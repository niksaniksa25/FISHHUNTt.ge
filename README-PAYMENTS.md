# GeoNature payments

## Plans
- Free: 0 ₾
- Plus: 5.99 ₾ standard; 2.99 ₾ launch sale until 2026-11-01 (50% sale shown in UI)
- AI Pro: 15.00 ₾ reference price; 7.99 ₾ current special price

## Promos
- Public promo codes (case-insensitive): `niko50` → 50% off, `niko25` → 25% off, `andro10` → 10% off, `andro20` / `andro 20` → 20% off, `avtobest` → 100% off.
- `avtobest` applies 100% to the currently selected plan and term. For signed-in users it stores the plan grant on the account until the selected term expires; for guests it is stored in that browser only. This public code is unlimited and can be redeemed by anyone who knows it.

## Admin UI
- The public checkout shows one promo-code field. Admin-only promo-code entry and validation have been removed.

## Trial
- 3-day / 72-hour client-side trial is available from `trial.html`.
- For production-grade trials, move trial state to a server account/database.

## BOG
- Merchant credentials stay in `.env` on the server.
- `/api/payments/pricing` supplies server-side current pricing.
- Promo validation is performed on the server through `/api/payments/promo/validate`; there is no separate admin promo field.

## Trial card requirement
- Trial no longer starts without a verified card-attachment callback.
- The frontend never collects raw card/CVV data.
- Configure `BOG_TRIAL_SETUP_URL` with the BOG merchant-approved card setup/tokenization URL. The URL may use `{ref}`, `{email}`, `{plan}`, `{return}` placeholders.
- After BOG returns to `/api/trial/callback?ref=...&status=success`, the user can activate the 72-hour trial.
- Actual recurring/card-on-file behavior is provider-dependent and must be enabled on the BOG merchant account; GeoNature does not invent or handle card data itself.

## Running promo codes correctly
- Promo input automatically converts letters to lowercase; `andro 20` is normalized to `andro20`.
- To apply a promo for actual payment or Plus activation, start the Node backend with `START_GeoNature.bat`. VS Code Live Server can show a local-only price preview, but it cannot create a verified order or activate a paid plan.
- When the Node API is available, the server is authoritative for validation, price calculation, and free-code activation.


## Donations and leaderboard
- The donation form lives at `donate.html` with buttons for 1, 2, 5, 10 and 25 GEL plus a custom amount below them.
- The leaderboard is empty until the first real donation is confirmed by BOG.
- The server verifies completed status, GEL currency, exact amount and the external order ID via BOG's receipt API before adding a supporter.
- The donor name is optional. Empty name is displayed as “ანონიმური მხარდამჭერი”.
- No test or fake supporters are inserted.
- Real checkout is not active until `BOG_CLIENT_ID`, `BOG_CLIENT_SECRET`, `PUBLIC_BASE_URL` (public HTTPS Node server) and the deployed API origin in `js/donate-config.js` are configured.
