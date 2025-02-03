const getJiraMetrics = async (issueKey) => {
  try {
    const jira = new (require('jira-client'))({
      protocol: 'https',
      host: process.env.JIRA_HOST,
      username: process.env.JIRA_EMAIL,
      password: process.env.JIRA_API_TOKEN,
      apiVersion: '3',
      strictSSL: true
    });

    const issue = await jira.findIssue(issueKey);
    
    return {
      summary: issue.fields.summary || 'No Title',
      roi: issue.fields[process.env.JIRA_ROI_FIELD] || 'N/A',
      cpi: issue.fields[process.env.JIRA_CPI_FIELD] || 'N/A',
      spend: issue.fields[process.env.JIRA_SPEND_FIELD] || 'N/A',
      conversions: issue.fields[process.env.JIRA_CONVERSIONS_FIELD] || 'N/A',
      campaignStatus: issue.fields.status?.name || 'Unknown',
      status: issue.fields[process.env.JIRA_STATUS_FIELD],
      updated: issue.fields.updated
    };
  } catch (error) {
    console.error('Error getting Jira metrics:', error);
    throw error;
  }
};

module.exports = { getJiraMetrics };