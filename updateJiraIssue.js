const axios = require('axios');
const { generateJiraUpdateModal } = require('./jiraUpdateModal');
require('dotenv').config();

// Mapping of block IDs to Jira custom fields
const BLOCK_TO_FIELD_MAPPING = {
  'ad_account': process.env.JIRA_AD_ACCOUNT_FIELD,
  'vertical': process.env.JIRA_VERTICAL_FIELD,
  'traffic_source': process.env.JIRA_TRAFFIC_SOURCE_FIELD,
  'team_member': process.env.JIRA_TEAM_MEMBER_FIELD,
  'creative_link': process.env.JIRA_CREATIVE_LINK_FIELD,
  'roi': process.env.JIRA_ROI_FIELD,
  'cpi': process.env.JIRA_CPI_FIELD,
  'total_spend': process.env.JIRA_SPEND_FIELD,
  'conversions': process.env.JIRA_CONVERSIONS_FIELD,
  'status': process.env.JIRA_STATUS_FIELD,
  'start_date': process.env.JIRA_START_DATE_FIELD,
  'due_date': process.env.JIRA_DUE_DATE_FIELD,
  'description': process.env.JIRA_DESCRIPTION_FIELD,
  'summary': process.env.JIRA_SUMMARY_FIELD,
  'priority': process.env.JIRA_PRIORITY_FIELD,
  'status_category_changed_date': process.env.JIRA_STATUS_CATEGORY_DATE_FIELD,
  'last_viewed': process.env.JIRA_LAST_VIEWED_FIELD,
  'assignee': process.env.JIRA_ASSIGNEE_FIELD,
  'components': process.env.JIRA_COMPONENTS_FIELD,
  'labels': process.env.JIRA_LABELS_FIELD,
  'time_estimate': process.env.JIRA_TIME_ESTIMATE_FIELD,
  'versions': process.env.JIRA_VERSIONS_FIELD,
  
};

// Jira issue update handler
const updateJiraIssue = async ({ command, ack, client }) => {
  await ack();

  // Parse the command input
  const [issueKey] = command.text.split(' ');

  if (!issueKey) {
    await client.chat.postMessage({
      channel: command.channel_id,
      text: 'Please provide an issue key. Usage: `/jira-update ISSUE-KEY`'
    });
    return;
  }

  try {
    // Generate and open update modal
    const modal = await generateJiraUpdateModal(command.trigger_id, issueKey);
    
    await client.views.open({
      trigger_id: command.trigger_id,
      view: modal
    });
  } catch (error) {
    console.error('Error opening update modal:', error);
    await client.chat.postMessage({
      channel: command.channel_id,
      text: `Error opening update modal: ${error.message}`
    });
  }
};

// Handle modal submission
const handleJiraUpdateSubmission = async ({ body, client, ack }) => {
  await ack();

  try {
    // Extract issue key from private metadata
    const { issueKey } = JSON.parse(body.view.private_metadata);
    const values = body.view.state.values;

    // Prepare credentials
    const credentials = Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    // Prepare field updates
    const fieldUpdates = {};

    // Process each block
    for (const [blockId, blockValue] of Object.entries(values)) {
      // Get the input action ID
      const actionId = Object.keys(blockValue)[0];
      const value = blockValue[actionId].value || blockValue[actionId].selected_option?.value;

      // Skip empty values
      if (!value) continue;

      // Map block ID to Jira field
      const jiraField = BLOCK_TO_FIELD_MAPPING[blockId] || 
        (blockId === 'priority' ? 'priority' : 
         blockId === 'due_date' ? 'duedate' : null);

      if (!jiraField) continue;

      // Special handling for different field types
      if (['vertical', 'traffic_source', 'team_member', 'status'].includes(blockId)) {
        // Option-based fields require { id: fieldId }
        fieldUpdates[jiraField] = { id: value };
      } else if (['roi', 'cpi', 'total_spend', 'conversions'].includes(blockId)) {
        // Numeric fields
        fieldUpdates[jiraField] = parseFloat(value);
      } else if (blockId === 'priority') {
        // Priority field
        fieldUpdates[jiraField] = { id: value };
      } else if (blockId === 'due_date') {
        // Date field
        fieldUpdates[jiraField] = value;
      } else {
        // Text fields
        fieldUpdates[jiraField] = value;
      }
    }

    // Perform the update
    const updateResponse = await axios({
      method: 'PUT',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/issue/${issueKey}`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      data: { fields: fieldUpdates }
    });

    // Send success message
    await client.chat.postMessage({
      channel: body.user.id,
      text: `Successfully updated issue ${issueKey} 🎉`
    });

  } catch (error) {
    console.error('Error updating Jira issue:', error);
    
    // Send error message
    await client.chat.postMessage({
      channel: body.user.id,
      text: `Error updating issue: ${error.response?.data?.errorMessages?.join(', ') || error.message}`
    });
  }
};

module.exports = {
  updateJiraIssue,
  handleJiraUpdateSubmission
};