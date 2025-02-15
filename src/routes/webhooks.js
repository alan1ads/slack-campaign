const express = require('express');
const router = express.Router();
const { handleJiraWebhook } = require('../handlers/updateStatus');

module.exports = (app) => {
  router.post('/jira-webhook', (req, res) => {
    console.log('🎯 Webhook route hit:', {
      method: req.method,
      path: req.path,
      url: req.url,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // Log the request regardless of secret validation
    console.log('📨 Webhook payload:', JSON.stringify(req.body, null, 2));

    return handleJiraWebhook(req, res, app);
  });
  return router;
}; 