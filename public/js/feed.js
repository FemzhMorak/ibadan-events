// Full-screen swipeable event feed for the Home screen — one event per
// screen: name + category pills + interested count at top, a large rounded
// banner image, and two pill action buttons (Get Directions / I'm
// Interested). Swiping is native horizontal scroll-snap, with a small
// windowed dot indicator tracking position.
const FeedModule = (() => {
  const MAX_VISIBLE_DOTS = 7;

  let events = [];
  let activeIndex = 0;
  let callbacks = {};
  let trackEl, dotsEl;
  let rafPending = false;

  function buildPill(text, accent) {
    const span = document.createElement('span');
    span.className = 'pill' + (accent ? ' accent' : '');
    span.textContent = text;
    return span;
  }

  function buildTags(event) {
    const row = document.createElement('div');
    row.className = 'pill-row feed-tags';
    const isFree = event.price?.type === 'free';
    row.appendChild(buildPill(isFree ? 'Free' : (event.price?.label || 'Paid'), isFree));
    (event.category || []).slice(0, 3).forEach((cat) => {
      row.appendChild(buildPill(cat.charAt(0).toUpperCase() + cat.slice(1)));
    });
    return row;
  }

  function buildInterested(event) {
    const row = document.createElement('div');
    row.className = 'feed-interested';
    if (!event.interestedLabel) {
      row.hidden = true;
      return row;
    }
    row.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 17.3-6.2 3.6 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7Z"/></svg>';
    const span = document.createElement('span');
    span.textContent = event.interestedLabel;
    row.appendChild(span);
    return row;
  }

  function buildActions(event) {
    const row = document.createElement('div');
    row.className = 'feed-actions';

    const directionsBtn = document.createElement('button');
    directionsBtn.type = 'button';
    directionsBtn.className = 'pill-btn outline';
    directionsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-8-8 18-2-8-8-2Z"/></svg> Get Directions';
    directionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onDirections && callbacks.onDirections(event);
    });

    const interestedBtn = document.createElement('button');
    interestedBtn.type = 'button';
    interestedBtn.className = 'pill-btn filled';
    setInterestedBtnState(interestedBtn, Saved.isSaved(event.id));
    interestedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nowSaved = callbacks.onToggleInterested && callbacks.onToggleInterested(event);
      setInterestedBtnState(interestedBtn, nowSaved);
    });

    row.append(directionsBtn, interestedBtn);
    return row;
  }

  function setInterestedBtnState(btn, isSaved) {
    btn.classList.toggle('active', !!isSaved);
    btn.innerHTML = isSaved
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg> Interested'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 17.3-6.2 3.6 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7Z"/></svg> I\'m Interested';
  }

  function buildSlide(event) {
    const slide = document.createElement('div');
    slide.className = 'feed-slide';
    slide.dataset.eventId = event.id;

    const header = document.createElement('div');
    header.className = 'feed-header';
    header.addEventListener('click', () => callbacks.onSelect && callbacks.onSelect(event));

    const name = document.createElement('h2');
    name.className = 'feed-event-name';
    name.textContent = event.name;

    header.append(name, buildTags(event), buildInterested(event));

    const image = document.createElement('div');
    image.className = 'feed-image';
    if (event.bannerImage) image.style.backgroundImage = `url("${event.bannerImage}")`;
    image.addEventListener('click', () => callbacks.onSelect && callbacks.onSelect(event));

    slide.append(header, image, buildActions(event));
    return slide;
  }

  function renderDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = '';
    const total = events.length;
    if (total <= 1) return;

    let start = 0;
    let end = total;
    if (total > MAX_VISIBLE_DOTS) {
      start = Math.max(0, Math.min(activeIndex - Math.floor(MAX_VISIBLE_DOTS / 2), total - MAX_VISIBLE_DOTS));
      end = start + MAX_VISIBLE_DOTS;
    }

    for (let i = start; i < end; i++) {
      const dot = document.createElement('span');
      dot.className = 'feed-dot';
      if (i === activeIndex) dot.classList.add('active');
      else if (Math.abs(i - activeIndex) === 1) dot.classList.add('near');
      dotsEl.appendChild(dot);
    }
  }

  function handleScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!trackEl || !trackEl.clientWidth) return;
      const index = Math.round(trackEl.scrollLeft / trackEl.clientWidth);
      if (index !== activeIndex && index >= 0 && index < events.length) {
        activeIndex = index;
        renderDots();
      }
    });
  }

  function renderEmpty() {
    dotsEl.innerHTML = '';
    trackEl.classList.add('empty');
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      <p>No upcoming events yet.<br>Check back soon!</p>`;
    trackEl.appendChild(empty);
  }

  function render(eventList, userLocation, cbs) {
    events = eventList || [];
    activeIndex = 0;
    callbacks = cbs || {};
    trackEl = document.getElementById('feed-track');
    dotsEl = document.getElementById('feed-dots');

    trackEl.removeEventListener('scroll', handleScroll);
    trackEl.innerHTML = '';
    trackEl.scrollLeft = 0;
    trackEl.classList.remove('empty');

    if (events.length === 0) {
      renderEmpty();
      return;
    }

    events.forEach((event) => trackEl.appendChild(buildSlide(event)));
    renderDots();
    trackEl.addEventListener('scroll', handleScroll, { passive: true });
  }

  return { render };
})();
