'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const hazards = require('../js/weather-hazards.js');
const NOW = Date.parse('2026-10-25T10:15:00Z'), HOUR = 3600000, LAT = 41.7151, LON = 44.8271;
const local = (time, offset) => new Date(time + offset * 1000).toISOString().slice(0, 16);
function fixture(now = NOW, offset = 14400) {
  const first = Math.floor((now + offset * 1000) / HOUR) * HOUR + HOUR - offset * 1000;
  const time = Array.from({ length: 6 }, (_, i) => local(first + i * HOUR, offset));
  const units = { wind_speed_10m: 'km/h', wind_gusts_10m: 'km/h', precipitation: 'mm' };
  return { timezone: offset === 14400 ? 'Asia/Tbilisi' : 'UTC', utc_offset_seconds: offset,
    current: { time: local(now, offset), interval: 900, wind_speed_10m: 10, wind_gusts_10m: 15, weather_code: 1, precipitation: 0 },
    current_units: { ...units }, hourly_units: { ...units },
    hourly: { time, wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 15), weather_code: time.map(() => 1), precipitation: time.map(() => 0), precipitation_probability: time.map(() => 20) },
    __meta: { source: 'Open-Meteo', stale: false, updatedAt: now, fetchedAt: now, currentTime: now, requestedLatitude: LAT, requestedLongitude: LON }
  };
}
function evaluate(data, now = NOW, change = {}) { return hazards.evaluate(data, { lat: LAT, lon: LON, now, ...change }); }
function alert(data, kind) { return evaluate(data).hazards.find(item => item.kind === kind); }

test('complete fresh calm forecast reports model coverage without inventing a danger or safe guarantee', () => {
  const data = fixture(), before = JSON.stringify(data), result = evaluate(data);
  assert.equal(result.status, 'live'); assert.equal(result.coverage.current, true); assert.equal(result.coverage.forecast, 6);
  assert.equal(result.coverage.complete, true); assert.deepEqual(result.coverage.missing, []); assert.deepEqual(result.hazards, []);
  assert.equal(result.sourceTime, new Date(NOW).toISOString()); assert.equal(result.window.to, '2026-10-25T16:00:00.000Z');
  assert.equal(result.safe, undefined); assert.equal(JSON.stringify(data), before);
});
test('null, blank and boolean measurements remain missing while actual zero is a valid calm value', () => {
  for (const missing of [null, undefined, '', ' ', false, true]) {
    const data = fixture(); data.current.wind_speed_10m = missing;
    const result = evaluate(data); assert.equal(result.status, 'partial'); assert.ok(result.coverage.missing.includes('current:wind')); assert.deepEqual(result.hazards, []);
  }
  const data = fixture(); Object.assign(data.current, { wind_speed_10m: 0, wind_gusts_10m: 0, precipitation: 0, weather_code: 0 });
  assert.equal(evaluate(data).status, 'live'); assert.deepEqual(evaluate(data).hazards, []);
});
test('sustained wind warning and danger thresholds respect the exact numeric boundary', () => {
  for (const [value, expected] of [[34.9, null], [35, 'warning'], [49.9, 'warning'], [50, 'danger']]) {
    const data = fixture(); data.current.wind_speed_10m = value;
    assert.equal(alert(data, 'wind')?.severity || null, expected);
  }
});
test('gust thresholds do not copy the sustained-wind threshold', () => {
  for (const [value, expected] of [[49.9, null], [50, 'warning'], [69.9, 'warning'], [70, 'danger']]) {
    const data = fixture(); data.current.wind_gusts_10m = value;
    const found = alert(data, 'wind'); assert.equal(found?.severity || null, expected); if (found) assert.equal(found.metric, 'gust');
  }
});
test('a wind warning selects one strongest sample and retains whether the hazard is already current', () => {
  const data = fixture(); data.current.wind_speed_10m = 40; data.hourly.wind_gusts_10m[2] = 80;
  const result = evaluate(data), found = result.hazards.find(item => item.kind === 'wind');
  assert.equal(result.hazards.length, 1); assert.equal(found.severity, 'danger'); assert.equal(found.value, 80); assert.equal(found.metric, 'gust');
  assert.equal(found.scope, 'forecast'); assert.equal(found.current, true); assert.equal(found.forecast, true); assert.equal(found.startsAt, result.sourceTime);
  assert.equal(found.localTime, data.hourly.time[2]); assert.equal(found.at, '2026-10-25T13:00:00.000Z');
});
test('thunderstorm WMO codes are dangerous without turning an unrelated code into a storm', () => {
  for (const code of [95, 96, 99]) {
    const data = fixture(); data.current.weather_code = code;
    const found = alert(data, 'thunderstorm'); assert.equal(found.severity, 'danger'); assert.equal(found.metric, 'code'); assert.equal(found.value, code); assert.equal(found.unit, 'WMO');
  }
  const data = fixture(); data.current.weather_code = 3; assert.equal(alert(data, 'thunderstorm'), undefined);
});
test('current precipitation uses the declared aggregation interval before applying hourly-rate thresholds', () => {
  for (const [amount, expected, rate] of [[1.24, null, null], [1.25, 'warning', 5], [2.5, 'danger', 10]]) {
    const data = fixture(); data.current.precipitation = amount;
    const found = alert(data, 'rain'); assert.equal(found?.severity || null, expected); if (found) { assert.equal(found.value, rate); assert.equal(found.unit, 'მმ/სთ'); }
  }
});
test('unknown current precipitation intervals cannot turn an accumulated amount into a made-up hourly intensity', () => {
  for (const interval of [undefined, null, 0, 1, -900, 900.5, false, '']) {
    const data = fixture(); data.current.interval = interval; data.current.precipitation = 20;
    const result = evaluate(data); assert.equal(result.status, 'partial'); assert.ok(result.coverage.missing.includes('current:precip')); assert.equal(alert(data, 'rain'), undefined);
  }
});
test('a heavy-precipitation WMO condition can be disclosed without inventing a measured mm/hour number', () => {
  const data = fixture(); delete data.current.interval; data.current.weather_code = 65;
  const found = alert(data, 'rain'); assert.equal(found.metric, 'code'); assert.equal(found.value, 65); assert.equal(found.unit, 'WMO'); assert.equal(found.threshold, null);
  assert.doesNotMatch(found.message, /მმ\/სთ/); assert.equal(evaluate(data).status, 'partial');
});
test('hourly precipitation warning uses the preceding single-hour amount, not six-hour totals or probability', () => {
  const data = fixture(); data.hourly.precipitation = [2, 2, 2, 2, 2, 2]; data.hourly.precipitation_probability.fill(100);
  assert.equal(alert(data, 'rain'), undefined);
  data.hourly.precipitation[3] = 5; assert.equal(alert(data, 'rain').severity, 'warning');
  data.hourly.precipitation[3] = 10; assert.equal(alert(data, 'rain').severity, 'danger'); assert.equal(alert(data, 'rain').localTime, data.hourly.time[3]);
});
test('rain probability alone cannot generate a heavy-rain alert', () => {
  const data = fixture(); data.current.precipitation_probability = 100; data.hourly.precipitation_probability.fill(100);
  assert.deepEqual(evaluate(data).hazards, []);
});
test('past hours, the current endpoint and far-future selected forecasts cannot become imminent warnings', () => {
  const now = Date.parse('2026-10-25T10:00:00Z'), data = fixture(now);
  data.hourly.time.unshift(local(now, data.utc_offset_seconds));
  for (const key of ['wind_speed_10m', 'wind_gusts_10m', 'precipitation', 'precipitation_probability', 'weather_code']) data.hourly[key].unshift(key === 'weather_code' ? 99 : 100);
  data.hourly.time.push('2026-10-26T20:00');
  for (const key of ['wind_speed_10m', 'wind_gusts_10m', 'precipitation', 'precipitation_probability', 'weather_code']) data.hourly[key].push(key === 'weather_code' ? 99 : 100);
  data.selectedISO = '2026-10-26T20:00';
  const result = evaluate(data, now); assert.equal(result.status, 'live'); assert.deepEqual(result.hazards, []); assert.equal(result.coverage.forecast, 6);
});
test('missing hourly rows and fields produce partial coverage while retaining a genuine available hazard', () => {
  const data = fixture(); data.hourly.wind_speed_10m[0] = 50; data.hourly.wind_gusts_10m[1] = null; data.hourly.time.pop();
  const result = evaluate(data); assert.equal(result.status, 'partial'); assert.equal(result.coverage.forecast, 4); assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.missing.some(key => key.endsWith(':gust'))); assert.ok(result.coverage.missing.some(key => key.endsWith(':missing'))); assert.equal(result.hazards[0].value, 50);
});
test('duplicate forecast endpoints are ambiguous and neither version is used to send a warning', () => {
  const data = fixture(); data.hourly.time.push(data.hourly.time[0]);
  for (const key of ['wind_speed_10m', 'wind_gusts_10m', 'precipitation', 'weather_code']) data.hourly[key].push(key === 'weather_code' ? 99 : 100);
  const result = evaluate(data); assert.equal(result.status, 'partial'); assert.equal(result.coverage.forecast, 5); assert.deepEqual(result.hazards, []); assert.ok(result.coverage.missing.some(key => key.endsWith(':duplicate')));
});
test('the next-six-hour window crosses local midnight without selecting the prior day', () => {
  const now = Date.parse('2026-10-25T19:15:00Z'), data = fixture(now); data.hourly.wind_speed_10m[0] = 50;
  const result = evaluate(data, now); assert.equal(result.status, 'live'); assert.equal(result.hazards[0].localTime, '2026-10-26T00:00');
  assert.equal(result.hazards[0].at, '2026-10-25T20:00:00.000Z'); assert.equal(result.window.to, '2026-10-26T01:00:00.000Z');
});
test('negative offsets and quarter-hour offsets use the declared local clock for endpoint selection', () => {
  for (const offset of [-7 * 3600, 0, 20700]) {
    const data = fixture(NOW, offset); data.hourly.wind_speed_10m[0] = 50;
    const result = evaluate(data); assert.equal(result.status, 'live'); assert.equal(result.hazards[0].localTime, data.hourly.time[0]);
    assert.equal(Date.parse(result.hazards[0].at), Date.parse(data.hourly.time[0] + 'Z') - offset * 1000);
  }
});
test('stale fetches, stale observations and explicit cached fallback never issue hazard alerts', () => {
  for (const change of [data => { data.__meta.updatedAt = NOW - hazards.MAX_FETCH_AGE - 1; }, data => { data.current.time = local(NOW - hazards.MAX_CURRENT_AGE - 60000, 14400); data.__meta.currentTime = Date.parse(data.current.time + 'Z') - 14400000; }, data => { data.__meta.stale = true; }]) {
    const data = fixture(); data.current.wind_speed_10m = 100; change(data);
    const result = evaluate(data); assert.equal(result.status, 'stale'); assert.deepEqual(result.hazards, []);
  }
});
test('freshness boundaries are inclusive and future or inconsistent source clocks fail closed', () => {
  const exact = fixture(); exact.__meta.updatedAt = NOW - hazards.MAX_FETCH_AGE; assert.equal(evaluate(exact).status, 'live');
  for (const change of [data => { data.__meta.updatedAt = NOW + 60001; }, data => { data.current.time = local(NOW + 6 * 60000, 14400); data.__meta.currentTime = NOW + 6 * 60000; }, data => { data.__meta.currentTime += 1001; }, data => { delete data.__meta.stale; }, data => { delete data.__meta.updatedAt; delete data.__meta.fetchedAt; }]) {
    const data = fixture(); data.current.wind_speed_10m = 100; change(data); const result = evaluate(data); assert.equal(result.status, 'unavailable'); assert.deepEqual(result.hazards, []);
  }
});
test('alerts require exact verified requested coordinates rather than rounded model-grid coordinates', () => {
  for (const change of [data => { delete data.__meta.requestedLatitude; }, data => { data.__meta.requestedLongitude += 0.001; }, data => { data.__meta.requestedLatitude = null; }]) {
    const data = fixture(); data.current.wind_speed_10m = 100; change(data); assert.equal(evaluate(data).status, 'unavailable'); assert.deepEqual(evaluate(data).hazards, []);
  }
  const data = fixture(); data.latitude = 41.75; data.longitude = 44.75;
  assert.equal(evaluate(data, NOW, { lat: String(LAT), lon: String(LON) }).status, 'live');
  assert.equal(evaluate(data, NOW, { lat: true }).reason, 'location_unavailable');
});
test('unsupported declared wind, gust or precipitation units never use guessed conversion factors', () => {
  for (const [group, metric, unit] of [['current_units', 'wind_speed_10m', 'm/s'], ['hourly_units', 'wind_gusts_10m', 'mph'], ['hourly_units', 'precipitation', 'inch']]) {
    const data = fixture(); data.current.wind_speed_10m = 100; data[group][metric] = unit;
    const result = evaluate(data); assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'unsupported_units'); assert.deepEqual(result.hazards, []);
  }
});
test('malformed source dates, impossible offsets and invalid timezones cannot generate weather claims', () => {
  for (const change of [data => { data.current.time = '2026-02-31T12:00'; }, data => { data.current.time = '2026-10-25T24:00'; }, data => { data.utc_offset_seconds = null; }, data => { data.utc_offset_seconds = 90000; }, data => { data.utc_offset_seconds = 1.5; }, data => { data.timezone = 'not/a-zone'; }]) {
    const data = fixture(); data.current.wind_speed_10m = 100; change(data); assert.equal(evaluate(data).status, 'unavailable'); assert.deepEqual(evaluate(data).hazards, []);
  }
});
test('impossible measurements and unsupported WMO codes stay unknown', () => {
  const data = fixture(); Object.assign(data.current, { wind_speed_10m: -5, wind_gusts_10m: 1000, precipitation: -10, weather_code: 999 });
  const result = evaluate(data); assert.equal(result.status, 'partial'); assert.equal(result.coverage.current, false); assert.deepEqual(result.hazards, []);
  assert.equal(result.coverage.missing.filter(key => key.startsWith('current:')).length, 4);
});
test('known upcoming danger survives missing current measurements with explicitly partial coverage', () => {
  const data = fixture(); Object.assign(data.current, { wind_speed_10m: null, wind_gusts_10m: null, precipitation: null, weather_code: null }); data.hourly.weather_code[2] = 99;
  const result = evaluate(data); assert.equal(result.status, 'partial'); assert.equal(result.hazards[0].kind, 'thunderstorm'); assert.equal(result.hazards[0].scope, 'forecast');
});
test('missing inputs and invalid evaluation clocks return a serializable unavailable snapshot', () => {
  for (const data of [null, undefined, {}, [], true]) { const result = evaluate(data); assert.equal(result.status, 'unavailable'); assert.doesNotThrow(() => JSON.stringify(result)); }
  for (const now of [null, false, NaN, Infinity, -1, '']) assert.equal(evaluate(fixture(), now).status, 'unavailable');
});
