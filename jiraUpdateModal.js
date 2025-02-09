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

// Rest of the code remains the same as in the previous implementation, 
// with these key changes in the modal generation:

// Modify the block creation for simple inputs:
inputFieldConfigs.forEach(field => {
  const blockElement = {
    type: field.type === 'multiline' 
      ? 'plain_text_input' 
      : field.type === 'date' 
        ? 'datepicker' 
        : field.type === 'number' 
          ? 'plain_text_input'  // Changed from number_input
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

  // Add number constraint for number inputs
  if (field.type === 'number') {
    blockElement.type = 'plain_text_input';
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

// Modify option-based field addition:
// Fetch and add option-based fields
for (const field of OPTION_FIELDS) {
  const options = await fetchFieldOptions(field, credentials);
  
  if (options.length > 0) {
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
    });
  }
}

// For assignee and component fields, ensure at least one option:
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