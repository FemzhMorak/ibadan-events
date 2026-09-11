// Minimal hash-based router that swaps which .screen is visible and drives
// the bottom nav's active state. Screens that should show the bottom nav
// are listed in NAV_VISIBLE_ROUTES.
const NAV_VISIBLE_ROUTES = new Set(['home', 'map', 'saved']);

const Router = {
  _handlers: {},
  _current: null,

  on(route, handler) {
    Router._handlers[route] = handler;
  },

  init() {
    window.addEventListener('hashchange', Router._onHashChange);
    document.getElementById('bottom-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (btn) Router.navigate(btn.dataset.route);
    });
  },

  _onHashChange() {
    const { route, params } = Router._parseHash();
    Router._render(route, params);
  },

  _parseHash() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [route, ...rest] = hash.split('/').filter(Boolean);
    return { route: route || 'home', params: rest };
  },

  navigate(route, params = []) {
    const hash = '#/' + [route, ...params].join('/');
    if (location.hash === hash) {
      Router._render(route, params);
    } else {
      location.hash = hash;
    }
  },

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
  },

  _render(route, params) {
    Router._current = route;
    const screenId = {
      home: 'home-screen',
      detail: 'detail-screen',
      map: 'map-screen',
      saved: 'saved-screen',
    }[route] || 'home-screen';

    Router.showScreen(screenId);

    const nav = document.getElementById('bottom-nav');
    nav.style.display = NAV_VISIBLE_ROUTES.has(route) ? 'flex' : 'none';
    nav.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.route === route);
    });

    window.scrollTo(0, 0);

    const handler = Router._handlers[route];
    if (handler) handler(...params);
  },

  start(defaultRoute = 'home') {
    if (!location.hash) location.hash = '#/' + defaultRoute;
    else Router._onHashChange();
  },
};
