const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const repo = path.resolve(__dirname, '..');
let temporary, context, serverHandler, server;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const ua = crypto.createECDH('prime256v1');
ua.generateKeys();
const auth = crypto.randomBytes(16);
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/local-fixture-only',
  keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
};
const preferences = { fish: [{ id: 'carp' }], places: [{ id: 'tbilisi-sea' }], hour: 'any', threshold: 40 };

before(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-push-test-'));
  const fakeHttp = {
    createServer(handler) { serverHandler = handler; return { listen() {}, address() { return { port: 0 }; } }; },
  };
  context = vm.createContext({
    require(name) { return name === 'node:http' ? fakeHttp : require(name); },
    process: { env: { ...process.env, GEONATURE_DATA_DIR: temporary } }, __dirname: repo,
    Buffer, URL, URLSearchParams, AbortController, AbortSignal, Intl, Date,
    console: { log() {}, warn() {}, error() {} },
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {},
    fetch() { throw new Error('No network requests are allowed in push tests'); },
  });
  vm.runInContext(fs.readFileSync(path.join(repo, 'server.js'), 'utf8'), context, { filename: 'server.js' });
  server = vm.runInContext('({normalizePushSub,normalizePushPreferences,calcPushScore,encryptWebPush,runPushChecks,pushFishingModel,pushWaterById})', context);
});
after(() => fs.rmSync(temporary, { recursive: true, force: true }));

function freshWeather(placeId = 'tbilisi-sea') {
  const place = server.pushWaterById.get(placeId);
  const now = new Date();
  now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 15) * 15, 0, 0);
  return {
    utc_offset_seconds: 0, timezone: 'UTC',
    current: {
      time: now.toISOString().slice(0, 16), temperature_2m: 20, pressure_msl: 1015,
      wind_speed_10m: 5, precipitation: 0, weather_code: 1, relative_humidity_2m: 60,
    },
    __meta: { stale: false, updatedAt: Date.now(), currentTime: now.getTime(), requestedLatitude: place[4], requestedLongitude: place[5] },
  };
}
async function route(url, payload) {
  const req = new EventEmitter();
  req.url = url; req.method = 'POST'; req.headers = { host: 'localhost' };
  let status;
  const response = await new Promise((resolve, reject) => {
    const res = { setHeader() {}, writeHead(value) { status = value; }, end(value) { resolve({ status, value: JSON.parse(value) }); } };
    Promise.resolve(serverHandler(req, res)).catch(reject);
    req.emit('data', JSON.stringify(payload)); req.emit('end');
  });
  return response;
}

// Decrypt independently as a browser would: use the receiver private key and
// the sender key carried in the RFC 8188 record, not server helper functions.
test('encrypted push payload decrypts with RFC 8291 browser key derivation', () => {
  const payload = { title: 'ადგილობრივი ტესტი', body: 'პირობების ინდექსი 72/100', url: 'https://example.invalid/' };
  const message = server.encryptWebPush(subscription, payload);
  const salt = message.subarray(0, 16);
  assert.equal(message.readUInt32BE(16), 4096);
  assert.equal(message[20], 65);
  const senderPublic = message.subarray(21, 86);
  const ciphertext = message.subarray(86);
  const sharedSecret = ua.computeSecret(senderPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), senderPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, auth, info, 32));
  const key = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = crypto.createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const clear = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  assert.equal(clear.at(-1), 2, 'final-record delimiter');
  assert.deepEqual(JSON.parse(clear.subarray(0, -1).toString()), payload);
  assert.notDeepEqual(message, server.encryptWebPush(subscription, payload), 'each notification has fresh ephemeral keys and salt');
});

test('subscriptions reject unknown endpoints and malformed or off-curve encryption keys', () => {
  assert.ok(server.normalizePushSub(subscription));
  for (const endpoint of ['http://fcm.googleapis.com/fixture', 'https://127.0.0.1/private', 'https://fcm.googleapis.com.evil.invalid/fixture', 'https://user:password@fcm.googleapis.com/fixture']) assert.equal(server.normalizePushSub({ ...subscription, endpoint }), null);
  assert.equal(server.normalizePushSub({ ...subscription, keys: { ...subscription.keys, auth: 'invalid' } }), null);
  assert.equal(server.normalizePushSub({ ...subscription, keys: { ...subscription.keys, p256dh: Buffer.alloc(65, 4).toString('base64url') } }), null);
});

test('preferences use canonical names, habitats and coordinates instead of forged client values', () => {
  const result = server.normalizePushPreferences({ ...preferences, fish: [{ id: 'carp', name: 'forged', temp: { min: -20, max: 60 } }], places: [{ id: 'tbilisi-sea', lat: 0, lon: 0, name: 'forged' }] });
  assert.equal(result.fish[0].name, 'კობრი');
  assert.equal(result.fish[0].temp, undefined);
  assert.equal(result.places[0].lat, 41.760);
  assert.equal(result.places[0].lon, 44.837);
  for (const invalid of [
    { ...preferences, fish: [{ id: 'nonexistent' }] },
    { ...preferences, places: [{ id: 'nonexistent' }] },
    { ...preferences, places: [{ id: 'tbilisi-sea' }, { id: 'tbilisi-sea' }] },
    { ...preferences, fish: Array(6).fill({ id: 'carp' }) },
    { ...preferences, hour: '99' },
  ]) assert.equal(server.normalizePushPreferences(invalid), null);
});

test('push index uses the published fishing-page model including habitat and local hour', () => {
  const weather = freshWeather();
  const fish = server.pushFishingModel.FISHES.find(item => item[0] === 'carp');
  const water = server.pushWaterById.get('tbilisi-sea');
  const expected = server.pushFishingModel.GeoFishChance(fish, { ...weather.current, local_hour: Number(weather.current.time.slice(11, 13)) }, water, true);
  assert.equal(server.calcPushScore(weather, { id: 'carp' }, { id: 'tbilisi-sea' }), expected);
});

test('an unconfirmed fish and water association cannot trigger a low-threshold server alert', () => {
  const weather=freshWeather(),fish=server.pushFishingModel.FISHES.find(item=>item[0]==='tench'),water=server.pushWaterById.get('tbilisi-sea');
  assert.ok(Number.isFinite(server.pushFishingModel.GeoFishChance(fish,{...weather.current,local_hour:Number(weather.current.time.slice(11,13))},water,true)));
  assert.equal(server.calcPushScore(weather,{id:'tench'},{id:'tbilisi-sea'}),null);
});

test('missing, stale, wrong-place and prohibited-species weather never produces an alert score', () => {
  const fish = { id: 'carp' }, place = { id: 'tbilisi-sea' };
  assert.equal(server.calcPushScore(null, fish, place), null);
  for (const change of [
    value => { value.current.temperature_2m = null; },
    value => { value.current.wind_speed_10m = null; },
    value => { value.__meta.stale = true; },
    value => { value.__meta.currentTime -= 60 * 60 * 1000; },
    value => { value.__meta.updatedAt -= 20 * 60 * 1000; },
    value => { value.__meta.updatedAt = NaN; },
    value => { value.__meta.requestedLatitude = 0; },
    value => { value.current.time = '2020-01-01T08:00'; },
  ]) {
    const value = freshWeather(); change(value);
    assert.equal(server.calcPushScore(value, fish, place), null);
  }
  assert.equal(server.calcPushScore(freshWeather(), { id: 'browntrout' }, place), null);
  assert.equal(server.calcPushScore(freshWeather(), { id: 'sturgeon' }, place), null);
  assert.equal(server.calcPushScore(freshWeather(), fish, { id: 'nonexistent' }), null);
});

test('invalid API subscriptions are rejected and a failed write cannot enable a subscription', async () => {
  const invalid = await route('/api/push/subscribe', { clientId: 'local_test_client', subscription: { ...subscription, endpoint: 'https://127.0.0.1/private' }, preferences });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.value.ok, false);
  const file = path.join(temporary, 'push-state.json');
  fs.unlinkSync(file); fs.mkdirSync(file);
  try {
    const failed = await route('/api/push/subscribe', { clientId: 'local_test_client', subscription, preferences });
    assert.equal(failed.status, 500);
    assert.equal(failed.value.ok, false);
    assert.equal(vm.runInContext('pushState.subscriptions.length', context), 0);
  } finally { fs.rmSync(file, { recursive: true, force: true }); }
});

test('concurrent checks share one run, skip stale data and publish truthful index wording', async () => {
  let weatherCalls = 0;
  const notifications = [];
  const record = { clientId: 'local_check_fixture', enabled: true, subscription, preferences, lastSent: {} };
  context.fixtureSubscriptions = [record];
  context.fixtureWeather = async () => { weatherCalls += 1; await pause(15); return freshWeather(); };
  context.fixtureSend = async (value, payload) => { notifications.push(payload); return true; };
  vm.runInContext('pushState.subscriptions=fixtureSubscriptions;getWeatherData=fixtureWeather;sendPush=fixtureSend;', context);
  await Promise.all([server.runPushChecks(), server.runPushChecks(), server.runPushChecks()]);
  assert.equal(weatherCalls, 1);
  assert.equal(notifications.length, 1);
  assert.ok(notifications[0].body.includes('პირობების ინდექსი'));
  assert.ok(notifications[0].body.includes('დაჭერის ალბათობას არ წარმოადგენს'));
  record.lastSent = {};
  context.fixtureWeather = async () => ({ ...freshWeather(), __meta: { ...freshWeather().__meta, stale: true } });
  vm.runInContext('getWeatherData=fixtureWeather;', context);
  await server.runPushChecks();
  assert.equal(notifications.length, 1);
});

function browser({ github = false, fail = false, rotated = false } = {}) {
  const storage = new Map();
  const requested = [], actions = [];
  let unsubscribed = 0, permissions = 0;
  const push = { toJSON: () => subscription, unsubscribe: async () => { unsubscribed += 1; return true; } };
  const oldPush = { options: { applicationServerKey: new Uint8Array(65) }, unsubscribe: async () => { unsubscribed += 1; return true; } };
  const registration = { pushManager: { getSubscription: async () => rotated ? oldPush : null, subscribe: async () => { actions.push('subscribe'); return push; } } };
  const window = { __GN_API_CONFIG_LOADED: true, GN_API_BASE_URL: '', isSecureContext: true, PushManager: function() {}, Notification: true };
  const sandbox = {
    window, navigator: { serviceWorker: { register: async () => registration } },
    document: { baseURI: 'http://127.0.0.1:8791/dashboard.html', addEventListener() {} },
    location: { hostname: github ? 'niksaniksa25.github.io' : '127.0.0.1', port: '8791' },
    Notification: { requestPermission: async () => { permissions += 1; actions.push('permission'); return 'granted'; } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    crypto, Uint8Array, URL, AbortController, setTimeout, clearTimeout, atob, console,
    fetch: async (url, options) => {
      requested.push({ url, options }); actions.push('request');
      const config = url.endsWith('/config');
      return { ok: config || !fail, status: config || !fail ? 200 : 503, json: async () => config ? { ok: true, publicKey: subscription.keys.p256dh } : fail ? { ok: false, message: 'Local fixture failure' } : { ok: true } };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'js', 'push-notifications.js'), 'utf8'), sandbox);
  return { api: window.GeoNaturePush, requested, storage, actions, get unsubscribed() { return unsubscribed; }, get permissions() { return permissions; } };
}

test('browser records enabled state and edited preferences only after server confirmation', async () => {
  const failed = browser({ fail: true });
  await assert.rejects(failed.api.subscribe({ ...preferences, enabled: false }), /Local fixture failure/);
  assert.equal(failed.api.prefs().enabled, false);
  assert.equal(failed.unsubscribed, 1, 'rollback newly created browser subscription');
  await assert.rejects(failed.api.savePreferences(preferences.fish, preferences.places, 'any', 80), /Local fixture failure/);
  assert.equal(failed.api.prefs().threshold, 72);
  const success = browser();
  await success.api.subscribe({ ...preferences, enabled: false });
  assert.equal(success.api.prefs().enabled, true);
  assert.equal(success.requested[0].url, '/api/push/config', 'configured Node ports use their own origin');
});

test('GitHub Pages without a server refuses push before prompting browser permission', async () => {
  const page = browser({ github: true });
  await assert.rejects(page.api.subscribe(preferences), /Push ახლა მიუწვდომელია/);
  assert.equal(page.requested.length, 0);
  assert.equal(page.permissions, 0);
  assert.equal(page.api.prefs().enabled, false);
});


test('configured push asks permission from the user gesture and replaces rotated browser keys', async () => {
  const page = browser({ rotated: true });
  await page.api.subscribe({ ...preferences, enabled: false });
  assert.equal(page.actions[0], 'permission', 'request permission before asynchronous network work');
  assert.equal(page.unsubscribed, 1, 'remove old subscription with an incompatible VAPID key');
  assert.ok(page.actions.includes('subscribe'));
  assert.equal(page.api.prefs().enabled, true);
});


test('editing preferences or requesting a test cannot reactivate inactive or invalid subscriptions', async () => {
  const clientId = 'inactive_fixture_client';
  const enabled = await route('/api/push/subscribe', { clientId, subscription, preferences });
  assert.equal(enabled.status, 200);
  assert.equal((await route('/api/push/unsubscribe', { clientId })).status, 200);
  const inactive = await route('/api/push/preferences', { clientId, preferences });
  assert.equal(inactive.status, 409);
  assert.equal((await route('/api/push/test', { clientId })).status, 409);
  assert.equal(vm.runInContext("pushState.subscriptions.find(item=>item.clientId==='inactive_fixture_client').enabled", context), false);
  assert.equal((await route('/api/push/subscribe', { clientId, subscription, preferences })).status, 200);
  vm.runInContext("pushState.subscriptions.find(item=>item.clientId==='inactive_fixture_client').subscription.keys.auth='invalid';", context);
  const expired = await route('/api/push/preferences', { clientId, preferences });
  assert.equal(expired.status, 409);
  assert.equal((await route('/api/push/test', { clientId })).status, 409);
  assert.equal((await route('/api/push/subscribe', { clientId, subscription, preferences })).status, 200);
  const updated = await route('/api/push/preferences', { clientId, preferences: { ...preferences, threshold: 80 } });
  assert.equal(updated.status, 200);
  assert.equal(vm.runInContext("pushState.subscriptions.find(item=>item.clientId==='inactive_fixture_client').preferences.threshold", context), 80);
});
