GeoNature final score + responsive pass

Changes in this pass:
- Outdoor Score is conservative and uses hourly weather conditions.
- Hourly score now includes apparent temperature, wind, gusts, rain, rain probability, pressure, humidity, cloud cover, visibility, weather code and time-of-day light context when available.
- Home, hunting, place details and map hourly scoring now pass the selected hour into the Outdoor Score calculation.
- Shared responsive.css is included across the site.
- Added js/device-responsive.js with explicit iOS / Android / Tablet / Desktop body classes.
- Added device-specific responsive rules for iPhone, Android/Samsung-sized phones, tablets and desktop.
- JS syntax checks: PASS.
- Configure the administrator password using private server environment variables; never commit it.
