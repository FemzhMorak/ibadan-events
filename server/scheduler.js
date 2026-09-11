const cron = require('node-cron');
const { crawl } = require('./crawler/scrape');
const { sendMorningDigest } = require('./push/webpush');

// Pinned explicitly via node-cron's `timezone` option rather than the
// process's own TZ env var — some hosts (e.g. Vercel) reserve `TZ` and
// won't let you set it, and this way the schedule is correct regardless
// of what timezone the server itself runs in.
const LAGOS_TZ = 'Africa/Lagos';

function start() {
  // Re-crawl allevents.in every 6 hours.
  cron.schedule('0 */6 * * *', () => {
    console.log('[scheduler] Running scheduled crawl');
    crawl().catch((err) => console.error('[scheduler] Crawl error:', err));
  }, { timezone: LAGOS_TZ });

  // Morning digest push notification at 7:00 AM Lagos time.
  cron.schedule('0 7 * * *', () => {
    console.log('[scheduler] Sending morning digest');
    sendMorningDigest().catch((err) => console.error('[scheduler] Push error:', err));
  }, { timezone: LAGOS_TZ });

  console.log('[scheduler] Crawl (every 6h) and morning digest (7:00 AM Africa/Lagos) scheduled');
}

module.exports = { start };
