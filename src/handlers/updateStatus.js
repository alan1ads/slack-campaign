const axios = require('axios');
require('dotenv').config();

// Map the user-friendly commands to exact Jira values
const STATUS_MAP = {
  'ready': '🟢 Ready to Launch',
  'killed': '💀 Killed',
  'another chance': '🔁 Another Chance',
  'let it ride': '⚡ Let it Ride',
  'roll out': '✅ Roll Out',
  'phase complete': '✨ Phase Complete'
};

const updateStatus = async ({ command, ack, say }) => {
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

module.exports = updateStatus;