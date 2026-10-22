const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const known = ['known', 'ცნობილი ტბა', 'ტბა', 'თბილისი', 41.7, 44.8, '', ''];
function forecast(temperature = 21, time = '2026-10-13T12:15') {
  const times = ['2026-10-13', '2026-10-14'].flatMap(date => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`));
  const values = value => times.map(() => value);
  return {
    timezone: 'Asia/Tbilisi', utc_offset_seconds: 14400,
    current: { time, temperature_2m: temperature, apparent_temperature: temperature, wind_speed_10m: 3, precipitation: 0, weather_code: 0, is_day: 1 },
    hourly: { time: times, temperature_2m: values(18), apparent_temperature: values(18), wind_speed_10m: values(3), precipitation: values(0), weather_code: values(0), is_day: values(1) }
  };
}
function harness({ waters = [known], fetch, stored = {}, search = '' } = {}) {
  let clock = Date.parse('2026-10-13T08:15:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const ids = ['map', 'mapInfo', 'mapDate', 'mapHour', 'mapLiveLabel', 'mapRefresh', 'mapLiveToggle', 'mapSearch', 'mapSearchBtn', 'mapGps', 'mapNearby', 'mapNearbyList', 'routeMode', 'clearRoute', 'routeInfo'];
  const elements = new Map(ids.map(id => [id, { id, value: '', textContent: '', innerHTML: '', disabled: false, dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = String(value); }, getAttribute(key) { return this.attributes[key] ?? null; }, focus() { this.focused = true; } }]));
  const storage = new Map(Object.entries(stored)), layers = [], calls = [], views = [], fits = [], events = new Map(), removed = new Set(), intervals = new Map();
  const map = { setView(coords, zoom) { views.push({ coords: [...coords], zoom }); return this; }, getCenter() { return { lat: 42, lng: 43.7 }; }, removeLayer(layer) { removed.add(layer); return this; }, fitBounds(bounds, options) { fits.push({bounds,options}); }, invalidateSize() {}, on(event, callback) { events.set(event, callback); return this; } };
  function layer(coords, options = {}, kind = 'marker') {
    const result = { coords, options, kind, handlers: {}, addTo() { layers.push(this); return this; }, bindPopup(html) { this.popup = html; return this; }, openPopup() { this.openedAfterView=views.length; return this; }, setLatLng(next) { this.coords = next; return this; }, setIcon(icon) { this.options.icon = icon; return this; }, on(event, callback) { this.handlers[event] = callback; return this; }, getBounds() { return []; } };
    return result;
  }
  const tileEvents = new Map();
  const context = vm.createContext({ Date: Clock, Intl, console, URLSearchParams, AbortController, location: { search }, navigator: {}, document: { hidden: false, getElementById: id => elements.get(id) || null, addEventListener() {} }, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, setTimeout: () => 1, clearTimeout() {}, setInterval(callback) { intervals.set(intervals.size + 1, callback); return intervals.size; }, clearInterval(id) { intervals.delete(id); }, addEventListener() {}, L: { map: () => map, tileLayer: () => ({ addTo() {}, on(event, callback) { tileEvents.set(event, callback); } }), divIcon: icon => icon, marker: (coords, options) => layer(coords, options), geoJSON: geometry => layer(geometry, {}, 'route'), polyline: coords => layer(coords, {}, 'direct') }, fetch: async (url, options) => { calls.push({ url, options }); if (fetch) return fetch(url, options); const length = new URL(url).searchParams.get('latitude')?.split(',').length || 1; return { ok: true, json: async () => length === 1 ? forecast() : Array.from({ length }, () => forecast()) }; } });
  context.window = context;
  context.WATERS = waters;
  for (const file of ['common.js', 'map.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context, { filename: file });
  context.initGeoMap();
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
  return { context, layers, calls, views, fits, events, tileEvents, removed, storage, intervals, flush, node: id => elements.get(id), markers: () => layers.filter(item => item.options.icon && !removed.has(item)), async click(id) { await elements.get(id).onclick?.(); await flush(); }, setClock(iso) { clock = Date.parse(iso); } };
}

test('failed map backgrounds remain distinguishable from success and can recover on retry', async () => {
  const page=harness();await page.flush();
  page.tileEvents.get('loading')();page.tileEvents.get('tileerror')();page.tileEvents.get('load')();
  assert.equal(page.node('map').dataset.mapTiles,'error');
  assert.equal(page.markers().length,1,'place markers survive a background failure');
  page.tileEvents.get('loading')();assert.equal(page.node('map').dataset.mapTiles,'loading');
  page.tileEvents.get('tileerror')();page.tileEvents.get('tileload')();page.tileEvents.get('load')();
  assert.equal(page.node('map').dataset.mapTiles,'ready','one failed tile must not label a usable background as entirely unavailable');
});

test('late phone controllers reuse the live map without creating duplicate layers or timers', async () => {
  const page=harness();await page.flush();
  const markers=page.markers().length,requests=page.calls.length,timers=page.intervals.size;
  assert.equal(page.context.initGeoMap(),page.context.GNMap.instance);
  assert.equal(typeof page.context.GNMap.refresh,'function');
  assert.equal(page.markers().length,markers);assert.equal(page.calls.length,requests);assert.equal(page.intervals.size,timers);
});

test('a missing map engine renders a visible retry in the canvas', () => {
  const nodes=new Map(['map','mapInfo','mapEngineRetry'].map(id=>[id,{innerHTML:'',textContent:''}]));let reloads=0;
  const context=vm.createContext({document:{getElementById:id=>nodes.get(id)},location:{reload(){reloads++;}}});context.window=context;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/map.js'),'utf8'),context);
  context.initGeoMap();assert.match(nodes.get('map').innerHTML,/role="alert"/);assert.match(nodes.get('map').innerHTML,/mapEngineRetry/);
  nodes.get('mapEngineRetry').onclick();assert.equal(reloads,1);
});

test('GPS waits for an active zoom to finish and opens its popup after centering', async () => {
  const page=harness();await page.flush();
  page.context.navigator.geolocation={getCurrentPosition:done=>done({coords:{latitude:42,longitude:43.7}})};
  page.events.get('zoomstart')();await page.click('mapGps');
  const gps=page.layers.find(layer=>layer.popup==='ჩემი მდებარეობა');
  assert.equal(page.views.length,1,'setView must not run during the previous CSS zoom');assert.equal(gps.openedAfterView,undefined);
  page.events.get('zoomend')();
  assert.deepEqual(page.views.at(-1),{coords:[42,43.7],zoom:12});
  assert.equal(gps.openedAfterView,page.views.length);assert.match(page.node('mapInfo').textContent,/GPS მდებარეობა ჩართულია/);
});

test('nearby replaces a queued GPS view before the old zoom finishes', async () => {
  const page=harness();await page.flush();
  page.context.navigator.geolocation={getCurrentPosition:done=>done({coords:{latitude:42,longitude:43.7}})};
  page.events.get('zoomstart')();await page.click('mapGps');await page.click('mapNearby');page.events.get('zoomend')();
  assert.deepEqual(page.views.at(-1),{coords:[41.7,44.8],zoom:9});
  assert.equal(page.views.length,2,'only the latest queued navigation is applied');
  assert.equal(page.layers.find(layer=>layer.popup==='ჩემი მდებარეობა').openedAfterView,undefined);
});

test('an older delayed GPS result cannot replace a newer local search', async () => {
  const page=harness();await page.flush();let located;
  page.context.navigator.geolocation={getCurrentPosition:done=>{located=done;}};
  const gps=page.node('mapGps').onclick();
  page.node('mapSearch').value=known[1];await page.click('mapSearchBtn');
  located({coords:{latitude:42,longitude:43.7}});await gps;await page.flush();
  assert.deepEqual(page.views.at(-1),{coords:[41.7,44.8],zoom:12});
  assert.match(page.node('mapInfo').textContent,/ცნობილი ტბა/);assert.doesNotMatch(page.node('mapInfo').textContent,/GPS მდებარეობა ჩართულია/);
});

test('clearing a route also cancels its view queued behind a zoom transition', async () => {
  const page=harness({fetch:async url=>({ok:true,json:async()=>url.includes('project-osrm.org')?{routes:[{geometry:{type:'LineString',coordinates:[[43.7,42],[44.8,41.7]]},distance:20000,duration:1800}]}:forecast()})});await page.flush();
  page.context.navigator.geolocation={getCurrentPosition:done=>done({coords:{latitude:42,longitude:43.7}})};
  await page.click('routeMode');page.events.get('zoomstart')();page.markers()[0].handlers.click();await page.flush();
  assert.equal(page.fits.length,0,'route fitting waits while zooming');await page.click('clearRoute');page.events.get('zoomend')();
  assert.equal(page.fits.length,0,'a cleared route must not move the map after zoomend');
});

test('map markers and batch weather exclude unknown, empty, boolean and out-of-range coordinates', async () => {
  const invalid = [[null, null], ['', 44], [false, 44], [91, 44], [41, 181], [[], 44]];
  const waters = [known, ['zero', 'ნულოვანი კოორდინატი', 'ტბა', 'რეგიონი', 0, 0], ...invalid.map((coordinates, i) => [`bad${i}`, 'უცნობი', 'ტბა', 'რეგიონი', ...coordinates])];
  const page = harness({ waters }); await page.flush();
  assert.equal(page.markers().length, 2);
  const query = new URL(page.calls[0].url).searchParams;
  assert.equal(query.get('latitude'), '41.70000,0.00000'); assert.equal(query.get('longitude'), '44.80000,0.00000');
  assert.equal(query.get('wind_speed_unit'), 'kmh'); assert.equal(query.get('temperature_unit'), 'celsius');
  assert.match(page.node('mapInfo').textContent, /2\/2/);
});

test('current mode uses current observations while explicit hours use forecast values', async () => {
  const page = harness({ fetch: async () => ({ ok: true, json: async () => forecast(43) }) }); await page.flush();
  const expectedCurrent = page.context.outdoorScore(page.context.GeoNatureCommon.conditionsFromRow(page.context.GeoNatureCommon.currentWeatherRow(forecast(43))));
  assert.match(page.markers()[0].options.icon.html, new RegExp(`>${expectedCurrent}<`));
  assert.match(page.node('mapLiveLabel').textContent, /მიმდინარე პირობები/);
  assert.doesNotMatch(page.markers()[0].popup, /&hour=/);
  page.node('mapHour').value = '18'; await page.node('mapHour').onchange(); await page.flush();
  const expectedForecast = page.context.outdoorScore(page.context.GeoNatureCommon.conditionsFromRow(page.context.GeoNatureCommon.weatherRowAt(forecast(43), '2026-10-13T18:00')));
  assert.match(page.markers()[0].options.icon.html, new RegExp(`>${expectedForecast}<`));
  assert.notEqual(expectedCurrent, expectedForecast); assert.match(page.node('mapLiveLabel').textContent, /პროგნოზი/);
  assert.match(page.markers()[0].popup, /&hour=18/);
  assert.ok([...page.storage.keys()].some(key => key.endsWith('|current'))); assert.ok([...page.storage.keys()].some(key => key.endsWith('|forecast')));
});

test('stale or missing current measurements are unavailable rather than silently replaced by forecast', async () => {
  for (const mutate of [data => { data.current.time = '2026-10-13T09:00'; }, data => { data.current.temperature_2m = null; }]) {
    const data = forecast(); mutate(data);
    const page = harness({ fetch: async () => ({ ok: true, json: async () => data }) }); await page.flush();
    assert.match(page.markers()[0].options.icon.html, /score-unavailable/);
    assert.match(page.node('mapLiveLabel').textContent, /მონაცემი მიუწვდომელია/); assert.equal(page.storage.size, 0);
  }
});

test('cached selection restores refresh button and a previous request cannot overwrite it', async () => {
  let complete;
  const page = harness({ fetch: () => new Promise(resolve => { complete = resolve; }), stored: { 'GN_MAP_SCORE_V4_2026-10-13|13|forecast': JSON.stringify({ time: Date.parse('2026-10-13T08:15:00Z'), scores: [['known', 42]] }) } });
  assert.equal(page.node('mapRefresh').disabled, true);
  page.node('mapHour').value = '13'; await page.node('mapHour').onchange(); await page.flush();
  assert.equal(page.node('mapRefresh').disabled, false); assert.match(page.markers()[0].options.icon.html, />42</);
  complete({ ok: true, json: async () => forecast() }); await page.flush();
  assert.match(page.markers()[0].options.icon.html, />42</); assert.equal(page.node('mapRefresh').disabled, false);
});

test('a removed or newly unlocated water loses its old map marker', async () => {
  const page = harness(); await page.flush(); const previous = page.markers()[0];
  page.context.WATERS = [[...known.slice(0, 4), null, null]]; await page.click('mapRefresh');
  assert.equal(page.markers().length, 0); assert.ok(page.removed.has(previous)); assert.equal(page.calls.length, 1);
});

test('local search works offline and unlocated names cannot fabricate a pin', async () => {
  const page = harness({ waters: [known, ['unknown', 'უცნობი ტბა', 'ტბა', 'თბილისი', null, null]] }); await page.flush();
  page.context.geocode = async () => []; page.node('mapSearch').value = known[1]; await page.click('mapSearchBtn');
  assert.deepEqual(page.views.at(-1).coords, [41.7, 44.8]);
  const before = page.views.length; page.node('mapSearch').value = 'უცნობი ტბა'; await page.click('mapSearchBtn');
  assert.equal(page.views.length, before); assert.match(page.node('mapInfo').textContent, /ზუსტი კოორდინატები მიუწვდომელია/);
  page.node('mapSearch').value = ' '; await page.click('mapSearchBtn'); assert.equal(page.node('mapSearch').focused, true);
});

test('only the latest search may navigate and invalid geocoder entries are skipped', async () => {
  const page = harness(); await page.flush(); const requests = [];
  page.context.geocode = query => new Promise(resolve => requests.push({ query, resolve }));
  page.node('mapSearch').value = 'პირველი'; const first = page.node('mapSearchBtn').onclick();
  page.node('mapSearch').value = 'მეორე'; const second = page.node('mapSearchBtn').onclick();
  requests[1].resolve([{ lat: null, lon: null }, { lat: '42.2', lon: '43.2', display_name: 'მეორე' }]); await second;
  requests[0].resolve([{ lat: '41', lon: '44', display_name: 'პირველი' }]); await first;
  assert.deepEqual(page.views.at(-1).coords, [42.2, 43.2]); assert.equal(page.node('mapSearchBtn').disabled, false);
});

test('city and region searches do not select an arbitrary water from that region', async () => {
  const page = harness(); await page.flush(); let query;
  page.context.geocode = async value => { query = value; return [{ lat: '41.7151', lon: '44.8271', display_name: 'თბილისი' }]; };
  page.node('mapSearch').value = 'თბილისი'; await page.click('mapSearchBtn');
  assert.equal(query, 'თბილისი'); assert.deepEqual(page.views.at(-1).coords, [41.7151, 44.8271]);
});

test('unsupported GPS gives feedback and nearby distances explicitly use map center', async () => {
  const page = harness({ waters: [known, ['unknown', 'უცნობი', 'ტბა', '', null, null]] }); await page.flush();
  await page.click('mapGps'); assert.match(page.node('mapInfo').textContent, /GPS ხელმისაწვდომი არ არის/);
  await page.click('mapNearby'); assert.match(page.node('mapInfo').textContent, /რუკის ცენტრიდან/);
  assert.match(page.node('mapNearbyList').innerHTML, /id=known/); assert.doesNotMatch(page.node('mapNearbyList').innerHTML, /id=unknown/);
  assert.equal(page.node('mapInfo').getAttribute('aria-live'), 'polite');
});

test('route mode requests GPS, accepts marker and map clicks, and clears pending routes', async () => {
  let pending;
  const page = harness({ fetch: async url => url.includes('project-osrm.org') ? new Promise(resolve => { pending = resolve; }) : { ok: true, json: async () => forecast() } }); await page.flush();
  page.context.navigator.geolocation = { getCurrentPosition: done => done({ coords: { latitude: 41.5, longitude: 44.5 } }) };
  await page.click('routeMode'); assert.equal(page.node('routeMode').getAttribute('aria-pressed'), 'true');
  page.markers()[0].handlers.click(); assert.ok(page.calls.at(-1).url.includes('44.5,41.5;44.8,41.7'));
  page.events.get('click')({ latlng: { lat: 42.1, lng: 43.1 } }); assert.ok(page.calls.at(-1).url.includes('44.5,41.5;43.1,42.1'));
  await page.click('clearRoute'); pending({ ok: true, json: async () => ({ routes: [{ geometry: { type: 'LineString', coordinates: [[44.5, 41.5], [43.1, 42.1]] }, distance: 25000, duration: 3600 }] }) }); await page.flush();
  assert.equal(page.layers.filter(item => item.kind === 'route').length, 0); assert.equal(page.node('routeMode').getAttribute('aria-pressed'), 'false'); assert.match(page.node('routeInfo').textContent, /გასუფთავებულია/);
});

test('malformed driving routes fall back to an explicitly labeled direct distance', async () => {
  const page = harness({ fetch: async url => ({ ok: true, json: async () => url.includes('project-osrm.org') ? { routes: [{ geometry: { type: 'LineString', coordinates: [[null, null], [44, 41]] }, distance: 20000, duration: 1800 }] } : forecast() }) }); await page.flush();
  page.context.navigator.geolocation = { getCurrentPosition: done => done({ coords: { latitude: 41.5, longitude: 44.5 } }) };
  await page.click('routeMode'); page.events.get('click')({ latlng: { lat: 42, lng: 44 } }); await page.flush();
  assert.equal(page.layers.filter(item => item.kind === 'route').length, 0); assert.equal(page.layers.filter(item => item.kind === 'direct').length, 1);
  assert.match(page.node('routeInfo').textContent, /პირდაპირი მანძილი/); assert.doesNotMatch(page.node('routeInfo').textContent, /30 წთ/);
});

test('invalid URL coordinates do not create a selected map pin', async () => {
  const page = harness({ search: '?lat=91&lon=44&name=invalid' }); await page.flush();
  assert.equal(page.layers.filter(item => item.kind === 'marker' && !item.options.icon).length, 0); assert.equal(page.views.length, 1);
});
