const { jira } = require('../utils/jiraClient');
const axios = require('axios');

const FORM_BLOCKS = {
  type: 'modal',
  callback_id: 'review_submission',
  title: {
    type: 'plain_text',
    text: 'Start New Review'
  },
  submit: {
    type: 'plain_text',
    text: 'Submit'
  },
  blocks: [
    {
      type: 'input',
      block_id: 'summary_block',
      element: {
        type: 'plain_text_input',
        action_id: 'summary',
        placeholder: {
          type: 'plain_text',
          text: 'e.g., Facebook Submission 123'
        }
      },
      label: {
        type: 'plain_text',
        text: 'Campaign Name'
      }
    },
    {
      type: 'input',
      block_id: 'ad_account_block',
      element: {
        type: 'plain_text_input',
        action_id: 'ad_account',
        placeholder: {
          type: 'plain_text',
          text: 'e.g., Nitido 8684'
        }
      },
      label: {
        type: 'plain_text',
        text: 'Ad Account'
      }
    },
    {
      type: 'input',
      block_id: 'vertical_block',
      element: {
        type: 'static_select',
        action_id: 'vertical',
        placeholder: {
          type: 'plain_text',
          text: 'Select a vertical'
        },
        options: [
          {
            text: {
              type: 'plain_text',
              text: 'Medicare'
            },
            value: '10586'
          }
          // Add more options based on your Jira configuration
        ]
      },
      label: {
        type: 'plain_text',
        text: 'Vertical'
      }
    },
    {
      type: 'input',
      block_id: 'traffic_source_block',
      element: {
        type: 'static_select',
        action_id: 'traffic_source',
        placeholder: {
          type: 'plain_text',
          text: 'Select traffic source'
        },
        options: [
          {
            text: {
              type: 'plain_text',
              text: 'Facebook'
            },
            value: '10572'
          }
          // Add more options based on your Jira configuration
        ]
      },
      label: {
        type: 'plain_text',
        text: 'Traffic Source'
      }
    },
    {
      type: 'input',
      block_id: 'team_member_block',
      element: {
        type: 'static_select',
        action_id: 'team_member',
        placeholder: {
          type: 'plain_text',
          text: 'Select team member'
        },
        options: [
          {
            text: {
              type: 'plain_text',
              text: 'Creative Dept'
            },
            value: '10777'
          }
          // Add more options based on your Jira configuration
        ]
      },
      label: {
        type: 'plain_text',
        text: 'Team Member'
      }
    },
    {
      type: 'input',
      block_id: 'description_block',
      element: {
        type: 'plain_text_input',
        action_id: 'description',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: 'Enter campaign details...'
        }
      },
      label: {
        type: 'plain_text',
        text: 'Description'
      }
    },
    {
      type: 'input',
      block_id: 'creative_link_block',
      element: {
        type: 'url_text_input',
        action_id: 'creative_link',
        placeholder: {
          type: 'plain_text',
          text: 'Enter Google Drive link'
        }
      },
      label: {
        type: 'plain_text',
        text: 'Creative Link'
      }
    }
  ]
};

const getFieldOptions = async (fieldId) => {
  try {
    console.log(`Fetching options for field ${fieldId}`);
    
    // Map of field IDs to their context IDs
    const contextIds = {
      'customfield_10195': '10316', // Vertical
      'customfield_10194': '10315'  // Traffic Source
    };
    
    const contextId = contextIds[fieldId];
    console.log(`Field ${fieldId} mapped to context ${contextId}`);
    
    if (!contextId) {
      console.warn(`No context ID found for field ${fieldId}`);
      return [];
    }
    
    const url = `https://${process.env.JIRA_HOST}/rest/api/3/field/${fieldId}/context/${contextId}/option`;
    console.log('Making request to URL:', url);

    const response = await axios({
      method: 'GET',
      url: url,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
        ).toString('base64')}`
      }
    });
    
    console.log(`Response status for ${fieldId}:`, response.status);
    
    if (response.data && response.data.values && response.data.values.length > 0) {
      return response.data.values.map(option => ({
        text: {
          type: 'plain_text',
          text: option.value
        },
        value: option.id
      }));
    }
    
    return [];
  } catch (error) {
    console.error(`Error fetching field options for ${fieldId}:`, error.message);
    // Fallback options for verticals if API fails
    if (fieldId === 'customfield_10195') {
      return [
        { text: { type: 'plain_text', text: 'ACA Spanish' }, value: '10582' },
        { text: { type: 'plain_text', text: 'ACA' }, value: '10583' },
        { text: { type: 'plain_text', text: 'Debt Relief' }, value: '10584' },
        { text: { type: 'plain_text', text: 'Debt Spanish' }, value: '10585' },
        { text: { type: 'plain_text', text: 'Medicare' }, value: '10586' },
        { text: { type: 'plain_text', text: 'Medicare (Spanish)' }, value: '10587' },
        { text: { type: 'plain_text', text: 'MVA' }, value: '10588' },
        { text: { type: 'plain_text', text: 'Auto Insurance' }, value: '10589' },
        { text: { type: 'plain_text', text: 'Final Expense' }, value: '10590' },
        { text: { type: 'plain_text', text: 'Solar' }, value: '10591' },
        { text: { type: 'plain_text', text: 'Loan' }, value: '10592' },
        { text: { type: 'plain_text', text: 'Refinance' }, value: '10593' },
        { text: { type: 'plain_text', text: 'Ecomm' }, value: '10594' },
        { text: { type: 'plain_text', text: 'Web' }, value: '10615' },
        { text: { type: 'plain_text', text: 'All' }, value: '10616' }
      ];
    }
    return [];
  }
};

const getTeamMemberOptions = async () => {
  try {
    // Create base64 encoded credentials
    const credentials = Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    // Get the field options directly from Jira
    const response = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${process.env.JIRA_TEAM_MEMBER_FIELD}/option`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });

    if (response.data && response.data.values) {
      return response.data.values.map(option => ({
        text: { 
          type: 'plain_text', 
          text: option.value 
        },
        value: option.id
      }));
    }

    // Fallback to default options if API fails
    console.warn('No options returned from API, using defaults');
    return [
      {
        text: { type: 'plain_text', text: 'Creative Dept' },
        value: '10775'
      },
      {
        text: { type: 'plain_text', text: 'Brian' },
        value: '10776'
      },
      {
        text: { type: 'plain_text', text: 'Josh' },
        value: '10777'
      },
      {
        text: { type: 'plain_text', text: 'Muthaher' },
        value: '10778'
      }
    ];
  } catch (error) {
    console.error('Error getting team member options:', error);
    // Return default options on error
    return [
      {
        text: { type: 'plain_text', text: 'Creative Dept' },
        value: '10775'
      },
      {
        text: { type: 'plain_text', text: 'Brian' },
        value: '10776'
      },
      {
        text: { type: 'plain_text', text: 'Josh' },
        value: '10777'
      },
      {
        text: { type: 'plain_text', text: 'Muthaher' },
        value: '10778'
      }
    ];
  }
};

const reviewStart = async ({ command, ack, client }) => {
  await ack();

  try {
    // Fetch all options
    const [verticalOptions, trafficSourceOptions] = await Promise.all([
      getFieldOptions(process.env.JIRA_VERTICAL_FIELD),
      getFieldOptions(process.env.JIRA_TRAFFIC_SOURCE_FIELD)
    ]);
    
    // Get team member options
    const teamMemberOptions = await getTeamMemberOptions();
    
    if (!teamMemberOptions.length) {
      throw new Error('No team member options available');
    }

    const result = await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'review_submission',
        private_metadata: JSON.stringify({ channel_id: command.channel_id }),
        title: {
          type: 'plain_text',
          text: 'New Campaign Review'
        },
        submit: {
          type: 'plain_text',
          text: 'Submit'
        },
        blocks: [
          {
            type: 'input',
            block_id: 'campaign_name',
            element: {
              type: 'plain_text_input',
              action_id: 'campaign_name_input',
              placeholder: {
                type: 'plain_text',
                text: 'e.g., Facebook Submission 123'
              }
            },
            label: {
              type: 'plain_text',
              text: 'Campaign Name'
            }
          },
          {
            type: 'input',
            block_id: 'ad_account',
            element: {
              type: 'plain_text_input',
              action_id: 'ad_account_input',
              placeholder: {
                type: 'plain_text',
                text: 'e.g., Nitido 8684'
              }
            },
            label: {
              type: 'plain_text',
              text: 'Ad Account'
            }
          },
          {
            type: 'input',
            block_id: 'vertical',
            element: {
              type: 'static_select',
              action_id: 'vertical_input',
              placeholder: {
                type: 'plain_text',
                text: 'Select Vertical'
              },
              options: verticalOptions.length > 0 ? verticalOptions : [
                { text: { type: 'plain_text', text: 'Medicare' }, value: '10586' }
              ]
            },
            label: {
              type: 'plain_text',
              text: 'Vertical'
            }
          },
          {
            type: 'input',
            block_id: 'traffic_source',
            element: {
              type: 'static_select',
              action_id: 'traffic_source_input',
              placeholder: {
                type: 'plain_text',
                text: 'Select Traffic Source'
              },
              options: trafficSourceOptions
            },
            label: {
              type: 'plain_text',
              text: 'Traffic Source'
            }
          },
          {
            type: 'input',
            block_id: 'team_member',
            element: {
              type: 'static_select',
              action_id: 'team_member_input',
              placeholder: {
                type: 'plain_text',
                text: 'Select team member'
              },
              options: teamMemberOptions
            },
            label: {
              type: 'plain_text',
              text: 'Team Member'
            }
          },
          {
            type: 'input',
            block_id: 'description',
            element: {
              type: 'plain_text_input',
              action_id: 'description_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: 'Enter campaign details and requirements...'
              }
            },
            label: {
              type: 'plain_text',
              text: 'Description'
            }
          },
          {
            type: 'input',
            block_id: 'creative_link',
            element: {
              type: 'plain_text_input',
              action_id: 'creative_link_input',
              placeholder: {
                type: 'plain_text',
                text: 'Enter Google Drive link'
              }
            },
            label: {
              type: 'plain_text',
              text: 'Creative Link'
            }
          }
        ]
      }
    });
    console.log('Modal opened successfully:', result);
  } catch (error) {
    console.error('Error opening modal:', error);
    await client.chat.postMessage({
      channel: command.channel_id,
      text: `Error starting review process: ${error.message}`
    });
  }
};

module.exports = reviewStart;
