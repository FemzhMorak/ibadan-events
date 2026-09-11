const fs = require('fs');
const path = require('path');

// Minimal .env loader (no extra dependency) — reads KEY=VALUE lines and
// applies them to process.env if not already set.
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const express = require('express');
const cors = require('cors');
const db = require('./db');
const eventsRouter = require('./routes/events');
const pushRouter = require('./routes/push');
const scheduler = require('./scheduler');
const { crawl } = require('./crawler/scrape');

db.init();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/events', eventsRouter);
app.use('/api/push', pushRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback for client-side hash routing (all app routes live under `/`).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`IbadanEvents server listening on http://localhost:${PORT}`);
  scheduler.start();

  if (process.env.CRAWL_ON_START === 'true') {
    console.log('[startup] CRAWL_ON_START=true — running an initial crawl');
    crawl().catch((err) => console.error('[startup] Initial crawl failed:', err));
  }
});
