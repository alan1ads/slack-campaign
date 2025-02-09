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

// Mapping of custom fields to human-readable names
const CUSTOM_FIELD_NAMES = {
  // ... previous mapping ...
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
  try {
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
      // ... previous input field configs ...
    ];

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
          block_id: CUSTOM_FIELD_NAMES[field].toLowerCase().replace(/\s+/g, '_'),
          element: {
            type: 'static_select',
            action_id: `${CUSTOM_FIELD_NAMES[field].toLowerCase().replace(/\s+/g, '_')}_input`,
            placeholder: {
              type: 'plain_text',
              text: `Select ${CUSTOM_FIELD_NAMES[field]}`
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
            text: CUSTOM_FIELD_NAMES[field]
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