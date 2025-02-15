const express = require('express');
const router = express.Router();
const { handleJiraWebhook } = require('../handlers/updateStatus');

module.exports = (app) => {
  router.post('/jira-webhook', (req, res) => {
    console.log('🎯 Webhook route hit:', {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body
    });
    return handleJiraWebhook(req, res, app);
  });
  return router;
}; 