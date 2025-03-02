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

// Function to load tracking data from file
const loadTrackingData = () => {
  try {
    console.log('📂 Loading tracking data...');
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Created data directory at:', dataDir);
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
        const data = fs.readFileSync(TRACKING_FILE_PATH, 'utf8');
        console.log('📄 Raw file contents:', data);
        
        if (!data.trim()) {
          console.log('⚠️ Tracking file is empty');
          return;
        }

        try {
          const parsed = JSON.parse(data);
          console.log('📄 Parsed tracking data:', parsed);
          
          if (!parsed || typeof parsed !== 'object') {
            console.log('⚠️ Invalid tracking data format');
            return;
          }

          // Initialize or merge status data
          if (parsed.status) {
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

          // Initialize or merge campaign data
          if (parsed.campaign) {
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

          console.log('📥 Loaded tracking data successfully:', {
            statusCount: Object.keys(activeTracking.status).length,
            campaignCount: Object.keys(activeTracking.campaign).length,
            campaigns: Object.keys(activeTracking.campaign),
            statuses: Object.keys(activeTracking.status)
          });
        } catch (parseError) {
          console.error('❌ Error parsing tracking data:', parseError);
        }
      } else {
        console.log('📝 No existing tracking file found at:', TRACKING_FILE_PATH);
      }
    } finally {
      releaseLock();
    }

    // Save current state to ensure file exists and is up to date
    saveTrackingData();
  } catch (error) {
    console.error('❌ Error in loadTrackingData:', error);
    releaseLock();
  }
};

// Function to save tracking data to file
const saveTrackingData = () => {
  try {
    console.log('💾 Attempting to save tracking data:', {
      currentStatus: Object.keys(activeTracking.status),
      currentCampaigns: Object.keys(activeTracking.campaign)
    });

    // Try to acquire lock
    if (!acquireLock()) {
      console.log('⚠️ Could not acquire lock for saving, will retry on next update');
      return;
    }

    try {
      // Ensure the directory exists
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 Created data directory for saving at:', dataDir);
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

      // Write to temporary file first
      const tempPath = `${TRACKING_FILE_PATH}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(dataToSave, null, 2));

      // Rename temporary file to actual file (atomic operation)
      fs.renameSync(tempPath, TRACKING_FILE_PATH);

      console.log('💾 Saved tracking data successfully:', {
        statusCount: Object.keys(dataToSave.status).length,
        campaignCount: Object.keys(dataToSave.campaign).length,
        campaigns: Object.keys(dataToSave.campaign),
        statuses: Object.keys(dataToSave.status),
        path: TRACKING_FILE_PATH
      });
    } finally {
      releaseLock();
    }
  } catch (error) {
    console.error('❌ Error saving tracking data:', error);
    releaseLock();
  }
};

// Load tracking data on startup and save current state
loadTrackingData();

// Status thresholds (customfield_10281) - these are fixed
const STATUS_THRESHOLDS = {
  '🟢 Ready to Launch': 2880,
  '⚡ Let it Ride': 2880,
  '✅ Roll Out': 2880,
  '✨ Phase Complete': 2880,
  '💀 Killed': 2880,
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
  'PHASE COMPLETE': null,       // Timer disabled
  'FAILED': null               // Timer disabled
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

// Call this on startup
fetchCampaignStatusThresholds();

// Check if issue has an assignee
const hasAssignee = (issue) => {
  return issue?.fields?.assignee !== null;
};

// Convert minutes to milliseconds with special handling
const getThresholdMs = (statusType, statusValue, issue) => {
  if (statusType === 'status') {
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
    
    // Return null for PHASE COMPLETE and FAILED to disable timer
    if (campaignStatus === 'PHASE COMPLETE' || campaignStatus === 'FAILED') {
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

// Export the functions
module.exports = {
  startTracking,
  clearTracking,
  checkStatusAlerts,
  activeTracking,
  updateCampaignThreshold,
  ensureChannelAccess,
  loadTrackingData // Export this so it can be called on app startup if needed
}; 