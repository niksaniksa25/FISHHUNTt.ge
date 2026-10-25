(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FishHuntWeatherHazards = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const HOUR = 3600000, FORECAST_HOURS = 6, MAX_FETCH_AGE = 15 * 60000, MAX_CURRENT_AGE = 45 * 60000;
  const THRESHOLDS = Object.freeze({ wind: Object.freeze({ warning: 35, danger: 50 }), gust: Object.freeze({ warning: 50, danger: 70 }), rain: Object.freeze({ warning: 5, danger: 10 }) });
  const WMO = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
  const THUNDER = new Set([95, 96, 99]), HEAVY_PRECIP = new Set([65, 67, 82, 86]);
  function number(value) {
    if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
    const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
  }
  function bounded(value, max) { const parsed = number(value); return parsed !== null && parsed >= 0 && parsed <= max ? parsed : null; }
  function coordinates(lat, lon) { return number(lat) !== null && number(lon) !== null && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180; }
  function localTimestamp(value, offset) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null;
    const parsed = Date.parse(value + 'Z');
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, value.length) !== value) return null;
    return parsed - offset * 1000;
  }
  function unsupportedUnits(data) {
    for (const units of [data.current_units, data.hourly_units]) {
      for (const [field, expected] of [['wind_speed_10m', 'km/h'], ['wind_gusts_10m', 'km/h'], ['precipitation', 'mm']]) {
        if (units?.[field] !== undefined && units[field] !== expected) return true;
      }
    }
    return false;
  }
  function fields(input, interval) {
    const code = number(input.weather_code), amount = bounded(input.precipitation, 500);
    return {
      wind: bounded(input.wind_speed_10m, 450), gust: bounded(input.wind_gusts_10m, 500),
      code: Number.isInteger(code) && WMO.has(code) ? code : null,
      precip: amount === null || interval === null ? null : amount * 3600 / interval,
      interval, amount
    };
  }
  function severity(value, thresholds) { return value >= thresholds.danger ? 'danger' : value >= thresholds.warning ? 'warning' : null; }
  function evaluate(data, options = {}) {
    const now = number(options.now === undefined ? Date.now() : options.now), validNow = now !== null && now > 0 && now < 8640000000000000;
    const result = {
      status: 'unavailable', reason: 'missing_data', source: 'Open-Meteo', sourceTime: null,
      checkedAt: validNow ? new Date(now).toISOString() : null, timezone: typeof data?.timezone === 'string' ? data.timezone : '',
      window: { from: validNow ? new Date(now).toISOString() : null, to: null },
      coverage: { current: false, forecast: 0, expectedForecast: FORECAST_HOURS, complete: false, missing: [] }, hazards: []
    };
    const fail = (reason, status = 'unavailable') => { result.reason = reason; result.status = status; return result; };
    if (!validNow) return fail('invalid_clock');
    if (!data || typeof data !== 'object' || !data.current || !data.__meta) return result;
    const meta = data.__meta;
    if (!coordinates(options.lat, options.lon)) return fail('location_unavailable');
    if (!coordinates(meta.requestedLatitude, meta.requestedLongitude)) return fail('location_unverified');
    if (Number(options.lat) !== Number(meta.requestedLatitude) || Number(options.lon) !== Number(meta.requestedLongitude)) return fail('location_mismatch');
    const offset = number(data.utc_offset_seconds);
    if (offset === null || !Number.isInteger(offset) || Math.abs(offset) > 14 * 3600 || offset % 60 !== 0) return fail('invalid_timezone');
    try { new Intl.DateTimeFormat('en', { timeZone: result.timezone }).format(new Date(now)); } catch { return fail('invalid_timezone'); }
    if (!result.timezone) return fail('invalid_timezone');
    const observed = localTimestamp(data.current.time, offset), fetched = number(meta.updatedAt ?? meta.fetchedAt);
    if (observed === null) return fail('source_time_unavailable');
    result.sourceTime = new Date(observed).toISOString();
    if (Object.prototype.hasOwnProperty.call(meta, 'currentTime') && (number(meta.currentTime) === null || Math.abs(Number(meta.currentTime) - observed) > 1000)) return fail('inconsistent_source_time');
    if (meta.stale === true || fetched !== null && (now - fetched > MAX_FETCH_AGE || now - observed > MAX_CURRENT_AGE)) return fail('stale_data', 'stale');
    if (meta.stale !== false || fetched === null) return fail('freshness_unverified');
    if (fetched > now + 60000 || observed > now + 5 * 60000) return fail('future_source_time');
    if (unsupportedUnits(data)) return fail('unsupported_units');

    const next = Math.floor((now + offset * 1000) / HOUR) * HOUR + HOUR - offset * 1000;
    const endpoints = Array.from({ length: FORECAST_HOURS }, (_, i) => next + i * HOUR);
    result.window.to = new Date(endpoints.at(-1)).toISOString();
    const missing = result.coverage.missing, candidates = [], timestamps = new Map(), duplicate = new Set();
    const localTime = at => new Date(at + offset * 1000).toISOString().slice(0, 16);
    function assess(row, at, scope) {
      const prefix = scope === 'current' ? 'current' : 'forecast:' + localTime(at);
      for (const metric of ['wind', 'gust', 'code', 'precip']) if (row[metric] === null) missing.push(prefix + ':' + metric);
      const make = (kind, metric, value, level, threshold, unit) => candidates.push({
        id: kind, kind, severity: level, metric, value: Math.round(value * 10) / 10, unit, threshold,
        at: new Date(at).toISOString(), localTime: localTime(at), scope
      });
      for (const metric of ['wind', 'gust']) {
        const value = row[metric], level = value === null ? null : severity(value, THRESHOLDS[metric]);
        if (level) make('wind', metric, value, level, THRESHOLDS[metric][level], 'კმ/სთ');
      }
      if (THUNDER.has(row.code)) make('thunderstorm', 'code', row.code, 'danger', null, 'WMO');
      const rainLevel = row.precip === null ? null : severity(row.precip, THRESHOLDS.rain);
      if (rainLevel) make('rain', 'precip', row.precip, rainLevel, THRESHOLDS.rain[rainLevel], 'მმ/სთ');
      else if (HEAVY_PRECIP.has(row.code)) make('rain', 'code', row.code, row.code === 67 ? 'danger' : 'warning', null, 'WMO');
      return ['wind', 'gust', 'code', 'precip'].every(metric => row[metric] !== null);
    }
    const interval = bounded(data.current.interval, 3600), validInterval = interval !== null && Number.isInteger(interval) && interval >= 60 ? interval : null;
    result.coverage.current = assess(fields(data.current, validInterval), observed, 'current');
    const hourly = data.hourly || {}, times = Array.isArray(hourly.time) ? hourly.time : [];
    // Only six exact upcoming local-hour endpoints are assessed. An hourly
    // precipitation value describes the preceding hour; past endpoints cannot
    // become an imminent rain alert when the selected UI forecast changes.
    for (let i = 0; i < Math.min(times.length, 1000); i++) {
      const time = localTimestamp(times[i], offset);
      if (time === null || !endpoints.includes(time)) continue;
      if (timestamps.has(time)) duplicate.add(time); else timestamps.set(time, i);
    }
    for (const at of endpoints) {
      if (!timestamps.has(at) || duplicate.has(at)) { missing.push('forecast:' + localTime(at) + (duplicate.has(at) ? ':duplicate' : ':missing')); continue; }
      const index = timestamps.get(at), input = {};
      for (const field of ['wind_speed_10m', 'wind_gusts_10m', 'weather_code', 'precipitation']) input[field] = Array.isArray(hourly[field]) ? hourly[field][index] : null;
      if (assess(fields(input, 3600), at, 'forecast')) result.coverage.forecast++;
    }
    result.coverage.complete = result.coverage.current && result.coverage.forecast === FORECAST_HOURS;
    result.status = result.coverage.complete ? 'live' : 'partial'; result.reason = result.coverage.complete ? 'assessed' : 'incomplete_coverage';
    for (const kind of ['wind', 'thunderstorm', 'rain']) {
      const matches = candidates.filter(item => item.kind === kind);
      if (!matches.length) continue;
      const rank = item => item.severity === 'danger' ? 2 : 1;
      matches.sort((a, b) => rank(b) - rank(a) || (b.threshold ? b.value / b.threshold : b.value / 100) - (a.threshold ? a.value / a.threshold : a.value / 100) || a.at.localeCompare(b.at));
      const peak = matches[0], start = matches.reduce((first, item) => item.at < first ? item.at : first, matches[0].at);
      const current = matches.some(item => item.scope === 'current');
      peak.startsAt = start; peak.current = current; peak.forecast = matches.some(item => item.scope === 'forecast');
      peak.title = kind === 'wind' ? peak.metric === 'gust' ? 'ქარის ძლიერი დარტყმები' : 'ძლიერი ქარი' : kind === 'thunderstorm' ? 'ჭექა-ქუხილის პირობები' : 'უხვი ნალექი';
      const detail = peak.metric === 'code' ? kind === 'thunderstorm' ? 'პროგნოზის კოდი ჭექა-ქუხილს მიუთითებს.' : 'პროგნოზის კოდი ძლიერ ნალექს მიუთითებს.' : peak.value + ' ' + peak.unit + ' · საორიენტაციო ზღვარი ' + peak.threshold + ' ' + peak.unit + '.';
      peak.message = detail + (peak.scope === 'current' ? ' მიმდინარე მოდელის მონაცემი.' : ' საათობრივი პროგნოზი: ' + peak.localTime.slice(11) + '.');
      result.hazards.push(peak);
    }
    return result;
  }
  return Object.freeze({ evaluate, THRESHOLDS, FORECAST_HOURS, MAX_FETCH_AGE, MAX_CURRENT_AGE });
});
