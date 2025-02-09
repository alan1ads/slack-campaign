const axios = require('axios');
const { generateJiraUpdateModal } = require('./jiraUpdateModal');
require('dotenv').config();

// Updated mapping of block IDs to Jira fields
const BLOCK_TO_FIELD_MAPPING = {
  // Existing fields
  'ad_account': process.env.JIRA_AD_ACCOUNT_FIELD,
  'vertical': process.env.JIRA_VERTICAL_FIELD,
  'traffic_source': process.env.JIRA_TRAFFIC_SOURCE_FIELD,
  'team_member': process.env.JIRA_TEAM_MEMBER_FIELD,
  'creative_link': process.env.JIRA_CREATIVE_LINK_FIELD,
  'roi': process.env.JIRA_ROI_FIELD,
  'cpi': process.env.JIRA_CPI_FIELD,
  'total_spend': process.env.JIRA_SPEND_FIELD,
  'conversions': process.env.JIRA_CONVERSIONS_FIELD,
  
  // System fields
  'status': process.env.JIRA_STATUS_FIELD,
  'priority': process.env.JIRA_PRIORITY_FIELD,
  'assignee': process.env.JIRA_ASSIGNEE_FIELD,
  'reporter': process.env.JIRA_REPORTER_FIELD,
  'description': process.env.JIRA_DESCRIPTION_FIELD,
  'summary': process.env.JIRA_SUMMARY_FIELD,
  'due_date': process.env.JIRA_DUE_DATE_FIELD,
  'components': process.env.JIRA_COMPONENTS_FIELD,
  'labels': process.env.JIRA_LABELS_FIELD,
  'time_estimate': process.env.JIRA_TIME_ESTIMATE_FIELD,
  'time_spent': process.env.JIRA_TIME_SPENT_FIELD,
  'versions': process.env.JIRA_VERSIONS_FIELD,
  'environment': process.env.JIRA_ENVIRONMENT_FIELD,
  
  // New custom fields
  'story_points': process.env.JIRA_STORY_POINTS_FIELD,
  'sprint': process.env.JIRA_SPRINT_FIELD,
  'epic_link': process.env.JIRA_EPIC_LINK_FIELD,
  'flagged': process.env.JIRA_FLAGGED_FIELD,
  'team': process.env.JIRA_TEAM_FIELD,
  'start_date': process.env.JIRA_START_DATE_FIELD,
  
  // Additional custom fields
  'department': process.env.JIRA_DEPARTMENT_FIELD,
  'manager': process.env.JIRA_MANAGER_FIELD,
  'buddy': process.env.JIRA_BUDDY_FIELD
};

// Add FIELD_TYPES constant at the top level
const FIELD_TYPES = {
  // Existing fields
  [process.env.JIRA_TEAM_MEMBER_FIELD]: 'option',
  [process.env.JIRA_AD_ACCOUNT_FIELD]: 'string',
  [process.env.JIRA_VERTICAL_FIELD]: 'option',
  [process.env.JIRA_TRAFFIC_SOURCE_FIELD]: 'option',
  [process.env.JIRA_CREATIVE_LINK_FIELD]: 'string',
  [process.env.JIRA_ROI_FIELD]: 'number',
  [process.env.JIRA_CPI_FIELD]: 'number',
  [process.env.JIRA_SPEND_FIELD]: 'number',
  [process.env.JIRA_CONVERSIONS_FIELD]: 'number',
  
  // System fields
  [process.env.JIRA_STATUS_FIELD]: 'status',
  [process.env.JIRA_PRIORITY_FIELD]: 'priority',
  [process.env.JIRA_ASSIGNEE_FIELD]: 'user',
  [process.env.JIRA_REPORTER_FIELD]: 'user',
  [process.env.JIRA_DESCRIPTION_FIELD]: 'string',
  [process.env.JIRA_SUMMARY_FIELD]: 'string',
  [process.env.JIRA_DUE_DATE_FIELD]: 'date',
  [process.env.JIRA_COMPONENTS_FIELD]: 'array',
  [process.env.JIRA_LABELS_FIELD]: 'array',
  [process.env.JIRA_TIME_ESTIMATE_FIELD]: 'number',
  [process.env.JIRA_TIME_SPENT_FIELD]: 'number',
  [process.env.JIRA_VERSIONS_FIELD]: 'array',
  [process.env.JIRA_ENVIRONMENT_FIELD]: 'string',
  
  // New custom fields
  [process.env.JIRA_STORY_POINTS_FIELD]: 'number',
  [process.env.JIRA_SPRINT_FIELD]: 'sprint',
  [process.env.JIRA_EPIC_LINK_FIELD]: 'epic',
  [process.env.JIRA_FLAGGED_FIELD]: 'boolean',
  [process.env.JIRA_TEAM_FIELD]: 'team',
  [process.env.JIRA_START_DATE_FIELD]: 'date',
  [process.env.JIRA_DEPARTMENT_FIELD]: 'option',
  [process.env.JIRA_MANAGER_FIELD]: 'user',
  [process.env.JIRA_BUDDY_FIELD]: 'user'
};

// Enhanced formatFieldValue function
function formatFieldValue(value, fieldType) {
  switch (fieldType) {
    case 'option':
      return { id: value };
    case 'number':
      return parseFloat(value);
    case 'date':
    case 'datetime':
      return value;
    case 'array':
      if (typeof value === 'string') {
        return value.split(',').map(item => item.trim());
      }
      return Array.isArray(value) ? value : [value];
    case 'user':
      return { accountId: value };
    case 'status':
      return { id: value };
    case 'priority':
      return { id: value };
    case 'sprint':
      return parseInt(value);
    case 'epic':
      return value;
    case 'boolean':
      return value === 'true';
    case 'team':
      return { id: value };
    case 'string':
      return value;
    default:
      return value;
  }
}

// Enhanced handleJiraUpdateSubmission
const handleJiraUpdateSubmission = async ({ body, client, ack }) => {
  await ack();

  try {
    const { issueKey } = JSON.parse(body.view.private_metadata);
    const values = body.view.state.values;
    const credentials = Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    const fieldUpdates = {};

    for (const [blockId, blockValue] of Object.entries(values)) {
      const actionId = Object.keys(blockValue)[0];
      let value = blockValue[actionId].value;

      // Handle different input types
      if (blockValue[actionId].selected_option) {
        value = blockValue[actionId].selected_option.value;
      } else if (blockValue[actionId].selected_options) {
        value = blockValue[actionId].selected_options.map(opt => opt.value);
      } else if (blockValue[actionId].selected_date) {
        value = blockValue[actionId].selected_date;
      }

      if (value === undefined || value === null) continue;

      const jiraField = BLOCK_TO_FIELD_MAPPING[blockId];
      if (!jiraField) continue;

      const fieldType = FIELD_TYPES[jiraField];
      fieldUpdates[jiraField] = formatFieldValue(value, fieldType);
    }

    // Special handling for description field (Jira's Atlassian Document Format)
    if (fieldUpdates[process.env.JIRA_DESCRIPTION_FIELD]) {
      fieldUpdates[process.env.JIRA_DESCRIPTION_FIELD] = {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: fieldUpdates[process.env.JIRA_DESCRIPTION_FIELD]
          }]
        }]
      };
    }

    await axios({
      method: 'PUT',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      data: { fields: fieldUpdates }
    });

    await client.chat.postMessage({
      channel: body.user.id,
      text: `Successfully updated issue ${issueKey} 🎉`
    });

  } catch (error) {
    console.error('Error updating Jira issue:', error);
    await client.chat.postMessage({
      channel: body.user.id,
      text: `Error updating issue: ${error.response?.data?.errorMessages?.join(', ') || error.message}`
    });
  }
};

// Add this function definition
const updateJiraIssue = async ({ command, ack, client }) => {
  await ack();
  
  try {
    const credentials = Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    const issueKey = command.text.trim();
    if (!issueKey) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: 'Please provide a Jira issue key'
      });
      return;
    }

    const modal = await generateJiraUpdateModal(issueKey, credentials);
    
    await client.views.open({
      trigger_id: command.trigger_id,
      view: modal
    });
  } catch (error) {
    console.error('Error opening modal:', error);
    await client.chat.postMessage({
      channel: command.channel_id,
      text: `Error: ${error.message}`
    });
  }
};

module.exports = {
  updateJiraIssue,
  handleJiraUpdateSubmission
};