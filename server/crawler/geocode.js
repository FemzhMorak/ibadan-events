// Geocodes venue names to lat/lng using the free OpenStreetMap Nominatim API.
// Nominatim's usage policy requires a descriptive User-Agent and a max of
// 1 request/second, so results are cached to disk and lookups are queued.
const axios = require('axios');
const db = require('../db');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'IbadanEventsApp/1.0 (https://github.com/ibadan-events; contact: hello@ibadanevents.app)';
const MIN_INTERVAL_MS = 1100;

// Ibadan's approximate bounding box, used to bias/validate results so a
// venue name that also exists elsewhere in the world doesn't get matched.
const IBADAN_VIEWBOX = '3.80,7.55,4.05,7.30'; // left,top,right,bottom
const IBADAN_FALLBACK = { lat: 7.3775, lng: 3.9470 }; // Ibadan city centre

let lastRequestAt = 0;

function normalizeKey(venue) {
  return venue.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function geocodeVenue(venueName) {
  if (!venueName) return { ...IBADAN_FALLBACK, approximate: true };

  const cache = db.getVenueCache();
  const key = normalizeKey(venueName);
  if (cache[key]) return cache[key];

  const query = /ibadan/i.test(venueName) ? venueName : `${venueName}, Ibadan, Nigeria`;

  try {
    await throttle();
    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q: query,
        format: 'json',
        limit: 1,
        viewbox: IBADAN_VIEWBOX,
        bounded: 0,
        countrycodes: 'ng',
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });

    let result;
    if (Array.isArray(data) && data.length > 0) {
      result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        approximate: false,
        displayName: data[0].display_name,
      };
    } else {
      result = { ...IBADAN_FALLBACK, approximate: true };
    }

    cache[key] = result;
    db.saveVenueCache(cache);
    return result;
  } catch (err) {
    console.warn(`Geocoding failed for "${venueName}": ${err.message}`);
    return { ...IBADAN_FALLBACK, approximate: true };
  }
}

module.exports = { geocodeVenue };
