# GeoNature

This build keeps the existing site and adds:
- Bank of Georgia payment integration scaffold for Plus (2.99 GEL/month) and AI Pro (7.99 GEL/month).
- Responsive CSS for iPhone and Samsung/Android screen sizes.
- Georgian / English UI toggle.

Real payment credentials must be entered in `.env` on the server. Do not put merchant secrets into browser JavaScript.


UI update: the More menu now contains all secondary tools in a grouped, responsive dropdown.


### Premium term purchases
1 month at standard current plan price; 3 months 10% off; 6 months 15% off; 12 months 25% off. Server calculates final amount and sends the selected term to BOG.


## New Premium Smart Tools
Fish Activity Timeline, Live Hotspots, Stargazing Score, Smart Alerts, Community Reports, Best Moment, Personal GeoNature, AI Trip Planner, Record Predictor and Safety Mode are exposed on premium-extras.html.

## Admin Panel
Open admin.html from the AI page using the Admin Panel button. Admin password is verified only on the server; do not put it in client JavaScript.

### Real Push Notifications
GeoNature now supports Web Push subscriptions for selected fish + selected fishing places.

1. Run `START_GeoNature.bat` (or `node server.js`). For local development use `http://localhost:8787/`; do not use Live Server for Push.
2. Open `dashboard.html` and enable `🔔 შეტყობინებები`.
3. Choose one or more fish and one or more lakes/rivers/reservoirs, then enable notifications and optionally send a test notification.
4. The server checks selected combinations periodically and sends a browser Push when the calculated activity score is high enough.

For production the server must stay running and the site should be served over HTTPS. Web Push keys are generated and stored locally in `push-state.json`; do not share that file if you deploy the project publicly.

### Profile Backgrounds
The account profile now supports photo backgrounds (fishing lake, fishing rod, fish, forest, mountains, lake and a PLUS football-themed background) and additional photo-style avatar choices. PLUS avatars/backgrounds are gated by the existing plan system.


## განახლებული კატალოგები
- თევზები: 84 სახეობა (`js/fishing-data.js`).
- ველური ბუნება: 61 სახეობა (`js/hunting-data.js`).
- AI-ის ადგილების სია პირდაპირ საერთო 108 წყალსატევის მონაცემებიდან ივსება, რათა თევზების ID-ები და ადგილები ერთმანეთს დაემთხვეს.
- საჯარო 100%-იანი პრომო კოდია `avtobest`; ძველი `autobest` აღარ არის აქტიური.
- სახეობებისა და გავრცელების მონაცემები საინფორმაციოა; კონკრეტულ ადგილას არსებობა/დაცული სტატუსი ადგილობრივად გადაამოწმე.


## Local launch
- Run `START_GeoNature.bat`. It chooses a free local port if an older server is already running, then opens that exact URL so a stale GeoNature process does not keep serving old code.
