const { jira } = require('../utils/jiraClient');

const findJiraFields = async ({ command, ack, say }) => {
  await ack();

  if (!command.text) {
    await say({
      text: "Please provide a Jira issue key",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Error:* Please provide a Jira issue key\nUsage: `/find-fields ISSUE-123`"
          }
        }
      ]
    });
    return;
  }

  try {
    const issue = await jira.findIssue(command.text);
    
    const formattedFields = Object.entries(issue.fields).map(([key, value]) => {
      const valueString = typeof value === 'object' ? JSON.stringify(value) : value;
      return `• *${key}*: ${valueString}`;
    }).join('\n');

    // Split message if it's too long
    const chunks = formattedFields.match(/.{1,2900}/g) || [];

    await say({
      text: `Fields for issue ${command.text}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Jira Fields for Issue ${command.text}*`
          }
        }
      ]
    });

    for (const chunk of chunks) {
      await say({
        text: chunk,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "```" + chunk + "```"
            }
          }
        ]
      });
    }

  } catch (error) {
    console.error('Error finding Jira fields:', error);
    await say({
      text: "Error finding Jira fields",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Error finding Jira fields:* ${error.message}`
          }
        }
      ]
    });
  }
};

module.exports = findJiraFields;