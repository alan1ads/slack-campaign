const axios = require('axios');
require('dotenv').config();

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
  'NEW REQUEST': 1440,        // New campaigns need quick review
  'REQUEST REVIEW': 1440,     // Reviews should be timely
  'READY TO SHIP': 1440,      // Ready items should move quickly
  'SUBMISSION REVIEW': 1440,  // Reviews need attention
  'PHASE 1': 2880,           // Phases can take longer
  'PHASE 2': 2880,
  'PHASE 3': 2880,
  'PHASE 4': 2880,
  'PHASE COMPLETE': 5      // Should move to next phase/status
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

// Convert minutes to milliseconds
const getThresholdMs = (statusType, statusValue) => {
  if (statusType === 'status') {
    return (STATUS_THRESHOLDS[statusValue] || 5) * 60 * 1000;
  } else {
    // For campaign status, convert to uppercase to match keys
    const campaignStatus = statusValue.toUpperCase();
    return (CAMPAIGN_STATUS_THRESHOLDS[campaignStatus] || 5) * 60 * 1000;
  }
};

// Start tracking when we get a webhook status change
const startTracking = (issueKey, statusType, statusValue) => {
  activeTracking[statusType][issueKey] = {
    status: statusValue,
    startTime: new Date(),
    lastAlertTime: null  // Track when we last sent an alert
  };
  console.log(`⏱️ Started tracking ${issueKey} ${statusType}: ${statusValue}`);
};

// Check durations and alert if needed
const checkStatusAlerts = async (app) => {
  try {
    const now = new Date();
    const ALERT_FREQUENCY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    console.log('🔍 Checking tracked statuses:', {
      campaign: Object.keys(activeTracking.campaign),
      status: Object.keys(activeTracking.status)
    });
    
    // Check Status (customfield_10281)
    for (const [issueKey, tracking] of Object.entries(activeTracking.status)) {
      const timeInStatus = now - tracking.startTime;
      const thresholdMs = getThresholdMs('status', tracking.status);
      const timeSinceLastAlert = tracking.lastAlertTime ? (now - tracking.lastAlertTime) : ALERT_FREQUENCY_MS;

      if (timeInStatus > thresholdMs && timeSinceLastAlert >= ALERT_FREQUENCY_MS) {
        console.log(`⚠️ Status threshold exceeded for ${issueKey}: ${Math.round(timeInStatus / 60000)}m in ${tracking.status}`);
        
        // Send Slack alert
        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: process.env.SLACK_NOTIFICATION_CHANNEL,
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
      const timeInStatus = now - tracking.startTime;
      const thresholdMs = getThresholdMs('campaign', tracking.status);
      const timeSinceLastAlert = tracking.lastAlertTime ? (now - tracking.lastAlertTime) : ALERT_FREQUENCY_MS;

      if (timeInStatus > thresholdMs && timeSinceLastAlert >= ALERT_FREQUENCY_MS) {
        console.log(`⚠️ Campaign Status threshold exceeded for ${issueKey}: ${Math.round(timeInStatus / 60000)}m in ${tracking.status}`);
        
        // Send Slack alert
        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: process.env.SLACK_NOTIFICATION_CHANNEL,
          text: `Campaign Status Timer Alert for ${issueKey}`,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "⏰ Campaign Status Timer Alert",
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
                  text: `*Current Campaign Status:*\n${tracking.status}`
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