# Weather danger assessments

`js/weather-hazards.js` exports the pure `FishHuntWeatherHazards.evaluate(data, {lat, lon, now})` evaluator. The browser passes normalized Open-Meteo data from `GeoNatureCommon.openMeteo`, with the actual request coordinates recorded in `data.__meta.requestedLatitude` and `requestedLongitude`. Rounded model-grid coordinates are not treated as the request location. The evaluator does not fetch, persist, request notification permission or send notifications.

These are heuristic model assessments for planning a trip, not official emergency warnings or observations from a local weather station. A missing warning does not establish that a place is safe. The user interface must retain the source time, current/forecast distinction, incomplete-data state and the fact that automatic checks run while the site is open. System notification permission is a separate explicit action.

## Freshness and location

- Requested latitude and longitude must exactly match the evaluated location.
- `__meta.stale` must be `false`. The fetched dataset must be at most 15 minutes old and its current model timestamp at most 45 minutes old. Fetch times over one minute in the future and current timestamps over five minutes in the future are rejected.
- The current timestamp is parsed from the provider's local time and declared UTC offset. If `__meta.currentTime` exists, it must agree within one second. Invalid dates, unsupported timezone identifiers and invalid offsets are rejected.
- Explicit units must be km/h for wind and gusts, and mm for precipitation. Conflicting units cause an unavailable result. Missing unit headers are accepted only as part of the normalized client contract, which explicitly requests km/h and mm from Open-Meteo; the evaluator does not guess or convert unknown units.
- Stale and unavailable results contain no hazards. A fresh dataset with missing measurements or forecast rows is `partial`; hazards supported by the remaining valid measurements may still be shown.

## Evaluated period and thresholds

The evaluator assesses the current model interval and exactly six upcoming local whole-hour endpoints after the real current time. A user-selected old or future hour on the weather page cannot move this window. The window crosses midnight using the supplied offset. Duplicate hourly timestamps are ambiguous and skipped. Missing rows and measurements appear in the returned coverage object.

| Condition | Warning | Higher severity |
| --- | --- | --- |
| Sustained wind | 35 km/h | 50 km/h |
| Gust | 50 km/h | 70 km/h |
| Precipitation intensity | 5 mm/h | 10 mm/h |
| Thunderstorm | — | WMO codes 95, 96 or 99 |

Current `precipitation` is an accumulation for `current.interval` seconds. It is converted to an hourly rate only when that interval is declared as an integer between 60 and 3600 seconds. Without an interval, an amount cannot become a fabricated mm/h number. Each hourly precipitation value is the accumulation over the preceding hour, assessed only for a future endpoint; a six-hour total is never compared to the hourly threshold. Rain probability alone never produces a heavy-precipitation alert.

WMO heavy-precipitation codes 65, 67, 82 and 86 can identify a modelled heavy-precipitation condition without inventing a numeric intensity. These use `metric: 'code'`, `unit: 'WMO'` and `threshold: null`. Code 67 identifies heavy freezing rain and receives the higher severity. A valid numeric intensity takes precedence when it already meets a threshold.

Only the strongest supported sample per kind (`wind`, `thunderstorm`, `rain`) is returned. Gust and sustained wind share the `wind` kind so that one weather event does not create duplicate wind notifications. Each hazard includes the sampled time, local time, model scope, value/unit, threshold when numeric, earliest matching time and whether matching current and forecast samples exist.

## Result

`status` is `live`, `partial`, `stale` or `unavailable`. `coverage` contains `current`, the number of fully covered forecast endpoints, `expectedForecast: 6`, `complete` and the exact missing metrics/endpoints. `live` means the defined model inputs cover this window; it does not mean safe conditions. `sourceTime` is the actual current model timestamp, while `checkedAt` is the evaluation clock. `window.to` identifies the final evaluated forecast endpoint.

Tests cover exact thresholds, accumulation intervals, probability-only forecasts, explicit unit mismatches, freshness and location checks, timezone offsets, midnight, invalid dates, duplicate/missing hours, zero versus unknown measurements, and hazards retained with partial coverage.
