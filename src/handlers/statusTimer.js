const axios = require('axios');
require('dotenv').config();

// Define status thresholds (in hours)
const STATUS_THRESHOLDS = {
  '🟢 Ready to Launch': 0.0833,  // Alert after 5 minutes
  '⚡ Let it Ride': 0.0833,      // Alert after 5 minutes
  '✅ Roll Out': 0.0833,         // Alert after 5 minutes
  '✨ Phase Complete': 0.0833,   // Alert after 5 minutes
  '💀 Killed': 0.0833,          // Alert after 5 minutes
  '🔁 Another Chance': 0.0833    // Alert after 5 minutes
};

const getStatusHistory = async (issueKey) => {
  try {
    // Get issue changelog
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}/changelog`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    // Filter for campaign status changes (using customfield_10281)
    const statusChanges = [];
    response.data.values.forEach(change => {
      change.items.forEach(item => {
        // Look for campaign status field changes
        if (item.fieldId === 'customfield_10281') {
          statusChanges.push({
            from: item.fromString,
            to: item.toString,
            timestamp: new Date(change.created)
          });
        }
      });
    });

    // Sort changes by timestamp
    statusChanges.sort((a, b) => a.timestamp - b.timestamp);

    return statusChanges;
  } catch (error) {
    console.error('Error getting status history:', error);
    throw error;
  }
};

const calculateTimeInStatus = async (issueKey) => {
  try {
    const statusHistory = await getStatusHistory(issueKey);
    const timeInStatus = {};
    let previousChange = null;

    statusHistory.forEach(change => {
      if (previousChange) {
        const duration = change.timestamp - previousChange.timestamp;
        const status = previousChange.to;
        timeInStatus[status] = (timeInStatus[status] || 0) + duration;
      }
      previousChange = change;
    });

    // Calculate time in current status
    if (previousChange) {
      const now = new Date();
      const duration = now - previousChange.timestamp;
      const currentStatus = previousChange.to;
      timeInStatus[currentStatus] = (timeInStatus[currentStatus] || 0) + duration;
    }

    return timeInStatus;
  } catch (error) {
    console.error('Error calculating time in status:', error);
    throw error;
  }
};

const checkStatusAlerts = async (app) => {
  try {
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
        fields: ['key', 'summary', 'customfield_10281'] // Make sure we get the campaign status field
      }
    });

    for (const issue of response.data.issues) {
      const timeInStatus = await calculateTimeInStatus(issue.key);
      const currentStatus = issue.fields.customfield_10281?.value; // Get the campaign status value
      
      if (currentStatus && STATUS_THRESHOLDS[currentStatus]) {
        const timeInCurrentStatus = timeInStatus[currentStatus] || 0;
        const thresholdMs = STATUS_THRESHOLDS[currentStatus] * 3600000; // Convert hours to ms

        if (timeInCurrentStatus > thresholdMs) {
          console.log('🚨 Alert threshold exceeded:', {
            issue: issue.key,
            status: currentStatus,
            timeInStatus: Math.round(timeInCurrentStatus / 3600000),
            threshold: STATUS_THRESHOLDS[currentStatus]
          });

          // Send alert to Slack
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
                    text: `*Current Status:*\n${currentStatus}`
                  },
                  {
                    type: "mrkdwn",
                    text: `*Time in Status:*\n${Math.round(timeInCurrentStatus / 60000)} minutes`
                  },
                  {
                    type: "mrkdwn",
                    text: `*Threshold:*\n5 minutes`
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

// Add a command to check status duration for a specific issue
const checkStatusDuration = async ({ command, ack, say }) => {
  await ack();
  
  const issueKey = command.text;

  try {
    if (!issueKey) {
      await say("Please provide an issue key: `/check-duration AS-123`");
      return;
    }

    const timeInStatus = await calculateTimeInStatus(issueKey);
    
    // Format the durations
    const formattedDurations = Object.entries(timeInStatus).map(([status, duration]) => {
      const hours = Math.round(duration / 3600000);
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `*${status}:* ${days}d ${remainingHours}h`;
    }).join('\n');

    await say({
      text: `Status duration for ${issueKey}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📊 Campaign Status Duration",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Issue:* ${issueKey}\n\n${formattedDurations}`
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