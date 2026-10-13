const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const fields = ['Feed','Pressure','PressureChange','Wind','WindDirection','Gust','Temp','Apparent','Rain','RainProb','Cloud','Humidity','Visibility','Daylight','Sunrise','Sunset','Moon','WaterTemp','WaterLevel','Kp'];
const unknown = 'მონაცემი არ არის';
function environment() {
  const elements = new Map();
  for (const field of fields) for (const suffix of ['', 'Bar', field === 'Moon' ? 'Label' : 'Detail']) {
    const id = 'factor' + field + suffix;
    elements.set(id, { id, textContent: '', innerHTML: '', style: {}, dataset: {}, setAttribute() {}, querySelector() { return null; } });
  }
  for (const id of ['assessmentFactors','factorFeedLabel','factorModelExplanation','factorLocation','factorHour','factorMode','factorUpdated','factorSource','factorWeather','assessmentLiveState']) elements.set(id, { textContent: '', innerHTML: '', style: {}, dataset: {}, querySelector() { return null; } });
  const document = { getElementById: id => elements.get(id) || null, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ document, Date, Intl, URL, URLSearchParams, console, AbortController, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, CustomEvent: class {}, fetch: async () => { throw new Error('offline'); } });
  context.window = context; context.addEventListener = () => {}; context.dispatchEvent = () => {};
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  load('js/common.js'); load('js/fishing-data.js'); load('js/live-factors.js');
  return { context, elements, value: key => elements.get('factor' + key).textContent, detail: key => elements.get('factor' + (key === 'Moon' ? 'MoonLabel' : key + 'Detail')).textContent };
}
function fixture() {
  return {
    timezone: 'Asia/Tbilisi', utc_offset_seconds: 14400,
    current: { time: '2026-10-13T08:15', interval: 900, temperature_2m: 18, apparent_temperature: 16, pressure_msl: 1012, wind_speed_10m: 4, wind_gusts_10m: 7, wind_direction_10m: 270, precipitation: 1.2, relative_humidity_2m: 60, cloud_cover: 25, weather_code: 61, is_day: 1 },
    hourly: {
      time: ['2026-10-13T07:00','2026-10-13T08:00','2026-10-13T09:00'],
      temperature_2m: [17,18,19], apparent_temperature: [15,16,17], pressure_msl: [1014,1013,1011], wind_speed_10m: [3,4,5], wind_gusts_10m: [6,7,8], wind_direction_10m: [260,270,280], precipitation: [0,2,3], precipitation_probability: [20,70,80], relative_humidity_2m: [65,60,55], cloud_cover: [10,25,40], weather_code: [0,61,63], is_day: [0,1,1], visibility: [12000,10000,8000]
    },
    daily: { time: ['2026-10-13'], sunrise: ['2026-10-13T07:08'], sunset: ['2026-10-13T18:22'] },
    __meta: { updatedAt: Date.parse('2026-10-13T04:16:00Z'), source: 'Open-Meteo', stale: false }
  };
}
function snapshot(env, data = fixture(), type = 'weather') { return { data, row: env.context.GeoNatureCommon.currentWeatherRow(data), type, locationName: 'თბილისი' }; }

test('assessment shows precipitation amount and probability separately with precise current and forecast periods', () => {
  const env = environment(), state = snapshot(env);
  env.context.GNLiveFactors.render(state);
  assert.equal(env.value('Rain'), '1.2 მმ'); assert.equal(env.value('RainProb'), '70%');
  assert.match(env.detail('Rain'), /წინა 15 წუთის ჯამი/); assert.match(env.detail('RainProb'), /საათობრივი პროგნოზი/);
  state.row = env.context.GeoNatureCommon.weatherRowAt(state.data, state.data.hourly.time[1]); env.context.GNLiveFactors.render(state);
  assert.equal(env.value('Rain'), '2.0 მმ'); assert.match(env.detail('Rain'), /წინა 1 საათის ჯამი/);
  assert.match(env.elements.get('assessmentLiveState').textContent, /პროგნოზი/);
});

test('current quarter-hour pressure trend compares two consecutive forecast hours and identifies the period', () => {
  const env = environment(), state = snapshot(env); env.context.GNLiveFactors.render(state);
  assert.equal(env.value('Pressure'), '1012.0 hPa'); assert.equal(env.value('PressureChange'), '↓ -1.0 hPa');
  assert.match(env.detail('PressureChange'), /პროგნოზული ცვლილება.*07:00 → 08:00/);
  state.data.hourly.pressure_msl[0] = null; env.context.GNLiveFactors.render(state);
  assert.equal(env.value('PressureChange'), unknown); assert.match(env.detail('PressureChange'), /ორი საათის წნევა არ არის/);
});

test('pressure trend rejects a gap in the forecast instead of calling it a one-hour change', () => {
  const env = environment(), data = fixture(); data.hourly.time[0] = '2026-10-13T06:00';
  assert.equal(env.context.GNLiveFactors.pressureTrend(data, env.context.GeoNatureCommon.currentWeatherRow(data)), null);
});

test('apparent temperature, daylight, wind direction and astronomy use the selected location time', () => {
  const env = environment(); env.context.GNLiveFactors.render(snapshot(env));
  assert.equal(env.value('Apparent'), '16.0°C'); assert.equal(env.value('Daylight'), 'დღე'); assert.equal(env.value('WindDirection'), '270°');
  assert.equal(env.value('Sunrise'), '07:08'); assert.equal(env.value('Sunset'), '18:22');
  assert.match(env.elements.get('factorHour').textContent, /2026-10-13.*08:15.*Asia\/Tbilisi/);
  assert.match(env.detail('Moon'), /მიახლოებითი ასტრონომიული გამოთვლა/);
  assert.equal(env.context.GNLiveFactors.forecastInstant(fixture(), '2026-10-13T08:15'), Date.parse('2026-10-13T08:15:00+04:00'));
});

test('missing apparent temperature and unmeasured water fields remain unknown with a visible reason', () => {
  const env = environment(), data = fixture(); delete data.current.apparent_temperature; delete data.hourly.apparent_temperature;
  env.context.GNLiveFactors.render(snapshot(env, data));
  assert.equal(env.value('Apparent'), unknown); assert.match(env.detail('Apparent'), /წყარო.*ველს არ აბრუნებს/);
  for (const key of ['WaterTemp','WaterLevel']) { assert.equal(env.value(key), unknown); assert.match(env.detail(key), /ადგილზე გაზომვა საჭიროა/); }
});

test('known zero values remain zero and missing probabilities do not hide measured rain', () => {
  const env = environment(), data = fixture(); data.current.precipitation = 0; data.current.cloud_cover = 0; data.hourly.precipitation_probability[1] = null;
  env.context.GNLiveFactors.render(snapshot(env, data));
  assert.equal(env.value('Rain'), '0.0 მმ'); assert.equal(env.value('Cloud'), '0%'); assert.equal(env.value('RainProb'), unknown);
  assert.doesNotMatch([...env.elements.values()].map(el => el.textContent + el.innerHTML).join(' '), /NaN|undefined|Infinity/);
});

test('weather-only assessment displays its canonical outdoor index rather than a species placeholder', () => {
  const env = environment(), state = snapshot(env); env.context.GNLiveFactors.render(state);
  const expected = env.context.GeoNatureCommon.outdoorScore(env.context.GeoNatureCommon.conditionsFromRow(state.row));
  assert.equal(env.value('Feed'), expected + '/100'); assert.equal(env.elements.get('factorFeedLabel').textContent, 'გარე პირობების ინდექსი');
});

test('fishing explanation shows the same score, real component weights and missing water temperature as the canonical model', () => {
  const env = environment(), state = snapshot(env, fixture(), 'fishing');
  state.subject = env.context.FISHES.find(f => f[0] === 'carp'); state.water = env.context.WATERS.find(w => String(w[6]).split(',').includes('carp'));
  env.context.activityWindowScore = (f, hour) => env.context.GeoFishConditions.activityFit(f[10], hour);
  env.context.GNLiveFactors.render(state);
  const expected = env.context.GeoFishChance(state.subject, env.context.GeoNatureCommon.conditionsFromRow(state.row), state.water, true);
  const html = env.elements.get('factorModelExplanation').innerHTML;
  assert.match(html, new RegExp('<b>' + expected + '/100</b>'));
  assert.match(html, /წონა [0-9.]+%/); assert.match(html, /წყლის ტემპერატურა არ იზომება/);
  assert.match(html, /მთვარე, Kp, ხილვადობა და წყლის დონე.*არ გამოიყენება/);
  assert.match(env.detail('Feed'), /მხოლოდ საათობრივი რეჟიმი/);
});

test('failed location clears all fields and a pending NOAA response cannot restore stale context', async () => {
  const env = environment(); let resolve; env.context.fetch = () => new Promise(done => { resolve = done; });
  env.context.GNLiveFactors.render(snapshot(env));
  env.context.GNLiveFactors.render({ data: null, row: null, error: true, locationName: 'ქუთაისი' });
  resolve({ ok: true, json: async () => [[new Date().toISOString(), 2]] }); await new Promise(done => setImmediate(done));
  for (const key of fields) assert.equal(env.value(key), unknown, key);
  assert.equal(env.elements.get('factorLocation').textContent, 'ქუთაისი');
  assert.equal(env.elements.get('factorMoonBar').style.width, '0%'); assert.equal(env.elements.get('factorKpBar').style.width, '0%');
});

test('all five assessment pages include every field and readable model and scale explanations', () => {
  for (const name of ['index.html','weather.html','fishing.html','hunting.html','place-details.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const field of fields) assert.equal((html.match(new RegExp('id="factor' + field + '"', 'g')) || []).length, 1, name + ':' + field);
    assert.match(html, /id="factorModelExplanation"/); assert.match(html, /id="factorMode"/); assert.match(html, /ბარები აჩვენებს მონაცემის შკალას/);
  }
});
