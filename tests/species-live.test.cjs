const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function speciesPage(search) {
  const elements = new Map(), ready = [], intervals = [], events = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', value: '', disabled: false, dataset: {}, parentElement: { appendChild() {} }, querySelectorAll() { return []; }, addEventListener() {} });
    return elements.get(id);
  };
  const document = { getElementById: id => ['menuBtn', 'nav'].includes(id) ? null : element(id), addEventListener(event, callback) { if (event === 'DOMContentLoaded') ready.push(callback); }, createElement() { return { innerHTML: '', className: '', querySelectorAll() { return []; } }; } };
  const context = vm.createContext({ document, location: { search }, navigator: {}, Date, Intl, Object, Number, URLSearchParams, Map, AbortController, setTimeout, clearTimeout, setInterval: callback => intervals.push(callback), console, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } });
  context.window = context; context.addEventListener = () => {}; context.dispatchEvent = event => events.push(event);
  context.GeoImage = { esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), placeholder: () => 'placeholder.svg', resolveSpeciesImage: async () => 'placeholder.svg' };
  context.WILDLIFE = [];
  for (const file of ['common.js', 'fishing-data.js', 'species.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context, { filename: file });
  let response = { timezone: 'Asia/Tbilisi', utc_offset_seconds: 14400, current: { time: '2026-10-13T12:15', temperature_2m: 20, pressure_msl: 1013, wind_speed_10m: 5, wind_gusts_10m: 8, precipitation: 0, weather_code: 0, relative_humidity_2m: 60, cloud_cover: 10, is_day: 1 }, hourly: { time: ['2026-10-13T12:00'], precipitation_probability: [10], visibility: [10000] }, __meta: { stale: false } };
  const requests = [];
  context.GeoNatureCommon.openMeteo = async (lat, lon, options) => { requests.push({ lat, lon, options }); return typeof response === 'function' ? response() : response; };
  return { context, element, events, intervals, requests, setResponse(value) { response = value; }, async flush() { await new Promise(resolve => setImmediate(resolve)); }, async start() { await ready[0](); await this.flush(); } };
}

test('blank or malformed incoming chance is unknown and never shown as a catch percentage', async () => {
  for (const chance of ['', 'null', 'NaN', '-1', '101', ' ']) {
    const page = speciesPage('?id=carp&chance=' + encodeURIComponent(chance)); await page.start();
    const lead = page.element('speciesLead').innerHTML;
    assert.ok(lead.includes('მონაცემი მიუწვდომელია')); assert.ok(!lead.includes('წინა გვერდის ინდექსი')); assert.ok(!lead.includes('დაჭერის შანსი'));
    assert.ok(page.element('environment').innerHTML.includes('/100')); assert.ok(!page.element('environment').innerHTML.includes('NaN'));
  }
  const page = speciesPage('?id=carp&chance=77'); await page.start();
  assert.ok(page.element('speciesLead').innerHTML.includes('77/100')); assert.ok(page.element('speciesLead').innerHTML.includes('ბმულიდან მიღებული')); assert.ok(!page.element('speciesLead').innerHTML.includes('77%'));
});

test('species weather uses the shared provider, true current timestamp and explicit fallback location', async () => {
  const page = speciesPage('?id=carp'); await page.start();
  assert.equal(page.requests[0].lat, 41.7151); assert.equal(page.requests[0].lon, 44.8271); assert.equal(page.requests[0].options.force, undefined);
  assert.match(page.element('environment').innerHTML, /თბილისი \(ნაგულისხმევი\)/); assert.match(page.element('environment').innerHTML, /2026-10-13 12:15/);
  assert.match(page.element('environment').innerHTML, /20\.0 °C/); assert.match(page.element('environment').innerHTML, /1013\.0 hPa/);
  assert.equal(page.events.at(-1).detail.selectedCurrent, true); assert.equal(page.intervals.length, 1);
  await page.element('weatherRefresh').onclick(); assert.equal(page.requests.at(-1).options.force, true);
});

test('species refresh preserves stale provenance and clears weather on failure', async () => {
  const page = speciesPage('?id=carp'); await page.start();
  const last = page.events.at(-1).detail.data;
  page.setResponse({ ...last, current: { ...last.current, pressure_msl: null }, __meta: { stale: true } }); await page.element('weatherRefresh').onclick();
  const html = page.element('environment').innerHTML;
  assert.match(html, /ბოლო ხელმისაწვდომი მონაცემი/); assert.ok(html.includes('მონაცემი მიუწვდომელია')); assert.ok(!html.includes('NaN'));
  page.setResponse(() => Promise.reject(new Error('provider unavailable'))); await page.element('weatherRefresh').onclick();
  assert.match(page.element('environment').innerHTML, /დროებით ვერ ჩაიტვირთა/); assert.equal(page.events.at(-1).detail.data, null); assert.equal(page.element('weatherRefresh').disabled, false);
});
