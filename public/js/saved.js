// "Interested" / saved events live in localStorage only — no account system.
const SAVED_STORAGE_KEY = 'ibadanevents.saved';

const Saved = {
  getIds() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY) || '[]');
    } catch (_) {
      return [];
    }
  },
  isSaved(id) {
    return Saved.getIds().includes(id);
  },
  toggle(event) {
    const ids = Saved.getIds();
    const idx = ids.indexOf(event.id);
    let saved;
    if (idx === -1) {
      ids.push(event.id);
      saved = true;
      Saved._cacheEvent(event);
    } else {
      ids.splice(idx, 1);
      saved = false;
    }
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(ids));
    return saved;
  },
  _cacheEvent(event) {
    const cache = JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY + '.cache') || '{}');
    cache[event.id] = event;
    localStorage.setItem(SAVED_STORAGE_KEY + '.cache', JSON.stringify(cache));
  },
  getCachedEvents() {
    const cache = JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY + '.cache') || '{}');
    return Saved.getIds().map((id) => cache[id]).filter(Boolean);
  },
};
