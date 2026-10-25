const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function harness(stored = {}) {
  const data = new Map(Object.entries(stored).map(([key, value]) => [key, JSON.stringify(value)]));
  const elements = new Map();
  const events = new Map();
  const createElement = id => {
    const classes = new Set(id === 'safetyPanel' ? ['hidden'] : []);
    const listeners = new Map();
    const element = { id, value: '', textContent: '', innerHTML: '', disabled: false,
      classList: { contains: name => classes.has(name), remove: name => classes.delete(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
      addEventListener: (name, handler) => listeners.set(name, handler),
      fire: (name, event = {}) => listeners.get(name)?.(event),
    };
    elements.set(id, element); return element;
  };
  const document = { readyState: 'loading', hidden: false, getElementById: id => elements.get(id) || null,
    addEventListener(name, handler) { if (!events.has(name)) events.set(name, []); events.get(name).push(handler); },
  };
  const window = { location: { hostname: 'example.github.io' }, addEventListener() {},
    GNPremium: { has: () => true, maxForecastDays: () => 3 },
  };
  const context = vm.createContext({ window, document, navigator: {}, Intl, Date, Map, Set, Number, Math,
    Object, String, Array, JSON, Boolean, Promise, console, AbortController,
    localStorage: { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
  });
  for (const file of ['common.js', 'fishing-data.js', 'wildlife-rules.js', 'weather-hazards.js', 'premium-extras.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context, { filename: file });
  }
  return { window, elements, createElement, events, data, tools: window.GeoNaturePremiumTools,
    init: () => events.get('DOMContentLoaded').forEach(handler => handler()),
  };
}
function forecast(now = new Date(), shift = 0) {
  const local = new Date(now.getTime() + 4 * 60 * 60 * 1000 + shift).toISOString().slice(0, 16);
  const day = local.slice(0, 10), times = [];
  for (let i = 0; i < 48; i++) times.push(new Date(Date.parse(day + 'T00:00Z') + i * 3600000).toISOString().slice(0, 16));
  const current = { time: local, temperature_2m: 20, pressure_msl: 1013, wind_speed_10m: 8,
    wind_gusts_10m: 12, precipitation: 0, weather_code: 1, cloud_cover: 20, relative_humidity_2m: 60 };
  const hourly = { time: times, visibility: times.map(() => 10000), precipitation_probability: times.map(() => 5) };
  for (const [key, value] of Object.entries(current)) if (key !== 'time') hourly[key] = times.map(() => value);
  const next = times[24].slice(0, 10);
  return { current, hourly, timezone: 'Asia/Tbilisi', utc_offset_seconds: 14400,
    daily: { time: [day, next], sunrise: [day + 'T07:00', next + 'T07:00'], sunset: [day + 'T18:00', next + 'T18:00'] },
    __meta: { source: 'Open-Meteo', stale: false } };
}

test('best hours use the forecast location clock, exclude past days and respond to real storm conditions', () => {
  const { tools, window } = harness();
  const now = new Date('2026-10-12T22:30:00Z'), data = forecast(now);
  const rows = tools.futureRows(data, now);
  assert.equal(rows[0].iso, '2026-10-13T02:00');
  assert.ok(rows.every(row => row.iso >= '2026-10-13T02:00'));
  const fish = window.FISHES[0], water = window.WATERS[0];
  const calm = tools.rankedHours(data, fish, water, now);
  assert.ok(calm[0].score > 20);
  data.hourly.weather_code.fill(95);
  const storm = tools.rankedHours(data, fish, water, now);
  assert.ok(storm.every(item => item.score <= 20));
  data.hourly.pressure_msl.fill(null);
  assert.equal(tools.rankedHours(data, fish, water, now).length, 0);
});

test('freshness refuses stale, old, future and missing current data without client timezone bias', () => {
  const { tools } = harness();
  const now = new Date('2026-10-12T22:30:00Z');
  assert.equal(tools.fresh(forecast(now), now), true);
  assert.equal(tools.fresh(forecast(now, -2 * 3600000), now), false);
  assert.equal(tools.fresh(forecast(now, 3600000), now), false);
  const stale = forecast(now); stale.__meta.stale = true;
  assert.equal(tools.fresh(stale, now), false);
  assert.equal(tools.fresh({}, now), false);
});

test('night sky uses real night boundaries, cloud and visibility and preserves unknown inputs', () => {
  const { tools } = harness();
  const data = forecast(new Date('2026-10-13T08:00:00Z'));
  const day = data.daily.time[0];
  assert.equal(tools.skyAssessment(data, { iso: day + 'T12:00', date: day, cloud: 0, visibility: 10000 }), null);
  const clear = tools.skyAssessment(data, { iso: day + 'T20:00', date: day, cloud: 0, visibility: 10000 });
  assert.equal(clear.score, 100);
  assert.equal(tools.skyAssessment(data, { iso: day + 'T20:00', date: day, cloud: 100, visibility: 10000 }).score, 0);
  assert.equal(tools.skyAssessment(data, { iso: day + 'T20:00', date: day, cloud: null, visibility: 10000 }), null);
  assert.equal(tools.skyAssessment(data, { iso: day + 'T20:00', date: day, cloud: 0, visibility: null }), null);
  delete data.daily.sunset;
  assert.equal(tools.skyAssessment(data, { iso: day + 'T20:00', date: day, cloud: 0, visibility: 10000 }), null);
});

test('personal statistics read both real catch stores and skip empty or invalid weights', () => {
  const { tools } = harness({ geonature_plus_v1: { catches: [{ fish: 'კობრი', weight: 2 }, { fish: 'კობრი', weight: '' }], favorites: ['ლისი'], plans: [1] },
    gn_catches: [{ species: 'ლოქო', weight: '4' }, { species: 'კობრი', weight: -1 }, { species: 'ლოქო', weight: 'invalid' }],
    gn_plus_state: { catches: [{ fish: 'fake legacy', weight: 999 }] } });
  const history = tools.catchHistory(), summary = tools.recordSummary(history.records);
  assert.equal(history.records.length, 5);
  assert.equal(summary.favorite[0], 'კობრი');
  assert.equal(summary.weighed, 2);
  assert.equal(summary.average, 3);
  assert.equal(summary.max.weight, 4);
  assert.equal(history.favorites.length, 1);
  assert.equal(history.plans.length, 1);
});

test('premium reports start empty, escape user entries and clear live values on failed refresh', async () => {
  const h = harness();
  for (const id of ['toolsLocation', 'toolsFish', 'toolsStatus', 'liveStatus', 'updatedAt', 'bestActivity', 'bestTime', 'bestScore', 'bestPlace', 'bestNote',
    'biteNow', 'fishTimeline', 'stargazing', 'alertState', 'alertThreshold', 'reports', 'reportStatus', 'reportPlace', 'reportFish', 'reportActivity', 'addReport',
    'personalInsight', 'predictor', 'tripPrompt', 'tripResult', 'buildTrip', 'hotspots', 'refreshBest', 'safetyPanel']) h.createElement(id);
  h.window.GeoNatureCommon.openMeteo = async () => forecast();
  h.init();
  await h.tools.refresh();
  assert.match(h.elements.get('reports').innerHTML, /ჯერ არ არის/);
  h.elements.get('reportPlace').value = '<img src=x onerror=alert(1)>';
  h.elements.get('reportFish').value = '<script>bad</script>';
  h.elements.get('addReport').fire('click');
  assert.ok(!h.elements.get('reports').innerHTML.includes('<img'));
  assert.match(h.elements.get('reports').innerHTML, /&lt;img/);
  assert.match(h.elements.get('reports').innerHTML, /&lt;script/);
  h.elements.get('tripPrompt').value = '<img src=x onerror=alert(1)>';
  h.elements.get('buildTrip').fire('click');
  assert.ok(!h.elements.get('tripResult').innerHTML.includes('<img'));
  assert.match(h.elements.get('tripResult').innerHTML, /&lt;img/);
  assert.match(h.elements.get('bestScore').textContent, /\/100/);
  h.elements.get('toolsFish').value = 'browntrout';
  h.elements.get('toolsFish').fire('change');
  h.elements.get('buildTrip').fire('click');
  assert.match(h.elements.get('tripResult').innerHTML, /გეგმა ვერ შედგება/);
  h.window.GeoNatureCommon.openMeteo = async () => { throw new Error('offline'); };
  await h.tools.refresh();
  assert.equal(h.elements.get('bestScore').textContent, '—');
  assert.match(h.elements.get('biteNow').textContent, /მიუწვდომელია/);
  assert.match(h.elements.get('liveStatus').textContent, /მიუწვდომელია/);
});

test('slower previous destination fetch cannot replace the current location forecast', async () => {
  const h = harness();
  for (const id of ['toolsLocation', 'toolsFish', 'bestPlace', 'bestScore', 'liveStatus']) h.createElement(id);
  let completeOld;
  h.window.GeoNatureCommon.openMeteo = () => new Promise(resolve => { completeOld = resolve; });
  h.init();
  const destination = h.window.WATERS[1];
  h.elements.get('toolsLocation').value = destination[0];
  h.window.GeoNatureCommon.openMeteo = async () => forecast();
  await h.elements.get('toolsLocation').fire('change');
  await Promise.resolve();
  completeOld(forecast());
  await Promise.resolve();
  assert.equal(h.elements.get('bestPlace').textContent, destination[1]);
});

test('premium safety uses the same interval-aware hazards and cannot call missing measurements clear',async()=>{
  const h=harness();for(const id of ['toolsLocation','toolsFish','safetyMode','safetyPanel'])h.createElement(id);
  const water=h.window.WATERS.find(item=>typeof item[4]==='number'&&typeof item[5]==='number'),data=forecast();
  data.current.interval=900;data.current.precipitation=1.5;data.__meta={...data.__meta,updatedAt:Date.now(),requestedLatitude:water[4],requestedLongitude:water[5]};
  h.window.GeoNatureCommon.openMeteo=async()=>data;h.init();await h.tools.refresh();await h.elements.get('safetyMode').fire('click');
  assert.match(h.elements.get('safetyPanel').innerHTML,/⚠️/);assert.match(h.elements.get('safetyPanel').innerHTML,/ნალექი/);
  data.current.precipitation=0;data.current.wind_speed_10m=null;await h.tools.refresh();await h.elements.get('safetyMode').fire('click');
  assert.match(h.elements.get('safetyPanel').innerHTML,/ყველა რისკი ვერ შემოწმდა/);assert.doesNotMatch(h.elements.get('safetyPanel').innerHTML,/ზღვარი არ გადაჭარბებულა/);
  data.__meta.stale=true;await h.tools.refresh();await h.elements.get('safetyMode').fire('click');assert.match(h.elements.get('safetyPanel').innerHTML,/რისკი ვერ შეფასდა/);
});
