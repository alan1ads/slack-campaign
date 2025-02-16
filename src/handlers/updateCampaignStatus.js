const axios = require('axios');
require('dotenv').config();
const { startTracking, clearTracking } = require('./statusTimer');

const updateCampaignStatus = async ({ command, ack, say }) => {
  await ack();
  
  const [issueKey, ...statusParts] = command.text.split(' ');
  const inputStatus = statusParts.join(' ').toLowerCase();

  // Verify this is an AS issue
  if (!issueKey.startsWith('AS-')) {
    await say('Please provide an AS project issue key: `/campaign-status-update AS-123 status`');
    return;
  }

  console.log('🔍 Getting statuses for project:', process.env.JIRA_PROJECT_KEY);

  try {
    // Get statuses only for AS project
    const statusesResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/project/AS/statuses`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    // Get Task type statuses
    const taskStatuses = statusesResponse.data.find(type => type.name === 'Task');
    if (!taskStatuses) {
      throw new Error('Could not find Task statuses for AS project');
    }

    const availableStatuses = taskStatuses.statuses;

    if (!issueKey || !inputStatus) {
      const statusList = availableStatuses
        .map(status => `• \`${status.name}\``)
        .join('\n');
      
      await say({
        text: 'Please provide both issue key and status',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Please provide both issue key and campaign status: \`/campaign-status-update [issue-key] [status]\`\n\n*Available Campaign Statuses:*\n${statusList}`
            }
          }
        ]
      });
      return;
    }

    // Find the matching status
    const matchingStatus = availableStatuses.find(
      status => status.name.toLowerCase() === inputStatus
    );

    if (!matchingStatus) {
      const validStatuses = availableStatuses
        .map(status => `• \`${status.name}\``)
        .join('\n');
      
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

    // Get available transitions for the issue
    const transitionsResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}/transitions`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    // Find the transition that matches our target status
    const transition = transitionsResponse.data.transitions.find(
      t => t.to.id === matchingStatus.id
    );

    if (!transition) {
      const availableTransitions = transitionsResponse.data.transitions
        .map(t => `\`${t.to.name}\``)
        .join(', ');

      throw new Error(
        `Cannot transition to "${matchingStatus.name}" from the current status. ` +
        `Available transitions are: ${availableTransitions}`
      );
    }

    // Perform the transition
    await axios({
      method: 'POST',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}/transitions`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      },
      data: {
        transition: {
          id: transition.id
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
    const updatedStatus = updatedIssue.fields.status.name;

    // Track the Campaign Status change
    clearTracking(issueKey, 'campaign');  // Clear old Campaign Status tracking
    startTracking(issueKey, 'campaign', matchingStatus.name);  // Start tracking new Campaign Status
    console.log(`🕒 Started tracking Campaign Status for ${issueKey}: ${matchingStatus.name}`);

    await say({
      text: `Campaign Status updated for ${issueKey}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Campaign Status Update for ${issueKey}*\n*Campaign Name:* \`${updatedIssue.fields.summary}\`\n*Campaign Status successfully updated to:* \`${updatedStatus}\``
          }
        }
      ]
    });

  } catch (error) {
    console.error('Error updating campaign status:', error);
    
    let errorMessage = error.message;
    if (error.response?.data?.errors) {
      errorMessage = Object.entries(error.response.data.errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join('\n');
    }

    await say({
      text: 'Error updating campaign status',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Error updating campaign status:\n\`\`\`${errorMessage}\`\`\`\nPlease try again with a valid status.`
          }
        }
      ]
    });
  }
};

module.exports = updateCampaignStatus;
