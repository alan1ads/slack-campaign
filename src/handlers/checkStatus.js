const JiraApi = require('jira-client');
require('dotenv').config();

const jira = new JiraApi({
  protocol: 'https',
  host: process.env.JIRA_HOST,
  username: process.env.JIRA_EMAIL,
  password: process.env.JIRA_API_TOKEN,
  apiVersion: '3',
  strictSSL: true
});

// We'll update this mapping after seeing the actual values
const STATUS_EMOJIS = {
  'LET IT RIDE': '⚡',
  'ROLL OUT': '✅',
  'ANOTHER CHANCE': '🔄',
  'KILLED': '💀',
  'PHASE COMPLETE': '✨',
  'READY': '🟢'
};

const checkStatus = async ({ command, ack, say }) => {
  await ack();
  const issueKey = command.text;

  try {
    if (!issueKey) {
      await say({
        text: 'Please provide an issue key',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Please provide an issue key: `/check-status AS-10`"
            }
          }
        ]
      });
      return;
    }

    const issue = await jira.findIssue(issueKey);
    const customStatus = issue.fields[process.env.JIRA_STATUS_FIELD];
    const campaignStatus = issue.fields.status?.name || 'Unknown';
    
    let statusValue = customStatus?.value || 'Unknown';
    statusValue = statusValue.toUpperCase();
    const emoji = STATUS_EMOJIS[statusValue];

    await say({
      text: `Status for ${issueKey}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Status for ${issueKey}*\n*Campaign Name:* \`${issue.fields.summary}\`\n*Campaign Status:* \`${campaignStatus}\`\n*Status:* \`${statusValue}${emoji ? ` ${emoji}` : ''}\``
          }
        }
      ]
    });

  } catch (error) {
    console.error('Error checking status:', error);
    await say({
      text: 'Error checking status',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Error checking status: ${error.message}. Please try again.`
          }
        }
      ]
    });
  }
};

module.exports = checkStatus;