const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
let fixture, child, dataDir, base;
const requests = [];
const states = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function weather(latitude, longitude, offset = 0) {
  const now = new Date(Date.now() + offset * 1000);
  now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 15) * 15, 0, 0);
  const currentTime = now.toISOString().slice(0, 16);
  const hour = currentTime.slice(0, 13) + ':00';
  const day = currentTime.slice(0, 10);
  const current = {
    time: currentTime, interval: 900, temperature_2m: 17, apparent_temperature: 16,
    relative_humidity_2m: 68, precipitation: 0.1, rain: 0.1, showers: 0, snowfall: 0,
    weather_code: 2, cloud_cover: 35, is_day: 1, pressure_msl: 1014, surface_pressure: 985,
    wind_speed_10m: 12, wind_direction_10m: 180, wind_gusts_10m: 20,
  };
  const hourly = { time: [hour] };
  for (const key of ['temperature_2m', 'apparent_temperature', 'is_day', 'relative_humidity_2m', 'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl', 'surface_pressure', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m']) hourly[key] = [current[key]];
  hourly.precipitation_probability = [20];
  hourly.visibility = [10000];
  return {
    latitude, longitude, utc_offset_seconds: offset, timezone: offset ? 'Asia/Tbilisi' : 'GMT', timezone_abbreviation: offset ? 'GET' : 'GMT',
    current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h', precipitation: 'mm', pressure_msl: 'hPa' },
    current, hourly,
    daily: {
      time: [day], weather_code: [2], temperature_2m_max: [21], temperature_2m_min: [11],
      precipitation_probability_max: [20], precipitation_sum: [0.1], wind_speed_10m_max: [20],
      sunrise: [day + 'T06:00'], sunset: [day + 'T18:00'], uv_index_max: [3],
    },
  };
}

async function request(query, expected = 200) {
  const response = await fetch(base + '/api/weather?' + query, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, expected, query);
  return { response, value: await response.json() };
}

before(async () => {
  fixture = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const latitude = Number(url.searchParams.get('latitude'));
    const longitude = Number(url.searchParams.get('longitude'));
    requests.push({ latitude, longitude, query: url.searchParams, at: Date.now() });
    const mode = states.get(latitude) || 'valid';
    if (mode === 'delay') await pause(800);
    else if (mode === 'slow-valid') await pause(70);
    if (res.destroyed) return;
    if (mode === 'fail' || mode === 'delay') { res.writeHead(503).end('unavailable'); return; }
    if (mode === 'invalid-json') { res.end('invalid fixture JSON'); return; }
    const body = weather(latitude, longitude, mode === 'georgia-timezone' ? 14400 : 0);
    if (mode === 'malformed') body.hourly.temperature_2m = [];
    if (mode === 'invalid-units') body.current_units.wind_speed_10m = 'mp/h';
    if (mode === 'null-current') body.current.temperature_2m = null;
    if (mode === 'outdated') body.current.time = '2020-01-01T00:00';
    if (mode === 'wrong-location') body.latitude += 3;
    if (mode === 'invalid-percentages') body.hourly.precipitation_probability = [120];
    if ((mode === 'fallback' && url.searchParams.get('models') !== 'gfs_seamless') || (mode === 'ecmwf-only' && url.searchParams.get('models') !== 'ecmwf_ifs04')) { res.writeHead(503).end(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geonature-weather-test-'));
  child = spawn(process.execPath, ['server.js'], {
    cwd: repo,
    env: {
      ...process.env, HOST: '127.0.0.1', PORT: '0', GEONATURE_DATA_DIR: dataDir, GN_FRONTEND_ORIGIN: 'https://niksaniksa25.github.io',
      GEONATURE_WEATHER_API_URL: `http://127.0.0.1:${fixture.address().port}/forecast`,
      GEONATURE_WEATHER_CACHE_TTL_MS: '500', GEONATURE_WEATHER_STALE_TTL_MS: '1500',
      GEONATURE_WEATHER_REQUEST_TIMEOUT_MS: '400', GEONATURE_WEATHER_ATTEMPT_TIMEOUT_MS: '150',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Weather test server did not start')), 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  if (fixture) await new Promise(resolve => { fixture.close(resolve); fixture.closeAllConnections(); });
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
});

test('missing, blank, non-numeric and out-of-range coordinates never reach the provider', async () => {
  const count = requests.length;
  for (const query of ['', 'latitude=41', 'latitude=&longitude=44', 'latitude=41&longitude=%20', 'latitude=nope&longitude=44', 'latitude=91&longitude=44', 'latitude=41&longitude=-181']) {
    const { value } = await request(query, 400);
    assert.equal(value.ok, false);
  }
  assert.equal(requests.length, count);
});

test('weather units and location metadata are explicit and fresh cache hits stay location-specific', async () => {
  const first = await request('latitude=41.1234&longitude=44.5678');
  assert.equal(first.response.headers.get('cache-control'), 'no-store');
  assert.equal(first.value.ok, true);
  assert.equal(first.value.meta.stale, false);
  assert.equal(first.value.meta.requestedLatitude, 41.1234);
  assert.equal(first.value.meta.requestedLongitude, 44.5678);
  assert.equal(first.value.meta.timezone, 'GMT');
  assert.equal(first.value.meta.updatedAt, first.value.meta.fetchedAt);
  assert.ok(first.value.meta.ageMs >= 0);
  assert.ok(Number.isFinite(first.value.meta.currentTime));
  const provider = requests.at(-1);
  assert.equal(provider.query.get('temperature_unit'), 'celsius');
  assert.equal(provider.query.get('wind_speed_unit'), 'kmh');
  assert.equal(provider.query.get('precipitation_unit'), 'mm');
  assert.ok(provider.query.get('current').split(',').includes('is_day'));
  assert.ok(provider.query.get('hourly').split(',').includes('is_day'));
  assert.ok(provider.query.get('hourly').split(',').includes('apparent_temperature'));
  const count = requests.length;
  const cached = await request('latitude=41.1234&longitude=44.5678');
  assert.equal(requests.length, count);
  assert.equal(cached.value.meta.fetchedAt, first.value.meta.fetchedAt);
  const other = await request('latitude=41.1235&longitude=44.5678');
  assert.equal(requests.length, count + 1);
  assert.equal(other.value.data.latitude, 41.1235);
});

test('concurrent reads share one provider request and freshness starts at completed download', async () => {
  states.set(42, 'slow-valid');
  const count = requests.length;
  const results = await Promise.all(Array.from({ length: 8 }, () => request('latitude=42&longitude=44')));
  assert.equal(requests.length, count + 1);
  assert.ok(results.every(result => result.value.meta.fetchedAt === results[0].value.meta.fetchedAt));
  assert.ok(results[0].value.meta.fetchedAt - requests.at(-1).at >= 50);
});

test('a provider failure uses only a bounded, explicitly stale result for the same location', async () => {
  const query = 'latitude=43&longitude=44';
  const first = await request(query);
  states.set(43, 'fail');
  await pause(530);
  const stale = await request(query);
  assert.equal(stale.value.meta.stale, true);
  assert.equal(stale.value.meta.fetchedAt, first.value.meta.fetchedAt);
  assert.ok(stale.value.meta.ageMs >= 500);
  assert.equal(stale.response.headers.get('cache-control'), 'no-store');
  await pause(1000);
  const expired = await request(query, 503);
  assert.equal(expired.value.ok, false);
  await request('latitude=43&longitude=45', 503);
});

test('malformed JSON, broken arrays, null current values, wrong units and old observations are rejected', async () => {
  let latitude = 44;
  for (const mode of ['invalid-json', 'malformed', 'null-current', 'invalid-units', 'outdated']) {
    states.set(latitude, mode);
    const result = await request(`latitude=${latitude}&longitude=44`, 503);
    assert.equal(result.value.ok, false, mode);
    latitude += 1;
  }
});

test('a failed preferred model can recover with a validated alternative model', async () => {
  states.set(49, 'fallback');
  const result = await request('latitude=49&longitude=44');
  assert.equal(result.value.meta.source, 'Open-Meteo • gfs_seamless');
  assert.equal(result.value.meta.stale, false);
});

test('slow upstream requests finish within the total budget and do not poison subsequent requests', async () => {
  states.set(50, 'delay');
  const started = Date.now();
  const result = await request('latitude=50&longitude=44', 503);
  assert.equal(result.value.ok, false);
  assert.ok(Date.now() - started < 900, 'total timeout must bound all model attempts');
  states.set(50, 'valid');
  const recovered = await request('latitude=50&longitude=44');
  assert.equal(recovered.value.meta.stale, false);
});


test('manual refresh bypasses fresh cache while concurrent refreshes still share one request', async () => {
  const query = 'latitude=51&longitude=44';
  const first = await request(query);
  states.set(51, 'slow-valid');
  const count = requests.length;
  const fresh = await Promise.all([request(query + '&refresh=1'), request(query + '&refresh=1')]);
  assert.equal(requests.length, count + 1);
  assert.ok(fresh[0].value.meta.fetchedAt > first.value.meta.fetchedAt);
  assert.equal(fresh[0].value.meta.fetchedAt, fresh[1].value.meta.fetchedAt);
  assert.equal(fresh[0].value.meta.stale, false);
});

test('wrong provider locations and physically invalid percentages are rejected', async () => {
  states.set(52, 'wrong-location');
  states.set(53, 'invalid-percentages');
  await request('latitude=52&longitude=44', 503);
  await request('latitude=53&longitude=44', 503);
});


test('current observation timestamps use provider UTC offset rather than server local timezone', async () => {
  states.set(54, 'georgia-timezone');
  const { value } = await request('latitude=54&longitude=44');
  assert.equal(value.meta.utcOffsetSeconds, 14400);
  assert.equal(value.meta.timezone, 'Asia/Tbilisi');
  const expected = Date.parse(value.data.current.time + 'Z') - 14400 * 1000;
  assert.equal(value.meta.currentTime, expected);
  assert.ok(Date.now() - expected >= 0 && Date.now() - expected < 16 * 60 * 1000);
});

test('ECMWF fallback requests its supported 15-day horizon', async () => {
  states.set(55, 'ecmwf-only');
  const { value } = await request('latitude=55&longitude=44');
  assert.equal(value.meta.source, 'Open-Meteo • ecmwf_ifs04');
  assert.equal(requests.at(-1).query.get('forecast_days'), '15');
});


test('a configured static frontend can read weather through the existing API CORS policy', async () => {
  const origin = 'https://niksaniksa25.github.io';
  const url = base + '/api/weather?latitude=56&longitude=44';
  const response = await fetch(url, { headers: { Origin: origin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('vary'), 'Origin');
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  const untrusted = await fetch(url, { headers: { Origin: 'https://untrusted.example.invalid' } });
  assert.equal(untrusted.headers.get('access-control-allow-origin'), null);
});
