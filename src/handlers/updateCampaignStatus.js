const axios = require('axios');
require('dotenv').config();

const updateCampaignStatus = async ({ command, ack, say }) => {
  await ack();
  
  const [issueKey, ...statusParts] = command.text.split(' ');
  const inputStatus = statusParts.join(' ').toLowerCase();

  console.log('🔍 Getting statuses for project:', process.env.JIRA_PROJECT_KEY);

  try {
    // Get all available statuses from Jira
    const statusesResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/status`,
      auth: {
        username: process.env.JIRA_EMAIL,
        password: process.env.JIRA_API_TOKEN
      }
    });

    const availableStatuses = statusesResponse.data.filter(status => 
      status.scope?.project?.id === '10029' || // Creative Testing project ID
      status.scope?.project?.key === 'AS'
    );

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
