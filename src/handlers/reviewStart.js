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
  const response = await axios({
    method: 'GET',
    url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${fieldId}/context/10000/option`,
    auth: {
      username: process.env.JIRA_EMAIL,
      password: process.env.JIRA_API_TOKEN
    }
  });
  
  return response.data.values.map(option => ({
    text: {
      type: 'plain_text',
      text: option.value
    },
    value: option.id
  }));
};

const reviewStart = async ({ command, ack, client }) => {
  await ack();

  try {
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
              options: [
                {
                  text: {
                    type: 'plain_text',
                    text: 'Medicare'
                  },
                  value: '10586'
                }
                // Add other verticals here
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
              options: [
                {
                  text: {
                    type: 'plain_text',
                    text: 'Facebook'
                  },
                  value: '10572'
                }
                // Add other traffic sources here
              ]
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
                text: 'Select Team Member'
              },
              options: [
                {
                  text: {
                    type: 'plain_text',
                    text: 'Creative Dept'
                  },
                  value: '10777'
                }
                // Add other team members here
              ]
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
