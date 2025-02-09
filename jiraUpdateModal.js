const axios = require('axios');
require('dotenv').config();

// Helper function to fetch field options dynamically
async function fetchFieldOptions(field, credentials) {
  try {
    // Get field context
    const contextResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${field}/context`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });

    const contextId = contextResponse.data.values[0]?.id;
    
    if (!contextId) {
      console.log(`No context found for field ${field}`);
      return [];
    }

    // Get field options
    const optionsResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${field}/context/${contextId}/option`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });

    return optionsResponse.data.values.map(option => ({
      text: {
        type: 'plain_text',
        text: option.value
      },
      value: option.id
    }));
  } catch (error) {
    console.error(`Error fetching options for ${field}:`, error.message);
    return [];
  }
}

// Helper function to fetch assignee options
async function fetchAssigneeOptions(credentials) {
  try {
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/users/picker`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });

    return response.data.users.map(user => ({
      text: {
        type: 'plain_text',
        text: user.displayName
      },
      value: user.accountId
    }));
  } catch (error) {
    console.error('Error fetching assignees:', error);
    return [];
  }
}

// Helper function to fetch component options
async function fetchComponentOptions(credentials) {
  try {
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/project/${process.env.JIRA_PROJECT_KEY}/components`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });

    return response.data.map(component => ({
      text: {
        type: 'plain_text',
        text: component.name
      },
      value: component.id
    }));
  } catch (error) {
    console.error('Error fetching components:', error);
    return [];
  }
}

// Mapping of custom fields to human-readable names
const CUSTOM_FIELD_NAMES = {
  [process.env.JIRA_ROI_FIELD]: 'ROI',
  [process.env.JIRA_CPI_FIELD]: 'CPI',
  [process.env.JIRA_SPEND_FIELD]: 'Total Spend',
  [process.env.JIRA_CONVERSIONS_FIELD]: 'Conversions',
  [process.env.JIRA_STATUS_FIELD]: 'Status',
  [process.env.JIRA_AD_ACCOUNT_FIELD]: 'Ad Account',
  [process.env.JIRA_VERTICAL_FIELD]: 'Vertical',
  [process.env.JIRA_TRAFFIC_SOURCE_FIELD]: 'Traffic Source',
  [process.env.JIRA_TEAM_MEMBER_FIELD]: 'Team Member',
  [process.env.JIRA_CREATIVE_LINK_FIELD]: 'Creative Link',
  
  // New fields
  [process.env.JIRA_START_DATE_FIELD]: 'Start Date',
  [process.env.JIRA_DUE_DATE_FIELD]: 'Due Date',
  [process.env.JIRA_DESCRIPTION_FIELD]: 'Description',
  [process.env.JIRA_SUMMARY_FIELD]: 'Summary',
  [process.env.JIRA_PRIORITY_FIELD]: 'Priority',
  [process.env.JIRA_STATUS_CATEGORY_DATE_FIELD]: 'Status Category Date',
  [process.env.JIRA_LAST_VIEWED_FIELD]: 'Last Viewed',
  [process.env.JIRA_ASSIGNEE_FIELD]: 'Assignee',
  [process.env.JIRA_COMPONENTS_FIELD]: 'Components',
  [process.env.JIRA_LABELS_FIELD]: 'Labels',
  [process.env.JIRA_TIME_ESTIMATE_FIELD]: 'Time Estimate',
  [process.env.JIRA_VERSIONS_FIELD]: 'Versions',
  [process.env.JIRA_ISSUE_LINKS_FIELD]: 'Issue Links'
};

// Fields that require option selection
const OPTION_FIELDS = [
  process.env.JIRA_VERTICAL_FIELD,
  process.env.JIRA_TRAFFIC_SOURCE_FIELD,
  process.env.JIRA_TEAM_MEMBER_FIELD,
  process.env.JIRA_STATUS_FIELD
];

// Generate Jira update modal
async function generateJiraUpdateModal(triggerId, issueKey) {
  // Prepare credentials
  const credentials = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString('base64');

  // Prepare modal blocks
  const modalBlocks = [];

  // Add issue key as hidden metadata
  const privateMetadata = JSON.stringify({ issueKey });

  // Define input field configurations
  const inputFieldConfigs = [
    { 
      blockId: 'ad_account', 
      label: 'Ad Account', 
      fieldId: process.env.JIRA_AD_ACCOUNT_FIELD 
    },
    { 
      blockId: 'roi', 
      label: 'ROI', 
      fieldId: process.env.JIRA_ROI_FIELD,
      type: 'number' 
    },
    { 
      blockId: 'cpi', 
      label: 'CPI', 
      fieldId: process.env.JIRA_CPI_FIELD,
      type: 'number' 
    },
    { 
      blockId: 'total_spend', 
      label: 'Total Spend', 
      fieldId: process.env.JIRA_SPEND_FIELD,
      type: 'number' 
    },
    { 
      blockId: 'conversions', 
      label: 'Conversions', 
      fieldId: process.env.JIRA_CONVERSIONS_FIELD,
      type: 'number' 
    },
    { 
      blockId: 'creative_link', 
      label: 'Creative Link', 
      fieldId: process.env.JIRA_CREATIVE_LINK_FIELD 
    },
    // New fields
    { 
      blockId: 'start_date', 
      label: 'Start Date', 
      fieldId: process.env.JIRA_START_DATE_FIELD,
      type: 'date'
    },
    { 
      blockId: 'summary', 
      label: 'Summary', 
      fieldId: process.env.JIRA_SUMMARY_FIELD 
    },
    { 
      blockId: 'description', 
      label: 'Description', 
      fieldId: process.env.JIRA_DESCRIPTION_FIELD,
      type: 'multiline'
    },
    { 
      blockId: 'status_category_date', 
      label: 'Status Category Date', 
      fieldId: process.env.JIRA_STATUS_CATEGORY_DATE_FIELD,
      type: 'date'
    },
    { 
      blockId: 'last_viewed', 
      label: 'Last Viewed', 
      fieldId: process.env.JIRA_LAST_VIEWED_FIELD,
      type: 'date'
    },
    { 
      blockId: 'time_estimate', 
      label: 'Time Estimate', 
      fieldId: process.env.JIRA_TIME_ESTIMATE_FIELD,
      type: 'number'
    }
  ];

  // Add simple input fields
  inputFieldConfigs.forEach(field => {
    const blockElement = {
      type: field.type === 'multiline' 
        ? 'plain_text_input' 
        : field.type === 'date' 
          ? 'datepicker' 
          : field.type === 'number' 
            ? 'plain_text_input' 
            : 'plain_text_input',
      action_id: `${field.blockId}_input`,
      placeholder: {
        type: 'plain_text',
        text: `Enter ${field.label}`
      }
    };

    // Add special properties for number inputs
    if (field.type === 'number') {
      blockElement.input_type = 'number';
    }

    // Add multiline property for description
    if (field.type === 'multiline') {
      blockElement.multiline = true;
    }

    modalBlocks.push({
      type: 'input',
      block_id: field.blockId,
      element: blockElement,
      label: {
        type: 'plain_text',
        text: field.label
      },
      optional: true
    });
  });

  // Fetch and add option-based fields
  for (const field of OPTION_FIELDS) {
    const options = await fetchFieldOptions(field, credentials);
    
    modalBlocks.push({
      type: 'input',
      block_id: CUSTOM_FIELD_NAMES[field].toLowerCase().replace(/\s+/g, '_'),
      element: {
        type: 'static_select',
        action_id: `${CUSTOM_FIELD_NAMES[field].toLowerCase().replace(/\s+/g, '_')}_input`,
        placeholder: {
          type: 'plain_text',
          text: `Select ${CUSTOM_FIELD_NAMES[field]}`
        },
        options: options
      },
      label: {
        type: 'plain_text',
        text: CUSTOM_FIELD_NAMES[field]
      },
      optional: true
    });
  }

  // Add priority field
  const priorityOptions = [
    { text: { type: 'plain_text', text: 'Lowest' }, value: '5' },
    { text: { type: 'plain_text', text: 'Low' }, value: '4' },
    { text: { type: 'plain_text', text: 'Medium' }, value: '3' },
    { text: { type: 'plain_text', text: 'High' }, value: '2' },
    { text: { type: 'plain_text', text: 'Highest' }, value: '1' }
  ];

  modalBlocks.push({
    type: 'input',
    block_id: 'priority',
    element: {
      type: 'static_select',
      action_id: 'priority_input',
      placeholder: {
        type: 'plain_text',
        text: 'Select Priority'
      },
      options: priorityOptions
    },
    label: {
      type: 'plain_text',
      text: 'Priority'
    },
    optional: true
  });

  // Add due date field
  modalBlocks.push({
    type: 'input',
    block_id: 'due_date',
    element: {
      type: 'datepicker',
      action_id: 'due_date_input',
      placeholder: {
        type: 'plain_text',
        text: 'Select Due Date'
      }
    },
    label: {
      type: 'plain_text',
      text: 'Due Date'
    },
    optional: true
  });

  // Add assignee field
  const assigneeOptions = await fetchAssigneeOptions(credentials);
  modalBlocks.push({
    type: 'input',
    block_id: 'assignee',
    element: {
      type: 'static_select',
      action_id: 'assignee_input',
      placeholder: {
        type: 'plain_text',
        text: 'Select Assignee'
      },
      options: assigneeOptions
    },
    label: {
      type: 'plain_text',
      text: 'Assignee'
    },
    optional: true
  });

  // Add components field
  const componentsOptions = await fetchComponentOptions(credentials);
  modalBlocks.push({
    type: 'input',
    block_id: 'components',
    element: {
      type: 'static_select',
      action_id: 'components_input',
      placeholder: {
        type: 'plain_text',
        text: 'Select Components'
      },
      options: componentsOptions
    },
    label: {
      type: 'plain_text',
      text: 'Components'
    },
    optional: true
  });

  // Construct full modal
  return {
    type: 'modal',
    callback_id: 'jira_update_submission',
    title: {
      type: 'plain_text',
      text: 'Update Jira Issue'
    },
    submit: {
      type: 'plain_text',
      text: 'Update'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    private_metadata: privateMetadata,
    blocks: modalBlocks
  };
}

module.exports = {
  generateJiraUpdateModal
};