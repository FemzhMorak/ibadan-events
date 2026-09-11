// Thin wrapper around the backend REST API.
const Api = {
  async _get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Request failed: ${path} (${res.status})`);
    return res.json();
  },
  async _post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Request failed: ${path} (${res.status})`);
    return res.json();
  },
  today() {
    return this._get('/api/events/today');
  },
  thisWeek() {
    return this._get('/api/events/thisweek');
  },
  nearby(lat, lng, radius) {
    const params = new URLSearchParams({ lat, lng });
    if (radius) params.set('radius', radius);
    return this._get(`/api/events/nearby?${params.toString()}`);
  },
  all() {
    return this._get('/api/events/all');
  },
  event(id) {
    return this._get(`/api/events/${encodeURIComponent(id)}`);
  },
  vapidPublicKey() {
    return this._get('/api/push/vapid-public-key');
  },
  subscribePush(subscription) {
    return this._post('/api/push/subscribe', subscription);
  },
};
