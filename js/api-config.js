// Shared API origin for the static frontend and Node.js backend.
// When the site is served by server.js itself, leave this empty.
// When using GitHub Pages, set this to the deployed Node server's HTTPS origin, e.g.:
// window.GN_API_BASE_URL = 'https://your-service.onrender.com';
window.GN_API_BASE_URL = '';
window.GN_API_BASE_URL = String(window.GN_API_BASE_URL || '').trim().replace(/\/+$/, '');
window.__GN_API_CONFIG_LOADED = true;
window.GN_API_URL = function(path) {
  const route = '/' + String(path || '').replace(/^\/+/, '');
  return String(window.GN_API_BASE_URL || '').replace(/\/+$/, '') + route;
};
