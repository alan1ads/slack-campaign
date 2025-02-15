const express = require('express');
const router = express.Router();
const { handleJiraWebhook } = require('../handlers/updateStatus');

module.exports = (app) => {
  router.post('/jira-webhook', express.json(), (req, res) => {
    console.log('🎯 Webhook route hit:', {
      method: req.method,
      path: req.path,
      url: req.url,
      contentType: req.headers['content-type'],
      hasBody: !!req.body,
      bodyKeys: Object.keys(req.body || {}),
      timestamp: new Date().toISOString()
    });

    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('⚠️ Warning: Empty request body received');
      return res.status(400).json({ error: 'Empty body received' });
    }

    console.log('📦 Webhook body:', JSON.stringify(req.body, null, 2));

    return handleJiraWebhook(req, res, app);
  });
  return router;
}; 