// Backward-compatible donation config alias.
// The shared API origin is configured in js/api-config.js and loaded before this file.
window.GN_API_BASE_URL = String(window.GN_API_BASE_URL || '').trim();
