const fs = require('fs');
const path = require('path');

// On Vercel the deployed bundle is read-only at runtime — only /tmp is
// writable, and it's wiped between cold starts / not shared across
// instances. Runtime data (crawled events, geocode cache, push
// subscriptions) goes there when running on Vercel; the bundled seed
// file is always read from the repo copy, which is read-only but never
// written to anyway.
//
// This makes the app *work* on Vercel, but the data it writes is not
// durable — it can reset on the next cold start. For real production
// persistence, swap these JSON-file reads/writes for a real datastore
// (Vercel KV / Postgres / Upstash Redis, etc).
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'ibadan-events-data') : BUNDLED_DATA_DIR;
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const SEED_FILE = path.join(BUNDLED_DATA_DIR, 'seed-events.json');
const VENUES_CACHE_FILE = path.join(DATA_DIR, 'venues-cache.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }
}

function readJSON(file, fallback) {
  ensureFile(file, fallback);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    console.error(`Failed to read ${file}:`, err.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EVENTS_FILE)) {
    const seed = readJSON(SEED_FILE, { events: [], lastCrawled: null });
    writeJSON(EVENTS_FILE, seed);
  }
  ensureFile(VENUES_CACHE_FILE, {});
  ensureFile(SUBSCRIPTIONS_FILE, { subscriptions: [] });
}

function getEvents() {
  return readJSON(EVENTS_FILE, { events: [], lastCrawled: null }).events || [];
}

function getEventsMeta() {
  return readJSON(EVENTS_FILE, { events: [], lastCrawled: null });
}

function saveEvents(events) {
  writeJSON(EVENTS_FILE, { events, lastCrawled: new Date().toISOString() });
}

function getVenueCache() {
  return readJSON(VENUES_CACHE_FILE, {});
}

function saveVenueCache(cache) {
  writeJSON(VENUES_CACHE_FILE, cache);
}

function getSubscriptions() {
  return readJSON(SUBSCRIPTIONS_FILE, { subscriptions: [] }).subscriptions || [];
}

function saveSubscriptions(subscriptions) {
  writeJSON(SUBSCRIPTIONS_FILE, { subscriptions });
}

module.exports = {
  init,
  getEvents,
  getEventsMeta,
  saveEvents,
  getVenueCache,
  saveVenueCache,
  getSubscriptions,
  saveSubscriptions,
  EVENTS_FILE,
  SEED_FILE,
};
