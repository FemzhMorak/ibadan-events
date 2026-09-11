const express = require('express');
const db = require('../db');

const router = express.Router();

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function upcomingEvents() {
  const now = new Date();
  return db
    .getEvents()
    .filter((e) => e.startDate && new Date(e.startDate) >= startOfDay(now))
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
}

router.get('/today', (req, res) => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const events = upcomingEvents().filter((e) => {
    const d = new Date(e.startDate);
    return d >= todayStart && d <= todayEnd;
  });
  res.json({ events, count: events.length });
});

router.get('/thisweek', (req, res) => {
  const now = new Date();
  const weekEnd = endOfDay(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  const tomorrowStart = startOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const events = upcomingEvents().filter((e) => {
    const d = new Date(e.startDate);
    return d >= tomorrowStart && d <= weekEnd;
  });
  res.json({ events, count: events.length });
});

router.get('/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = req.query.radius ? parseFloat(req.query.radius) : 15;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query params are required numbers' });
  }

  const events = upcomingEvents()
    .filter((e) => typeof e.lat === 'number' && typeof e.lng === 'number')
    .map((e) => ({ ...e, distanceKm: haversineKm(lat, lng, e.lat, e.lng) }))
    .filter((e) => e.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json({ events, count: events.length });
});

router.get('/all', (req, res) => {
  const events = upcomingEvents();
  res.json({ events, count: events.length });
});

router.get('/meta', (req, res) => {
  const meta = db.getEventsMeta();
  res.json({ lastCrawled: meta.lastCrawled, total: (meta.events || []).length });
});

router.get('/:id', (req, res) => {
  const event = db.getEvents().find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ event });
});

module.exports = router;
