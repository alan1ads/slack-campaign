// test-jira.js (fixed)
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

async function testJiraConnection() {
  try {
    // Get recent issues from AS project - note the quotes around "AS"
    const issues = await jira.searchJira('project = "AS" ORDER BY created DESC', {maxResults: 10});
    console.log('Recent issues from Creative Testing (AS):');
    issues.issues.forEach(issue => {
      console.log(`- ${issue.key}: ${issue.fields.summary}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testJiraConnection();