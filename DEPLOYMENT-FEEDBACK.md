# Deploying the Node API (Feedback/Admin inbox)

The static GitHub Pages frontend cannot run `server.js`. A persistent Node service is required so feedback submissions survive restarts.

## Render Blueprint

1. In Render, choose **New → Blueprint** and connect this GitHub repository. Render reads `render.yaml`.
2. Review the service and persistent-disk pricing before confirming. This Blueprint uses a Starter web service and a 1 GB persistent disk because feedback, sessions, and orders are written to JSON files.
3. During setup, set a strong private `GEONATURE_ADMIN_PANEL_PASSWORD`. BOG credentials can remain empty while only testing Feedback; payments will remain disabled until Merchant credentials are added.
4. After deployment, copy the actual HTTPS origin shown by Render (the origin only, without a path or trailing slash).
5. In `js/api-config.js`, change `window.GN_API_BASE_URL = '';` to `window.GN_API_BASE_URL = 'https://YOUR-ACTUAL-SERVICE.onrender.com';`. Commit that one-line change to GitHub.
6. Check `https://YOUR-ACTUAL-SERVICE.onrender.com/api/health`; it should return JSON. Then open the GitHub Pages site, submit a test Feedback message, and confirm it appears in `admin.html`.

## Private runtime data

The deployed service stores `feedback.json`, `sessions.json`, `users.json`, `orders.json`, `donations.json`, `analytics.json`, and `push-state.json` under `GEONATURE_DATA_DIR` (the Blueprint mounts persistent storage at `/var/data`). These files must stay out of Git.

The expected frontend origin in the Blueprint is `https://niksaniksa25.github.io`, which is also the origin used by the repository's GitHub Pages URL. If you use another frontend domain, change both `GN_FRONTEND_ORIGIN` and `DONATION_FRONTEND_ORIGIN` in Render's environment to match it exactly.
