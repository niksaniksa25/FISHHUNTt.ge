# FishHunt AI deployment

GitHub Pages serves the website. The existing `fishhunt-ai.bsloveer25.workers.dev` Cloudflare Worker provides Gemini chat, fish-photo analysis, administrator access and anonymous visitor counts. A separate `fishhunt-accounts` Worker stores synchronized accounts. The public service addresses are already configured in `js/api-config.js`; API keys and administrator passwords never belong in that file.

## Update the existing AI Worker from GitHub

The repository-root `wrangler.toml` declares `name = "fishhunt-ai"` and `main = "worker/fishhunt-ai.mjs"`. The normal repository-root command is:

```sh
npx wrangler deploy
```

This bundles the Worker and its imported fish catalogue together. In the existing **Workers & Pages → fishhunt-ai → Settings → Builds** project, use the repository root `/`, leave the Build command empty, and use **`npx wrangler deploy`** as the Deploy command. A successful Git-connected build publishes the selected commit; publishing GitHub Pages alone does not prove that the AI Worker deployed.

Before this configuration existed, the same root command had no Worker entry point and failed with `Missing entry-point to Worker script or to assets directory`. GitHub's Cloudflare check links to the private build log; if a build still fails, inspect that log for the actual current error rather than assuming every failure has the same cause.

The existing dashboard configuration is retained:

- `keep_vars = true` preserves ordinary dashboard variables such as `GEMINI_MODEL`, allowed origins and request limits.
- `unsafe.metadata.keep_bindings` asks the Cloudflare upload API to retain existing `plain_text`, `json`, `secret_text`, `secret_key` and `kv_namespace` bindings. This retains the existing `ADMIN_KV` binding without copying or guessing its namespace ID.
- No replacement KV namespace is created, and no private key or password is included in the repository. Keep the existing `GEMINI_API_KEY`, `ADMIN_PASSWORD` and `ADMIN_KV` attached to **fishhunt-ai**.

Wrangler labels raw upload metadata as experimental. The preservation payload has been checked against Wrangler 4.152's generated multipart metadata, not merely its TOML parser. Review this setting when changing deployment tooling or intentionally changing bindings; `--keep-vars` by itself does **not** preserve KV bindings.

The current source imports `worker/fish-catalog.mjs`. Pasting only `worker/fishhunt-ai.mjs` into the dashboard's single-file editor is no longer a complete deployment. Use the Git-connected repository build, or bundle all modules with Wrangler before a manual upload.

The accounts project remains separate. Its deploy command must explicitly use its own config when running at the repository root:

```sh
npx wrangler deploy --config cloudflare/accounts/wrangler.toml
```

Alternatively, use `cloudflare/accounts` as that project's root directory and `npx wrangler deploy` there. The root AI configuration does not replace the accounts configuration or its SQLite Durable Object migration.

## Check the published version

Open `https://fishhunt-ai.bsloveer25.workers.dev/api/health`. `configured: true` means the Gemini key is present. `photoConfigured: true` means the deployed version includes the photo route and has its Gemini key. These flags do not prove that the provider's model, regional availability or quota will accept every request. `adminConfigured: true` requires both the existing administrator binding and a sufficiently long private password; `analyticsConfigured: true` requires that binding.

After deployment, refresh the website. Chat uses `/api/ai/chat`; the photo widget sends an explicitly selected, resized photo to `/api/ai/identify-photo` only after the visitor presses its analysis button. See [photo behavior and limits](PHOTO-AI-KA.md). Images are not saved to account storage or visitor analytics.

Gemini's model defaults to `gemini-2.5-flash-lite`; the private Worker variable `GEMINI_MODEL` can select another model available to the owner's Google AI Studio project. Model availability and provider quotas can change. A model or quota error must remain an error, not a fabricated answer or identification. Do not send keys or passwords in chat, issues or screenshots of unmasked settings.

## Existing administrator and analytics storage

`ADMIN_KV` is the existing `fishhunt-admin` KV namespace. It stores server-verified administrator sessions, feedback and counted visitor IDs. Keep it attached when publishing AI changes. Administrator access also requires the private `ADMIN_PASSWORD` secret, at least 12 characters long.

Anonymous visits begin only after the counting Worker version is deployed. Counts represent unique browser IDs per Asia/Tbilisi calendar day and since installation, not verified people or reconstructed historical traffic. No raw IPs, emails or names are stored in visit records. A new browser may use two KV writes; provider free-tier quotas and eventual consistency still apply. Totals that exceed the bounded scan are reported unavailable rather than truncated into a false count. Public website feedback continues to use the configured GitHub Issues flow; the assistant's tests do not create public feedback.

## Optional Node backend

The Node server also provides a text-chat route through OpenAI Responses when its private `OPENAI_API_KEY` is configured; `OPENAI_MODEL` is optional. That is independent of this Cloudflare Gemini deployment and requires an actual public Node service if used with GitHub Pages. ChatGPT subscriptions do not supply website API credentials. No new hosting, billing or provider account is provisioned by committing website code.

The browser's premium UI is not authoritative server-side billing authorization. Keep provider quotas and request limits configured, and do not claim that the model receives current weather, legal permission or private account records unless those data are explicitly connected by the corresponding feature.
