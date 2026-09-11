// Leaflet-based map view using the standard free OpenStreetMap tiles (no
// API key). A CSS color-invert filter on the tile pane (see style.css)
// turns them dark to match the app's near-black look, without depending
// on a key-gated dark tile provider. Markers use the app's green accent
// color via a CSS-styled divIcon and sit in a separate pane, so the
// invert filter doesn't affect them.
const IBADAN_CENTER = [7.3775, 3.9470];

const MapModule = (() => {
  let map = null;
  let markersLayer = null;
  let userMarker = null;
  let events = [];
  let onEventSelect = null;

  function ensureMap() {
    if (map) return map;
    map = L.map('leaflet-map', { zoomControl: false, attributionControl: true }).setView(IBADAN_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);

    map.on('click', () => hideSheet());

    return map;
  }

  function pinIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="map-pin-marker"></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 30],
    });
  }

  function userIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="user-dot-outer"><div class="user-dot-inner"></div></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function showSheet(event) {
    const sheet = document.getElementById('map-sheet');
    sheet.innerHTML = '';
    const card = Cards.build(event);
    card.addEventListener('click', () => onEventSelect && onEventSelect(event));
    sheet.appendChild(card);
    sheet.hidden = false;
  }

  function hideSheet() {
    document.getElementById('map-sheet').hidden = true;
  }

  function render(eventList, userLocation, selectHandler) {
    events = eventList || [];
    onEventSelect = selectHandler;
    const m = ensureMap();
    hideSheet();
    markersLayer.clearLayers();

    events.forEach((event) => {
      if (typeof event.lat !== 'number' || typeof event.lng !== 'number') return;
      const marker = L.marker([event.lat, event.lng], { icon: pinIcon() });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showSheet(event);
        m.panTo([event.lat, event.lng]);
      });
      marker.addTo(markersLayer);
    });

    if (userMarker) {
      userMarker.remove();
      userMarker = null;
    }
    if (userLocation) {
      userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon(), zIndexOffset: 1000 }).addTo(map);
      m.setView([userLocation.lat, userLocation.lng], 14);
    } else if (events.length) {
      const bounds = L.latLngBounds(events.filter((e) => e.lat && e.lng).map((e) => [e.lat, e.lng]));
      if (bounds.isValid()) m.fitBounds(bounds.pad(0.2));
    }

    // The map container was hidden (display:none via screen transition)
    // when first created, so Leaflet needs an explicit resize nudge.
    setTimeout(() => m.invalidateSize(), 50);
  }

  return { render };
})();
