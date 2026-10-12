# Live data and conditions indices

## Weather

The website reads Open-Meteo current model conditions and hourly forecasts. These are weather-model estimates for a location, not readings from a sensor at the fishing bank. Temperatures use Celsius, wind and gusts km/h, precipitation mm and pressure hPa. Times use the forecast location's timezone; Georgian defaults use `Asia/Tbilisi` even when the visitor's phone uses another timezone.

Current model conditions remain separate from an explicitly selected forecast hour. Automatic refresh follows the current hour unless the visitor pins a forecast. Manual refresh preserves that choice. Responses for a previously selected location cannot replace a newer selection. Paused refresh, stale data, forecasts and unavailable measurements have distinct states.

On GitHub Pages without a Node backend, weather is fetched directly from the public provider. With the Node backend, `/api/weather` shares concurrent requests, validates provider fields and units, caches by location for five minutes, and bounds provider attempts to ten seconds. `refresh=1` requests fresh data. An upstream outage may return a clearly marked last-known result for the same location for up to 90 minutes; stale observations never appear as fresh LIVE data. Provider outages remain visible rather than generating replacement weather.

Missing measurements stay unknown. A location with missing coordinates cannot request `(0, 0)` by accident. Map markers remain unscored until the selected date/hour has actual data. The map, place details and weather tools use the same outdoor scoring helper.

## Fishing and wildlife

Fishing numbers are comparative **conditions indices out of 100**, not calibrated probabilities of catching a fish. A score of 70 does not mean a 70% chance of a catch. Catch rates also depend on effort, skill, gear, water conditions, population and access, which this website does not measure.

The fishing index uses the selected species, destination, local hour and available weather. Missing core data cannot produce a score. The species' preferred water-temperature range is used only when an actual `water_temperature` measurement is supplied; air temperature is never substituted for water temperature. Optional measurements are omitted from weighted calculations when unavailable. Midnight is a valid hour, and hazardous weather cannot receive a reassuring high score.

Destination scores use that destination's forecast, rather than weather from the visitor's current city. The guide loads destination conditions on request. Unknown species/destination associations are conservative and explicitly informational. Wildlife activity indices describe typical seasonal/time patterns; they are not measured probabilities of seeing or hunting an animal.

Legal restrictions are independent of activity. A high index does not grant fishing or hunting permission. See [wildlife rule sources and limits](WILDLIFE-RULES.md).

## Other live tools and storage

Premium tools use actual forecasts and locally saved records. There are no seeded community reports, fabricated hotspots, random alerts or statistical catch predictions. Sky and safety assessments describe available forecast information, without guaranteeing visibility or safety. Trips and community reports saved without a backend remain in the current browser.

On a static deployment, remembered local accounts persist in local storage; nonremembered accounts persist only in the current tab's session storage. These accounts are clearly labelled as local. Payments, verified donations and server Web Push need a configured backend. A preview discount does not activate Premium or confirm payment.

Web Push uses the same fishing conditions model and canonical species/location data as the website, rejects missing/stale weather and prohibited catches, and implements RFC 8291 encrypted delivery. Tests use local subscriptions and independent decryption; they never send public test notifications.

## Validation

`npm run check` validates every active JavaScript file. `npm test` exercises provider failures, timezones, missing data, races, cache refresh, conditions scoring, account storage, real API persistence, legal date boundaries and Push encryption. Genuine WebKit browser checks cover mobile and desktop UI, current/forecast switching, offline recovery, search, forms and static deployment behavior.
