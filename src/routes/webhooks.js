const express = require('express');
const router = express.Router();
const { handleJiraWebhook } = require('../handlers/updateStatus');

module.exports = (app) => {
  router.post('/jira-webhook', (req, res) => {
    console.log('🎯 Webhook route hit:', {
      method: req.method,
      path: req.path,
      url: req.url,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });

    // Log the raw body
    console.log('📦 Raw request body:', req.body);
    
    // Log the parsed body
    console.log('📨 Parsed webhook payload:', JSON.stringify(req.body, null, 2));

    // Check if body is empty
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('⚠️ Warning: Empty request body received');
    }

    return handleJiraWebhook(req, res, app);
  });
  return router;
}; 