# IbadanEvents

A Progressive Web App for discovering events happening around Ibadan, Nigeria — styled after a movie-ticket-booking app: a fixed near-black (`#0D0D0D`) look throughout, with a single green accent. The Home screen is a full-screen, swipeable event feed (one event per screen, swiped left/right): bold white name and small pill category tags top-left, a real "★ N+ Interested" count scraped from the source site, a large 55vh rounded banner image, and two pill action buttons — Get Directions and I'm Interested — right on the card, no need to open the event first. The rest of the app (search, detail, saved, map) keeps the same near-black, pill-and-card language with a floating glass bottom nav.

## Stack

- **Backend**: Node.js + Express, a JSON file database, a crawler for [allevents.in/ibadan/all](https://allevents.in/ibadan/all), OpenStreetMap Nominatim geocoding, and Web Push for the morning digest.
- **Frontend**: Vanilla JS PWA (no build step) — hash-routed single page app, Leaflet.js for the map, a service worker for offline shell caching.

## Getting started

```bash
npm install
cp .env.example .env
npm run generate-vapid   # paste the printed keys into .env
npm run generate-icons   # only needed if public/icons/ is missing
npm start
```

Open http://localhost:3000. On first launch it shows a friendly location-permission prompt before asking the OS for `navigator.geolocation`.

The repo ships with `server/data/seed-events.json`, a real snapshot crawled from allevents.in — on first run this is copied into `server/data/events.json` (gitignored) so the app has real Ibadan events immediately, without waiting on a crawl.

## Crawler

```bash
npm run crawl              # crawl all events on the listing page
node server/crawler/scrape.js --limit=5   # crawl only the first 5, for a quick check
```

Under traditional/local hosting, the server also re-crawls automatically every 6 hours via `node-cron` (see `server/scheduler.js`); set `CRAWL_ON_START=true` in `.env` to also crawl once immediately when the server boots. On Vercel, `node-cron`'s timers don't survive between serverless invocations, so the recurring crawl is done via a Vercel Cron Job hitting `GET /api/crawl` instead — see [Deploying to Vercel](#deploying-to-vercel).

For each event, the crawler:
1. Parses the listing page (`li.event-card.event-card-link`) for name, date, venue, banner, price, and — when the source page shows one — a real "N+ Interested" count.
2. Fetches the event's detail page and reads its `schema.org/Event` JSON-LD block for the full description, precise geo-coordinates, and category tags.
3. Falls back to the free OpenStreetMap Nominatim API (`server/crawler/geocode.js`) to geocode the venue name when the detail page has no coordinates — results are cached to `server/data/venues-cache.json` so the same venue is never looked up twice.

## REST API

| Endpoint | Description |
|---|---|
| `GET /api/events/today` | Events happening today |
| `GET /api/events/thisweek` | Events in the next 7 days (excluding today) |
| `GET /api/events/nearby?lat=&lng=&radius=` | Events within `radius`km (default 15), sorted by distance |
| `GET /api/events/all` | All upcoming events |
| `GET /api/events/:id` | A single event |
| `GET /api/events/meta` | Last crawl time and event count |
| `GET /api/push/vapid-public-key` | Public VAPID key for push subscriptions |
| `POST /api/push/subscribe` | Register a push subscription |
| `POST /api/push/unsubscribe` | Remove a push subscription |
| `GET /api/crawl?limit=` | Manually trigger a crawl (optionally capped to the first `limit` listing items). Gated by `CRON_SECRET` — see below. |
| `GET /api/digest` | Manually trigger the morning push digest. Also gated by `CRON_SECRET`. |

## Deploying to Vercel

The app runs on Vercel as a single serverless function (`api/index.js`, which just re-exports the Express app from `server/index.js`) — `vercel.json` rewrites every request to it, so static files, the SPA, and `/api/*` all work exactly as they do locally.

**Environment variables** (Project Settings → Environment Variables):
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL` — from `npm run generate-vapid`, if you want push notifications to work.
- `CRON_SECRET` — any random string. Set this and Vercel automatically sends `Authorization: Bearer <value>` when its Cron Jobs call `/api/crawl` and `/api/digest` (see `vercel.json`), which is exactly what those routes check for. Without it, those endpoints are open to anyone who finds the URL.
- Do **not** set `TZ` — Vercel reserves that name. It isn't needed anyway; Lagos time is pinned directly in code (`server/lib/time.js`, and `node-cron`'s own `timezone` option locally).

**Cron schedule**: Vercel Cron Jobs run in UTC, and there's no timezone option in `vercel.json` — so `/api/crawl` runs at `0 5 * * *` (5:00 UTC = 6:00 AM Lagos) and `/api/digest` at `0 6 * * *` (6:00 UTC = 7:00 AM Lagos), Lagos being a fixed UTC+1 with no DST. Both are daily, once each — the **Hobby plan only allows daily cron jobs** (no `*/6`-style intervals), which is also why the crawl isn't hourly here. If you ever need a different local time, convert it to UTC yourself before editing the schedule string.

**⚠️ Storage is not durable on Vercel.** The "database" is JSON files written to disk, and Vercel's deployed filesystem is read-only except `/tmp` — so at runtime this app writes to `/tmp` instead (see `server/db.js`), which works, but `/tmp` is wiped on cold starts and isn't shared across instances. In practice: the daily crawl cron keeps most instances populated most of the time, but you may occasionally see an empty or stale feed right after a cold start, and there's no guarantee two simultaneous requests hit the same warm instance. This is fine for a demo/personal project; for real production use, swap `server/db.js`'s file reads/writes for a real datastore (Vercel KV, Vercel Postgres, Upstash Redis, etc.) — ask if you want that wired up.

**Seeding events after deploy**: since a fresh deployment starts from the bundled `seed-events.json` (copied into `/tmp` on first read), just wait for the first daily cron run, or trigger one immediately:
```bash
curl "https://<your-app>.vercel.app/api/crawl" -H "Authorization: Bearer <your CRON_SECRET>"
```

## PWA features

- **Installable**: `public/manifest.json` + icons in `public/icons/` (generated by `scripts/generate-icons.js`, a pure-JS/no-network PNG generator using `pngjs`).
- **Offline shell**: `public/service-worker.js` caches the app shell (cache-first) and uses network-first for `/api/*` so data stays fresh online but still resolves when offline.
- **Push digest**: subscribing (automatically offered the first time you mark an event "I'm Interested") registers for a 7:00 AM daily notification summarizing today's events. Requires VAPID keys in `.env` — see `npm run generate-vapid`.
- **Location permission**: a friendly explanation sheet appears on first launch before requesting `navigator.geolocation`, so users understand why it's needed (distance labels + the map view) before the OS prompt appears.

## Design

One fixed palette — no theme picker. Design tokens live at the top of `public/css/style.css`:

- Background `#0D0D0D`, elevated surfaces `#1A1A1A`/`#222222`, white/light-grey text.
- A single green accent (`#22C55E`) for CTAs, the active nav icon, map pins, distance labels, and "Free" pills.
- The map itself uses standard free OpenStreetMap tiles (no API key) with a CSS invert filter for a dark basemap — markers sit in a separate Leaflet pane so they keep their true accent color.

## Project layout

```
api/
  index.js              Vercel serverless entry point — re-exports server/index.js
vercel.json              rewrites, function maxDuration, cron schedule
server/
  index.js              Express app (exported; only .listen()s when run directly)
  db.js                  JSON file database helpers (writes to /tmp on Vercel)
  lib/time.js             Africa/Lagos day-boundary math, independent of host TZ
  scheduler.js            node-cron: 6-hourly crawl, 7am push digest (local hosting only)
  routes/                 REST API routes, including admin.js (crawl/digest triggers)
  crawler/                allevents.in scraper + Nominatim geocoder
  push/                   Web Push subscription + digest sending
  data/                   seed-events.json (committed) + runtime JSON db (gitignored)
public/
  index.html             all screens (splash, home, detail, map, saved) + search overlay
  css/style.css           design tokens + all component styles
  js/                     api, saved (localStorage), cards, feed (swipeable home), router, map, push, app
  manifest.json, service-worker.js, icons/
scripts/
  generate-vapid.js       prints a fresh VAPID key pair
  generate-icons.js       generates the PWA icon set
```
