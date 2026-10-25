# FishHunt accounts and device sync

The repository-root `wrangler.toml` deploys **fishhunt-ai**. For **fishhunt-accounts**, keep the explicit `--config cloudflare/accounts/wrangler.toml` command at root, or use `cloudflare/accounts` as the project root. Do not point the accounts project at the default AI config.

The website can keep an account local to one browser or use a private Cloudflare account service. Local accounts continue to work independently. Creating a cloud account or signing into it is an explicit choice; a local password hash is never uploaded or treated as a cloud password.

The account service is implemented in the existing `worker/fishhunt-ai.mjs`. **Publishing GitHub Pages does not deploy that Worker.** The browser enables cloud account actions only after the public health endpoint reports `accountConfigured: true`.

## Recommended: separate accounts Worker

The ready-to-deploy configuration at `cloudflare/accounts/wrangler.toml` creates an **accounts-only** Worker named `fishhunt-accounts`. It needs no Gemini key, administrator password, or administrator KV namespace. The existing `fishhunt-ai` Worker stays untouched.

1. In **Cloudflare → Workers & Pages**, import the existing GitHub repository as a new Worker project. Select the repository's `main` branch and set **Root directory** to `cloudflare/accounts`.
2. The checked-in Wrangler file already names the accounts Worker and declares its free SQLite Durable Object binding and migration. Use `npx wrangler deploy` as the deployment command. Keep the project on **Workers Free**; do not enable a paid Workers subscription.
3. Deploy, open the new Worker's public HTTPS address followed by `/api/health`, and confirm `accountConfigured: true`. `configured: false`, `adminConfigured: false`, and `analyticsConfigured: false` are expected on this accounts-only Worker; AI and administrator features still use the separate existing Worker.
4. The website is already configured for `https://fishhunt-accounts.bsloveer25.workers.dev`, matching this Worker name and the existing owner's Workers subdomain. Once that address reports `accountConfigured: true`, refresh the website and explicitly create or sign into a cloud account. If Cloudflare assigns a different address, put only its public HTTPS origin into `window.GN_ACCOUNT_WORKER_ORIGIN` in `js/api-config.js`; this service URL is not a secret.

If deploying locally instead of importing GitHub, authenticate with `npx wrangler@4 login`, then run this command from the repository root:

```sh
npx wrangler@4 deploy --config cloudflare/accounts/wrangler.toml
```

The configuration's entrypoint points to the existing shared Worker source; there is no duplicate account implementation to maintain. Wrangler applies the SQLite migration and creates its binding during deployment. The deployment format and relative entrypoint are checked with `wrangler deploy --dry-run`; importing the project still requires the owner's Cloudflare account authorization.

## Advanced: extend the existing Worker instead

Alternatively, the existing AI service and administrator inbox can stay on the same Worker and retain their existing secrets and `ADMIN_KV` namespace. Accounts use a new **SQLite Durable Object** binding named `FISHHUNT_ACCOUNTS`, class `FishHuntAccountsDO`. SQLite Durable Objects are available on Workers Free; use the free plan and do not enable paid Workers for this setup.

Cloudflare KV alone is unsuitable for credential creation: its eventual consistency cannot enforce one account per email across different edge locations. The Durable Object serializes account creation and revision checks and stores the private account data. `ADMIN_KV` remains separate and is not used for account passwords, sessions or personal records.

There is no Cloudflare deployment credential in this Codex environment. The owner can deploy from their own computer, without sharing any password, token or Gemini key in chat:

1. Open **Cloudflare → Workers & Pages → fishhunt-ai → Settings → Bindings**. Keep the existing `ADMIN_KV` binding and copy its existing KV namespace ID. The ID is configuration, not the administrator password or Gemini key.
2. In a current checkout of this repository, copy `wrangler.accounts.example.toml` to a local file named `wrangler.accounts.local.toml`. Replace only the `ADMIN_KV` placeholder with that existing namespace ID. If the Worker has other existing bindings, copy those into the local configuration too. Keep all existing variables and secrets in Cloudflare; `keep_vars = true` preserves dashboard variables and Wrangler preserves existing secrets.
3. With Node.js 20.19+ installed, authenticate locally with `npx wrangler@4 login`. The browser opens Cloudflare's own login/authorization page. Do not send the login URL, authorization code, password or token in chat.
4. Deploy the Worker and its one-time SQLite migration with:

   ```sh
   npx wrangler@4 deploy --config wrangler.accounts.local.toml
   ```

5. Open `https://fishhunt-ai.bsloveer25.workers.dev/api/health`. The result should include `accountConfigured: true`, while preserving the previously configured AI/admin/analytics status. A new account binding alone does not copy local profiles or purchase access.
6. Refresh the website, explicitly create a cloud account in the profile's synchronization section, and choose which local records to upload. On another device, sign into that same cloud account and download its profile and personal records.

Pasting the JavaScript into the dashboard editor alone is insufficient for a new Durable Object class: the first deployment also needs the `new_sqlite_classes` migration. The provided Wrangler command applies the migration and adds the binding together. The template is intentionally **not** named `wrangler.toml`, so a Git-connected build cannot accidentally deploy placeholder bindings or remove the existing administrator KV binding.

No email delivery service is configured. The app does not claim to verify email ownership or send password-reset messages. Cloud accounts instead support a personal, one-use recovery code. While signed in, open the account's recovery section and confirm the current password to create a code. Save it in a password manager or another private place away from this browser. Only its hash is stored by the backend; the original code is shown once and cannot be retrieved later. Generating a replacement invalidates the previous code. A code remains valid until replaced or used.

On the sign-in form, **Forgot password** accepts the cloud account's email, its saved recovery code and a new password. Successful recovery consumes the code and immediately revokes all sessions on all devices. The user must sign in with the new password and create a new recovery code. Profiles, plans, favorites and private records remain intact. Existing accounts require a successful sign-in to prepare their first code: knowing an email alone cannot reset a password. Local browser accounts are separate and are not reset by this cloud endpoint.

The health endpoint exposes `accountRecoveryConfigured: true` only in the Worker version supporting these routes. After publishing a frontend update, the Git-connected `fishhunt-accounts` Worker also needs its successful deployment before recovery actions become available. Existing sync stays available if an older Worker has not yet deployed.

## API contract

All account routes accept only the existing approved frontend origins and the Worker's own origin. Requests use JSON and an `Authorization: Bearer <token>` header after login. Responses use `Cache-Control: no-store`; account endpoints must never be cached by the offline service worker.

| Route | Request | Result |
| --- | --- | --- |
| `POST /api/account/signup` | `email`, `password`, optional `remember` and safe initial `profile` | HTTP 201 with `token`, `expiresAt`, `user`, `profile`, profile `revision` |
| `POST /api/account/signin` | `email`, `password`, optional `remember` | Same session fields, HTTP 200 |
| `POST /api/account/signout` | Authenticated request | Revokes that actual bearer session |
| `GET /api/account/me` | Authenticated request | Safe account, profile and profile revision |
| `POST /api/account/recovery-code` | Authenticated `password` (current password) | One-time plaintext `recoveryCode`, `recoveryConfigured: true`, safe `user`; previous code invalidated |
| `POST /api/account/recover` | `email`, saved `recoveryCode`, `newPassword` | Password replaced, code consumed and every session revoked; no automatic login |
| `GET /api/account/profile` | Authenticated request | `profile`, `revision`, `savedAt` |
| `PATCH /api/account/profile` | Profile fields and exact `baseRevision` | Updated acknowledged profile and new revision |
| `GET /api/account/state` | Authenticated request | `state` and `revision`, both `null` before first upload |
| `PUT /api/account/state` | `state`, exact `baseRevision` (`null` initially) | Normalized records and new revision |

Profile fields are `displayName`, `avatarId`, `backgroundId`, `nameColor` and `avatarFrame`. All cosmetic IDs are fixed allowlists. Cloud accounts start on **Free**; clients cannot assign themselves a paid plan or copy a local Plus flag into the backend. Paid choices require an authoritative active plan stored by the backend. Achievement frames check the saved personal records, and do not grant a paid plan or a verified public ranking.

Personal state includes `name`, personal unverified `xp`, `favorites`, `plans`, `catches`, optional `catchLog`, `checklists` and `favoriteXpNames`. Badges are derived from those records. The server discards unknown fields, credentials and photo data; photographs remain in the original browser. Limits are 100 favorites, 50 plans, 100 planner catches, 100 catch-log records, 16 checklists with 30 items each, and 100 KB of normalized data. Requests above 160 KB are rejected before parsing.

Each successful update creates an immutable revision, retaining the most recent twenty versions as a private backup. A stale update returns HTTP 409 with `code: "sync_conflict"`, a message and `revisions` containing the latest saved content. The app must ask which version to keep. An explicit resolution may send `resolveRevisions: [latestRevision]` and `baseRevision: null`; it is rejected again if another device changes that revision first. Failed persistence leaves the acknowledged version intact.

Passwords use a random per-account salt and PBKDF2-SHA256 with 100,000 iterations. Tokens use 256 random bits; only token hashes are stored. Sessions expire after one day, or thirty days when Remember me is selected. Session expiry and sign-out are checked by the backend. Authentication and write rates are limited; failed requests do not expose credentials or administrator secrets.

Recovery codes contain 256 random bits, displayed as eight groups of eight hexadecimal characters. Case, hyphens and spaces are ignored when entering them. A domain-separated SHA-256 digest is stored with the account; no plaintext code is persisted. Code setup requires an active bearer session plus the current password and is rate-limited. Public recovery has bounded global, IP and email limits, derives a password hash on both known and unknown emails, and uses the same `invalid_recovery` response for an unknown email, absent code, wrong code or previously used code. A failed attempt never consumes a valid code. Code consumption, the new salted password and a session-version increment share one transaction updating both account indexes. Every authenticated route checks the session version, including legacy sessions (version zero); reset cannot leave another device authenticated. No unbounded session scan is needed. A failed storage transaction preserves the previous password, code and sessions.

A scheduled hourly Durable Object alarm removes expired sessions and authentication rate-limit rows in bounded batches, resuming from a saved cursor. Active sessions, accounts, current snapshots and revision backups are preserved. This prevents unused expired credentials and unique login targets from accumulating indefinitely in free storage.

Tests use an isolated in-memory Durable Object storage adapter and exercise the same exported Worker route. They cover duplicate-email races, password/session handling, revocation/expiry, private data separation, concurrent revision conflicts, storage rollback, Plus and achievement rules, body limits and the existing AI/admin routes. No live test accounts are created by the automated suite.
