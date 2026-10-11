# Feedback and Analytics

- A floating “Feedback / შეცდომა” button is available on all root-level app pages, including the admin page.
- Feedback is saved on the Node server in `feedback.json` and appears in `admin.html` after administrator login. Admin can mark reports as read/resolved.
- The backend tracks anonymous browser IDs and page views in `analytics.json`; it does not save IP addresses. Clear browser storage or use another browser/device and it is counted as another anonymous visitor.
- Successful registrations are reflected from `users.json`; successful sign-ins are counted in `analytics.json`.
- Orders are persisted in `orders.json`. Purchase reporting counts callback statuses received as successful from BOG and stores the summary in `analytics.json`. Ensure BOG merchant callbacks are correctly configured before relying on purchase totals for accounting.
- For server-backed functions run `START_GeoNature.bat`; do not use VS Code Live Server or `file://` for feedback/analytics. The server needs write access to the project folder so it can create/update the JSON data files.
