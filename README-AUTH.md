# GeoNature Authentication

The auth page uses one form with a Sign in / Sign up toggle. Only the selected mode is shown.

Server mode: run START_GeoNature.bat or `npm start`, then open `http://localhost:8787/auth.html`.
Static/file preview: browser-local account mode is used automatically.

New local storage namespace: `geonature_local_*_v5`; older preview accounts are intentionally ignored so the auth system starts clean.

Passwords are not stored in plain text. Server accounts use Node scrypt hashes. Browser preview accounts store only a SHA-256-derived value and salt. For remembered passwords, the browser Password Manager is used through standard autocomplete fields.
