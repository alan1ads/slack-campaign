const axios = require('axios');
require('dotenv').config();

// Map the user-friendly commands to exact Jira values
const STATUS_MAP = {
  'ready': '🟢 Ready to Launch',
  'killed': '💀 Killed',
  'another chance': '🔁 Another Chance',
  'let it ride': '⚡ Let it Ride',
  'roll out': '✅ Roll Out',
  'phase complete': '✨ Phase Complete'
};

// Helper function to send Slack notification
const sendSlackNotification = async (app, issueKey, oldStatus, newStatus, updatedBy) => {
  try {
    // Get the issue details
    const issueResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    const issue = issueResponse.data;

    // Send notification to the configured Slack channel
    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: process.env.SLACK_NOTIFICATION_CHANNEL,
      text: `Status updated for ${issueKey}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Status Update for ${issueKey}*\n*Campaign Name:* \`${issue.fields.summary}\`\n*Status changed from* \`${oldStatus || 'Unknown'}\` *to* \`${newStatus}\`\n*Updated by:* ${updatedBy}`
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error sending Slack notification:', error);
  }
};

// Webhook handler for Jira status updates
const handleJiraWebhook = async (req, res, app) => {
  try {
    console.log('🔍 Received webhook from Jira:', {
      event: req.body.webhookEvent,
      issueKey: req.body.issue?.key,
      query: req.query,
      body: JSON.stringify(req.body)
    });
    
    const webhookData = req.body;
    
    // Get secret from query parameter instead of header
    const webhookSecret = req.query.secret;
    console.log('🔐 Webhook secret comparison:', {
      received: webhookSecret,
      expected: process.env.JIRA_WEBHOOK_SECRET,
      matches: webhookSecret === process.env.JIRA_WEBHOOK_SECRET
    });

    if (webhookSecret !== process.env.JIRA_WEBHOOK_SECRET) {
      console.log('❌ Invalid webhook secret received');
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    // Check if this is a field update event
    if (webhookData.webhookEvent === 'jira:issue_updated' && webhookData.changelog?.items) {
      console.log('📝 Checking for status changes in:', webhookData.changelog.items);
      
      // Look specifically for status field changes
      const statusChange = webhookData.changelog.items.find(
        item => item.field === 'status'
      );

      console.log('🔄 Status change detected:', statusChange);

      if (statusChange) {
        const issueKey = webhookData.issue.key;
        const oldStatus = statusChange.fromString;
        const newStatus = statusChange.toString;
        const updatedBy = webhookData.user.displayName;

        console.log('✨ Processing status change:', {
          issueKey,
          oldStatus,
          newStatus,
          updatedBy
        });

        // Get additional issue details
        const issueResponse = await axios({
          method: 'GET',
          url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
          auth: {
            username: process.env.JIRA_EMAIL,
            password: process.env.JIRA_API_TOKEN
          }
        });

        const issue = issueResponse.data;

        // Send a more detailed notification to Slack
        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: process.env.SLACK_NOTIFICATION_CHANNEL,
          text: `Status updated for ${issueKey}`,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "🔄 Jira Status Update",
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
                  text: `*Campaign:*\n${issue.fields.summary}`
                },
                {
                  type: "mrkdwn",
                  text: `*Previous Status:*\n${oldStatus}`
                },
                {
                  type: "mrkdwn",
                  text: `*New Status:*\n${newStatus}`
                },
                {
                  type: "mrkdwn",
                  text: `*Updated By:*\n${updatedBy}`
                },
                {
                  type: "mrkdwn",
                  text: `*Updated At:*\n${new Date().toLocaleString()}`
                }
              ]
            }
          ]
        });
      }
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateStatus = async ({ command, ack, say, client }) => {
  await ack();
  
  const [issueKey, ...statusParts] = command.text.split(' ');
  const inputStatus = statusParts.join(' ').toLowerCase();

  try {
    if (!issueKey || !inputStatus) {
      const statusList = Object.values(STATUS_MAP).map(status => `• \`${status}\``).join('\n');
      await say({
        text: 'Please provide both issue key and status',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Please provide both issue key and status: \`/status-update [issue-key] [status]\`\n\n*Available Statuses:*\n${statusList}`
            }
          }
        ]
      });
      return;
    }

    // Find the matching status from our map
    const matchingStatus = Object.entries(STATUS_MAP).find(([key]) => 
      inputStatus.includes(key)
    );

    if (!matchingStatus) {
      const validStatuses = Object.values(STATUS_MAP).map(status => `• \`${status}\``).join('\n');
      await say({
        text: 'Invalid status provided',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Invalid status. Please use one of the following:\n${validStatuses}`
            }
          }
        ]
      });
      return;
    }

    // First, get the current issue to confirm it exists
    const issueResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    const issue = issueResponse.data;
    
    // Get the field options
    const optionsResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${process.env.JIRA_STATUS_FIELD}/context`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    const contextId = optionsResponse.data.values[0]?.id;

    if (!contextId) {
      throw new Error('Could not find field context');
    }

    // Get available options for this context
    const availableOptions = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${process.env.JIRA_STATUS_FIELD}/context/${contextId}/option`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    const targetOption = availableOptions.data.values.find(
      option => option.value === matchingStatus[1]
    );

    if (!targetOption) {
      throw new Error(`Could not find matching option for status: ${matchingStatus[1]}`);
    }

    // Update the issue with the found option
    await axios({
      method: 'PUT',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      },
      data: {
        fields: {
          [process.env.JIRA_STATUS_FIELD]: {
            id: targetOption.id,
            value: targetOption.value
          }
        }
      }
    });

    // Get the updated issue to confirm changes
    const updatedIssueResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    const updatedIssue = updatedIssueResponse.data;
    const updatedStatus = updatedIssue.fields[process.env.JIRA_STATUS_FIELD]?.value || 'Unknown';

    // After successful status update, send notification
    await sendSlackNotification(
      { client }, // Pass the client as part of an app-like object
      issueKey,
      issue.fields[process.env.JIRA_STATUS_FIELD]?.value,
      updatedStatus,
      command.user_name
    );

    await say({
      text: `Status updated for ${issueKey}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Status Update for ${issueKey}*\n*Campaign Name:* \`${updatedIssue.fields.summary}\`\n*Status successfully updated to:* \`${updatedStatus}\``
          }
        }
      ]
    });

  } catch (error) {
    console.error('Error updating status:', error);
    console.error('Error response:', error.response?.data);
    
    let errorMessage = 'Unknown error occurred';
    if (error.response?.data?.errors) {
      errorMessage = Object.entries(error.response.data.errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join('\n');
    } else if (error.message) {
      errorMessage = error.message;
    }

    await say({
      text: 'Error updating status',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Error updating status:\n\`\`\`${errorMessage}\`\`\`\nPlease try again with a valid status.`
          }
        }
      ]
    });
  }
};

module.exports = { updateStatus, handleJiraWebhook };