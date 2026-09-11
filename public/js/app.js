// App bootstrap: splash timing, location permission, and all screen
// rendering / event wiring lives here.
const LOCATION_PROMPT_SEEN_KEY = 'ibadanevents.locationPromptSeen';
const SPLASH_MIN_MS = 1500;

const App = {
  state: {
    userLocation: null, // { lat, lng } or null
    feedEvents: [],
    allEventsCache: null,
    currentDetailEvent: null,
  },

  async boot() {
    PushModule.registerServiceWorker();

    const splashStart = Date.now();
    await App.waitFor(SPLASH_MIN_MS - (Date.now() - splashStart));

    await App.maybePromptLocation();

    Router.on('home', App.renderHome);
    Router.on('detail', App.renderDetail);
    Router.on('map', App.renderMapScreen);
    Router.on('saved', App.renderSaved);
    Router.init();

    document.getElementById('splash-screen').classList.remove('active');
    Router.start('home');

    App.wireGlobalUI();
  },

  waitFor(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  },

  // ---------- Location permission ---------------------------------------

  maybePromptLocation() {
    if (localStorage.getItem(LOCATION_PROMPT_SEEN_KEY) === 'true' || !('geolocation' in navigator)) {
      return App.tryGetCachedLocation();
    }

    return new Promise((resolve) => {
      const sheet = Sheets.open(`
        <div class="sheet-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.6"/></svg>
        </div>
        <h2>See what's near you</h2>
        <p>IbadanEvents uses your location to show how far events are and to find what's happening nearby on the map. We never share it with anyone.</p>
        <div class="sheet-actions">
          <button class="btn btn-primary btn-block" id="location-allow-btn">Allow location access</button>
          <button class="btn btn-secondary btn-block" id="location-skip-btn">Not now</button>
        </div>
      `);

      localStorage.setItem(LOCATION_PROMPT_SEEN_KEY, 'true');

      const finish = () => {
        Sheets.close(sheet);
        resolve();
      };

      sheet.querySelector('#location-allow-btn').onclick = () => {
        App.requestLocation().finally(finish);
      };
      sheet.querySelector('#location-skip-btn').onclick = finish;
    });
  },

  requestLocation() {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          App.state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          resolve(App.state.userLocation);
        },
        () => resolve(null),
        { timeout: 8000, maximumAge: 5 * 60 * 1000 }
      );
    });
  },

  tryGetCachedLocation() {
    if (!('geolocation' in navigator)) return Promise.resolve();
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          App.state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          resolve();
        },
        () => resolve(),
        { timeout: 5000, maximumAge: 5 * 60 * 1000 }
      );
    });
  },

  // ---------- Home screen: full-screen swipeable event feed --------------

  async renderHome() {
    try {
      const res = await Api.all();
      App.state.feedEvents = res.events;
      App.state.allEventsCache = res.events;
      FeedModule.render(res.events, App.state.userLocation, {
        onSelect: App.openDetail,
        onDirections: App.openDirections,
        onToggleInterested: App.toggleInterested,
      });
    } catch (err) {
      console.error('Failed to load events:', err);
      FeedModule.render([], App.state.userLocation, {});
    }
  },

  // ---------- Shared actions: directions + interested toggle -------------

  openDirections(event) {
    const destination = typeof event.lat === 'number' && typeof event.lng === 'number'
      ? `${event.lat},${event.lng}`
      : encodeURIComponent(`${event.venue}, Ibadan, Nigeria`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank');
  },

  toggleInterested(event) {
    const nowSaved = Saved.toggle(event);
    App.toast(nowSaved ? 'Added to your interested events' : 'Removed from interested events');
    if (nowSaved) PushModule.subscribeForDigest();
    return nowSaved;
  },

  // ---------- Search overlay -----------------------------------------------

  openSearch() {
    document.getElementById('search-overlay').hidden = false;
    document.getElementById('search-input').focus();
    Cards.renderList(document.getElementById('search-list'), [], { emptyMessage: 'Start typing to search events, venues, or categories.' });
  },

  closeSearch() {
    document.getElementById('search-overlay').hidden = true;
    document.getElementById('search-input').value = '';
    document.getElementById('search-list').innerHTML = '';
  },

  async runSearch(query) {
    const searchList = document.getElementById('search-list');
    const trimmed = query.trim();
    if (!trimmed) {
      Cards.renderList(searchList, [], { emptyMessage: 'Start typing to search events, venues, or categories.' });
      return;
    }

    if (!App.state.allEventsCache) {
      try {
        const res = await Api.all();
        App.state.allEventsCache = res.events;
      } catch (err) {
        App.state.allEventsCache = [];
      }
    }

    const q = trimmed.toLowerCase();
    const results = App.state.allEventsCache.filter((e) => {
      const haystack = [e.name, e.venue, ...(e.category || [])].join(' ').toLowerCase();
      return haystack.includes(q);
    });

    Cards.renderList(searchList, results, {
      userLocation: App.state.userLocation,
      onSelect: App.openDetail,
      emptyMessage: `No events match "${trimmed}".`,
    });
  },

  // ---------- Notifications -------------------------------------------------

  async toggleNotifications() {
    if (PushModule.hasOptedIn()) {
      App.toast("You're already subscribed to the morning digest");
      return;
    }
    const ok = await PushModule.subscribeForDigest();
    App.toast(ok
      ? "You'll get a 7am digest of today's events"
      : 'Enable notifications in your browser settings to subscribe');
  },

  // ---------- Detail screen -----------------------------------------------

  openDetail(event) {
    App.state.currentDetailEvent = event;
    Router.navigate('detail', [event.id]);
  },

  async renderDetail(id) {
    let event = [...App.state.feedEvents, ...(App.state.allEventsCache || [])].find((e) => e.id === id);
    if (!event) {
      try {
        const res = await Api.event(id);
        event = res.event;
      } catch (err) {
        console.error('Event not found:', err);
        Router.navigate('home');
        return;
      }
    }
    App.state.currentDetailEvent = event;

    document.getElementById('detail-banner').style.backgroundImage = event.bannerImage ? `url("${event.bannerImage}")` : '';

    const tagsEl = document.getElementById('detail-tags');
    tagsEl.innerHTML = '';
    const isFree = event.price?.type === 'free';
    tagsEl.appendChild(App.buildPill(isFree ? 'Free' : (event.price?.label || 'Paid'), isFree));
    (event.category || []).slice(0, 3).forEach((cat) => {
      tagsEl.appendChild(App.buildPill(cat.charAt(0).toUpperCase() + cat.slice(1)));
    });

    document.getElementById('detail-name').textContent = event.name;

    const interestedRow = document.getElementById('detail-interested-count');
    if (event.interestedLabel) {
      interestedRow.hidden = false;
      interestedRow.querySelector('span').textContent = event.interestedLabel;
    } else {
      interestedRow.hidden = true;
    }

    document.getElementById('detail-date').textContent = Format.dateLabel(event.startDate);
    document.getElementById('detail-time').textContent = Format.timeLabel(event.startDate) || event.dateText || '';
    document.getElementById('detail-venue').textContent = event.venue || 'Venue TBA';
    document.getElementById('detail-address').textContent = event.address || '';
    document.getElementById('detail-description').textContent = event.description || 'No description provided for this event.';

    App.updateInterestedButton(event);
  },

  buildPill(text, accent) {
    const span = document.createElement('span');
    span.className = 'pill' + (accent ? ' accent' : '');
    span.textContent = text;
    return span;
  },

  updateInterestedButton(event) {
    const btn = document.getElementById('detail-interested-btn');
    const isSaved = Saved.isSaved(event.id);
    btn.classList.toggle('active', isSaved);
    btn.innerHTML = isSaved
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg> Interested'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 17.3-6.2 3.6 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7Z"/></svg> I\'m Interested';
  },

  // ---------- Map screen ----------------------------------------------------

  async renderMapScreen() {
    let events = App.state.allEventsCache;
    if (!events) {
      try {
        const res = await Api.all();
        events = res.events;
        App.state.allEventsCache = events;
      } catch (err) {
        events = [];
      }
    }
    MapModule.render(events, App.state.userLocation, App.openDetail);
  },

  // ---------- Saved screen ---------------------------------------------------

  renderSaved() {
    Cards.renderList(document.getElementById('saved-list'), Saved.getCachedEvents(), {
      userLocation: App.state.userLocation,
      onSelect: App.openDetail,
      emptyMessage: "Events you mark as interested will show up here.",
    });
  },

  // ---------- Global UI wiring ------------------------------------------------

  wireGlobalUI() {
    let searchTimer;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => App.runSearch(e.target.value), 220);
    });
    document.getElementById('feed-search-btn').addEventListener('click', App.openSearch);
    document.getElementById('search-close-btn').addEventListener('click', App.closeSearch);
    document.getElementById('feed-notify-btn').addEventListener('click', App.toggleNotifications);

    document.getElementById('detail-back-btn').addEventListener('click', () => Router.navigate('home'));
    document.getElementById('map-back-btn').addEventListener('click', () => Router.navigate('home'));

    document.getElementById('detail-directions-btn').addEventListener('click', () => {
      const event = App.state.currentDetailEvent;
      if (event) App.openDirections(event);
    });

    document.getElementById('detail-share-btn').addEventListener('click', async () => {
      const event = App.state.currentDetailEvent;
      if (!event) return;
      const shareData = { title: event.name, text: `${event.name} — ${event.venue}, Ibadan`, url: event.url || location.href };
      if (navigator.share) {
        try { await navigator.share(shareData); } catch (_) { /* user cancelled */ }
      } else {
        await navigator.clipboard.writeText(shareData.url);
        App.toast('Link copied to clipboard');
      }
    });

    document.getElementById('detail-interested-btn').addEventListener('click', () => {
      const event = App.state.currentDetailEvent;
      if (!event) return;
      App.toggleInterested(event);
      App.updateInterestedButton(event);
    });
  },

  toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(App._toastTimer);
    App._toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  },
};

// Generic bottom sheet helper used for the location-permission prompt.
const Sheets = {
  open(innerHtml) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = `<div class="sheet">${innerHtml}</div>`;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) Sheets.close(backdrop);
    });
    document.body.appendChild(backdrop);
    return backdrop;
  },
  close(backdrop) {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  },
};

document.addEventListener('DOMContentLoaded', App.boot);
