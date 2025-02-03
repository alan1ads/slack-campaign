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

const searchIssues = async ({ command, ack, say }) => {
  await ack();
  const projectKey = command.text.toUpperCase();

  try {
    if (!projectKey) {
      await say({
        text: 'Available Projects',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Available Projects:*\n• AS: Creative Testing\n• FB: FB AD ACCTS\n• TPD: Tech Production Department\n\nUsage: `/search-issues AS`"
            }
          }
        ]
      });
      return;
    }

    const jqlQuery = `project = "${projectKey}" ORDER BY created DESC`;
    const issues = await jira.searchJira(jqlQuery, {maxResults: 20});
    
    if (issues.issues.length === 0) {
      await say({
        text: 'No issues found',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `No issues found in project ${projectKey}.`
            }
          }
        ]
      });
      return;
    }

    const issueList = issues.issues.map(issue => 
      `• *${issue.key}*: ${issue.fields.summary}`
    ).join('\n');

    await say({
      text: `Issues for ${projectKey}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Current Issues for ${projectKey}:*\n${issueList}`
          }
        }
      ]
    });

  } catch (error) {
    console.error('Error fetching issues:', error);
    await say({
      text: 'Error fetching issues',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Error fetching issues: ${error.message}. Please try again.`
          }
        }
      ]
    });
  }
};

module.exports = searchIssues;