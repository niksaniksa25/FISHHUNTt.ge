# GeoNature

## Development and current behavior

Use Node.js 20 or newer (`npm start`); cloud development uses Node.js 24 with `NODE_USE_ENV_PROXY=1`. No third-party package installation is required. Keep private runtime records outside the static checkout using `GEONATURE_DATA_DIR`.

Run `npm run check` to check every active JavaScript file and `npm test` for weather, conditions scoring, live state, account storage, API persistence, private-file protection and wildlife restrictions. The GitHub validation workflow runs both commands.

Current conditions, selected-hour forecasts, stale data and unavailable measurements are separate. Fishing scores are comparative indices out of 100, not measured catch percentages. See [live data behavior and limitations](docs/LIVE-DATA.md).

Shared responsive layouts are in `css/responsive.css`, with separate `css/responsive-ios.css` and `css/responsive-android.css` platform adjustments. `js/device-responsive.js` applies device classes and visible-viewport sizing; `css/nature-theme.css` supplies the shared forest/river palette.

`css/ui-polish.css` is the final shared design layer with a dedicated phone layout. The homepage puts places, weather and planning before supporting content. `js/ui-shell.js` provides the local page/species/place finder, section shortcuts, a return-to-top control and expandable factor explanations; all 20 factor values remain visible. Every full page has a main landmark, skip link, description and accessible names for its search/planner fields. Mobile page titles retain their independent horizontal navigation; content cards stay in ordinary grids.

The season calendar, species profiles and planning tools show restrictions separately from activity forecasts. See [the source versions and legal coverage](docs/WILDLIFE-RULES.md); an activity score does not establish permission to catch or hunt.

Feedback saves to the Node API when it is hosted. On GitHub Pages, submitting opens a prefilled public GitHub issue in the same tab; the visitor signs in and presses Create issue there. Unsent drafts are preserved. See [feedback behavior and deployment](DEPLOYMENT-FEEDBACK.md).

The fishing list sorts by the selected live conditions index and reorders existing cards after refresh, preserving filters, selected species and keyboard focus. Default hours track current conditions; explicitly selected forecast hours stay fixed. Assessment panels show all 20 fields with units, timestamps, unknown-data explanations and the actual fishing model's contributions and caps.

This build keeps the existing site and adds:
- Bank of Georgia payment integration scaffold for Plus (2.99 GEL/month) and AI Pro (7.99 GEL/month).
- Responsive CSS for iPhone and Samsung/Android screen sizes.
- Georgian / English UI toggle.

Real payment credentials must be entered in `.env` on the server. Do not put merchant secrets into browser JavaScript.


On phones and tablets, all page titles appear in one horizontally scrollable header row, including the secondary destinations. The desktop More menu groups secondary tools in a dropdown. Donation has its own compact link in the main navigation.


### Premium term purchases
1 month at standard current plan price; 3 months 10% off; 6 months 15% off; 12 months 25% off. Server calculates final amount and sends the selected term to BOG.

On static hosting, checkout, donation payments and trial activation show their unavailable state before submission. Plan restrictions are preserved. Trial creation, card callbacks and activation also return `503` on the Node server until authoritative bank verification is implemented; a `status=success` return URL cannot attach a card or grant a trial. Setting `BOG_TRIAL_SETUP_URL` alone is insufficient.


## New Premium Smart Tools
`premium-extras.html` provides forecast-based activity timelines, destination comparisons, sky and safety assessments, best-hour planning and statistics from actual local catch records. Local reports are labelled as browser storage; no sample records or invented live scores are included.

## Admin Panel
Open admin.html from the AI page using the Admin Panel button. Admin password is verified only on the server; do not put it in client JavaScript.

### Real Push Notifications
Notifications work on GitHub Pages while the site is open: choose up to five fish and five places using the searchable checkbox lists. The browser checks fresh forecasts every 15 minutes and shows a saved in-page feed, counter and alerts for confirmed fish/location associations. Unsupported browser notification permissions do not disable the in-page feed. Each pair is limited to one conditions alert every four hours. These checks stop when the site is closed; the local test button demonstrates the interface without sending a real Push or fetching weather.

Optional server Web Push supports notifications after closing the site when a Node backend and browser support are configured:

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

Without a backend, Feedback opens GitHub Issues directly and preserves the draft; a GitHub account is required to finish submitting. To deliver reports privately to the admin inbox, host `server.js` with persistent private storage, set `window.GN_API_BASE_URL` in `js/api-config.js` to its HTTPS origin, and set `GN_FRONTEND_ORIGIN` on the server to the frontend's exact origin. Static hosting alone cannot maintain a private inbox.


## Feedback API deployment
- `render.yaml` and `package.json` now define the Node API service and persistent private storage.
- The server uses `GEONATURE_DATA_DIR` for feedback, sessions, users, orders, donation ledger, analytics, and push state. On Render, the Blueprint mounts a persistent disk at `/var/data`.
- Complete the hosting setup and set the actual Node service's HTTPS origin in `js/api-config.js`; GitHub Pages cannot run API routes itself.
- Follow [DEPLOYMENT-FEEDBACK.md](DEPLOYMENT-FEEDBACK.md) for the exact deployment and verification steps. Review Render's Starter service and persistent-disk pricing before creating it.
