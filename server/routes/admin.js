// Manual/cron-triggered maintenance endpoints: crawling allevents.in and
// sending the morning push digest. These do real outbound work (dozens of
// HTTP requests, geocoding) so they're gated behind CRON_SECRET — set that
// env var and Vercel automatically sends `Authorization: Bearer
// $CRON_SECRET` when it triggers a Cron Job, which is exactly what this
// checks. If CRON_SECRET isn't set, requests are allowed through
// (keeps local dev friction-free) but a warning is logged.
const express = require('express');
const { crawl } = require('../crawler/scrape');
const { sendMorningDigest } = require('../push/webpush');

const router = express.Router();

function requireCronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[admin] CRON_SECRET is not set — this endpoint is unauthenticated');
    return next();
  }
  if (req.headers.authorization === `Bearer ${secret}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.get('/crawl', requireCronAuth, async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
  try {
    const events = await crawl({ limit });
    res.json({ ok: true, count: events.length });
  } catch (err) {
    console.error('[admin] Crawl failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/digest', requireCronAuth, async (req, res) => {
  try {
    await sendMorningDigest();
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Digest failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
