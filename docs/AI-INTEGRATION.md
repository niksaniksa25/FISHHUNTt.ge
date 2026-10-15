# FishHunt AI — real model connection

The website routes the AI page's chat through the server-side OpenAI Responses API rather than canned answers. The existing topic list remains for suggestions.

## To activate
1. In Render, create a Blueprint from this GitHub repo using render.yaml (paid Starter service and persistent disk are selected in the blueprint). The Node API also serves ai.html directly at the Render service URL.
2. Set OPENAI_API_KEY in the backend's **private environment variables**. Do not commit or paste it into the public GitHub repository.
3. Optionally set OPENAI_MODEL (default: gpt-4.1-mini).
4. To test first, open the Render service's own https://SERVICE-URL/ai.html (the API uses that same origin). To keep GitHub Pages as the website, set window.GN_API_BASE_URL in js/api-config.js to the real deployed HTTPS backend origin.
5. Confirm GN_FRONTEND_ORIGIN matches the web frontend origin (https://niksaniksa25.github.io for GitHub Pages).
6. Open ai.html and send a question.

ChatGPT Plus and OpenAI API billing are separate: cancelling Plus does not disconnect the website AI, but the API needs its own active billing and backend hosting.

There is no live weather data wired into the model yet; it must not claim live conditions. The current UI premium badge is not a secure server authorization check. Before offering AI as paid access, add authoritative account/session verification at /api/ai/chat.

Cost/abuse limits are intentionally conservative and in-memory: 12 calls/hour per apparent IP; 120/day server-wide; maximum 4 concurrent; max 1600 message characters; max 650 response tokens. These are not a replacement for API account spending controls. Environment limits: FISHHUNT_AI_DAILY_REQUEST_LIMIT, FISHHUNT_AI_IP_HOURLY_LIMIT. Conversation sends up to eight earlier turns. store:false is sent to the Responses API.

## Limitations
Adding code to GitHub does not create OpenAI API credentials, activate API billing, provision a Render service or deploy the API. A live backend must be provisioned separately. Without OPENAI_API_KEY the server returns a clear configuration error rather than generating fictional chat responses.


## Zero-cost-setup alternative (free tier, subject to provider limits)

The repo includes `worker/fishhunt-ai.mjs`: a Gemini chat gateway designed for **Cloudflare Workers Free**. It replaces the need for the paid Render Starter server **for AI only**. Billing and product policy can change; confirm both providers' free-tier eligibility and quotas before relying on them. Free tiers are not unlimited or a guaranteed long-term service.

1. Create a free API key at https://aistudio.google.com/apikey . Check that a free-tier Gemini model such as `gemini-2.5-flash-lite` is available in your country/account. Do not activate paid billing if you need zero spend.
2. Sign into https://dash.cloudflare.com/ and create a Worker on the free plan. Paste the source from `worker/fishhunt-ai.mjs` into the editor and deploy it. The Worker must be enabled on its `https://<worker>.<account>.workers.dev` hostname.
3. In **Worker → Settings → Variables and Secrets**, add a **Secret** named `GEMINI_API_KEY` and paste the Google AI Studio API key. Never add this value to GitHub.
4. Open `https://<worker>.<account>.workers.dev/api/health` and confirm `{"ok":true,"configured":true}`.
5. In GitHub repository `js/api-config.js`, replace `window.GN_AI_WORKER_ORIGIN = '';` with `window.GN_AI_WORKER_ORIGIN = 'https://<worker>.<account>.workers.dev';`. This is a public URL, *not* a secret. The rest of the site keeps its existing API settings.
6. Visit the GitHub Pages `ai.html` page, refresh once and ask a question. The site now uses the Worker and your Gemini free-tier API quota.

To customize a non-GitHub Pages frontend origin, add `FISHHUNT_ALLOWED_ORIGINS` on the Worker (comma-separated HTTPS origins). The worker's in-memory per-IP and daily limits reduce simple accidents but do not prevent distributed abuse or provide paid-user entitlements. Set provider-side quotas/budget controls and Cloudflare request rules before public use.

Use the Worker only for AI. Do not switch BOG payments, push, analytics, or donations to this Worker.

If you do not want any accounts, keys, or quotas at all, a cloud-hosted advanced AI is not realistically guaranteed to run for free. Fully local in-browser models are another possibility but are much weaker/slower on phones and require substantial model downloads.


## Free Cloudflare Admin + Feedback (owner setup required)

The same Cloudflare Worker now supports server-verified administrator login, feedback storage, and feedback management. It is independent of the paid Node.js API and existing Gemini AI.

1. In the Cloudflare dashboard open Storage & databases -> KV and create a KV namespace named fishhunt-admin.
2. Open Workers & Pages -> fishhunt-ai -> Settings -> Bindings -> Add binding -> KV namespace. Select fishhunt-admin. The variable name MUST be exactly ADMIN_KV.
3. Open Settings -> Variables and Secrets -> Add. Add type Secret, name ADMIN_PASSWORD, value a NEW private strong password at least 12 characters long. Do not put it in GitHub, share it in chat, or remove the existing GEMINI_API_KEY.
4. Open Edit code on fishhunt-ai. Replace the entire editor with the latest code at https://github.com/niksaniksa25/FISHHUNTt.ge/blob/main/worker/fishhunt-ai.mjs and click Deploy. GitHub changes alone cannot deploy the Worker.
5. Open https://fishhunt-ai.bsloveer25.workers.dev/api/health and confirm adminConfigured: true (plus configured: true for Gemini).
6. Visit https://niksaniksa25.github.io/FISHHUNTt.ge/admin.html and sign in with the new ADMIN_PASSWORD. The user-facing website already points to the Worker public URL.
7. Submit a test feedback message and confirm its arrival in the Admin inbox.

Limitations: old Node accounts, visitor analytics, and Bank of Georgia purchases do NOT move to this Worker; those figures are shown as unavailable. This change supports a live KV-stored feedback inbox, authenticated sessions, and mark-read/resolved. Cloudflare KV free limits and eventual consistency apply; the feedback list currently scans at most 300 records. Auth tokens are held in sessionStorage/localStorage depending on Remember me. Client-side premium UI gating is not authoritative paid entitlement. Set rate limits and optional Turnstile before significant public traffic.
