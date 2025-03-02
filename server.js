const { App } = require('@slack/bolt');
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

// Import all handlers
const findJiraFields = require('./src/handlers/findJiraFields');
const { getJiraMetrics } = require('./src/utils/jiraMetrics');
const listStatusOptions = require('./src/handlers/listStatusOptions');
const { updateStatus, handleJiraWebhook } = require('./src/handlers/updateStatus');
const updateCampaignStatus = require('./src/handlers/updateCampaignStatus');
const checkStatus = require('./src/handlers/checkStatus');
const searchIssues = require('./src/handlers/searchIssues');
const reviewStart = require('./src/handlers/reviewStart');
const { checkStatusAlerts, checkStatusDuration, clearTracking, loadTrackingData } = require('./src/handlers/statusTimer');

// Import utilities
const { jira } = require('./src/utils/jiraClient');

// Initialize express app
const expressApp = express();

// Add middleware for parsing JSON bodies with increased size limit and logging
expressApp.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    console.log('🔄 Processing request body:', buf.toString());
    try {
      if (buf.length) {
        const json = JSON.parse(buf.toString());
        console.log('✅ Valid JSON received:', typeof json);
      }
    } catch (e) {
      console.log('❌ Error parsing JSON:', e);
    }
  }
}));

// Add raw body logging middleware
expressApp.use((req, res, next) => {
  console.log('📥 Request details:', {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    timestamp: new Date().toISOString()
  });

  if (req.method === 'POST') {
    console.log('📦 Request body:', {
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodyKeys: Object.keys(req.body || {}),
      rawBody: JSON.stringify(req.body, null, 2)
    });
  }
  next();
});

// Initialize Slack app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// Update the webhook endpoint in server.js
expressApp.post('/webhooks/jira-webhook', (req, res) => {
  console.log('🎯 Webhook endpoint hit:', {
    hasBody: !!req.body,
    bodyKeys: Object.keys(req.body || {}),
    contentType: req.headers['content-type']
  });
  
  if (!req.body || Object.keys(req.body).length === 0) {
    console.log('⚠️ Empty body received in webhook');
    return res.status(400).json({ error: 'Empty body received' });
  }
  
  return handleJiraWebhook(req, res, app);
});

// Health check endpoint
expressApp.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const { updateJiraIssue, handleJiraUpdateSubmission } = require('./updateJiraIssue');

// Command handlers
app.command('/jira-update', updateJiraIssue);
app.command('/check-status', checkStatus);
app.command('/search-issues', searchIssues);
app.command('/find-fields', findJiraFields);
app.command('/list-status', listStatusOptions);
app.command('/status-update', updateStatus);
app.command('/campaign-status-update', updateCampaignStatus);
app.command('/review-start', reviewStart);
app.command('/check-duration', checkStatusDuration);

// View submissions
app.view('jira_update_submission', handleJiraUpdateSubmission);

// Handle the review submission with updated fields
app.view('review_submission', async ({ ack, body, view, client }) => {
  await ack();
  
  try {
    const values = view.state.values;
    const channelId = JSON.parse(view.private_metadata).channel_id;
    
    const newIssue = await jira.addNewIssue({
      fields: {
        project: {
          key: process.env.JIRA_PROJECT_KEY
        },
        summary: values.campaign_name.campaign_name_input.value,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: values.description.description_input.value || ''
                }
              ]
            }
          ]
        },
        // Existing fields
        [process.env.JIRA_AD_ACCOUNT_FIELD]: values.ad_account.ad_account_input.value,
        [process.env.JIRA_VERTICAL_FIELD]: {
          id: values.vertical.vertical_input.selected_option.value
        },
        [process.env.JIRA_TRAFFIC_SOURCE_FIELD]: {
          id: values.traffic_source.traffic_source_input.selected_option.value
        },
        [process.env.JIRA_TEAM_MEMBER_FIELD]: {
          id: values.team_member.team_member_input.selected_option.value
        },
        
        // New fields (if provided in the form)
        ...(values.story_points?.story_points_input?.value && {
          [process.env.JIRA_STORY_POINTS_FIELD]: parseFloat(values.story_points.story_points_input.value)
        }),
        ...(values.sprint?.sprint_input?.selected_option?.value && {
          [process.env.JIRA_SPRINT_FIELD]: parseInt(values.sprint.sprint_input.selected_option.value)
        }),
        ...(values.epic_link?.epic_link_input?.selected_option?.value && {
          [process.env.JIRA_EPIC_LINK_FIELD]: values.epic_link.epic_link_input.selected_option.value
        }),
        ...(values.team?.team_input?.selected_option?.value && {
          [process.env.JIRA_TEAM_FIELD]: {
            id: values.team.team_input.selected_option.value
          }
        }),
        ...(values.department?.department_input?.selected_option?.value && {
          [process.env.JIRA_DEPARTMENT_FIELD]: {
            id: values.department.department_input.selected_option.value
          }
        }),
        ...(values.manager?.manager_input?.selected_option?.value && {
          [process.env.JIRA_MANAGER_FIELD]: {
            accountId: values.manager.manager_input.selected_option.value
          }
        }),
        ...(values.buddy?.buddy_input?.selected_option?.value && {
          [process.env.JIRA_BUDDY_FIELD]: {
            accountId: values.buddy.buddy_input.selected_option.value
          }
        }),
        ...(values.start_date?.start_date_input?.selected_date && {
          [process.env.JIRA_START_DATE_FIELD]: values.start_date.start_date_input.selected_date
        }),
        ...(values.environment?.environment_input?.value && {
          [process.env.JIRA_ENVIRONMENT_FIELD]: values.environment.environment_input.value
        }),
        ...(values.labels?.labels_input?.value && {
          [process.env.JIRA_LABELS_FIELD]: values.labels.labels_input.value.split(',').map(label => label.trim())
        })
      }
    });

    await client.chat.postMessage({
      channel: channelId,
      text: `Created new issue: ${newIssue.key} 🎉\nView it here: https://${process.env.JIRA_HOST}/browse/${newIssue.key}`
    });

  } catch (error) {
    console.error('Error creating issue:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `Error creating issue: ${error.response?.data?.errorMessages?.join(', ') || error.message}`
    });
  }
});

// Update metrics pull command to include all fields
app.command('/metrics-pull', async ({ command, ack, say }) => {
  await ack();
  const campaignId = command.text;

  try {
    if (!campaignId) {
      await say('Please provide a campaign ID: `/metrics-pull [campaign-id]`');
      return;
    }

    const metrics = await getJiraMetrics(campaignId);

    await say({
      text: `Metrics for campaign ${campaignId}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Metrics for Campaign ${campaignId}*\n*Campaign Name:* \`${metrics.summary}\``
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              `• ROI %: ${metrics.roi}`,
              `• CPI: ${metrics.cpi}`,
              `• Total Spend: ${metrics.spend}`,
              `• Conversions: ${metrics.conversions}`,
              `• Campaign Status: \`${metrics.campaignStatus}\``,
              `• Status: \`${metrics.status?.value || 'Not Set'}\``,
              `• Story Points: ${metrics.storyPoints || 'Not Set'}`,
              `• Sprint: ${metrics.sprint || 'Not Set'}`,
              `• Team: ${metrics.team || 'Not Set'}`,
              `• Department: ${metrics.department?.value || 'Not Set'}`,
              `• Manager: ${metrics.manager?.displayName || 'Not Set'}`,
              `• Buddy: ${metrics.buddy?.displayName || 'Not Set'}`,
              `• Start Date: ${metrics.startDate || 'Not Set'}`,
              `• Environment: ${metrics.environment || 'Not Set'}`,
              `• Last Updated: ${new Date(metrics.updated).toLocaleString()}`
            ].join('\n')
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error pulling metrics:', error);
    await say(`Error retrieving metrics: ${error.message}. Please try again.`);
  }
});

// After all the imports and before app initialization, add the reconnection function
const startSocketModeClient = async (app) => {
  try {
    await app.start();
    console.log('⚡️ Bolt app is running with Socket Mode!');
  } catch (error) {
    console.error('❌ Error starting Socket Mode:', error);
    // Try to reconnect after a delay
    setTimeout(() => startSocketModeClient(app), 5000);
  }
};

// Replace the existing start-up code at the bottom with this:
(async () => {
  try {
    // Load existing tracking data instead of clearing it
    loadTrackingData();

    // Set up periodic status checks (every minute)
    setInterval(async () => {
      try {
        await checkStatusAlerts(app);
      } catch (error) {
        console.error('Error in status check interval:', error);
      }
    }, 60000); // Check every minute

    // Add Socket Mode event listeners
    app.client.on('unable_to_socket_mode_start', async () => {
      console.log('🔌 Unable to start Socket Mode, attempting to reconnect...');
      setTimeout(() => startSocketModeClient(app), 5000);
    });

    app.client.on('disconnect', async () => {
      console.log('🔌 Socket Mode disconnected, attempting to reconnect...');
      setTimeout(() => startSocketModeClient(app), 5000);
    });

    app.client.on('reconnect', async () => {
      console.log('🔄 Socket Mode reconnected successfully');
    });

    // Start Socket Mode with error handling
    await startSocketModeClient(app);
    
    // Start Express server
    const port = process.env.PORT || 3000;
    expressApp.listen(port, () => {
      console.log(`Express server is running on port ${port}`);
    });
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
})();