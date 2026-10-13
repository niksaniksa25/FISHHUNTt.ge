# Live data and conditions indices

## Weather

The website reads Open-Meteo current model conditions and hourly forecasts. These are weather-model estimates for a location, not readings from a sensor at the fishing bank. Temperatures use Celsius, wind and gusts km/h, precipitation mm and pressure hPa. Times use the forecast location's timezone; Georgian defaults use `Asia/Tbilisi` even when the visitor's phone uses another timezone.

Current model conditions remain separate from an explicitly selected forecast hour. Automatic refresh follows the current hour unless the visitor pins a forecast. Manual refresh preserves that choice. Responses for a previously selected location cannot replace a newer selection. Paused refresh, stale data, forecasts and unavailable measurements have distinct states.

On GitHub Pages without a Node backend, weather is fetched directly from the public provider. With the Node backend, `/api/weather` shares concurrent requests, validates provider fields and units, caches by location for five minutes, and bounds provider attempts to ten seconds. `refresh=1` requests fresh data. An upstream outage may return a clearly marked last-known result for the same location for up to 90 minutes; stale observations never appear as fresh LIVE data. Provider outages remain visible rather than generating replacement weather.

Missing measurements stay unknown. A location with missing coordinates cannot request `(0, 0)` by accident. Map markers remain unscored until the selected date/hour has actual data. The map, place details and weather tools use the same outdoor scoring helper.

All five assessment panels show 20 fields, including rainfall amount separately from rain probability, apparent temperature, wind direction, daylight and sunrise/sunset. Each field identifies its observation or forecast time and units. Unknown fields explain why they are unavailable. Pressure change uses identified consecutive hourly forecast values; moon values are approximate astronomical calculations, and NOAA Kp is global information rather than a local fish measurement. Unmeasured water temperature and water level are never inferred.

## Fishing and wildlife

Fishing numbers are comparative **conditions indices out of 100**, not calibrated probabilities of catching a fish. A score of 70 does not mean a 70% chance of a catch. Catch rates also depend on effort, skill, gear, water conditions, population and access, which this website does not measure.

The fishing index uses the selected species, destination, local hour and available weather. Missing core data cannot produce a score. The species' preferred water-temperature range is used only when an actual `water_temperature` measurement is supplied; air temperature is never substituted for water temperature. Optional measurements are omitted from weighted calculations when unavailable. Midnight is a valid hour, and hazardous weather cannot receive a reassuring high score.

The list ranks descending by the current index, with unavailable results last and deterministic ties. Refresh moves existing cards, retaining selected species, filters, focus and scroll position. `GeoFishConditions.explain` is the same calculation used by `GeoFishChance`: the panel shows included weights, normalized contributions, omitted measurements and any habitat or safety cap. Informational moon/Kp/water-level fields are not falsely presented as terms in that model.

Destination scores use that destination's forecast, rather than weather from the visitor's current city. The guide loads destination conditions on request. Unknown species/destination associations are conservative and explicitly informational. Wildlife activity indices describe typical seasonal/time patterns; they are not measured probabilities of seeing or hunting an animal.

Legal restrictions are independent of activity. A high index does not grant fishing or hunting permission. See [wildlife rule sources and limits](WILDLIFE-RULES.md).

## Other live tools and storage

Premium tools use actual forecasts and locally saved records. There are no seeded community reports, fabricated hotspots, random alerts or statistical catch predictions. Sky and safety assessments describe available forecast information, without guaranteeing visibility or safety. Trips and community reports saved without a backend remain in the current browser.

On a static deployment, remembered local accounts persist in local storage; nonremembered accounts persist only in the current tab's session storage. These accounts are clearly labelled as local. Payments, verified donations and server Web Push need a configured backend. A preview discount does not activate Premium or confirm payment.

Web Push uses the same fishing conditions model and canonical species/location data as the website, rejects missing/stale weather and prohibited catches, and implements RFC 8291 encrypted delivery. Tests use local subscriptions and independent decryption; they never send public test notifications.

Static Pages also has a foreground alert mode in `js/foreground-alerts.js`, requiring no server or browser notification permission. It checks at most five locations with three concurrent requests and evaluates up to five selected fish, skips stale/unknown/prohibited or unconfirmed fish/place pairs, records alerts locally and deduplicates each pair for four hours. Checks resume on navigation/visibility/online events with a 15-minute gate. These checks stop when the site closes. On iPhone, ordinary Safari can show in-page alerts; system Web Push additionally requires compatible iOS, an installed Home Screen web app and a configured server. Notification links select the exact fish and place and scroll to its profile.

Card images load near the viewport. Metadata lookups share in-flight requests, limit concurrency to four, time out and retain a placeholder on failure. Standalone and planner catch records are combined for dashboard display without duplicating either store; dashboard updates preserve photo previews, search results and unsaved forms. Opening the payment return page never establishes that a payment succeeded.

## Validation

`npm run check` validates every active JavaScript file. `npm test` exercises provider failures, timezones, missing data, races, cache refresh, conditions scoring, account storage, real API persistence, legal date boundaries and Push encryption. Genuine WebKit browser checks cover mobile and desktop UI, current/forecast switching, offline recovery, search, forms and static deployment behavior.
