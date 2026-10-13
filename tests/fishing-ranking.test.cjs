const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// A small DOM fixture keeps the tests dependency-free while exercising the
// actual rendering, keyboard handlers and DOM movement used in the page.
function fixture() {
  const elements = new Map();
  let context;
  class Element {
    constructor(id = '') {
      this.id = id; this.children = []; this.dataset = {}; this.attributes = {};
      this.value = ''; this.textContent = ''; this.options = [];
      this.isConnected = Boolean(id);
      this.classList = { toggle() {} }; this.style = { setProperty() {} };
      this.parts = { image: { isConnected: false }, slot: {}, title: {} };
    }
    set innerHTML(value) {
      for (const child of this.children) { child.isConnected = false; child.parts.image.isConnected = false; }
      this.html = value; this.children = [];
      if (this.id === 'hourSelect') this.options = [...value.matchAll(/<option value="([^"]*)"/g)].map(match => ({ value: match[1] }));
    }
    get innerHTML() { return this.html || ''; }
    appendChild(child) { this.children.push(child); child.parentElement = this; child.isConnected = true; child.parts.image.isConnected = true; return child; }
    insertBefore(child, at) {
      // Older mobile engines can blur a node when insertBefore moves it.
      if (context.document.activeElement === child) {
        context.document.activeElement = null; context.scrollY += 200;
      }
      this.children = this.children.filter(item => item !== child);
      const index = at ? this.children.indexOf(at) : this.children.length;
      this.children.splice(index < 0 ? this.children.length : index, 0, child);
    }
    contains(node) { return this.children.includes(node); }
    focus(options) { context.document.activeElement = this; this.lastFocusOptions = options; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener() {}
    querySelector(selector) {
      if (selector === 'img') return this.parts.image;
      if (selector === '.fish-chance-slot') return this.parts.slot;
      if (selector.includes('.gn-chance')) return this.parts.title;
      return null;
    }
    querySelectorAll(selector) {
      if (selector.includes('.fish-card')) return this.children.filter(child => child.dataset.fishId);
      return [];
    }
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  context = vm.createContext({
    console, Date, Intl, CustomEvent: class CustomEvent {},
    document: {
      activeElement: null, addEventListener() {}, dispatchEvent() {},
      createElement: () => new Element(), getElementById: id => ['menuBtn', 'nav'].includes(id) ? null : get(id),
      querySelectorAll(selector) { return selector.includes('#fishResults') ? get('fishResults').querySelectorAll('.fish-card') : []; },
    },
    navigator: {}, setTimeout() {}, clearTimeout() {}, URLSearchParams,
    scrollX: 0, scrollY: 400,
    scrollTo({ left, top }) { this.scrollX = left; this.scrollY = top; },
  });
  context.window = context;
  context.addEventListener = () => {};
  context.GeoImage = { resolveSpeciesImage: async () => 'fish.svg', placeholder: () => 'fish.svg' };
  context.GeoChanceUI = { markup: score => `<span class="gn-chance">${score ?? '—'}</span>` };
  for (const name of ['common.js', 'fishing-data.js', 'fishing.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name), 'utf8'), context, { filename: name });
  context.GeoNatureCommon.zonedDateTime = () => ({ date: '2026-10-13', time: '12:30', hour: 12 });
  get('fishType').value = 'all'; get('startDate').value = '2026-10-13';
  const set = source => vm.runInContext(source, context);
  set('selectedWater=WATERS[0]');
  return { context, get, set, cards: () => get('fishResults').children };
}

function forecast(hour = 12, minute = 15, wind = 6) {
  const date = '2026-10-13';
  const values = { temperature_2m: 20, pressure_msl: 1015, wind_speed_10m: wind, wind_gusts_10m: wind + 3, precipitation: 0, precipitation_probability: 10, weather_code: 1, relative_humidity_2m: 60, cloud_cover: 30, visibility: 10000 };
  const times = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  return { timezone: 'Asia/Tbilisi', utc_offset_seconds: 14400, current: { time: `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, ...values }, hourly: { time: times, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, times.map(() => value)])) }, daily: { time: [date] } };
}

const ids = entries => Array.from(entries, entry => entry.fish[0]);

test('live ranking sorts highest first, puts missing scores last and preserves real zero', () => {
  const { context } = fixture();
  const fishes = context.FISHES.slice(0, 5), scores = new Map([[fishes[0][0], 70], [fishes[1][0], null], [fishes[2][0], 90], [fishes[3][0], 0], [fishes[4][0], 70]]);
  context.GeoFishChance = fish => scores.get(fish[0]);
  const original = ids(fishes.map(fish => ({ fish })));
  assert.deepEqual(ids(context.GeoFishingPlanner.rankedList(fishes)), [fishes[2][0], fishes[0][0], fishes[4][0], fishes[3][0], fishes[1][0]]);
  assert.deepEqual(ids(fishes.map(fish => ({ fish }))), original, 'sorting does not mutate the catalogue');
  assert.deepEqual(ids(context.GeoFishingPlanner.rankedList([...fishes].reverse())), ids(context.GeoFishingPlanner.rankedList(fishes)), 'ties use stable catalogue identity');
});

test('initial card rendering uses descending indices and keyboard actions retain fish identity', () => {
  const { context, cards } = fixture();
  const list = context.FISHES.slice(0, 3);
  context.GeoFishChance = fish => ({ [list[0][0]]: 10, [list[1][0]]: 90, [list[2][0]]: null })[fish[0]];
  context.renderFishResults(list);
  assert.deepEqual(cards().map(card => card.dataset.fishId), [list[1][0], list[0][0], list[2][0]]);
  let clicked;
  context.selectFish = (fish, scroll, score) => { clicked = { fish, score }; };
  cards()[0].onkeydown({ key: 'Enter', preventDefault() {} });
  assert.equal(clicked.fish, list[1]); assert.equal(clicked.score, 90);
  cards()[2].onclick(); assert.equal(clicked.score, null, 'unknown never turns into index zero');
});

test('fish selection options reorder on live index changes without changing canonical values or selection', () => {
  const { context, get } = fixture(), select=get('fishSelect'), fish=context.FISHES.slice(0,4);
  Object.defineProperty(select,'options',{get:()=>select.children});
  const prompt=context.document.createElement('option');prompt.value='';select.appendChild(prompt);
  const options=fish.map((f,index)=>{const option=context.document.createElement('option');option.value=String(index);select.appendChild(option);return option;});
  let scores=[20,80,null,0],changes=0;select.value='0';select.onchange=()=>changes++;
  context.GeoFishChance=f=>scores[fish.indexOf(f)];context.refreshVisibleFishScores();
  assert.deepEqual(select.children.map(option=>option.value),['','1','0','3','2']);
  assert.equal(select.value,'0');assert.match(options[3].textContent,/0\/100/);assert.match(options[2].textContent,/უცნობია/);
  scores=[90,10,70,0];context.refreshVisibleFishScores();
  assert.deepEqual(select.children.map(option=>option.value),['','0','2','1','3']);
  assert.equal(select.value,'0');assert.equal(changes,0);
  assert.ok(options.every(option=>select.children.includes(option)),'existing option nodes remain in use');
  assert.equal(options[0].dataset.fishId,fish[0][0]);
});

test('freshwater filtering includes river species and keeps the descending live order', () => {
  const { context,get,cards }=fixture();get('fishType').value='fresh';context.renderFishSearch();
  const actual=cards().map(card=>card.dataset.fishId);
  const river=context.FISHES.filter(f=>f[3].includes('მდინარე'));assert.ok(river.length>0);
  assert.ok(river.every(f=>actual.includes(f[0])));
  assert.ok(context.FISHES.filter(f=>f[3]==='ზღვა').every(f=>!actual.includes(f[0])));
  const expected=context.GeoFishingPlanner.rankedList(context.FISHES.filter(f=>f[3].includes('მტკნარი')||f[3].includes('მდინარე')));
  assert.deepEqual(actual,ids(expected));
});

test('weather reordering keeps existing cards, selected identity, keyboard focus and scroll position', () => {
  const { context, cards, get, set } = fixture();
  const list = context.FISHES.slice(0, 3);
  let scores = [90, 70, 30];
  context.GeoFishChance = fish => scores[list.indexOf(fish)];
  context.renderFishResults(list);
  const originalCards = cards().slice();
  set('selectedFish=FISHES[1]');
  originalCards[1].focus(); const y = context.scrollY;
  scores = [30, 70, 90]; context.refreshVisibleFishScores();
  assert.deepEqual(cards().map(card => card.dataset.fishId), [list[2][0], list[1][0], list[0][0]]);
  assert.ok(cards().every(card => originalCards.includes(card)), 'updates move nodes instead of rebuilding them');
  assert.equal(context.selectedFish, list[1]); assert.equal(context.document.activeElement, originalCards[1]);
  assert.equal(context.scrollY, y); assert.equal(originalCards[1].lastFocusOptions.preventScroll, true);
  assert.equal(originalCards[1].attributes['aria-pressed'], 'true');
  assert.match(get('fishProfileChance').innerHTML, /70/);
});

test('live changes keep query, type and filtered count while reordering only matching fish', () => {
  const { context, cards, get } = fixture();
  get('fishSearch').value = 'carp'; get('fishType').value = 'fresh';
  let reverse = false;
  context.GeoFishChance = fish => reverse ? context.FISHES.indexOf(fish) : 100 - context.FISHES.indexOf(fish);
  context.renderFishSearch();
  const first = cards().map(card => card.dataset.fishId), count = get('fishCount').textContent;
  reverse = true; context.refreshVisibleFishScores();
  assert.deepEqual(cards().map(card => card.dataset.fishId), [...first].reverse());
  assert.equal(get('fishSearch').value, 'carp'); assert.equal(get('fishType').value, 'fresh'); assert.equal(get('fishCount').textContent, count);
});

test('default live conditions follow payload timestamps instead of freezing the initial hour', () => {
  const { context, get, set } = fixture();
  context.response = forecast(12, 15, 6); set('plannerWeather=response');
  context.renderFishingHourly(context.response);
  assert.equal(context.GeoFishingPlanner.selectedRow.time, '12:15'); assert.equal(context.GeoFishingPlanner.tracksCurrent, true);
  assert.equal(get('hourSelect').value, '');
  context.response = forecast(13, 30, 20); set('plannerWeather=response'); context.renderFishingHourly(context.response);
  assert.equal(context.GeoFishingPlanner.selectedRow.time, '13:30'); assert.equal(context.GeoFishingPlanner.selectedRow.wind, 20);
  assert.equal(get('hourSelect').value, ''); assert.match(get('fishLiveMode').textContent, /LIVE/);
});

test('an explicitly selected forecast hour stays selected after fresh live data arrives', () => {
  const { context, get, set } = fixture();
  context.response = forecast(12, 15); set("plannerWeather=response;selectedFishingHour='17:00';fishingDateTracksToday=false");
  context.renderFishingHourly(context.response);
  assert.equal(context.GeoFishingPlanner.selectedRow.time, '17:00'); assert.equal(context.GeoFishingPlanner.tracksCurrent, false);
  context.response = forecast(13, 30, 20); set('plannerWeather=response'); context.renderFishingHourly(context.response);
  assert.equal(context.GeoFishingPlanner.selectedRow.time, '17:00'); assert.equal(get('hourSelect').value, '17:00');
  assert.match(get('fishLiveMode').textContent, /საათობრივი/);
});

test('forced live refresh makes one request and updates the existing ranked list', async () => {
  const { context, cards } = fixture();
  context.renderFishResults(context.FISHES.slice(0, 4)); const oldCards = cards().slice();
  const calls = [];
  context.openMeteo = async (lat, lon, options) => { calls.push({ lat, lon, options }); return forecast(13, 30, 20); };
  await context.refreshFishingWeather({ force: true });
  assert.equal(calls.length, 1); assert.equal(calls[0].options.force, true);
  assert.equal(context.GeoFishingPlanner.selectedRow.time, '13:30');
  assert.ok(cards().every(card => oldCards.includes(card)));
});

test('a slower superseded live refresh cannot overwrite a newer response', async () => {
  const { context } = fixture(); let resolveFirst;
  context.openMeteo = () => new Promise(resolve => { resolveFirst = resolve; });
  const first = context.refreshFishingWeather({ force: true });
  context.openMeteo = async () => forecast(14, 45, 12);
  await context.refreshFishingWeather({ force: true });
  resolveFirst(forecast(12, 15, 6)); await first;
  assert.equal(context.GeoFishingPlanner.selectedRow.time, '14:45'); assert.equal(context.GeoFishingPlanner.selectedRow.wind, 12);
});

function imageObserver(context) {
  const observers = [];
  context.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.disconnected = true; this.targets.clear(); }
    intersect(target, isIntersecting = true) { this.callback([{ target, isIntersecting }], this); }
  };
  return observers;
}

test('species-image lookups wait for nearby cards and start once while live sorting retains observations', async () => {
  const { context, cards } = fixture(), observers = imageObserver(context), requests = [];
  context.GeoImage.resolveSpeciesImage = async name => { requests.push(name); return 'resolved-species.svg'; };
  const fish = context.FISHES.slice(0, 3); let reverse = false;
  context.GeoFishChance = subject => reverse ? fish.indexOf(subject) : 100 - fish.indexOf(subject);
  context.renderFishResults(fish); const observer = observers[0], firstCard = cards()[0];
  assert.equal(observer.options.rootMargin, '400px 0px'); assert.equal(observer.targets.size, 3); assert.equal(requests.length, 0);
  observer.intersect(firstCard, false); assert.equal(requests.length, 0);
  observer.intersect(firstCard); observer.intersect(firstCard); await Promise.resolve();
  assert.deepEqual(requests, [fish[0][1]]); assert.equal(firstCard.parts.image.src, 'resolved-species.svg');
  reverse = true; context.refreshVisibleFishScores();
  assert.equal(observers.length, 1); assert.equal(observer.disconnected, undefined);
  observer.intersect(cards()[0]); await Promise.resolve();
  assert.deepEqual(requests, [fish[0][1], fish[2][1]]); assert.ok(cards().includes(firstCard));
});

test('filtered result replacement disconnects old observers and ignores detached image responses', async () => {
  const { context, cards } = fixture(), observers = imageObserver(context);
  const resolvers = [], requests = [];
  context.GeoImage.resolveSpeciesImage = name => new Promise(resolve => { requests.push(name); resolvers.push(resolve); });
  context.renderFishResults(context.FISHES.slice(0, 3)); const oldCard = cards()[0];
  observers[0].intersect(oldCard); assert.equal(requests.length, 1);
  context.renderFishResults(context.FISHES.slice(3, 4)); const newCard = cards()[0];
  assert.equal(observers[0].disconnected, true); assert.equal(oldCard.isConnected, false);
  observers[0].intersect(oldCard); assert.equal(requests.length, 1, 'queued old observer events cannot start removed-card requests');
  resolvers[0]('old-species.svg'); await Promise.resolve();
  assert.equal(oldCard.parts.image.src, undefined); assert.equal(newCard.parts.image.src, undefined);
  observers[1].intersect(newCard); resolvers[1]('new-species.svg'); await Promise.resolve();
  assert.equal(newCard.parts.image.src, 'new-species.svg');
});

test('browsers without IntersectionObserver still resolve card images after insertion', async () => {
  const { context, cards } = fixture(), requests = [];
  context.GeoImage.resolveSpeciesImage = async name => { requests.push(name); return 'resolved-species.svg'; };
  context.renderFishResults(context.FISHES.slice(0, 3)); await Promise.resolve();
  assert.equal(requests.length, 3); assert.ok(cards().every(card => card.parts.image.src === 'resolved-species.svg'));
});

test('notification links select the exact known fish and compatible destination, including legacy water links', () => {
  const { context } = fixture(), fish = context.FISHES.find(subject => subject[0] === 'carp');
  const waterIndexes = context.compatibleWaterIndexes(fish), chosen = waterIndexes.at(-1), water = context.WATERS[chosen];
  for (const key of ['place', 'water']) {
    const selected = context.GeoFishingPlanner.selectionFromURL(`?fish=carp&${key}=${encodeURIComponent(water[0])}`);
    assert.equal(selected.fish, fish); assert.equal(selected.waterIndex, chosen);
  }
  const byName = context.GeoFishingPlanner.selectionFromURL(`?fish=carp&place=${encodeURIComponent(water[1])}`);
  assert.equal(byName.waterIndex, chosen);
  const canonical = context.GeoFishingPlanner.selectionFromURL(`?fish=carp&place=${encodeURIComponent(water[0])}&water=${encodeURIComponent(context.WATERS[waterIndexes[0]][0])}`);
  assert.equal(canonical.waterIndex, chosen, 'canonical place takes priority over the old water parameter');
});

test('unknown notification identifiers cannot fabricate a fish or a requested habitat', () => {
  const { context } = fixture();
  const selected = context.GeoFishingPlanner.selectionFromURL('?fish=not-a-species&place=not-a-place');
  assert.equal(selected.fish, null); assert.equal(selected.requestedWaterIndex, -1); assert.equal(selected.waterIndex, 0);
  const carp = context.FISHES.find(subject => subject[0] === 'carp'), indexes = context.compatibleWaterIndexes(carp);
  const incompatible = context.WATERS.findIndex((water, index) => !indexes.includes(index));
  const mismatch = context.GeoFishingPlanner.selectionFromURL(`?fish=carp&place=${encodeURIComponent(context.WATERS[incompatible][0])}`);
  assert.equal(mismatch.fish, carp); assert.equal(mismatch.requestedWaterIndex, incompatible);
  assert.equal(mismatch.waterIndex, indexes[0]); assert.notEqual(mismatch.waterIndex, incompatible);
});

test('a known fish without a confirmed location does not inherit a notification destination', () => {
  const { context } = fixture();
  const fish = context.FISHES.find(subject => context.compatibleWaterIndexes(subject).length === 0);
  assert.ok(fish, 'catalogue includes species whose local habitat is not confirmed');
  const selected = context.GeoFishingPlanner.selectionFromURL(`?fish=${encodeURIComponent(fish[0])}&place=${encodeURIComponent(context.WATERS[0][0])}`);
  assert.equal(selected.fish, fish); assert.equal(selected.waterIndex, -1);
});
