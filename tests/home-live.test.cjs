const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function weather(time = '2026-10-13T12:15', temperature = 27) {
  const times = ['2026-10-13', '2026-10-14'].flatMap(date => Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`));
  const values = value => times.map(() => value);
  return {
    timezone: 'Asia/Tbilisi', utc_offset_seconds: 14400,
    current: { time, temperature_2m: temperature, apparent_temperature: temperature, pressure_msl: 1015, wind_speed_10m: 5, wind_gusts_10m: 7, precipitation: 0, relative_humidity_2m: 60, cloud_cover: 10, weather_code: 0 },
    hourly: { time: times, temperature_2m: values(18), apparent_temperature: values(18), pressure_msl: values(1015), wind_speed_10m: values(5), wind_gusts_10m: values(7), precipitation: values(0), precipitation_probability: values(10), relative_humidity_2m: values(60), cloud_cover: values(10), visibility: values(10000), weather_code: values(0) },
    __meta: { stale: false, updatedAt: Date.parse('2026-10-13T08:15:00Z') }
  };
}
function harness() {
  let clock = Date.parse('2026-10-13T08:15:00Z'), response = weather();
  const elements = new Map(), listeners = new Map(), timers = new Map(), snapshots = [], requests = [];
  const node = id => {
    if (!elements.has(id)) elements.set(id, { id, textContent: '', innerHTML: '', value: '', dataset: {}, disabled: false, attributes: {}, setAttribute(name,value) { this.attributes[name]=value; }, classList: { toggle() {} }, handlers: {}, addEventListener(event, callback) { this.handlers[event] = callback; }, querySelectorAll() { return []; }, querySelector() { return null; } });
    return elements.get(id);
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const document = { body: { dataset: {} }, getElementById: node, querySelectorAll() { return []; }, addEventListener(event, callback) { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(callback); } };
  const context = vm.createContext({ document, Date: Clock, console: { warn() {} }, location: { pathname: '/index.html' }, setInterval(callback) { const id = timers.size + 1; timers.set(id, callback); return id; }, clearInterval(id) { timers.delete(id); }, setTimeout, localStorage: { getItem() { return null; } }, codeMeta: code => [code === 0 ? '☀️' : '☁️', code === 0 ? 'მოწმენდილი' : 'ღრუბლიანი'], openMeteo: async (lat, lon, options) => { requests.push(options); return typeof response === 'function' ? response(lat, lon) : response; } });
  context.window = context;
  context.GNPremium = { maxForecastDays: () => 3 };
  context.GeoNatureCommon = {
    outdoorScore: conditions => conditions.temperature_2m === null ? null : Math.round(conditions.temperature_2m),
    zonedDateTime() { const iso = new Clock(clock + 14400000).toISOString().slice(0, 19); return { iso, date: iso.slice(0, 10), time: iso.slice(11, 16) }; }
  };
  context.fishingEnvironmentScore = conditions => conditions.temperature_2m === null ? null : Math.round(conditions.temperature_2m);
  context.GNLiveFactors = { render: value => snapshots.push(value) };
  for (const file of ['home-dashboard.js', 'geo-extras.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context, { filename: file });
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  return { context, node, timers, snapshots, requests, flush, setResponse(value) { response = value; }, setClock(iso) { clock = Date.parse(iso); }, async start() { for (const callback of listeners.get('DOMContentLoaded') || []) await callback(); }, async event(id, type) { await node(id).handlers[type]?.({ target: node(id) }); await flush(); }, async documentEvent(type) { for(const callback of listeners.get(type)||[]) await callback(); await flush(); }, async interval() { await [...timers.values()][0]?.(); } };
}

test('homepage now uses current observations and one score across its weather panels', async () => {
  const page = harness(); await page.start();
  assert.equal(page.node('homeMainTemp').textContent, '27.0°C');
  assert.equal(page.node('homeTemp').textContent, '27°');
  assert.equal(page.node('homeScore').textContent, 27);
  assert.equal(page.node('outdoorScore').textContent, 27);
  assert.equal(page.node('outdoorScoreValue').textContent, 27);
  assert.match(page.node('homeSelectedTime').textContent, /12:15.*ახლა/);
  assert.equal(page.node('homeLiveState').textContent, '● LIVE');
  assert.equal(page.context.document.body.dataset.live, '1');
  assert.equal(page.snapshots.at(-1).row.current, true);
  assert.ok(page.node('gnBestMomentToday').innerHTML.includes('18'));
  assert.ok(!page.node('gnBestMomentToday').innerHTML.includes('ველოდები'));
});

test('auto refresh advances the current hour while explicit day and hour selection stays a forecast', async () => {
  const page = harness(); await page.start();
  page.setClock('2026-10-13T09:15:00Z'); page.setResponse(weather('2026-10-13T13:15', 30)); await page.interval();
  assert.equal(page.node('homeHourSelect').value, '13:00'); assert.match(page.node('homeSelectedTime').textContent, /13:15.*ახლა/);
  page.node('homeDateSelect').value = '2026-10-14'; page.node('homeDateSelect').onchange();
  page.node('homeHourSelect').value = '18:00'; page.node('homeHourSelect').onchange();
  assert.equal(page.node('homeMainTemp').textContent, '18.0°C'); assert.match(page.node('homeLiveState').textContent, /პროგნოზი/);
  page.setClock('2026-10-13T10:15:00Z'); page.setResponse(weather('2026-10-13T14:15', 32)); await page.context.GeoNatureHome.load();
  assert.equal(page.node('homeDateSelect').value, '2026-10-14'); assert.equal(page.node('homeHourSelect').value, '18:00');
  assert.equal(page.context.document.body.dataset.live, '0'); assert.equal(page.snapshots.at(-1).selectedCurrent, false);
});

test('pause stops scheduled refresh and resuming returns to the current observation', async () => {
  const page = harness(); await page.start(); await page.event('homeLiveToggle', 'click');
  assert.equal(page.timers.size, 0); assert.match(page.node('homeLiveState').textContent, /შეჩერებულია/);
  page.setResponse(weather('2026-10-13T12:15', 29)); await page.event('assessmentRefresh', 'click');
  assert.equal(page.node('homeMainTemp').textContent, '29.0°C'); assert.match(page.node('homeLiveState').textContent, /შეჩერებულია/);
  page.node('homeHourSelect').value = '18:00'; page.node('homeHourSelect').onchange();
  await page.event('assessmentLiveToggle', 'click');
  assert.equal(page.timers.size, 1); assert.equal(page.node('homeMainTemp').textContent, '29.0°C'); assert.equal(page.node('homeLiveState').textContent, '● LIVE');
});

test('a slower previous location cannot replace the latest city or its weather', async () => {
  const page = harness(); await page.start(); const requests = [];
  page.setResponse((lat, lon) => new Promise(resolve => requests.push({ lat, lon, resolve })));
  page.node('homeLocation').value = '41.6168,41.6367,ბათუმი'; await page.event('homeLocation', 'change');
  assert.equal(page.node('homeMainTemp').textContent, '—');
  page.node('homeLocation').value = '42.2679,42.7180,ქუთაისი'; await page.event('homeLocation', 'change');
  requests[1].resolve(weather('2026-10-13T12:15', 22)); await page.flush();
  requests[0].resolve(weather('2026-10-13T12:15', 35)); await page.flush();
  assert.equal(page.node('homeCity').textContent, 'ქუთაისი'); assert.equal(page.node('homeMainTemp').textContent, '22.0°C');
  assert.equal(page.snapshots.at(-1).locationName, 'ქუთაისი'); assert.equal(page.node('homeRefresh').disabled, false);
});

test('missing, stale and failed weather never claims fresh LIVE conditions or invents scores', async () => {
  const page = harness(), missing = weather(); missing.current.temperature_2m = null; missing.current.pressure_msl = null;
  missing.hourly.temperature_2m.fill(null); page.setResponse(missing); await page.start();
  assert.equal(page.node('homeMainTemp').textContent, '—'); assert.equal(page.node('homePressure').textContent, '—');
  assert.equal(page.node('homeScore').textContent, '—'); assert.equal(page.node('fishingScore').textContent, '—'); assert.equal(page.node('huntingScore').textContent, '—');
  assert.equal(page.node('outdoorBand').dataset.level, 'unknown'); assert.ok(!page.node('homeHourlyStrip').innerHTML.includes('NaN'));
  assert.ok(!page.node('gnBestMomentToday').innerHTML.includes('gn-best-score')); assert.equal(page.context.document.body.dataset.live, '0');
  const old = weather(); old.__meta.stale = true; page.setResponse(old); await page.context.GeoNatureHome.load();
  assert.match(page.node('homeLiveState').textContent, /ძველი მონაცემი/); assert.match(page.node('gnBestMomentToday').innerHTML, /ბოლო ხელმისაწვდომი პროგნოზი/);
  page.setResponse(() => Promise.reject(new Error('network unavailable'))); await page.context.GeoNatureHome.load();
  assert.match(page.node('homeLiveState').textContent, /მიუწვდომელია/); assert.match(page.node('homeUpdated').textContent, /ბოლო მონაცემი/); assert.equal(page.context.document.body.dataset.live, '0');
});

test('best moments retain the current whole hour at quarter past and ignore unknown rows', async () => {
  const page = harness(), data = weather();
  data.hourly.temperature_2m.fill(15); data.hourly.temperature_2m[11] = 95; data.hourly.temperature_2m[12] = 85; data.hourly.temperature_2m[13] = null;
  page.setResponse(data); await page.start();
  assert.match(page.node('homeBestHour').textContent, /12:00.*85/); assert.match(page.node('gnBestMomentToday').innerHTML, /<strong>12:00<\/strong>/);
  assert.ok(!page.node('gnBestMomentToday').innerHTML.includes('95'));
  const unknown = weather(); unknown.hourly.temperature_2m.fill(null); unknown.hourly.pressure_msl.fill(null);
  page.context.GeoNatureExtras.renderHome(unknown, null);
  assert.ok(!page.node('gnBestMomentToday').innerHTML.includes('gn-best-score')); assert.equal(page.node('gnBestMomentDays').innerHTML, '');
});

test('personal insights survive malformed saved statistics and escape catch names', () => {
  const page = harness();
  for (const value of ['null', '{"catches":{},"plans":"invalid","favorites":null,"xp":"bad"}', '{"catches":[null,{}, {"fish":"__proto__","place":"<img src=x>","weight":"Infinity"}]}']) {
    page.context.localStorage.getItem = () => value;
    assert.doesNotThrow(() => page.context.GeoNatureExtras.renderPersonalInsights());
    const html = page.node('gnPersonalInsightsGrid').innerHTML;
    assert.ok(!html.includes('NaN')); assert.ok(!html.includes('Infinity')); assert.ok(!html.includes('<img src=x>'));
  }
  assert.match(page.node('gnPersonalInsightsGrid').innerHTML, /&lt;img src=x&gt;/);
});

test('provider daylight context reaches the home score and best-moment calculations', async () => {
  const page = harness(), data = weather(); data.current.is_day = 0; data.hourly.is_day = data.hourly.time.map(() => 0);
  page.context.GeoNatureCommon.outdoorScore = conditions => conditions.is_day === 0 ? 10 : 85;
  page.setResponse(data); await page.start();
  assert.equal(page.node('homeScore').textContent, 10); assert.equal(page.node('outdoorScoreValue').textContent, 10);
  assert.match(page.node('homeBestHour').textContent, /10\/100/); assert.match(page.node('gnBestMomentToday').innerHTML, /<b>10<\/b>/);
});

test('returning to now restores current measurements and manual refresh bypasses the gateway cache', async () => {
  const page = harness(); await page.start();
  page.node('homeDateSelect').value='2026-10-14';page.node('homeDateSelect').onchange();
  page.node('homeHourSelect').value='18:00';page.node('homeHourSelect').onchange();
  assert.equal(page.node('homeNow').disabled,false);
  await page.event('homeRefresh','click');assert.equal(page.requests.at(-1).force,true);
  assert.equal(page.node('homeDateSelect').value,'2026-10-14','refresh preserves an explicitly selected forecast');
  await page.event('homeNow','click');assert.equal(page.node('homeDateSelect').value,'2026-10-13');
  assert.equal(page.node('homeMainTemp').textContent,'27.0°C');assert.equal(page.requests.at(-1).force,true);
  assert.equal(page.node('homeNow').disabled,true);
});

test('hidden pages pause polling and resume with fresh data while toggle state is accessible', async () => {
  const page=harness();await page.start();const count=page.requests.length;
  page.context.document.hidden=true;await page.interval();assert.equal(page.requests.length,count);
  page.context.document.hidden=false;await page.documentEvent('visibilitychange');assert.equal(page.requests.length,count+1);
  assert.equal(page.node('homeLiveToggle').attributes['aria-pressed'],'true');
  await page.event('homeLiveToggle','click');assert.equal(page.node('homeLiveToggle').attributes['aria-pressed'],'false');
  page.context.document.hidden=true;page.context.document.hidden=false;await page.documentEvent('visibilitychange');
  assert.equal(page.requests.length,count+1,'paused weather stays paused when the page becomes visible');
});
