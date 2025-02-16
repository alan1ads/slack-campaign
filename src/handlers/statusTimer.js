const axios = require('axios');
require('dotenv').config();

// We'll store both types of statuses
let CAMPAIGN_STATUSES = {};
let STATUS_THRESHOLDS = {};

// Initialize both status types from Jira
const initializeStatuses = async () => {
  try {
    // Get all Campaign Statuses from project
    const projectResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/project/${process.env.JIRA_PROJECT_KEY}/statuses`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    // Set 5-minute threshold for Campaign Statuses
    CAMPAIGN_STATUSES = projectResponse.data[0].statuses.reduce((acc, status) => {
      acc[status.name] = 0.0833; // 5 minutes
      return acc;
    }, {});

    // Set 5-minute threshold for Status values (customfield_10281)
    STATUS_THRESHOLDS = {
      '🟢 Ready to Launch': 0.0833,
      '⚡ Let it Ride': 0.0833,
      '✅ Roll Out': 0.0833,
      '✨ Phase Complete': 0.0833,
      '💀 Killed': 0.0833,
      '🔁 Another Chance': 0.0833
    };

    console.log('📊 Loaded Campaign Statuses:', Object.keys(CAMPAIGN_STATUSES));
    console.log('📊 Loaded Status Values:', Object.keys(STATUS_THRESHOLDS));
  } catch (error) {
    console.error('Error loading statuses:', error);
    console.error(error.response?.data || error.message);
  }
};

// Initialize on startup
initializeStatuses();

const getStatusHistory = async (issueKey) => {
  try {
    console.log(`🔍 Getting status history for ${issueKey}`);
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}/changelog`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    // Track both types of status changes
    const statusChanges = {
      status: [],     // For customfield_10281 (Status)
      campaign: []    // For status field (Campaign Status)
    };

    response.data.values.forEach(change => {
      change.items.forEach(item => {
        if (item.fieldId === 'customfield_10281') {
          statusChanges.status.push({
            from: item.fromString,
            to: item.toString,
            timestamp: new Date(change.created),
            type: 'status'
          });
          console.log(`📝 Status change: ${item.fromString} → ${item.toString}`);
        } else if (item.field === 'status') {
          statusChanges.campaign.push({
            from: item.fromString,
            to: item.toString,
            timestamp: new Date(change.created),
            type: 'campaign'
          });
          console.log(`📝 Campaign Status change: ${item.fromString} → ${item.toString}`);
        }
      });
    });

    return statusChanges;
  } catch (error) {
    console.error(`Error getting status history for ${issueKey}:`, error);
    throw error;
  }
};

const calculateTimeInStatus = async (issueKey) => {
  try {
    const statusHistory = await getStatusHistory(issueKey);
    const timeInStatus = {
      status: {},
      campaign: {}
    };

    // Calculate for status (customfield_10281)
    let previousStatus = null;
    statusHistory.status.forEach(change => {
      if (previousStatus) {
        const duration = change.timestamp - previousStatus.timestamp;
        const status = previousStatus.to;
        timeInStatus.status[status] = (timeInStatus.status[status] || 0) + duration;
      }
      previousStatus = change;
    });

    // Calculate for campaign status
    let previousCampaign = null;
    statusHistory.campaign.forEach(change => {
      if (previousCampaign) {
        const duration = change.timestamp - previousCampaign.timestamp;
        const status = previousCampaign.to;
        timeInStatus.campaign[status] = (timeInStatus.campaign[status] || 0) + duration;
      }
      previousCampaign = change;
    });

    // Calculate current duration for both
    const now = new Date();
    if (previousStatus) {
      const duration = now - previousStatus.timestamp;
      const currentStatus = previousStatus.to;
      timeInStatus.status[currentStatus] = (timeInStatus.status[currentStatus] || 0) + duration;
      console.log(`⏱️ Current Status duration for ${issueKey}: ${Math.round(duration / 60000)}m in ${currentStatus}`);
    }
    if (previousCampaign) {
      const duration = now - previousCampaign.timestamp;
      const currentStatus = previousCampaign.to;
      timeInStatus.campaign[currentStatus] = (timeInStatus.campaign[currentStatus] || 0) + duration;
      console.log(`⏱️ Current Campaign Status duration for ${issueKey}: ${Math.round(duration / 60000)}m in ${currentStatus}`);
    }

    return timeInStatus;
  } catch (error) {
    console.error(`Error calculating time in status for ${issueKey}:`, error);
    throw error;
  }
};

const checkStatusAlerts = async (app) => {
  try {
    console.log('🔄 Running status duration check...');
    
    // Get all active issues
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/search`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      },
      data: {
        jql: 'project = "Creative Testing" AND resolution = Unresolved',
        fields: ['key', 'summary', 'status', 'customfield_10281'] // Get both status fields
      }
    });

    console.log(`📋 Checking ${response.data.issues.length} active issues`);

    for (const issue of response.data.issues) {
      const timeInStatus = await calculateTimeInStatus(issue.key);
      
      // Check Status (customfield_10281)
      const currentStatus = issue.fields.customfield_10281?.value;
      if (currentStatus && STATUS_THRESHOLDS[currentStatus]) {
        const timeInCurrentStatus = timeInStatus.status[currentStatus] || 0;
        const thresholdMs = STATUS_THRESHOLDS[currentStatus] * 3600000; // Convert hours to ms

        if (timeInCurrentStatus > thresholdMs) {
          console.log(`⚠️ Status threshold exceeded for ${issue.key}: ${Math.round(timeInCurrentStatus / 60000)}m in ${currentStatus}`);
          
          await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: process.env.SLACK_NOTIFICATION_CHANNEL,
            text: `⚠️ Status Duration Alert`,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "⚠️ Status Duration Alert",
                  emoji: true
                }
              },
              {
                type: "section",
                fields: [
                  {
                    type: "mrkdwn",
                    text: `*Issue:*\n<https://${process.env.JIRA_HOST}/browse/${issue.key}|${issue.key}>`
                  },
                  {
                    type: "mrkdwn",
                    text: `*Campaign:*\n${issue.fields.summary}`
                  },
                  {
                    type: "mrkdwn",
                    text: `*Current Status:*\n${currentStatus}`
                  },
                  {
                    type: "mrkdwn",
                    text: `*Time in Status:*\n${Math.round(timeInCurrentStatus / 60000)} minutes`
                  }
                ]
              }
            ]
          });
        }
      }

      // Check Campaign Status
      const currentCampaignStatus = issue.fields.status.name;
      if (currentCampaignStatus && CAMPAIGN_STATUSES[currentCampaignStatus]) {
        const timeInCurrentStatus = timeInStatus.campaign[currentCampaignStatus] || 0;
        const thresholdMs = CAMPAIGN_STATUSES[currentCampaignStatus] * 3600000;

        if (timeInCurrentStatus > thresholdMs) {
          console.log(`⚠️ Campaign Status threshold exceeded for ${issue.key}: ${Math.round(timeInCurrentStatus / 60000)}m in ${currentCampaignStatus}`);
          
          await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: process.env.SLACK_NOTIFICATION_CHANNEL,
            text: `⚠️ Campaign Status Duration Alert`,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "⚠️ Campaign Status Duration Alert",
                  emoji: true
                }
              },
              {
                type: "section",
                fields: [
                  {
                    type: "mrkdwn",
                    text: `*Issue:*\n<https://${process.env.JIRA_HOST}/browse/${issue.key}|${issue.key}>`
                  },
                  {
                    type: "mrkdwn",
                    text: `*Campaign:*\n${issue.fields.summary}`
                  },
                  {
                    type: "mrkdwn",
                    text: `*Current Campaign Status:*\n${currentCampaignStatus}`
                  },
                  {
                    type: "mrkdwn",
                    text: `*Time in Status:*\n${Math.round(timeInCurrentStatus / 60000)} minutes`
                  }
                ]
              }
            ]
          });
        }
      }
    }
  } catch (error) {
    console.error('Error checking status alerts:', error);
  }
};

// Command handler for /check-duration
const checkStatusDuration = async ({ command, ack, say }) => {
  await ack();
  
  const issueKey = command.text;

  try {
    if (!issueKey) {
      await say("Please provide an issue key: `/check-duration AS-123`");
      return;
    }

    console.log(`🔍 Checking duration for ${issueKey}`);
    const timeInStatus = await calculateTimeInStatus(issueKey);
    
    // Format status durations
    const statusDurations = Object.entries(timeInStatus.status)
      .map(([status, duration]) => {
        const minutes = Math.round(duration / 60000);
        return `*${status}:* ${minutes}m`;
      }).join('\n');

    // Format campaign status durations
    const campaignDurations = Object.entries(timeInStatus.campaign)
      .map(([status, duration]) => {
        const minutes = Math.round(duration / 60000);
        return `*${status}:* ${minutes}m`;
      }).join('\n');

    await say({
      text: `Status duration for ${issueKey}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📊 Status Duration Report",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Issue:* ${issueKey}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Status History (Ready to Launch, Let it Ride, etc):*\n${statusDurations || 'No history'}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Campaign Status History (Phase 1, Request Review, etc):*\n${campaignDurations || 'No history'}`
          }
        }
      ]
    });

  } catch (error) {
    console.error('Error checking status duration:', error);
    await say(`Error checking status duration: ${error.message}`);
  }
};

module.exports = {
  checkStatusAlerts,
  checkStatusDuration
}; 