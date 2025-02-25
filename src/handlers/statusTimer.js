const axios = require('axios');
require('dotenv').config();

// Add timer alerts channel constant
const TIMER_ALERTS_CHANNEL = 'C08F7C8RCV7';

// Only track active status changes
let activeTracking = {
  status: {},      // For customfield_10281 (Status)
  campaign: {}     // For status field (Campaign Status)
};

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
  'NEW REQUEST': 2,             // 2 minutes (testing) - starts only when assigned
  'REQUEST REVIEW': 1200,       // 20 hours
  'READY TO SHIP': 1440,        // 24 hours
  'SUBMISSION REVIEW': 240,     // 4 hours
  'PHASE 1': 3120,             // 52 hours
  'PHASE 2': 4560,             // 76 hours
  'PHASE 3': 10080,            // 168 hours (1 week)
  'PHASE 4': 10080,            // 168 hours (1 week)
  'PHASE COMPLETE': null        // Timer disabled
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
    
    // Return null for PHASE COMPLETE to disable timer
    if (campaignStatus === 'PHASE COMPLETE') {
      return null;
    }
    
    return (CAMPAIGN_STATUS_THRESHOLDS[campaignStatus] || 5) * 60 * 1000;
  }
};

// Start tracking when we get a webhook status change
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
    lastAlertTime: null
  };
  console.log(`⏱️ Started tracking ${issueKey} ${statusType}: ${statusValue}`);
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

// Check durations and alert if needed
const checkStatusAlerts = async (app) => {
  try {
    const now = new Date();
    
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
      }
    }
  } catch (error) {
    console.error('Error checking status alerts:', error);
  }
};

// Clear tracking when status changes or on startup
const clearTracking = (issueKey, statusType) => {
  if (issueKey && statusType) {
    // Clear specific issue tracking
    if (activeTracking[statusType][issueKey]) {
      delete activeTracking[statusType][issueKey];
      console.log(`🧹 Cleared ${statusType} tracking for ${issueKey}`);
    }
  } else {
    // Clear all tracking (on startup)
    activeTracking = {
      status: {},
      campaign: {}
    };
    console.log('🧹 Cleared all status tracking');
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

module.exports = {
  startTracking,
  clearTracking,
  checkStatusAlerts,
  activeTracking,
  updateCampaignThreshold
}; 