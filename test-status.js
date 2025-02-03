// test-status.js
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

async function testStatusField() {
  try {
    // Get an example issue
    const issueKey = 'AS-10'; // Use any valid issue key
    const issue = await jira.findIssue(issueKey);
    
    console.log('All Fields:');
    console.log(JSON.stringify(issue.fields, null, 2));
    
    // Try to update the status
    console.log('\nTrying to update status...');
    const updateResult = await jira.updateIssue(issueKey, {
      fields: {
        [process.env.JIRA_STATUS_FIELD]: {
          value: "In Progress"  // Try with a simple value first
        }
      }
    });
    
    console.log('Update Result:', updateResult);
    
  } catch (error) {
    console.error('Error:', error.response?.body || error.message);
  }
}

testStatusField();