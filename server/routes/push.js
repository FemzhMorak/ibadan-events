const express = require('express');
const push = require('../push/webpush');

const router = express.Router();

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: push.getPublicKey(), configured: push.isConfigured() });
});

router.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription payload' });
  }
  push.addSubscription(subscription);
  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  push.removeSubscription(endpoint);
  res.json({ ok: true });
});

module.exports = router;
