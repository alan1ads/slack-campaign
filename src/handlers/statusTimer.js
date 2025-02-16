const axios = require('axios');
require('dotenv').config();

// Only track active status changes
let activeTracking = {
  status: {},      // For customfield_10281 (Status)
  campaign: {}     // For status field (Campaign Status)
};

// Status thresholds (5 minutes = 0.0833 hours)
const STATUS_THRESHOLDS = {
  '🟢 Ready to Launch': 0.0833,
  '⚡ Let it Ride': 0.0833,
  '✅ Roll Out': 0.0833,
  '✨ Phase Complete': 0.0833,
  '💀 Killed': 0.0833,
  '🔁 Another Chance': 0.0833
};

// Start tracking when we get a webhook status change
const startTracking = (issueKey, statusType, statusValue) => {
  activeTracking[statusType][issueKey] = {
    status: statusValue,
    startTime: new Date()
  };
  console.log(`⏱️ Started tracking ${issueKey} ${statusType}: ${statusValue}`);
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
      const timeInStatus = now - tracking.startTime;
      if (timeInStatus > 300000) { // 5 minutes
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
      }
    }

    // Check Campaign Status
    for (const [issueKey, tracking] of Object.entries(activeTracking.campaign)) {
      const timeInStatus = now - tracking.startTime;
      if (timeInStatus > 300000) { // 5 minutes
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

module.exports = {
  startTracking,
  clearTracking,
  checkStatusAlerts,
  activeTracking
}; 