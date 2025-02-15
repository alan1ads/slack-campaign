const express = require('express');
const router = express.Router();
const { handleJiraWebhook } = require('../handlers/updateStatus');

module.exports = (app) => {
  router.post('/jira-webhook', (req, res) => handleJiraWebhook(req, res, app));
  return router;
}; 