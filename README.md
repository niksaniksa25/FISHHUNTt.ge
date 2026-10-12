# GeoNature

## Development and current behavior

Use Node.js 20 or newer (`npm start`); cloud development uses Node.js 24 with `NODE_USE_ENV_PROXY=1`. No third-party package installation is required. Keep private runtime records outside the static checkout using `GEONATURE_DATA_DIR`.

Run `npm run check` to check every active JavaScript file and `npm test` for API persistence, private-file protection, fishing exceptions and hunting date boundaries. The GitHub validation workflow runs both commands.

Shared responsive layouts are in `css/responsive.css`, with separate `css/responsive-ios.css` and `css/responsive-android.css` platform adjustments. `js/device-responsive.js` applies device classes and visible-viewport sizing; `css/nature-theme.css` supplies the shared forest/river palette.

The season calendar, species profiles and planning tools show restrictions separately from activity forecasts. See [the source versions and legal coverage](docs/WILDLIFE-RULES.md); an activity score does not establish permission to catch or hunt.

Feedback saves to the Node API and appears in the administrator inbox when the API is hosted. On GitHub Pages without a backend, the widget prepares a public GitHub issue that the visitor must submit on GitHub. Drafts remain available until API storage is acknowledged. See [feedback deployment](DEPLOYMENT-FEEDBACK.md) to configure private in-page delivery on a separate backend.

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


## One-time donations and live leaderboard

- Open `donate.html` to donate 1, 2, 5, 10, 25 GEL, or enter another amount of at least 1 GEL.
- `js/donate.js` submits the amount to the Node API and refreshes the live leaderboard every 20 seconds.
- `/api/donations/leaderboard` returns only entries with server-side `verified: true` and `status: paid`.
- The BOG callback does **not** add a leaderboard entry on its own. The server looks up the payment with BOG's receipt endpoint and checks the external order ID, completed status, GEL currency, and exact amount before recording it.
- No sample or seeded supporters are included. If there are no confirmed payments, the leaderboard remains empty.
- The real checkout requires BOG Merchant/API credentials in the private server environment and a public HTTPS server URL in `PUBLIC_BASE_URL`. GitHub Pages alone cannot run `server.js`.
- If the website remains on GitHub Pages and the backend is on a separate host, set `window.GN_API_BASE_URL` in `js/api-config.js` to the backend's HTTPS origin. Allow the exact frontend origin using `GN_FRONTEND_ORIGIN` (and keep `DONATION_FRONTEND_ORIGIN` aligned for checkout). The same API setting is used by feedback and the admin feedback inbox.
- Keep the server's JSON runtime files (`orders.json`, `donations.json`, `users.json`, `sessions.json`, `analytics.json`, `feedback.json`, and `push-state.json`) on persistent private storage; never commit live user, order, or session records.


## Feedback on GitHub Pages

GitHub Pages only serves static files; it cannot receive feedback or save it to the admin inbox by itself. Deploy `server.js` as a public HTTPS Node service with persistent private storage, then set `window.GN_API_BASE_URL` in `js/api-config.js` to that service's origin (for example, `https://your-service.onrender.com`, with no trailing slash). Set `GN_FRONTEND_ORIGIN` in the server environment to the exact frontend origin, such as `https://niksaniksa25.github.io`. The feedback widget and admin inbox use that configuration. If the API origin is missing on GitHub Pages, the widget now displays a specific setup message rather than silently sending to a nonexistent `/api/feedback` route.


## Feedback API deployment
- `render.yaml` and `package.json` now define the Node API service and persistent private storage.
- The server uses `GEONATURE_DATA_DIR` for feedback, sessions, users, orders, donation ledger, analytics, and push state. On Render, the Blueprint mounts a persistent disk at `/var/data`.
- Complete the hosting setup and set the actual Node service's HTTPS origin in `js/api-config.js`; GitHub Pages cannot run API routes itself.
- Follow [DEPLOYMENT-FEEDBACK.md](DEPLOYMENT-FEEDBACK.md) for the exact deployment and verification steps. Review Render's Starter service and persistent-disk pricing before creating it.
