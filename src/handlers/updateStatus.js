const axios = require('axios');
require('dotenv').config();
const { startTracking, clearTracking, ensureChannelAccess } = require('./statusTimer');

// Map the user-friendly commands to exact Jira values
const STATUS_MAP = {
  'ready': '🟢 Ready to Launch',
  'killed': '💀 Killed',
  'another chance': '🔁 Another Chance',
  'let it ride': '⚡ Let it Ride',
  'roll out': '✅ Roll Out',
  'phase complete': '✨ Phase Complete'
};

// Replace the hardcoded channel constant with environment variable
const NEW_REQUEST_NOTIFICATION_CHANNEL = process.env.SLACK_NEW_REQUEST_CHANNEL;

// Add a map to track initial status changes
const newIssueTracker = new Map();

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
    const webhookData = req.body;
    
    // Enhanced webhook logging
    console.log('📥 Webhook Details:', {
      event: webhookData.webhookEvent,
      issueKey: webhookData.issue?.key,
      projectKey: webhookData.issue?.fields?.project?.key,
      status: webhookData.issue?.fields?.status?.name,
      isNewRequest: webhookData.issue?.fields?.status?.name?.toUpperCase() === 'NEW REQUEST',
      creator: webhookData.issue?.fields?.creator?.displayName
    });

    // Add logging to see what project the webhook is for
    console.log('🎫 Webhook project:', req.body.issue?.fields?.project?.key);
    
    // Only process AS project webhooks
    if (req.body.issue?.fields?.project?.key !== 'AS') {
      console.log('⚠️ Skipping webhook for non-AS project');
      return res.status(200).send('Skipped non-AS project');
    }

    console.log('📦 Full webhook data:', JSON.stringify(webhookData, null, 2));

    // Basic validation
    if (!webhookData || !webhookData.issue) {
      console.log('❌ Invalid webhook data - missing required fields');
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    console.log('🎫 Issue details:', {
      key: webhookData.issue.key,
      event: webhookData.webhookEvent,
      hasChangelog: !!webhookData.changelog,
      changeItems: webhookData.changelog?.items?.length || 0
    });

    const issueKey = webhookData.issue.key;
    const currentStatus = webhookData.issue.fields.status.name;
    const isNewRequest = currentStatus.toUpperCase() === 'NEW REQUEST';

    // Handle new issue creation
    if (webhookData.webhookEvent === 'jira:issue_created') {
      console.log(`📦 New Issue Created - ${issueKey} with initial status: ${currentStatus}`);
      
      // Start tracking this new issue
      newIssueTracker.set(issueKey, {
        initialStatus: currentStatus,
        createdAt: new Date(),
        notified: false
      });

      // Set a timeout to check if the issue is still in New Request after a short delay
      setTimeout(async () => {
        const tracking = newIssueTracker.get(issueKey);
        if (tracking && !tracking.notified && isNewRequest) {
          try {
            // Double check the current status
            const response = await axios({
              method: 'GET',
              url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
              auth: {
                username: process.env.JIRA_EMAIL,
                password: process.env.JIRA_API_TOKEN
              }
            });

            const currentStatus = response.data.fields.status.name;
            if (currentStatus.toUpperCase() === 'NEW REQUEST') {
              console.log(`🆕 Sending notification for confirmed New Request: ${issueKey}`);
              
              try {
                await ensureChannelAccess(app, NEW_REQUEST_NOTIFICATION_CHANNEL);
              } catch (error) {
                if (!error.message.includes('already_in_channel')) {
                  throw error;
                }
              }

              await app.client.chat.postMessage({
                token: process.env.SLACK_BOT_TOKEN,
                channel: NEW_REQUEST_NOTIFICATION_CHANNEL,
                text: `New Campaign Request Created: ${issueKey}`,
                blocks: [
                  {
                    type: "header",
                    text: {
                      type: "plain_text",
                      text: "🆕 New Campaign Request Created",
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
                        text: `*Summary:*\n${webhookData.issue.fields.summary || 'No summary'}`
                      },
                      {
                        type: "mrkdwn",
                        text: `*Created By:*\n${webhookData.issue.fields.creator.displayName || 'Unknown'}`
                      },
                      {
                        type: "mrkdwn",
                        text: `*Created At:*\n${new Date(webhookData.issue.fields.created).toLocaleString()}`
                      }
                    ]
                  }
                ]
              });
              tracking.notified = true;
              console.log('✅ New Request notification sent successfully');
            }
          } catch (error) {
            console.error('❌ Error sending New Request notification:', error);
          }
        }
        // Clean up the tracker after we're done
        newIssueTracker.delete(issueKey);
      }, 2000); // Wait 2 seconds to check the final status
    }

    // Check for Status changes in both standard and custom fields
    if (webhookData.changelog?.items) {
      // Handle Status changes (customfield_10281)
      const statusChanges = webhookData.changelog.items.filter(item => 
        item.fieldId === 'customfield_10281'
      );

      // Handle Campaign Status changes (status field)
      const campaignStatusChanges = webhookData.changelog.items.filter(item => 
        item.field === 'status' || item.fieldId === 'status'
      );

      // Handle Assignee changes
      const assigneeChanges = webhookData.changelog.items.filter(item => 
        item.field === 'assignee'
      );

      console.log('🔄 Changes found:', {
        status: statusChanges,
        campaign: campaignStatusChanges,
        assignee: assigneeChanges
      });

      // Process Status changes
      for (const change of statusChanges) {
        try {
          const oldStatus = change.fromString;
          const newStatus = change.toString;
          const updatedBy = webhookData.user?.displayName || 'Unknown User';
          const summary = webhookData.issue.fields.summary || 'No Summary';

          console.log(`✨ Processing Status change:`, {
            issueKey,
            oldStatus,
            newStatus,
            updatedBy,
            summary
          });

          // Track the Status change
          clearTracking(issueKey, 'status');
          startTracking(issueKey, 'status', newStatus);
          console.log(`🕒 Started tracking Status for ${issueKey}: ${newStatus}`);

          // Send to Slack
          await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: process.env.SLACK_NOTIFICATION_CHANNEL,
            text: `Status updated for ${issueKey}`,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "🔄 Campaign Status Update",
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
                    text: `*Campaign:*\n${summary}`
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
                  }
                ]
              }
            ]
          });
          console.log('✅ Slack notification sent successfully');
        } catch (error) {
          console.error('❌ Error:', error);
        }
      }

      // Process Campaign Status changes
      for (const change of campaignStatusChanges) {
        try {
          const oldStatus = change.fromString;
          const newStatus = change.toString;
          const updatedBy = webhookData.user?.displayName || 'Unknown User';
          const summary = webhookData.issue.fields.summary || 'No Summary';

          // Track the Campaign Status change
          clearTracking(issueKey, 'campaign');
          startTracking(issueKey, 'campaign', newStatus, webhookData.issue);
          console.log(`🕒 Started tracking Campaign Status for ${issueKey}: ${newStatus}`);

          // Send Slack notification for Campaign Status change (but not for New Request)
          await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: process.env.SLACK_NOTIFICATION_CHANNEL,
            text: `Campaign Status updated for ${issueKey}`,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "🔄 Campaign Status Update",
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
                    text: `*Campaign:*\n${summary}`
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
                  }
                ]
              }
            ]
          });
          console.log('✅ Slack notification sent successfully');
        } catch (error) {
          console.error('❌ Error:', error);
        }
      }

      // Process Assignee changes
      for (const change of assigneeChanges) {
        try {
          const currentStatus = webhookData.issue.fields.status.name;

          // If it's a NEW REQUEST and someone was assigned, start tracking
          if (currentStatus.toUpperCase() === 'NEW REQUEST' && change.to) {
            console.log(`👤 Assignee added to NEW REQUEST ${issueKey}, starting timer`);
            clearTracking(issueKey, 'campaign');
            startTracking(issueKey, 'campaign', currentStatus, webhookData.issue);
          }
        } catch (error) {
          console.error('❌ Error handling assignee change:', error);
        }
      }
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
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