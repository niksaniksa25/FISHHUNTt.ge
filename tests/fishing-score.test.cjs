const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const elements = new Map();
  const context = vm.createContext({
    console, Date, Intl, CustomEvent: class CustomEvent {},
    document: { addEventListener() {}, getElementById(id) { return elements.get(id) || null; } },
  });
  context.window = context;
  for (const name of ['fishing-data.js', 'fishing.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name), 'utf8'), context, { filename: name });
  return { context, elements, score: context.GeoFishChance, fish: context.FISHES.find(f => f[0] === 'catfish'), water: context.WATERS.find(w => String(w[6]).split(',').includes('catfish')) };
}
const conditions = { temperature_2m: 20, pressure_msl: 1015, wind_speed_10m: 6, precipitation: 0, precipitation_probability: 10, weather_code: 1, relative_humidity_2m: 60, local_hour: 0 };

test('absent measurements cannot become zero or fabricated catch scores', () => {
  const { score, fish, water } = fixture();
  for (const key of ['temperature_2m', 'pressure_msl', 'wind_speed_10m', 'precipitation', 'weather_code']) {
    for (const missing of [null, undefined, '', ' ', true, NaN, Infinity]) {
      assert.equal(score(fish, { ...conditions, [key]: missing }, water), null, `${key}: ${String(missing)}`);
    }
  }
  assert.equal(score(fish, {}, water), null);
  assert.equal(score(null, conditions, water), null);
  assert.ok(Number.isInteger(score(fish, { ...conditions, precipitation: 0, wind_speed_10m: 0, weather_code: 0, temperature_2m: 0 }, water)));
});

test('midnight remains midnight for nocturnal fish and clock changes do not alter explicit hours', () => {
  const { score, fish, water, context } = fixture();
  assert.ok(score(fish, conditions, water) > score(fish, { ...conditions, local_hour: 12 }, water));
  assert.equal(context.GeoFishConditions.activityFit('ღამე', 0), 100);
  assert.equal(context.GeoFishConditions.activityFit('ღამე', null), null);
  assert.equal(score(fish, { ...conditions, local_hour: 24 }, water), score(fish, conditions, water));
});

test('air temperature never substitutes for a species water-temperature preference', () => {
  const { score, fish, water } = fixture();
  const cold = [...fish], warm = [...fish];
  cold[7] = '4–12°C'; warm[7] = '22–30°C';
  assert.equal(score(cold, conditions, water), score(warm, conditions, water));
  assert.ok(score(cold, { ...conditions, water_temperature: 8 }, water) > score(warm, { ...conditions, water_temperature: 8 }, water));
  assert.equal(score(cold, { ...conditions, water_temperature: null }, water), score(cold, conditions, water));
});

test('heavy precipitation, extreme wind and thunderstorms cannot improve a fishing assessment', () => {
  const { score, fish, water } = fixture();
  const rains = [0, .2, 1, 3, 6, 12].map(precipitation => score(fish, { ...conditions, precipitation }, water));
  for (let i = 1; i < rains.length; i++) assert.ok(rains[i] <= rains[i - 1]);
  assert.ok(score(fish, { ...conditions, wind_speed_10m: 60 }, water) <= 25);
  for (const weather_code of [95, 96, 99]) assert.ok(score(fish, { ...conditions, weather_code }, water) <= 20);
});

test('unconfirmed and incompatible destinations do not look as suitable as confirmed habitats', () => {
  const { score, fish, water, context } = fixture();
  const unlisted = [...water]; unlisted[6] = 'browntrout';
  assert.ok(score(fish, conditions, water) > score(fish, conditions, unlisted));
  assert.ok(score(fish, conditions, unlisted) <= 40);
  const seaFish = context.FISHES.find(f => f[3] === 'ზღვა');
  assert.ok(score(seaFish, conditions, water) <= 10);
});

test('numeric ASCII ranges and typographic ranges describe the same preference', () => {
  const { score, fish, water } = fixture();
  const ascii = [...fish], typographic = [...fish];
  ascii[8] = '1000-1025 hPa'; typographic[8] = '1000–1025 hPa';
  ascii[9] = '2-12 კმ/სთ'; typographic[9] = '2–12 კმ/სთ';
  assert.equal(score(ascii, conditions, water), score(typographic, conditions, water));
});

test('hourly parsing preserves absent measurements and picks the actual matching best hour', () => {
  const { context, elements } = fixture();
  const date = '2026-10-13';
  const data = { hourly: { time: [`${date}T00:00`, `${date}T12:00`, `${date}T21:00`], temperature_2m: [20, 20, null], pressure_msl: [1015, 1015, 1015], wind_speed_10m: [6, 6, 6], precipitation: [0, 0, 0], weather_code: [1, 1, 1] } };
  context.testForecast = data;
  vm.runInContext("selectedFish=FISHES.find(f=>f[0]==='catfish');selectedWater=WATERS.find(w=>String(w[6]).split(',').includes('catfish'));plannerWeather=testForecast;", context);
  const rows = context.GeoFishingPlanner.rowsForDate(data, date);
  assert.equal(rows[2].temperature, null);
  assert.equal(rows[0].humidity, null);
  assert.equal(rows[0].cloud, null);
  assert.equal(context.GeoFishingPlanner.scoredHours(data, date).length, 2);
  const best = context.GeoFishingPlanner.bestHour(data, date);
  assert.equal(best.r.time, '00:00');
  elements.set('hourSelect', { options: rows.map(r => ({ value: r.time })), value: '' });
  context.chooseBestHourForDate(date);
  assert.equal(context.GeoFishingPlanner.selectedRow.time, best.r.time);
  assert.equal(elements.get('hourSelect').value, best.r.time);
  assert.equal(context.GeoFishChance(context.selectedFish, context.GeoFishingPlanner.conditionFromRow(best.r), context.selectedWater), best.score);
  assert.equal(context.GeoFishingPlanner.bestHour(data, '2026-10-14'), null);
});

test('missing destination coordinates cannot silently request latitude zero', () => {
  const { context } = fixture();
  for (const invalid of [null, undefined, '', ' ']) assert.equal(context.waterHasCoordinates(['unknown', '', '', '', invalid, invalid]), false);
  assert.equal(context.waterHasCoordinates(['equator', '', '', '', 0, 0]), true);
});

test('today recommendations exclude elapsed hours while explicit historical rows remain inspectable', () => {
  const { context } = fixture();
  context.GeoNatureCommon = { zonedDateTime() { return { date: '2026-10-13', hour: 12, time: '12:30' }; } };
  const data = { hourly: { time: ['2026-10-13T00:00','2026-10-13T12:00','2026-10-13T21:00'], temperature_2m:[20,20,20], pressure_msl:[1015,1015,1015], wind_speed_10m:[6,6,6], precipitation:[0,0,0], weather_code:[1,1,1] } };
  vm.runInContext("selectedFish=FISHES.find(f=>f[0]==='catfish');selectedWater=WATERS.find(w=>String(w[6]).split(',').includes('catfish'));", context);
  assert.equal(context.GeoFishingPlanner.rowsForDate(data,'2026-10-13').length,3);
  const recommended = context.GeoFishingPlanner.scoredHours(data,'2026-10-13');
  assert.equal(recommended.length,2);
  assert.ok(recommended.every(item=>item.r.local_hour>=12));
});

function plusFixture(stored, failWrite=false) {
  let value=stored;
  const toast={textContent:'',classList:{add(){},remove(){}}};
  const context=vm.createContext({console,Date,Intl,CustomEvent:class CustomEvent{},setTimeout(){return 1;},clearTimeout(){},
    localStorage:{getItem(){return value;},setItem(key,next){if(failWrite)throw new Error('quota');value=next;}},
    document:{addEventListener(){},dispatchEvent(){},getElementById(id){return id==='gnToast'?toast:null;}},
  });
  context.window=context;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/geonature-plus.js'),'utf8'),context);
  return {context,toast};
}

test('corrupt optional local state cannot crash fishing tools or reuse mutable default arrays', () => {
  const { context }=plusFixture(JSON.stringify({catches:null,plans:'bad',favorites:[null,'კობრი'],badges:42,photoIds:[null],xp:'oops',checklists:[]}));
  const first=context.GeoNaturePlus.state();
  assert.equal(first.xp,0);assert.equal(first.catches.length,0);assert.equal(first.plans.length,0);assert.equal(first.badges.length,0);assert.equal(first.favorites.length,1);
  first.catches.push({fish:'test'});
  assert.equal(context.GeoNaturePlus.state().catches.length,0);
});

test('catch entry accepts a real record once and rejects invalid weight or failed persistence', () => {
  const { context }=plusFixture('{}');
  assert.equal(context.GeoNaturePlus.recordCatch('კობრი','ტბა',-2,'2026-10-13',''),false);
  assert.equal(context.GeoNaturePlus.recordCatch('','ტბა',1,'2026-10-13',''),false);
  assert.equal(context.GeoNaturePlus.state().catches.length,0);
  assert.equal(context.GeoNaturePlus.recordCatch('კობრი','ტბა',1.25,'2026-10-13',''),true);
  assert.equal(context.GeoNaturePlus.state().catches.length,1);
  assert.equal(context.GeoNaturePlus.state().xp,50);
  const failed=plusFixture('{}',true);
  assert.equal(failed.context.GeoNaturePlus.recordCatch('კობრი','ტბა',1,'2026-10-13',''),false);
  assert.equal(failed.context.GeoNaturePlus.state().catches.length,0);
  assert.match(failed.toast.textContent,/ვერ შეინახა/);
});

test('typical wildlife activity uses Georgia dates, preserves explicit midnight and supports multiple seasons', () => {
  const { context }=fixture();
  context.GeoNatureCommon={zonedDateTime(){return {date:'2026-10-13',hour:0};}};
  const animal=['mammal','ღამის ცხოველი','', '', '', 'ტყე','საქართველო','გაზაფხული • შემოდგომა','ღამე'];
  const score=context.GeoWildlifeChance;
  assert.equal(score(null),null);
  assert.equal(score(animal,{date:'2026-02-29'}),null);
  assert.equal(score(animal,{date:''}),null);
  assert.equal(score(animal,{local_hour:24}),null);
  assert.equal(score(animal),score(animal,{date:'2026-10-13',local_hour:0}));
  assert.equal(score(animal,{date:'2026-10-13',local_hour:0}),score(animal,{date:'2026-04-13',local_hour:0}));
  assert.ok(score(animal,{date:'2026-10-13',local_hour:0})>score(animal,{date:'2026-10-13',local_hour:12}));
  assert.ok(score(animal,{date:'2026-10-13',local_hour:0})>score(animal,{date:'2026-07-13',local_hour:0}));
  assert.ok(Number.isInteger(score(animal,{date:'2026-10-13',local_hour:null})));
  const unknown=['mammal','უცნობი','', '', '', '', '', '', ''];
  assert.equal(score(unknown),null);
});

test('a late species image response cannot replace the newly selected fish photo', async () => {
  const { context, elements }=fixture();
  const requests=[];
  context.GeoImage={resolveSpeciesImage(){return new Promise(resolve=>requests.push(resolve));},placeholder(){return 'placeholder';}};
  elements.set('fishProfile',{set innerHTML(value){const old=elements.get('profileFishImage');if(old)old.isConnected=false;elements.set('profileFishImage',{isConnected:true});}});
  vm.runInContext('selectedFish=FISHES[0];selectedWater=WATERS[0];renderFishProfileShell();',context);
  const oldImage=elements.get('profileFishImage');
  vm.runInContext('selectedFish=FISHES[1];renderFishProfileShell();',context);
  const newImage=elements.get('profileFishImage');
  requests[1]('second-fish.jpg');await Promise.resolve();await Promise.resolve();
  assert.equal(newImage.src,'second-fish.jpg');
  requests[0]('first-fish.jpg');await Promise.resolve();await Promise.resolve();
  assert.equal(newImage.src,'second-fish.jpg');
  assert.equal(oldImage.src,undefined);
});
