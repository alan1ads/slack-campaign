const { App } = require('@slack/bolt');
require('dotenv').config();
const http = require('http');

// Import all handlers
const findJiraFields = require('./src/handlers/findJiraFields');
const { getJiraMetrics } = require('./src/utils/jiraMetrics');
const listStatusOptions = require('./src/handlers/listStatusOptions');
const updateStatus = require('./src/handlers/updateStatus');
const updateCampaignStatus = require('./src/handlers/updateCampaignStatus');
const checkStatus = require('./src/handlers/checkStatus');
const searchIssues = require('./src/handlers/searchIssues');
const reviewStart = require('./src/handlers/reviewStart');

// Import utilities
const { jira } = require('./src/utils/jiraClient');

// Initialize app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
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

// Enhanced metrics pull command
app.command('/metrics-pull', async ({ command, ack, say }) => {
  await ack();
  const campaignId = command.text;

  try {
    if (!campaignId) {
      await say({
        text: 'Please provide a campaign ID',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: 'Please provide a campaign ID: `/metrics-pull [campaign-id]`'
            }
          }
        ]
      });
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
              `• Last Updated: ${new Date(metrics.updated).toLocaleString()}`
            ].join('\n')
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error pulling metrics:', error);
    await say({
      text: 'Error retrieving metrics',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Error retrieving metrics: ${error.message}. Please try again.`
          }
        }
      ]
    });
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Bolt app is running with Socket Mode!');

  // Create a basic HTTP server for health checks
  const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Health check passed');
  });

  server.listen(process.env.PORT || 3000);
})();