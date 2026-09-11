const cron = require('node-cron');
const { crawl } = require('./crawler/scrape');
const { sendMorningDigest } = require('./push/webpush');

function start() {
  // Re-crawl allevents.in every 6 hours.
  cron.schedule('0 */6 * * *', () => {
    console.log('[scheduler] Running scheduled crawl');
    crawl().catch((err) => console.error('[scheduler] Crawl error:', err));
  });

  // Morning digest push notification at 7:00 AM (server local time / Africa
  // timezone is set via TZ env var — see .env.example).
  cron.schedule('0 7 * * *', () => {
    console.log('[scheduler] Sending morning digest');
    sendMorningDigest().catch((err) => console.error('[scheduler] Push error:', err));
  });

  console.log('[scheduler] Crawl (every 6h) and morning digest (7:00 AM) scheduled');
}

module.exports = { start };
