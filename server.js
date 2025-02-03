const { App } = require('@slack/bolt');
require('dotenv').config();

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

// Add command handlers
app.command('/check-status', checkStatus);
app.command('/search-issues', searchIssues);
app.command('/find-fields', findJiraFields);
app.command('/list-status', listStatusOptions);
app.command('/status-update', updateStatus);
app.command('/campaign-status-update', updateCampaignStatus);
app.command('/review-start', reviewStart);

// Handle the modal submission
app.view('review_submission', async ({ ack, body, view, client }) => {
  await ack();
  
  try {
    const values = view.state.values;
    
    // Get the channel ID from the private_metadata
    const channelId = JSON.parse(view.private_metadata).channel_id;
    
    const newIssue = await jira.addNewIssue({
      fields: {
        project: {
          key: 'AS'
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
        [process.env.JIRA_CREATIVE_LINK_FIELD]: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: values.creative_link.creative_link_input.value || ''
                }
              ]
            }
          ]
        },
        issuetype: {
          name: 'Task'
        }
      }
    });

    // Send success message to the original channel
    await client.chat.postMessage({
      channel: channelId,
      text: `Successfully created issue ${newIssue.key}! 🎉\nView it here: https://${process.env.JIRA_HOST}/browse/${newIssue.key}`
    });

  } catch (error) {
    console.error('Error creating Jira issue:', error);
    // Send error message to the original channel
    await client.chat.postMessage({
      channel: channelId,
      text: `Error creating issue: ${error.message}`
    });
  }
});

// Handle /metrics-pull command
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

    // Get metrics from Jira
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
            text: `• ROI %: ${metrics.roi}\n• CPI: ${metrics.cpi}\n• Total Spend: ${metrics.spend}\n• Conversions: ${metrics.conversions}\n• Campaign Status: \`${metrics.campaignStatus}\`\n• Status: \`${metrics.status?.value || 'Not Set'}\`\n• Last Updated: ${new Date(metrics.updated).toLocaleString()}`
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
})();