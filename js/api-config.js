// Shared API origin for the static frontend and Node.js backend.
// When server.js serves the pages itself, leave this empty.
// For GitHub Pages, enter the deployed Node server's HTTPS origin below.
// Example: window.GN_API_BASE_URL = 'https://your-service.onrender.com';
window.GN_API_BASE_URL = ''; // Replace the empty string with the public HTTPS Node API origin when separately hosted.
window.GN_API_BASE_URL = String(window.GN_API_BASE_URL || '').trim();
while (window.GN_API_BASE_URL.endsWith('/')) window.GN_API_BASE_URL = window.GN_API_BASE_URL.slice(0, -1);
window.__GN_API_CONFIG_LOADED = true;
window.GN_API_URL = function(path) {
  let route = String(path || '');
  while (route.startsWith('/')) route = route.slice(1);
  route = '/' + route;
  let base = String(window.GN_API_BASE_URL || '');
  while (base.endsWith('/')) base = base.slice(0, -1);
  return base + route;
};
