const axios = require('axios');
require('dotenv').config();

// Helper function to fetch field options dynamically
async function fetchFieldOptions(field, credentials) {
  try {
    // Skip if field is not provided or empty
    if (!field) {
      console.log('Field ID not provided');
      return [];
    }

    // Get field context
    const contextResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${field}/context`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    }).catch(error => {
      console.log(`Field ${field} not found or not accessible`);
      return { data: { values: [] } };
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
    }).catch(error => {
      console.log(`No options found for field ${field}`);
      return { data: { values: [] } };
    });

    return optionsResponse.data.values.map(option => ({
      text: {
        type: 'plain_text',
        text: option.value || 'Unnamed Option'
      },
      value: option.id
    }));
  } catch (error) {
    console.error(`Error fetching options for ${field}:`, error.response?.data || error.message);
    return [];
  }
}

// Helper function to fetch assignee options
async function fetchAssigneeOptions(credentials) {
  try {
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/user/search`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      },
      params: {
        maxResults: 50
      }
    });

    return response.data.map(user => ({
      text: {
        type: 'plain_text',
        text: user.displayName || user.emailAddress
      },
      value: user.accountId
    })).slice(0, 100); // Limit to first 100 users
  } catch (error) {
    console.error('Error fetching assignees:', error.response?.data || error.message);
    return [];
  }
}

// Helper function to fetch component options
async function fetchComponentOptions(credentials) {
  try {
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/project`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });

    // Use projects as components if direct component fetch fails
    return response.data.map(project => ({
      text: {
        type: 'plain_text',
        text: project.name
      },
      value: project.id
    })).slice(0, 100); // Limit to first 100 projects
  } catch (error) {
    console.error('Error fetching components:', error.response?.data || error.message);
    return [];
  }
}

// Helper function to safely get field name
function getFieldName(fieldId) {
  const customFieldNames = {
    [process.env.JIRA_TEAM_MEMBER_FIELD]: 'Team Member',
    [process.env.JIRA_AD_ACCOUNT_FIELD]: 'Ad Account',
    [process.env.JIRA_VERTICAL_FIELD]: 'Vertical',
    [process.env.JIRA_TRAFFIC_SOURCE_FIELD]: 'Traffic Source',
    [process.env.JIRA_CREATIVE_LINK_FIELD]: 'Creative Link',
    [process.env.JIRA_ROI_FIELD]: 'ROI',
    [process.env.JIRA_CPI_FIELD]: 'CPI',
    [process.env.JIRA_SPEND_FIELD]: 'Total Spend',
    [process.env.JIRA_CONVERSIONS_FIELD]: 'Conversions',
    [process.env.JIRA_STORY_POINTS_FIELD]: 'Story Points',
    [process.env.JIRA_SPRINT_FIELD]: 'Sprint',
    [process.env.JIRA_EPIC_LINK_FIELD]: 'Epic Link',
    [process.env.JIRA_FLAGGED_FIELD]: 'Flagged',
    [process.env.JIRA_TEAM_FIELD]: 'Team',
    [process.env.JIRA_DEPARTMENT_FIELD]: 'Department',
    [process.env.JIRA_MANAGER_FIELD]: 'Manager',
    [process.env.JIRA_BUDDY_FIELD]: 'Buddy',
    [process.env.JIRA_START_DATE_FIELD]: 'Start Date',
    [process.env.JIRA_ENVIRONMENT_FIELD]: 'Environment',
    [process.env.JIRA_LABELS_FIELD]: 'Labels',
    [process.env.JIRA_COMPONENTS_FIELD]: 'Components',
    [process.env.JIRA_PRIORITY_FIELD]: 'Priority',
    [process.env.JIRA_STATUS_FIELD]: 'Status',
    [process.env.JIRA_ASSIGNEE_FIELD]: 'Assignee',
    [process.env.JIRA_DUE_DATE_FIELD]: 'Due Date',
    [process.env.JIRA_TIME_ESTIMATE_FIELD]: 'Time Estimate',
    [process.env.JIRA_TIME_SPENT_FIELD]: 'Time Spent'
  };

  return customFieldNames[fieldId] || fieldId || 'Unknown Field';
}

// Update OPTION_FIELDS array to include all select/user fields
const OPTION_FIELDS = [
  process.env.JIRA_VERTICAL_FIELD,
  process.env.JIRA_TRAFFIC_SOURCE_FIELD,
  process.env.JIRA_TEAM_MEMBER_FIELD,
  process.env.JIRA_STATUS_FIELD,
  process.env.JIRA_SPRINT_FIELD,
  process.env.JIRA_EPIC_LINK_FIELD,
  process.env.JIRA_TEAM_FIELD,
  process.env.JIRA_DEPARTMENT_FIELD,
  process.env.JIRA_MANAGER_FIELD,
  process.env.JIRA_BUDDY_FIELD
];

// Update FIELD_TYPES with all fields
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
  [process.env.JIRA_CREATED_FIELD]: 'datetime',
  [process.env.JIRA_UPDATED_FIELD]: 'datetime',
  [process.env.JIRA_DUE_DATE_FIELD]: 'date',
  [process.env.JIRA_COMPONENTS_FIELD]: 'array',
  [process.env.JIRA_LABELS_FIELD]: 'array',
  [process.env.JIRA_TIME_ESTIMATE_FIELD]: 'number',
  [process.env.JIRA_TIME_SPENT_FIELD]: 'number',
  [process.env.JIRA_VERSIONS_FIELD]: 'array',
  [process.env.JIRA_ISSUE_LINKS_FIELD]: 'array',
  [process.env.JIRA_ENVIRONMENT_FIELD]: 'string',
  [process.env.JIRA_ATTACHMENT_FIELD]: 'array',
  [process.env.JIRA_WORKLOG_FIELD]: 'array',
  [process.env.JIRA_COMMENT_FIELD]: 'comments-page',
  
  // New custom fields
  [process.env.JIRA_STORY_POINTS_FIELD]: 'number',
  [process.env.JIRA_SPRINT_FIELD]: 'sprint',
  [process.env.JIRA_EPIC_LINK_FIELD]: 'epic',
  [process.env.JIRA_FLAGGED_FIELD]: 'boolean',
  [process.env.JIRA_TEAM_FIELD]: 'team',
  [process.env.JIRA_DEPARTMENT_FIELD]: 'select',
  [process.env.JIRA_MANAGER_FIELD]: 'user',
  [process.env.JIRA_BUDDY_FIELD]: 'user',
  [process.env.JIRA_START_DATE_FIELD]: 'date',
  [process.env.JIRA_LABELS_FIELD]: 'text',
  [process.env.JIRA_COMPONENTS_FIELD]: 'select',
  [process.env.JIRA_PRIORITY_FIELD]: 'select',
  [process.env.JIRA_STATUS_FIELD]: 'select',
  [process.env.JIRA_ASSIGNEE_FIELD]: 'user',
  [process.env.JIRA_DUE_DATE_FIELD]: 'date',
  [process.env.JIRA_TIME_ESTIMATE_FIELD]: 'number',
  [process.env.JIRA_TIME_SPENT_FIELD]: 'number'
};

// Update inputFieldConfigs with new fields
const inputFieldConfigs = [
  {
    blockId: 'summary',
    label: 'Summary',
    type: 'plain_text'
  },
  {
    blockId: 'description',
    label: 'Description',
    type: 'multiline'
  },
  {
    blockId: 'ad_account',
    label: 'Ad Account',
    type: 'plain_text'
  },
  {
    blockId: 'creative_link',
    label: 'Creative Link',
    type: 'plain_text'
  },
  {
    blockId: 'roi',
    label: 'ROI',
    type: 'number'
  },
  {
    blockId: 'cpi',
    label: 'CPI',
    type: 'number'
  },
  {
    blockId: 'total_spend',
    label: 'Total Spend',
    type: 'number'
  },
  {
    blockId: 'conversions',
    label: 'Conversions',
    type: 'number'
  },
  {
    blockId: 'story_points',
    label: 'Story Points',
    type: 'number'
  },
  {
    blockId: 'environment',
    label: 'Environment',
    type: 'multiline'
  },
  {
    blockId: 'time_estimate',
    label: 'Time Estimate (hours)',
    type: 'number'
  },
  {
    blockId: 'time_spent',
    label: 'Time Spent (hours)',
    type: 'number'
  },
  {
    blockId: 'labels',
    label: 'Labels (comma-separated)',
    type: 'plain_text'
  }
];

// Generate Jira update modal
async function generateJiraUpdateModal(issueKey, credentials) {
  try {
    // Prepare credentials
    const credentials = Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    // Prepare modal blocks
    const modalBlocks = [];

    // Add issue key as hidden metadata
    const privateMetadata = JSON.stringify({ issueKey });

    // Wrapper function to fetch options safely
    const fetchOptionsWithFallback = async (fetchFunc) => {
      try {
        return await fetchFunc(credentials);
      } catch (error) {
        console.error('Error fetching options:', error);
        return [];
      }
    };

    // Add simple input fields
    const processedBlocks = inputFieldConfigs.map(field => {
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

      // Add multiline property for description
      if (field.type === 'multiline') {
        blockElement.multiline = true;
      }

      return {
        type: 'input',
        block_id: field.blockId,
        element: blockElement,
        label: {
          type: 'plain_text',
          text: field.label
        },
        optional: true
      };
    });

    modalBlocks.push(...processedBlocks);

    // Fetch and add option-based fields
    const optionFieldPromises = OPTION_FIELDS.map(async (field) => {
      const options = await fetchFieldOptions(field, credentials);
      
      if (options.length > 0) {
        return {
          type: 'input',
          block_id: getFieldName(field).toLowerCase().replace(/\s+/g, '_'),
          element: {
            type: 'static_select',
            action_id: `${getFieldName(field).toLowerCase().replace(/\s+/g, '_')}_input`,
            placeholder: {
              type: 'plain_text',
              text: `Select ${getFieldName(field)}`
            },
            options: options.length > 0 ? options : [
              {
                text: { type: 'plain_text', text: 'No options available' },
                value: 'none'
              }
            ]
          },
          label: {
            type: 'plain_text',
            text: getFieldName(field)
          },
          optional: true
        };
      }
      return null;
    });

    const optionFieldBlocks = await Promise.all(optionFieldPromises);
    modalBlocks.push(...optionFieldBlocks.filter(block => block !== null));

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

    // Fetch and add assignee field
    const assigneeOptions = await fetchOptionsWithFallback(fetchAssigneeOptions);
    if (assigneeOptions.length > 0) {
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
          options: assigneeOptions.length > 0 ? assigneeOptions : [
            {
              text: { type: 'plain_text', text: 'No assignees found' },
              value: 'none'
            }
          ]
        },
        label: {
          type: 'plain_text',
          text: 'Assignee'
        },
        optional: true
      });
    }

    // Fetch and add components field
    const componentOptions = await fetchOptionsWithFallback(fetchComponentOptions);
    if (componentOptions.length > 0) {
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
          options: componentOptions.length > 0 ? componentOptions : [
            {
              text: { type: 'plain_text', text: 'No components found' },
              value: 'none'
            }
          ]
        },
        label: {
          type: 'plain_text',
          text: 'Components'
        },
        optional: true
      });
    }

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
  } catch (error) {
    console.error('Error generating modal:', error);
    throw error;
  }
}

module.exports = {
  generateJiraUpdateModal
};