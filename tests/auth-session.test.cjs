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

test('concurrent local registrations preserve both distinct users and reject duplicate email races', async () => {
  const first=app();
  const results=await Promise.allSettled([
    first.auth.request('/signup',post(credentials)),
    first.auth.request('/signup',post(credentials)),
    first.auth.request('/signup',post({...credentials,email:'other@example.test'}))
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
  const users=JSON.parse(first.local.getItem(usersKey));
  assert.equal(users.length,2);assert.equal(new Set(users.map(user=>user.email)).size,2);
});

const profilePatch = extra => ({ method: 'PATCH', body: JSON.stringify({ displayName: 'ტყის მეგობარი', avatarId: 'free-fox', backgroundId: 'bg-forest', ...extra }) });

test('legacy and unrecognized stored name colors read as the default without exposing raw CSS', async () => {
  const first=app();
  await first.auth.request('/signup',post(credentials));
  const users=JSON.parse(first.local.getItem(usersKey));
  for(const color of [undefined,'#ff0000','url(https://example.invalid/track)','unknown']){
    if(color===undefined)delete users[0].nameColor;else users[0].nameColor=color;
    first.local.setItem(usersKey,JSON.stringify(users));
    assert.equal((await first.auth.request('/profile')).profile.nameColor,'default');
    assert.equal((await first.auth.me()).nameColor,'default');
  }
});

test('a free account cannot persist a Plus name color or partially update its name', async () => {
  const first=app();await first.auth.request('/signup',post(credentials));
  await assert.rejects(first.auth.request('/profile',profilePatch({nameColor:'gold'})),/Plus/);
  const profile=(await first.auth.request('/profile')).profile;
  assert.equal(profile.displayName,'');assert.equal(profile.avatarId,'free-fish');assert.equal(profile.nameColor,'default');
  const saved=await first.auth.request('/profile',profilePatch({nameColor:'default'}));
  assert.equal(saved.profile.nameColor,'default');
});

test('Plus name colors persist across navigation while email remains available for authentication', async () => {
  const first=app();await first.auth.request('/signup',post(credentials));
  first.local.setItem('gn_plan','plus');
  for(const nameColor of ['mint','gold','sky','aqua','rose','lavender','coral']){
    const saved=await first.auth.request('/profile',profilePatch({nameColor}));
    assert.equal(saved.profile.nameColor,nameColor);
    const next=app({local:first.local,tab:first.tab});
    assert.equal((await next.auth.request('/profile')).profile.nameColor,nameColor);
    const user=await next.auth.me();assert.equal(user.nameColor,nameColor);assert.equal(user.email,credentials.email);
  }
});

test('expired Plus blocks a new color while a legacy profile edit can reset to the free default', async () => {
  const first=app();await first.auth.request('/signup',post(credentials));
  first.local.setItem('gn_plan','plus');
  await first.auth.request('/profile',profilePatch({nameColor:'gold'}));
  first.local.setItem('gn_plan_expires_at',String(Date.now()-1000));
  await assert.rejects(first.auth.request('/profile',profilePatch({nameColor:'rose'})),/Plus/);
  assert.equal((await first.auth.request('/profile')).profile.nameColor,'gold');
  const saved=await first.auth.request('/profile',profilePatch({displayName:'ახალი სახელი'}));
  assert.equal(saved.profile.nameColor,'default');
});

test('older clients preserve an entitled stored color when omitting the new field', async () => {
  const first=app();await first.auth.request('/signup',post(credentials));
  first.local.setItem('gn_plan','pro');
  await first.auth.request('/profile',profilePatch({nameColor:'lavender'}));
  const saved=await first.auth.request('/profile',profilePatch({displayName:'ახალი სახელი'}));
  assert.equal(saved.profile.displayName,'ახალი სახელი');assert.equal(saved.profile.nameColor,'lavender');
});

test('unknown or non-string requested name colors fail without saving profile changes', async () => {
  const first=app();await first.auth.request('/signup',post(credentials));first.local.setItem('gn_plan','plus');
  for(const nameColor of ['#ff0000','url(https://example.invalid/track)',{},['gold'],null]){
    await assert.rejects(first.auth.request('/profile',profilePatch({nameColor})),/ფერი არასწორია/);
    const profile=(await first.auth.request('/profile')).profile;assert.equal(profile.nameColor,'default');assert.equal(profile.displayName,'');
  }
});
