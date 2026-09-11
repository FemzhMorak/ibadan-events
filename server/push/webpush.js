// Web Push setup for the daily 7am "today's events" digest notification.
// Requires a VAPID key pair — generate one with `npm run generate-vapid`
// and put the values in your .env (see .env.example).
const webpush = require('web-push');
const db = require('../db');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL || 'mailto:hello@ibadanevents.app';

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(CONTACT_EMAIL, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
} else {
  console.warn('[push] VAPID keys not set — push notifications are disabled. Run `npm run generate-vapid`.');
}

function getPublicKey() {
  return PUBLIC_KEY;
}

function isConfigured() {
  return configured;
}

function addSubscription(subscription) {
  const subs = db.getSubscriptions();
  if (!subs.some((s) => s.endpoint === subscription.endpoint)) {
    subs.push(subscription);
    db.saveSubscriptions(subs);
  }
}

function removeSubscription(endpoint) {
  const subs = db.getSubscriptions().filter((s) => s.endpoint !== endpoint);
  db.saveSubscriptions(subs);
}

async function sendToAll(payload) {
  if (!configured) {
    console.warn('[push] Skipping send — VAPID keys not configured');
    return;
  }
  const subs = db.getSubscriptions();
  const body = JSON.stringify(payload);
  const stillValid = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, body);
      stillValid.push(sub);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log('[push] Subscription expired, removing');
      } else {
        console.warn('[push] Send failed:', err.message);
        stillValid.push(sub);
      }
    }
  }
  db.saveSubscriptions(stillValid);
}

async function sendMorningDigest() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const todaysEvents = db
    .getEvents()
    .filter((e) => e.startDate && new Date(e.startDate) >= todayStart && new Date(e.startDate) <= todayEnd);

  if (todaysEvents.length === 0) {
    console.log('[push] No events today — skipping digest');
    return;
  }

  const title = `${todaysEvents.length} event${todaysEvents.length > 1 ? 's' : ''} happening in Ibadan today`;
  const body = todaysEvents
    .slice(0, 3)
    .map((e) => e.name)
    .join(', ');

  await sendToAll({
    title,
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: '/#/home',
  });
  console.log(`[push] Sent morning digest for ${todaysEvents.length} events`);
}

module.exports = {
  getPublicKey,
  isConfigured,
  addSubscription,
  removeSubscription,
  sendToAll,
  sendMorningDigest,
};
