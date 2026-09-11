// Crawls https://allevents.in/ibadan/all for events happening in Ibadan.
//
// The listing page gives us a fast overview of each event (name, date,
// venue, banner, and sometimes a price badge). The detail page for each
// event carries a schema.org "Event" JSON-LD block with the full
// description, precise geo-coordinates and category tags, so we fetch it
// per event and fall back to Nominatim geocoding only when a venue has no
// coordinates in that JSON-LD.
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');
const { geocodeVenue } = require('./geocode');

const LISTING_URL = 'https://allevents.in/ibadan/all';
const USER_AGENT = 'Mozilla/5.0 (compatible; IbadanEventsBot/1.0; +https://github.com/ibadan-events)';
const DETAIL_FETCH_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 15000,
  });
  return data;
}

function parseListing(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('li.event-card.event-card-link').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('data-eid');
    const url = $el.attr('data-link');
    if (!id || !url) return;

    const bannerStyle = $el.find('.banner-cont').attr('style') || '';
    const bannerMatch = bannerStyle.match(/background:url\(([^)]+)\)/);
    const bannerImage = bannerMatch ? bannerMatch[1].trim() : null;

    const name = decodeEntities($el.find('.meta .title h3').first().text()) ||
      decodeEntities($el.attr('data-name'));
    const dateText = $el.find('.meta .date').first().text().trim();
    const venue = $el.find('.location.dotdotted').first().text().trim();
    const priceText = $el.find('.price-container .price span').first().text().trim();
    const interestedLabel = $el.find('.interested-container .interested span').first().text().trim() || null;

    items.push({ id, url, name, bannerImage, dateText, venue, priceText, interestedLabel });
  });

  return items;
}

function extractEventJsonLd(html) {
  const $ = cheerio.load(html);
  let eventData = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (eventData) return;
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed['@type'] === 'Event') eventData = parsed;
    } catch (_) {
      // some blocks aren't valid standalone JSON (e.g. multiple objects); skip
    }
  });

  const categories = [];
  $('.eps-event-tags-container a.eps-event-tags').each((_, el) => {
    const tag = $(el).text().trim();
    if (tag) categories.push(tag);
  });

  return { eventData, categories };
}

function resolvePrice(priceText, offers) {
  if (priceText) {
    if (/free/i.test(priceText)) return { type: 'free', label: 'Free' };
    return { type: 'paid', label: priceText };
  }

  if (Array.isArray(offers) && offers.length > 0) {
    const aggregate = offers.find((o) => o['@type'] === 'AggregateOffer') || offers[0];
    const low = parseFloat(aggregate.lowPrice ?? aggregate.price);
    if (!Number.isNaN(low)) {
      if (low <= 0) return { type: 'free', label: 'Free' };
      const currency = aggregate.priceCurrency || '';
      return { type: 'paid', label: `${currency} ${low}`.trim() };
    }
  }

  return { type: 'paid', label: 'Paid' };
}

async function fetchEventDetail(listingItem) {
  const html = await fetchHtml(listingItem.url);
  const { eventData, categories } = extractEventJsonLd(html);

  const name = decodeEntities(eventData?.name) || listingItem.name;
  const description = eventData?.description
    ? decodeEntities(eventData.description)
    : 'No description provided for this event.';
  const bannerImage = eventData?.image || listingItem.bannerImage;
  const startDate = eventData?.startDate || null;
  const endDate = eventData?.endDate || null;

  const location = eventData?.location || {};
  const geo = location.geo || {};
  const address = location.address || {};
  const venueName = location.name || listingItem.venue || 'Venue TBA';
  const fullAddress = [address.streetAddress, address.addressLocality, address.addressRegion]
    .filter(Boolean)
    .join(', ') || venueName;

  let lat = geo.latitude ? parseFloat(geo.latitude) : null;
  let lng = geo.longitude ? parseFloat(geo.longitude) : null;
  let approximateLocation = false;

  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
    const geocoded = await geocodeVenue(venueName);
    lat = geocoded.lat;
    lng = geocoded.lng;
    approximateLocation = geocoded.approximate;
  }

  const price = resolvePrice(listingItem.priceText, eventData?.offers);

  return {
    id: listingItem.id,
    name,
    url: listingItem.url,
    bannerImage,
    description,
    category: categories.length ? categories : ['general'],
    venue: venueName,
    address: fullAddress,
    startDate,
    endDate,
    dateText: listingItem.dateText,
    interestedLabel: listingItem.interestedLabel,
    price,
    lat,
    lng,
    approximateLocation,
    crawledAt: new Date().toISOString(),
  };
}

async function crawl({ limit } = {}) {
  console.log(`[crawler] Fetching listing: ${LISTING_URL}`);
  const listingHtml = await fetchHtml(LISTING_URL);
  let items = parseListing(listingHtml);
  console.log(`[crawler] Found ${items.length} events on listing page`);

  if (limit) items = items.slice(0, limit);

  const existing = db.getEvents();
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const results = [];

  // Saves whatever has been crawled so far, merged with any previously
  // crawled events that are still upcoming but weren't seen on this pull
  // (pagination / ordering can shift). Called after every item — not just
  // once at the end — so a mid-crawl crash or timeout (a real risk on a
  // time-limited serverless invocation) still leaves partial progress
  // persisted instead of losing the whole run.
  function persistProgress() {
    const now = Date.now();
    const seenIds = new Set(results.map((e) => e.id));
    const merged = [...results];
    for (const old of existing) {
      if (seenIds.has(old.id)) continue;
      const startsAt = old.startDate ? new Date(old.startDate).getTime() : null;
      if (startsAt && startsAt > now) merged.push(old);
    }
    merged.sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));
    db.saveEvents(merged);
    return merged;
  }

  for (const item of items) {
    try {
      const detail = await fetchEventDetail(item);
      results.push(detail);
      console.log(`[crawler] OK  ${detail.name} @ ${detail.venue}`);
    } catch (err) {
      console.warn(`[crawler] FAIL ${item.name || item.url}: ${err.message}`);
      const fallback = existingById.get(item.id);
      if (fallback) results.push(fallback);
    }
    persistProgress();
    await sleep(DETAIL_FETCH_DELAY_MS);
  }

  const finalResults = persistProgress();
  console.log(`[crawler] Saved ${finalResults.length} events to the database`);
  return finalResults;
}

if (require.main === module) {
  db.init();
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
  crawl({ limit })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[crawler] Crawl failed:', err);
      process.exit(1);
    });
}

module.exports = { crawl, parseListing, extractEventJsonLd, resolvePrice };
