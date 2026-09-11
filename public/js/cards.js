// Formatting helpers + event card rendering (shared by the Saved list,
// Search results, and the map bottom-sheet card).

const Format = {
  dateLabel(isoDate) {
    if (!isoDate) return 'Date TBA';
    const d = new Date(isoDate);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    if (isToday) return 'Today';
    if (isTomorrow) return 'Tomorrow';
    return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
  },
  timeLabel(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    return d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
  },
  dateTimeLabel(isoDate) {
    const date = Format.dateLabel(isoDate);
    const time = Format.timeLabel(isoDate);
    return time ? `${date} · ${time}` : date;
  },
  distanceLabel(km) {
    if (km == null || Number.isNaN(km)) return null;
    if (km < 1) return `${Math.round(km * 1000)}m away`;
    return `${km.toFixed(1)}km away`;
  },
  haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },
};

const Cards = {
  build(event, { userLocation = null } = {}) {
    const tpl = document.getElementById('event-card-template');
    const node = tpl.content.cloneNode(true);
    const article = node.querySelector('.event-card');
    article.classList.add('list-card');
    article.dataset.eventId = event.id;

    const banner = node.querySelector('.event-card-banner');
    if (event.bannerImage) banner.style.backgroundImage = `url("${event.bannerImage}")`;

    const badge = node.querySelector('.event-card-badge');
    const isFree = event.price?.type === 'free';
    badge.textContent = isFree ? 'Free' : (event.price?.label || 'Paid');
    badge.classList.toggle('paid', !isFree);

    const saveBtn = node.querySelector('.event-card-save');
    saveBtn.classList.toggle('saved', Saved.isSaved(event.id));
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nowSaved = Saved.toggle(event);
      saveBtn.classList.toggle('saved', nowSaved);
    });

    node.querySelector('.event-card-name').textContent = event.name;
    node.querySelector('.event-card-datetime span').textContent = Format.dateTimeLabel(event.startDate) || event.dateText || '';
    node.querySelector('.event-card-venue span').textContent = event.venue || 'Venue TBA';

    const distanceEl = node.querySelector('.event-card-distance');
    let km = typeof event.distanceKm === 'number' ? event.distanceKm : null;
    if (km === null && userLocation && typeof event.lat === 'number' && typeof event.lng === 'number') {
      km = Format.haversineKm(userLocation.lat, userLocation.lng, event.lat, event.lng);
    }
    const label = Format.distanceLabel(km);
    if (label) {
      distanceEl.textContent = label;
    } else {
      distanceEl.remove();
    }

    return article;
  },

  renderList(container, events, { userLocation = null, onSelect, emptyMessage = 'No events to show yet.' } = {}) {
    container.innerHTML = '';
    if (!events || events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <div>${emptyMessage}</div>`;
      container.appendChild(empty);
      return;
    }
    events.forEach((event) => {
      const card = Cards.build(event, { userLocation });
      card.addEventListener('click', () => onSelect && onSelect(event));
      container.appendChild(card);
    });
  },
};
