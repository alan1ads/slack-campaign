const axios = require('axios');
require('dotenv').config();

// Only track active status changes
let activeTracking = {
  status: {},      // For customfield_10281
  campaign: {}     // For status field
};

// Status thresholds (5 minutes = 0.0833 hours)
const STATUS_THRESHOLDS = {
  '🟢 Ready to Launch': 0.0833,
  '⚡ Let it Ride': 0.0833,
  '✅ Roll Out': 0.0833,
  '✨ Phase Complete': 0.0833,
  '💀 Killed': 0.0833,
  '🔁 Another Chance': 0.0833
};

// Start tracking when we get a webhook status change
const startTracking = (issueKey, statusType, statusValue) => {
  activeTracking[statusType][issueKey] = {
    status: statusValue,
    startTime: new Date()
  };
  console.log(`⏱️ Started tracking ${issueKey} ${statusType}: ${statusValue}`);
};

// Check durations and alert if needed
const checkStatusAlerts = async (app) => {
  try {
    const now = new Date();
    
    // Only check issues we're actively tracking
    for (const [issueKey, tracking] of Object.entries(activeTracking.status)) {
      const timeInStatus = now - tracking.startTime;
      const thresholdMs = 300000; // 5 minutes

      if (timeInStatus > thresholdMs) {
        console.log(`⚠️ Status threshold exceeded for ${issueKey}: ${Math.round(timeInStatus / 60000)}m in ${tracking.status}`);
        // Send alert...
      }
    }

    // Same for campaign status
    for (const [issueKey, tracking] of Object.entries(activeTracking.campaign)) {
      const timeInStatus = now - tracking.startTime;
      const thresholdMs = 300000; // 5 minutes

      if (timeInStatus > thresholdMs) {
        console.log(`⚠️ Campaign Status threshold exceeded for ${issueKey}: ${Math.round(timeInStatus / 60000)}m in ${tracking.status}`);
        // Send alert...
      }
    }
  } catch (error) {
    console.error('Error checking status alerts:', error);
  }
};

// Clear tracking when status changes or on startup
const clearTracking = (issueKey, statusType) => {
  if (issueKey && statusType) {
    // Clear specific issue tracking
    if (activeTracking[statusType][issueKey]) {
      delete activeTracking[statusType][issueKey];
      console.log(`🧹 Cleared ${statusType} tracking for ${issueKey}`);
    }
  } else {
    // Clear all tracking (on startup)
    activeTracking = {
      status: {},
      campaign: {}
    };
    console.log('🧹 Cleared all status tracking');
  }
};

module.exports = {
  startTracking,
  clearTracking,
  checkStatusAlerts
}; 