const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Add timer alerts channel constant
const TIMER_ALERTS_CHANNEL = 'C08F7C8RCV7';

// Define the path for the tracking data file
const TRACKING_FILE_PATH = process.env.RENDER ? 
  '/opt/render/project/src/data/tracking.json' : 
  path.join(__dirname, '../../data/tracking.json');

// Ensure the data directory exists
const dataDir = process.env.RENDER ? 
  '/opt/render/project/src/data' : 
  path.join(__dirname, '../../data');

// Add lock file path
const LOCK_FILE_PATH = path.join(dataDir, '.lock');

// Load tracking data from file or initialize if doesn't exist
let activeTracking = {
  status: {},      // For customfield_10281 (Status)
  campaign: {}     // For status field (Campaign Status)
};

// Function to acquire lock
const acquireLock = () => {
  try {
    fs.writeFileSync(LOCK_FILE_PATH, String(process.pid));
    return true;
  } catch (error) {
    console.error('Failed to acquire lock:', error);
    return false;
  }
};

// Function to release lock
const releaseLock = () => {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      fs.unlinkSync(LOCK_FILE_PATH);
    }
  } catch (error) {
    console.error('Failed to release lock:', error);
  }
};

// Updated loadTrackingDataFromJira function with improved error handling and JQL query
// Replace this function in your statusTimer.js file

const loadTrackingDataFromJira = async (app) => {
  console.log('🔄 Initializing tracking data from Jira...');
  
  try {
    // First try to load local data as a backup/starting point
    loadTrackingDataFromFile();
    
    // Get all active issues from Jira
    console.log('🔍 Fetching active issues from Jira...');
    
    // Construct JQL query more carefully
    let jqlQuery;
    try {
      // Try a simpler query first to test connectivity
      const testResponse = await axios({
        method: 'GET',
        url: `https://${process.env.JIRA_HOST}/rest/api/3/myself`,
        auth: {
          username: process.env.JIRA_EMAIL,
          password: process.env.JIRA_API_TOKEN
        }
      });
      
      console.log('✅ Jira connection test successful, user:', testResponse.data.displayName);
      
      // Use a simpler JQL query with proper escaping
      jqlQuery = 'project = "AS"';
      console.log('🔍 Using JQL query:', jqlQuery);
      
    } catch (testError) {
      console.error('❌ Jira connection test failed:', testError.message);
      if (testError.response) {
        console.error('  Status:', testError.response.status);
        console.error('  Data:', JSON.stringify(testError.response.data));
      }
      throw new Error('Could not connect to Jira API: ' + testError.message);
    }
    
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/search`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      },
      params: {
        jql: jqlQuery,
        maxResults: 100,
        fields: 'key,status,summary,created,updated,assignee,customfield_10281'
      }
    });
    
    if (!response.data || !response.data.issues) {
      console.log('⚠️ No active issues found in Jira or could not retrieve data');
      return;
    }
    
    console.log(`🔍 Found ${response.data.issues.length} active issues to track`);
    
    // Filter for active issues (not completed/failed) in code rather than in JQL
    const activeIssues = response.data.issues.filter(issue => {
      const status = issue.fields.status.name.toUpperCase();
      return status !== 'PHASE COMPLETE' && status !== 'FAILED';
    });
    
    console.log(`🔍 Filtered down to ${activeIssues.length} issues not in completed/failed status`);
    
    // Track issues we've processed to detect any that need to be removed
    const processedIssues = {
      status: new Set(),
      campaign: new Set()
    };
    
    // Process each issue and set up tracking
    for (const issue of activeIssues) {
      const issueKey = issue.key;
      const statusValue = issue.fields.customfield_10281?.value; // Status field
      const campaignStatus = issue.fields.status.name;  // Campaign Status field
      const assignee = issue.fields.assignee;
      
      console.log(`📋 Processing issue ${issueKey} - Status: ${statusValue || 'Not set'}, Campaign: ${campaignStatus}`);
      
      try {
        // Get issue history to determine how long it's been in current status
        const historyResponse = await axios({
          method: 'GET',
          url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}/changelog`,
          auth: {
            username: process.env.JIRA_EMAIL,
            password: process.env.JIRA_API_TOKEN
          }
        });
        
        // Find the most recent status change for both fields
        let statusChangeTime = new Date(issue.fields.created);
        let campaignStatusChangeTime = new Date(issue.fields.created);
        
        // Get last alert times from existing tracking (if any)
        let statusLastAlertTime = activeTracking.status[issueKey]?.lastAlertTime || null;
        let campaignLastAlertTime = activeTracking.campaign[issueKey]?.lastAlertTime || null;
        
        if (historyResponse.data && historyResponse.data.values) {
          // Process changelog for status changes
          for (const history of historyResponse.data.values) {
            const created = new Date(history.created);
            
            for (const item of history.items) {
              // Check for Status field changes
              if (item.fieldId === 'customfield_10281' && item.toString === statusValue) {
                if (created > statusChangeTime) {
                  statusChangeTime = created;
                }
              }
              
              // Check for Campaign Status changes
              if (item.field === 'status' && item.toString === campaignStatus) {
                if (created > campaignStatusChangeTime) {
                  campaignStatusChangeTime = created;
                }
              }
            }
          }
        }
        
        // Track the Status if set
        if (statusValue) {
          const thresholdMs = getThresholdMs('status', statusValue, issue);
          if (thresholdMs !== null) {
            // Add to processed set
            processedIssues.status.add(issueKey);
            
            // Update tracking with accurate history-based timing
            activeTracking.status[issueKey] = {
              status: statusValue,
              startTime: statusChangeTime,
              lastAlertTime: statusLastAlertTime,
              issue: {
                key: issue.key,
                fields: {
                  summary: issue.fields.summary,
                  assignee: issue.fields.assignee
                }
              }
            };
            console.log(`⏱️ Tracking Status for ${issueKey}: ${statusValue} (since ${statusChangeTime.toISOString()})`);
          }
        }
        
        // Track the Campaign Status
        const campaignThresholdMs = getThresholdMs('campaign', campaignStatus, issue);
        
        // Special handling for NEW REQUEST - only track if has assignee
        const isNewRequest = campaignStatus.toUpperCase() === 'NEW REQUEST';
        const shouldTrackCampaign = 
          (isNewRequest && assignee !== null) || 
          (!isNewRequest && campaignThresholdMs !== null);
        
        if (shouldTrackCampaign) {
          // Add to processed set
          processedIssues.campaign.add(issueKey);
          
          activeTracking.campaign[issueKey] = {
            status: campaignStatus,
            startTime: campaignStatusChangeTime,
            lastAlertTime: campaignLastAlertTime,
            issue: {
              key: issue.key,
              fields: {
                summary: issue.fields.summary,
                assignee: issue.fields.assignee
              }
            }
          };
          console.log(`⏱️ Tracking Campaign Status for ${issueKey}: ${campaignStatus} (since ${campaignStatusChangeTime.toISOString()})`);
        }
        
      } catch (historyError) {
        console.error(`❌ Error retrieving history for ${issueKey}:`, historyError.message);
        
        // Use existing tracking data if available, otherwise use created time
        if (statusValue) {
          processedIssues.status.add(issueKey);
          
          activeTracking.status[issueKey] = activeTracking.status[issueKey] || {
            status: statusValue,
            startTime: new Date(issue.fields.created),
            lastAlertTime: null,
            issue: {
              key: issue.key,
              fields: {
                summary: issue.fields.summary,
                assignee: issue.fields.assignee
              }
            }
          };
        }
        
        if (campaignStatus && campaignStatus.toUpperCase() !== 'PHASE COMPLETE' && campaignStatus.toUpperCase() !== 'FAILED') {
          processedIssues.campaign.add(issueKey);
          
          activeTracking.campaign[issueKey] = activeTracking.campaign[issueKey] || {
            status: campaignStatus,
            startTime: new Date(issue.fields.created),
            lastAlertTime: null,
            issue: {
              key: issue.key,
              fields: {
                summary: issue.fields.summary,
                assignee: issue.fields.assignee
              }
            }
          };
        }
      }
    }
    
    // Remove any issues that are no longer active
    for (const issueKey of Object.keys(activeTracking.status)) {
      if (!processedIssues.status.has(issueKey)) {
        console.log(`🧹 Removing stale status tracking for ${issueKey}`);
        delete activeTracking.status[issueKey];
      }
    }
    
    for (const issueKey of Object.keys(activeTracking.campaign)) {
      if (!processedIssues.campaign.has(issueKey)) {
        console.log(`🧹 Removing stale campaign tracking for ${issueKey}`);
        delete activeTracking.campaign[issueKey];
      }
    }
    
    // Save the tracking data to file
    saveTrackingData();
    
    console.log('✅ Jira tracking data initialized successfully:', {
      statusCount: Object.keys(activeTracking.status).length,
      campaignCount: Object.keys(activeTracking.campaign).length,
      statuses: Object.keys(activeTracking.status),
      campaigns: Object.keys(activeTracking.campaign)
    });
    
  } catch (error) {
    console.error('❌ Error initializing tracking data from Jira:', error.message);
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Error details:', JSON.stringify(error.response.data || {}));
    }
    // If Jira sync fails, fall back to local file
    console.log('⚠️ Falling back to local tracking data');
    loadTrackingDataFromFile();
  }
};

// Modified original function renamed to loadTrackingDataFromFile (as backup)
const loadTrackingDataFromFile = () => {
  try {
    console.log('📂 Loading tracking data from file...');
    console.log('📂 Data directory path:', dataDir);
    console.log('📂 Tracking file path:', TRACKING_FILE_PATH);
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 Created data directory at:', dataDir);
      } catch (dirError) {
        console.error('❌ Error creating data directory:', dirError);
      }
    }

    // Try to acquire lock
    if (!acquireLock()) {
      console.log('⚠️ Could not acquire lock, using cached data');
      return;
    }

    try {
      // Load existing data if file exists
      if (fs.existsSync(TRACKING_FILE_PATH)) {
        console.log('📄 Found tracking file at:', TRACKING_FILE_PATH);
        const fileStats = fs.statSync(TRACKING_FILE_PATH);
        console.log('📄 File stats:', {
          size: fileStats.size,
          modified: fileStats.mtime
        });

        const data = fs.readFileSync(TRACKING_FILE_PATH, 'utf8');
        
        if (!data.trim()) {
          console.log('⚠️ Tracking file is empty, initializing new data');
          return;
        }

        try {
          const parsed = JSON.parse(data);
          
          if (!parsed || typeof parsed !== 'object') {
            console.log('⚠️ Invalid tracking data format, initializing new data');
            return;
          }

          // Process status data
          if (parsed.status && typeof parsed.status === 'object') {
            Object.entries(parsed.status).forEach(([key, item]) => {
              if (item && typeof item === 'object') {
                activeTracking.status[key] = {
                  ...item,
                  startTime: new Date(item.startTime),
                  lastAlertTime: item.lastAlertTime ? new Date(item.lastAlertTime) : null
                };
              }
            });
          }

          // Process campaign data
          if (parsed.campaign && typeof parsed.campaign === 'object') {
            Object.entries(parsed.campaign).forEach(([key, item]) => {
              if (item && typeof item === 'object') {
                activeTracking.campaign[key] = {
                  ...item,
                  startTime: new Date(item.startTime),
                  lastAlertTime: item.lastAlertTime ? new Date(item.lastAlertTime) : null
                };
              }
            });
          }

          console.log('📥 Loaded tracking data from file successfully:', {
            statusCount: Object.keys(activeTracking.status).length,
            campaignCount: Object.keys(activeTracking.campaign).length
          });
        } catch (parseError) {
          console.error('❌ Error parsing tracking data:', parseError);
        }
      } else {
        console.log('📝 No existing tracking file found');
      }
    } finally {
      releaseLock();
    }
  } catch (error) {
    console.error('❌ Error in loadTrackingDataFromFile:', error);
    releaseLock();
  }
};

// Function to save tracking data to file
const saveTrackingData = () => {
  try {
    console.log('💾 Attempting to save tracking data:', {
      currentStatus: Object.keys(activeTracking.status),
      currentCampaigns: Object.keys(activeTracking.campaign),
      path: TRACKING_FILE_PATH
    });

    // Try to acquire lock
    if (!acquireLock()) {
      console.log('⚠️ Could not acquire lock for saving, will retry on next update');
      return;
    }

    try {
      // Ensure the directory exists
      if (!fs.existsSync(dataDir)) {
        try {
          fs.mkdirSync(dataDir, { recursive: true });
          console.log('📁 Created data directory for saving at:', dataDir);
        } catch (dirError) {
          console.error('❌ Error creating data directory:', dirError);
          // Continue anyway - we'll try to save the file
        }
      }

      // Prepare data for saving
      const dataToSave = {
        status: {},
        campaign: {}
      };

      // Process status data
      Object.entries(activeTracking.status).forEach(([key, item]) => {
        if (item && typeof item === 'object') {
          dataToSave.status[key] = {
            ...item,
            startTime: item.startTime.toISOString(),
            lastAlertTime: item.lastAlertTime ? item.lastAlertTime.toISOString() : null
          };
        }
      });

      // Process campaign data
      Object.entries(activeTracking.campaign).forEach(([key, item]) => {
        if (item && typeof item === 'object') {
          dataToSave.campaign[key] = {
            ...item,
            startTime: item.startTime.toISOString(),
            lastAlertTime: item.lastAlertTime ? item.lastAlertTime.toISOString() : null
          };
        }
      });

      try {
        // Write to temporary file first
        const tempPath = `${TRACKING_FILE_PATH}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(dataToSave, null, 2), { encoding: 'utf8', flag: 'w' });

        // Verify the temporary file was written correctly
        const tempData = fs.readFileSync(tempPath, 'utf8');
        const tempParsed = JSON.parse(tempData);
        
        if (!tempParsed || typeof tempParsed !== 'object') {
          throw new Error('Failed to write valid data to temporary file');
        }

        // Rename temporary file to actual file (atomic operation)
        fs.renameSync(tempPath, TRACKING_FILE_PATH);

        // Verify the file exists after saving
        if (!fs.existsSync(TRACKING_FILE_PATH)) {
          throw new Error('File does not exist after save operation');
        }

        console.log('💾 Saved tracking data successfully:', {
          statusCount: Object.keys(dataToSave.status).length,
          campaignCount: Object.keys(dataToSave.campaign).length,
          path: TRACKING_FILE_PATH
        });
      } catch (writeError) {
        console.error('❌ Error writing tracking file:', writeError);
        // If normal save fails, try saving to /tmp as a fallback
        try {
          const tmpPath = '/tmp/tracking.json';
          fs.writeFileSync(tmpPath, JSON.stringify(dataToSave, null, 2), 'utf8');
          console.log('💾 Saved tracking data to temporary location:', tmpPath);
        } catch (tmpError) {
          console.error('❌ Failed to save tracking data to temporary location:', tmpError);
        }
      }
    } finally {
      releaseLock();
    }
  } catch (error) {
    console.error('❌ Error saving tracking data:', error);
    releaseLock();
  }
};

// Status thresholds (customfield_10281) - these are fixed
const STATUS_THRESHOLDS = {
  '🟢 Ready to Launch': 2880,
  '⚡ Let it Ride': 2880,
  '✅ Roll Out': 2880,
  '✨ Phase Complete': 2880,
  '💀 Killed': null,
  '🔁 Another Chance': 2880
};

// Campaign Status thresholds (in minutes)
const CAMPAIGN_STATUS_THRESHOLDS = {
  'NEW REQUEST': 10,            // 10 minutes (starts only when assigned)
  'REQUEST REVIEW': 1200,       // 20 hours
  'READY TO SHIP': 1440,        // 24 hours
  'SUBMISSION REVIEW': 240,     // 4 hours
  'PHASE 1': 3120,             // 52 hours
  'PHASE 2': 4560,             // 76 hours
  'PHASE 3': 10080,            // 168 hours (1 week)
  'PHASE 4': 10080,            // 168 hours (1 week)
  'PHASE COMPLETE': null,       // Timer disabled!
  'FAILED': null,               // Timer disabled!
  'NEED MORE AMMO': null        // Timer disabled!
};

let campaignStatusThresholds = {};

const fetchCampaignStatusThresholds = async () => {
  try {
    // Get statuses from Jira API
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/project/AS/statuses`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    // Get Task type statuses
    const taskStatuses = response.data.find(type => type.name === 'Task');
    if (taskStatuses) {
      // Initialize each status with default threshold (5 minutes)
      taskStatuses.statuses.forEach(status => {
        campaignStatusThresholds[status.name] = 5;
      });
    }

    console.log('📋 Available Campaign Statuses:', Object.keys(campaignStatusThresholds));
  } catch (error) {
    console.error('Error fetching campaign statuses:', error);
  }
};

// Check if issue has an assignee
const hasAssignee = (issue) => {
  return issue?.fields?.assignee !== null;
};

// Convert minutes to milliseconds with special handling
const getThresholdMs = (statusType, statusValue, issue) => {
  if (statusType === 'status') {
    // Check if the status has a null threshold (disabled)
    if (STATUS_THRESHOLDS[statusValue] === null) {
      return null; // Don't start timer for disabled statuses
    }
    return (STATUS_THRESHOLDS[statusValue] || 5) * 60 * 1000;
  } else {
    // For campaign status, convert to uppercase to match keys
    const campaignStatus = statusValue.toUpperCase();
    
    // Special handling for NEW REQUEST
    if (campaignStatus === 'NEW REQUEST') {
      // Only start timer if there's an assignee
      if (!hasAssignee(issue)) {
        return null; // Don't start timer
      }
    }
    
    // Return null for statuses with disabled timers
    if (campaignStatus === 'PHASE COMPLETE' || campaignStatus === 'FAILED' || campaignStatus === 'NEED MORE AMMO') {
      return null;
    }
    
    return (CAMPAIGN_STATUS_THRESHOLDS[campaignStatus] || 5) * 60 * 1000;
  }
};

// Modify startTracking to save data after tracking starts
const startTracking = (issueKey, statusType, statusValue, issue) => {
  const thresholdMs = getThresholdMs(statusType, statusValue, issue);
  
  // Don't track if threshold is null
  if (thresholdMs === null) {
    console.log(`⏱️ Tracking disabled for ${issueKey} ${statusType}: ${statusValue}`);
    return;
  }
  
  activeTracking[statusType][issueKey] = {
    status: statusValue,
    startTime: new Date(),
    lastAlertTime: null,
    issue: issue // Store issue data if needed
  };
  console.log(`⏱️ Started tracking ${issueKey} ${statusType}: ${statusValue}`);
  
  // Save tracking data after updating
  saveTrackingData();
};

// Add a function to check if issue exists
const checkIssueExists = async (issueKey) => {
  try {
    await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });
    return true;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`🗑️ Issue ${issueKey} no longer exists, clearing tracking`);
      clearTracking(issueKey, 'status');
      clearTracking(issueKey, 'campaign');
    }
    return false;
  }
};

// Add ensure channel access function
const ensureChannelAccess = async (app, channelId) => {
  try {
    await app.client.conversations.join({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channelId
    });
  } catch (error) {
    console.error('Error joining channel:', error);
  }
};

// Modify checkStatusAlerts to save data after sending alerts
const checkStatusAlerts = async (app) => {
  try {
    const now = new Date();
    let dataChanged = false;
    
    console.log('🔍 Checking tracked statuses:', {
      campaign: Object.keys(activeTracking.campaign),
      status: Object.keys(activeTracking.status)
    });
    
    // Check Status (customfield_10281)
    for (const [issueKey, tracking] of Object.entries(activeTracking.status)) {
      // First verify issue still exists
      if (!(await checkIssueExists(issueKey))) {
        continue; // Skip if issue doesn't exist
      }

      const timeInStatus = now - tracking.startTime;
      const thresholdMs = getThresholdMs('status', tracking.status, tracking.issue);
      const timeSinceLastAlert = tracking.lastAlertTime ? (now - tracking.lastAlertTime) : thresholdMs;

      if (timeInStatus > thresholdMs && timeSinceLastAlert >= thresholdMs) {
        console.log(`⚠️ Status threshold exceeded for ${issueKey}: ${Math.round(timeInStatus / 60000)}m in ${tracking.status}`);
        
        // Ensure channel access before sending
        await ensureChannelAccess(app, TIMER_ALERTS_CHANNEL);
        
        // Send Slack alert
        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: TIMER_ALERTS_CHANNEL,
          text: `Status Timer Alert for ${issueKey}`,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "⏰ Status Timer Alert",
                emoji: true
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Issue:*\n<https://${process.env.JIRA_HOST}/browse/${issueKey}|${issueKey}>`
                },
                {
                  type: "mrkdwn",
                  text: `*Current Status:*\n${tracking.status}`
                },
                {
                  type: "mrkdwn",
                  text: `*Time in Status:*\n${Math.round(timeInStatus / 60000)} minutes`
                }
              ]
            }
          ]
        });

        // After sending alert, update lastAlertTime
        activeTracking.status[issueKey].lastAlertTime = now;
        dataChanged = true;
      }
    }

    // Check Campaign Status
    for (const [issueKey, tracking] of Object.entries(activeTracking.campaign)) {
      // First verify issue still exists
      if (!(await checkIssueExists(issueKey))) {
        continue; // Skip if issue doesn't exist
      }

      const timeInStatus = now - tracking.startTime;
      const thresholdMs = getThresholdMs('campaign', tracking.status, tracking.issue);
      const timeSinceLastAlert = tracking.lastAlertTime ? (now - tracking.lastAlertTime) : thresholdMs;

      if (timeInStatus > thresholdMs && timeSinceLastAlert >= thresholdMs) {
        console.log(`⚠️ Campaign Status threshold exceeded for ${issueKey}: ${Math.round(timeInStatus / 60000)}m in ${tracking.status}`);
        
        // Ensure channel access before sending
        await ensureChannelAccess(app, TIMER_ALERTS_CHANNEL);
        
        // Send Slack alert with custom message for NEW REQUEST
        const isNewRequest = tracking.status.toUpperCase() === 'NEW REQUEST';
        
        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: TIMER_ALERTS_CHANNEL,
          text: `Campaign Status Timer Alert for ${issueKey}`,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: isNewRequest ? "⏰ Assignee Action Required" : "⏰ Campaign Status Timer Alert",
                emoji: true
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Issue:*\n<https://${process.env.JIRA_HOST}/browse/${issueKey}|${issueKey}>`
                },
                {
                  type: "mrkdwn",
                  text: `*Campaign:*\n${tracking.status}`
                },
                {
                  type: "mrkdwn",
                  text: isNewRequest 
                    ? "*Alert:*\nAssignee has been on this task for over 10 minutes"
                    : `*Current Campaign Status:*\n${tracking.status}`
                },
                {
                  type: "mrkdwn",
                  text: `*Time in Status:*\n${Math.round(timeInStatus / 60000)} minutes`
                }
              ]
            }
          ]
        });

        // After sending alert, update lastAlertTime
        activeTracking.campaign[issueKey].lastAlertTime = now;
        dataChanged = true;
      }
    }

    // If any data changed, save it
    if (dataChanged) {
      saveTrackingData();
    }
  } catch (error) {
    console.error('Error checking status alerts:', error);
  }
};

// Modify clearTracking to be more careful about clearing data
const clearTracking = (issueKey, statusType) => {
  if (issueKey && statusType) {
    // Clear specific issue tracking
    if (activeTracking[statusType][issueKey]) {
      delete activeTracking[statusType][issueKey];
      console.log(`🧹 Cleared ${statusType} tracking for ${issueKey}`);
      // Save tracking data after clearing
      saveTrackingData();
    }
  } else {
    // Only clear all tracking if explicitly called with no parameters
    // This prevents accidental clearing of all data
    console.log('⚠️ Attempted to clear all tracking - Operation not allowed');
    return;
  }
};

// Add a function to update thresholds
const updateCampaignThreshold = (status, minutes) => {
  const campaignStatus = status.toUpperCase();
  if (CAMPAIGN_STATUS_THRESHOLDS.hasOwnProperty(campaignStatus)) {
    CAMPAIGN_STATUS_THRESHOLDS[campaignStatus] = minutes;
    console.log(`Updated threshold for "${status}" to ${minutes} minutes`);
  } else {
    console.log(`Warning: "${status}" is not a valid Campaign Status`);
  }
};

// Add function to check status duration for debugging
const checkStatusDuration = async ({ command, ack, say }) => {
  await ack();
  
  try {
    const issueKey = command.text.trim();
    
    if (!issueKey) {
      await say("Please provide an issue key: `/check-duration AS-123`");
      return;
    }
    
    // Get status data
    const statusData = activeTracking.status[issueKey];
    const campaignData = activeTracking.campaign[issueKey];
    
    const now = new Date();
    let blocks = [];
    
    if (!statusData && !campaignData) {
      await say(`No tracking data found for issue ${issueKey}`);
      return;
    }
    
    if (statusData) {
      const timeInStatus = now - statusData.startTime;
      const minutesInStatus = Math.round(timeInStatus / 60000);
      const hourInStatus = (minutesInStatus / 60).toFixed(1);
      
      blocks.push({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Issue Status:*\n${statusData.status}`
          },
          {
            type: "mrkdwn",
            text: `*Time in Status:*\n${minutesInStatus} minutes (${hourInStatus} hours)`
          },
          {
            type: "mrkdwn",
            text: `*Started At:*\n${statusData.startTime.toLocaleString()}`
          },
          {
            type: "mrkdwn",
            text: `*Last Alert:*\n${statusData.lastAlertTime ? statusData.lastAlertTime.toLocaleString() : 'No alerts sent'}`
          }
        ]
      });
    }
    
    if (campaignData) {
      const timeInStatus = now - campaignData.startTime;
      const minutesInStatus = Math.round(timeInStatus / 60000);
      const hourInStatus = (minutesInStatus / 60).toFixed(1);
      
      blocks.push({
        type: "divider"
      });
      
      blocks.push({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Campaign Status:*\n${campaignData.status}`
          },
          {
            type: "mrkdwn",
            text: `*Time in Status:*\n${minutesInStatus} minutes (${hourInStatus} hours)`
          },
          {
            type: "mrkdwn",
            text: `*Started At:*\n${campaignData.startTime.toLocaleString()}`
          },
          {
            type: "mrkdwn",
            text: `*Last Alert:*\n${campaignData.lastAlertTime ? campaignData.lastAlertTime.toLocaleString() : 'No alerts sent'}`
          }
        ]
      });
    }
    
    await say({
      text: `Status duration info for ${issueKey}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `⏱️ Status Duration for ${issueKey}`,
            emoji: true
          }
        },
        ...blocks
      ]
    });
    
  } catch (error) {
    console.error('Error checking status duration:', error);
    await say(`Error checking status duration: ${error.message}`);
  }
};

// Export the functions
module.exports = {
  startTracking,
  clearTracking,
  checkStatusAlerts,
  checkStatusDuration,
  activeTracking,
  updateCampaignThreshold,
  ensureChannelAccess,
  loadTrackingData: loadTrackingDataFromFile, // For backward compatibility
  loadTrackingDataFromJira // Export new Jira-based function
};