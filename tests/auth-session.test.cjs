const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require.resolve('../js/auth.js'), 'utf8');
const sessionKey = 'geonature_local_session_v5';
const usersKey = 'geonature_local_users_v5';
function storage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function app({ local = storage(), tab = storage(), http = false, remote = '' } = {}) {
  const context = { localStorage: local, sessionStorage: tab, crypto: webcrypto, TextEncoder, URLSearchParams, location: { protocol: http ? 'https:' : 'file:', search: '', href: '' }, document: { addEventListener() {}, getElementById() { return null; } }, fetch: async () => ({ ok: false, status: remote ? 503 : 404, json: async () => ({ message: 'Remote unavailable' }) }), __GN_API_CONFIG_LOADED: true, GN_API_BASE_URL: remote };
  context.window = context;
  vm.runInNewContext(source, context);
  return { auth: context.GeoNatureAuth, local, tab };
}
const credentials = { email: 'local@example.test', password: 'test-password-123' };
const post = payload => ({ method: 'POST', body: JSON.stringify(payload) });

test('a nonremembered local sign-in survives navigation in its tab and ends with the tab', async () => {
  const first = app();
  await first.auth.request('/signup', post({ ...credentials, remember: false }));
  assert.equal((await first.auth.me()).email, credentials.email);
  assert.equal(first.local.getItem(sessionKey), null);
  assert.ok(first.tab.getItem(sessionKey));
  const navigated = app({ local: first.local, tab: first.tab });
  assert.equal((await navigated.auth.me()).email, credentials.email);
  assert.equal(await app({ local: first.local }).auth.me(), null);
});

test('remembered local sign-in persists in a new tab and exposes the local account scope', async () => {
  const first = app({ http: true });
  const result = await first.auth.request('/signup', post({ ...credentials, remember: true }));
  assert.equal(result.localMode, true);
  assert.equal(first.auth.localMode, true);
  assert.ok(first.local.getItem(sessionKey));
  assert.equal(first.tab.getItem(sessionKey), null);
  assert.equal((await app({ local: first.local, http: true }).auth.me()).email, credentials.email);
});

test('changing remember preference replaces the session instead of keeping an old persistent login', async () => {
  const first = app();
  await first.auth.request('/signup', post({ ...credentials, remember: true }));
  await first.auth.request('/signin', post({ ...credentials, remember: false }));
  assert.equal(first.local.getItem(sessionKey), null);
  assert.ok(first.tab.getItem(sessionKey));
  assert.equal(first.local.getItem('geonature_last_email_v5'), null);
  await first.auth.request('/signin', post({ ...credentials, remember: true }));
  assert.equal(first.tab.getItem(sessionKey), null);
  assert.ok(first.local.getItem(sessionKey));
});

test('logout clears both persistent and tab sessions', async () => {
  const first = app();
  await first.auth.request('/signup', post({ ...credentials, remember: true }));
  first.tab.setItem(sessionKey, first.local.getItem(sessionKey));
  await first.auth.request('/signout', post({}));
  assert.equal(first.local.getItem(sessionKey), null);
  assert.equal(first.tab.getItem(sessionKey), null);
  assert.equal(await first.auth.me(), null);
});

test('static API fallback saves a profile to the local account', async () => {
  const first = app({ http: true });
  await first.auth.request('/signup', post(credentials));
  await first.auth.request('/profile', { method: 'PATCH', body: JSON.stringify({ displayName: 'Local Explorer', avatarId: 'free-fox', backgroundId: 'bg-forest' }) });
  const next = app({ local: first.local, http: true });
  const profile = (await next.auth.request('/profile')).profile;
  assert.equal(profile.displayName, 'Local Explorer');
  assert.equal(profile.avatarId, 'free-fox');
});

test('malformed local account and session data do not crash or create a ghost login', async () => {
  const first = app();
  for (const value of ['{}', 'null', '"wrong"', '[null]', '{broken']) {
    first.local.setItem(usersKey, value);
    first.local.setItem(sessionKey, value);
    first.tab.setItem(sessionKey, value);
    assert.equal(await first.auth.me(), null);
    await assert.rejects(first.auth.request('/signin', post(credentials)), /ელფოსტა ან პაროლი/);
  }
  first.local.setItem(sessionKey, JSON.stringify({ email: credentials.email, plan: 'pro' }));
  first.local.setItem(usersKey, '[]');
  first.tab.removeItem(sessionKey);
  assert.equal(await first.auth.me(), null);
});

test('an explicitly configured remote backend never creates a local account on an error', async () => {
  const first = app({ http: true, remote: 'https://api.example.test' });
  await assert.rejects(first.auth.request('/signup', post(credentials)), /Remote unavailable/);
  assert.equal(first.local.getItem(usersKey), null);
  assert.equal(first.auth.localMode, false);
});

test('failed local profile persistence reports an error and leaves the saved account intact', async () => {
  const first = app({ http: true });
  await first.auth.request('/signup', post(credentials));
  const write = first.local.setItem;
  first.local.setItem = (key, value) => { if (key === usersKey) throw new Error('Storage quota exceeded'); return write(key, value); };
  await assert.rejects(first.auth.request('/profile', { method: 'PATCH', body: JSON.stringify({ displayName: 'Not Saved', avatarId: 'free-fish', backgroundId: 'bg-forest' }) }), /quota/);
  assert.equal((await first.auth.me()).displayName, '');
});
