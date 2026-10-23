const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const profile = { displayName: 'ტყის მეგობარი', avatarId: 'free-fox', backgroundId: 'bg-forest' };
let data, child, base;

async function start() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: repo,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', GEONATURE_DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('Profile API server did not start: ' + errors)), 10000);
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Profile API server exited: ' + code + ' ' + errors)); });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}
async function api(user, payload, { route = '/api/auth/profile', expected = 200, admin = false } = {}) {
  const response = await fetch(base + route, {
    method: payload === undefined ? 'GET' : 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: 'gn_session=' + user + (admin ? '; gn_admin=admin-fixture' : '') },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  const value = await response.json();
  assert.equal(response.status, expected, JSON.stringify(value));
  return value;
}
async function stored(id) {
  return JSON.parse(await fs.readFile(path.join(data, 'users.json'), 'utf8')).find(user => user.id === id);
}

before(async () => {
  data = await fs.mkdtemp(path.join(os.tmpdir(), 'geonature-profile-api-'));
  const now = Date.now();
  const users = [
    { id: 'legacy', plan: 'free' },
    { id: 'free', plan: 'free', nameColor: 'default' },
    { id: 'plus', plan: 'plus', planExpiresAt: now + 3600000 },
    { id: 'pro', plan: 'pro', planExpiresAt: now + 3600000 },
    { id: 'unlimited', plan: 'plus', nameColor: 'mint' },
    { id: 'expired', plan: 'plus', planExpiresAt: now - 1000, nameColor: 'gold' },
    { id: 'bad-expiry', plan: 'plus', planExpiresAt: 'invalid', nameColor: 'gold' },
    { id: 'invalid-color', plan: 'plus', nameColor: 'red; background:url(https://example.invalid)' },
    { id: 'stale-free', plan: 'free', nameColor: 'lavender' },
    { id: 'admin-user', plan: 'free' },
  ].map(user => ({ ...profile, email: user.id + '@example.invalid', createdAt: now, ...user }));
  const sessions = Object.fromEntries(users.map(user => [user.id, { userId: user.id, expiresAt: now + 3600000 }]));
  sessions['__admin__:admin-fixture'] = { userId: 'ADMIN', expiresAt: now + 3600000 };
  await fs.writeFile(path.join(data, 'users.json'), JSON.stringify(users));
  await fs.writeFile(path.join(data, 'sessions.json'), JSON.stringify(sessions));
  await start();
});
after(async () => {
  await stop();
  if (data) await fs.rm(data, { recursive: true, force: true });
});

test('legacy accounts expose the default name color without rewriting their stored profile', async () => {
  assert.equal((await api('legacy')).profile.nameColor, 'default');
  assert.equal((await api('legacy', undefined, { route: '/api/auth/me' })).user.nameColor, 'default');
  assert.equal((await stored('legacy')).nameColor, undefined);
  const saved = await api('legacy', profile);
  assert.equal(saved.profile.nameColor, 'default');
  assert.equal((await stored('legacy')).nameColor, 'default');
});

test('free accounts cannot activate a Plus color or bypass the existing avatar and background gates', async () => {
  const original = await stored('free');
  await api('free', { ...profile, nameColor: 'gold' }, { expected: 403 });
  await api('free', { ...profile, nameColor: 'default', avatarId: 'plus-wolf' }, { expected: 403 });
  await api('free', { ...profile, nameColor: 'default', backgroundId: 'bg-football' }, { expected: 403 });
  assert.deepEqual(await stored('free'), original);
  assert.equal((await api('free', { ...profile, nameColor: 'default' })).profile.nameColor, 'default');
});

test('active Plus color persists through a server restart and is included in account responses', async () => {
  assert.equal((await api('plus', { ...profile, nameColor: 'gold' })).profile.nameColor, 'gold');
  assert.equal((await stored('plus')).nameColor, 'gold');
  await stop();
  await start();
  assert.equal((await api('plus')).profile.nameColor, 'gold');
  assert.equal((await api('plus', undefined, { route: '/api/auth/me' })).user.nameColor, 'gold');
  assert.equal((await api('pro', { ...profile, nameColor: 'sky' })).profile.nameColor, 'sky');
});

test('profile updates reject unknown name colors instead of storing arbitrary CSS', async () => {
  for (const nameColor of ['#fff', 'red; background:url(https://example.invalid)', 'constructor', '', null, 1, {}, ['gold']]) {
    await api('plus', { ...profile, nameColor }, { expected: 400 });
  }
  assert.equal((await stored('plus')).nameColor, 'gold');
  assert.equal((await api('invalid-color')).profile.nameColor, 'default');
  assert.equal((await api('invalid-color', profile)).profile.nameColor, 'default');
});

test('expired and invalid-expiry plans display default and reject a new paid color', async () => {
  for (const id of ['expired', 'bad-expiry']) {
    assert.equal((await api(id)).profile.nameColor, 'default');
    assert.equal((await api(id, undefined, { route: '/api/auth/me' })).user.nameColor, 'default');
    assert.equal((await stored(id)).nameColor, 'gold');
    await api(id, { ...profile, nameColor: 'rose' }, { expected: 403 });
    assert.equal((await stored(id)).nameColor, 'gold');
    assert.equal((await api(id, profile)).profile.nameColor, 'default');
    assert.equal((await stored(id)).nameColor, 'default');
  }
});

test('older clients retain an active paid preference but cannot retain a paid free-account color', async () => {
  assert.equal((await api('unlimited', profile)).profile.nameColor, 'mint');
  assert.equal((await stored('unlimited')).nameColor, 'mint');
  assert.equal((await api('stale-free', profile)).profile.nameColor, 'default');
  assert.equal((await stored('stale-free')).nameColor, 'default');
});

test('an authenticated admin session may choose a Plus color for its signed-in account', async () => {
  const result = await api('admin-user', { ...profile, nameColor: 'lavender' }, { admin: true });
  assert.equal(result.profile.nameColor, 'lavender');
  assert.equal((await api('admin-user', undefined, { admin: true })).profile.nameColor, 'lavender');
  assert.equal((await api('admin-user', undefined, { route: '/api/auth/me', admin: true })).user.nameColor, 'lavender');
  assert.equal((await api('admin-user')).profile.nameColor, 'default');
});
