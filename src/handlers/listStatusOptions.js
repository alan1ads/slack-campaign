const axios = require('axios');
require('dotenv').config();

const listStatusOptions = async ({ command, ack, say }) => {
  await ack();

  // Create base64 encoded credentials
  const credentials = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString('base64');

  try {
    // First get the field metadata
    const fieldResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${process.env.JIRA_STATUS_FIELD}/context`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });

    const contextId = fieldResponse.data.values[0]?.id;

    if (!contextId) {
      throw new Error('Could not find context ID for the field');
    }

    // Get the options using the context ID
    const optionsResponse = await axios({
      method: 'GET',
      url: `https://${process.env.JIRA_HOST}/rest/api/3/field/${process.env.JIRA_STATUS_FIELD}/context/${contextId}/option`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });

    const options = optionsResponse.data.values;
    console.log('Found options:', options); // Debug log

    await say({
      text: 'Status Field Options',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Available Status Options:*\n${options.map(opt => `• \`${opt.value}\``).join('\n')}\n\n*For Reference:*\nField ID: ${process.env.JIRA_STATUS_FIELD}`
          }
        }
      ]
    });

  } catch (error) {
    console.error('Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });

    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
    const statusCode = error.response?.status || 'No status';

    await say({
      text: 'Error occurred',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Error Details:*\nStatus: ${statusCode}\nMessage: ${errorMessage}\n\n*Request Details:*\n• Host: ${process.env.JIRA_HOST}\n• Field ID: ${process.env.JIRA_STATUS_FIELD}`
          }
        }
      ]
    });
  }
};

module.exports = listStatusOptions;