# FishHunt AI — real model connection

This branch routes the AI page's chat through the server-side OpenAI Responses API rather than canned answers. The existing topic list remains for suggestions.

## To activate
1. Deploy the existing Node API (server.js) to a public HTTPS backend (e.g. the configured Render service).
2. Set OPENAI_API_KEY in the backend's **private environment variables**. Do not commit or paste it into the public GitHub repository.
3. Optionally set OPENAI_MODEL (default: gpt-4.1-mini).
4. In js/api-config.js set window.GN_API_BASE_URL to the deployed backend HTTPS origin for GitHub Pages.
5. Confirm GN_FRONTEND_ORIGIN matches the web frontend origin (https://niksaniksa25.github.io for GitHub Pages).
6. Open ai.html and send a question.

ChatGPT Plus and OpenAI API billing are separate: cancelling Plus does not disconnect the website AI, but the API needs its own active billing and backend hosting.

There is no live weather data wired into the model yet; it must not claim live conditions. The current UI premium badge is not a secure server authorization check. Before offering AI as paid access, add authoritative account/session verification at /api/ai/chat.

Cost/abuse limits are intentionally conservative and in-memory: 12 calls/hour per apparent IP; 120/day server-wide; maximum 4 concurrent; max 1600 message characters; max 650 response tokens. These are not a replacement for API account spending controls. Environment limits: FISHHUNT_AI_DAILY_REQUEST_LIMIT, FISHHUNT_AI_IP_HOURLY_LIMIT. Conversation sends up to eight earlier turns. store:false is sent to the Responses API.

## Limitations
This PR does not create OpenAI API credentials, activate API billing, provision a Render service or deploy to the existing live site. Without OPENAI_API_KEY the server returns a clear configuration error rather than generating fictional chat responses.
