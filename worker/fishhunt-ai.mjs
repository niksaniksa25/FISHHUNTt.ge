// FishHunt AI: independent free-tier edge backend for Cloudflare Workers.
// Requires a privately stored GEMINI_API_KEY set in the Cloudflare dashboard.
// No API key is ever sent to the visitor's browser or committed to GitHub.

const limitsByIP = new Map();
let globalCounter = {day: "", count: 0};

const SYSTEM_PROMPT = [
  "You are FishHunt AI, an intelligent Georgian-language fishing and nature assistant.",
  "Talk naturally, analyze a user's question and keep track of context.",
  "Discuss fish, lakes, weather, fishing tackle, responsible hunting and Georgian wildlife.",
  "Never invent live weather measurements, lake stock levels, fish catch percentages,",
  "current legal seasons, protected species permissions or an official source.",
  "No live website data is connected. Explain this when a question needs current data.",
  "If the user asks about a law or season, recommend checking the current official rules.",
  "Be practical, friendly and concise. Respond in Georgian unless asked otherwise."
].join(" ");

function headersFor(origin, permitted) {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin"
  });
  if (permitted && origin) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return h;
}

function json(body, status, origin, allowed) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headersFor(origin, allowed)
  });
}
function allowedOrigin(origin, env) {
  const origins = new Set(["https://niksaniksa25.github.io"]);
  for (const item of String(env.FISHHUNT_ALLOWED_ORIGINS || "").split(",")) {
    const candidate = item.trim().replace(/\/+$/, "");
    if (/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(candidate)) origins.add(candidate);
  }
  return Boolean(origin && origins.has(origin.replace(/\/+$/, "")));
}
function trimText(text, maximum) {
  return typeof text === "string" ? text.trim().slice(0, maximum) : "";
}
function getLimit(name, env, fallback, maximum) {
  const n = Number(env[name]);
  return Number.isInteger(n) && n > 0 && n <= maximum ? n : fallback;
}
function isRateLimited(request, env) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (globalCounter.day !== day) globalCounter = {day, count: 0};
  if (globalCounter.count >= getLimit("AI_DAILY_LIMIT", env, 100, 10000)) return true;
  const ip = (request.headers.get("CF-Connecting-IP") || "unknown").slice(0, 80);
  if (limitsByIP.size > 2000) {
    for (const [k, v] of limitsByIP) if (v.resetAt <= now) limitsByIP.delete(k);
  }
  const old = limitsByIP.get(ip);
  const count = old && old.resetAt > now ? old : {count: 0, resetAt: now + 3600000};
  if (count.count >= getLimit("AI_IP_HOURLY_LIMIT", env, 10, 1000)) return true;
  count.count++;
  limitsByIP.set(ip, count);
  globalCounter.count++;
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const permitted = allowedOrigin(origin, env);
    const backendOrigin = new URL(request.url).origin;
    const firstParty = origin === backendOrigin;
    const allowed = permitted || firstParty;

    if (request.method === "OPTIONS") {
      return allowed ? new Response(null, {status: 204, headers: headersFor(origin, allowed)})
        : json({ok: false, message: "Origin not permitted"}, 403, origin, false);
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ok: true, service: "FishHunt AI", configured: Boolean(env.GEMINI_API_KEY)}, 200, origin, allowed);
    }
    if (url.pathname !== "/api/ai/chat") return json({ok: false, message: "Not found"}, 404, origin, allowed);
    if (request.method !== "POST") return json({ok: false, message: "Method not allowed"}, 405, origin, allowed);
    if (!allowed) return json({ok: false, message: "Origin not permitted"}, 403, origin, false);
    if (!String(request.headers.get("Content-Type") || "").startsWith("application/json")) {
      return json({ok: false, message: "Expected JSON"}, 415, origin, allowed);
    }
    const key = String(env.GEMINI_API_KEY || "").trim();
    if (!key) return json({ok: false, message: "უფასო AI გასააქტიურებელია: GEMINI_API_KEY არ არის დაყენებული."}, 503, origin, allowed);
    if (Number(request.headers.get("Content-Length") || 0) > 16000) {
      return json({ok: false, message: "Too much text"}, 413, origin, allowed);
    }

    let payload;
    try {
      const input = await request.text();
      if (input.length > 16000) return json({ok: false, message: "Too much text"}, 413, origin, allowed);
      payload = JSON.parse(input);
    } catch {
      return json({ok: false, message: "არასწორი შეკითხვის ფორმატი."}, 400, origin, allowed);
    }
    const message = trimText(payload?.message, 1601);
    if (!message || message.length > 1600) {
      return json({ok: false, message: "მომწერე შეკითხვა (მაქსიმუმ 1600 სიმბოლო)."}, 400, origin, allowed);
    }
    if (payload.history !== undefined && !Array.isArray(payload.history)) {
      return json({ok: false, message: "Invalid conversation history"}, 400, origin, allowed);
    }
    if (isRateLimited(request, env)) return json({
      ok: false, message: "უფასო AI-ის დროებითი ლიმიტი ამოიწურა. სცადე მოგვიანებით."
    }, 429, origin, allowed);

    const previous = (payload.history || []).slice(-8).filter(turn =>
      turn && ["user", "assistant"].includes(turn.role) && typeof turn.content === "string"
    ).map(turn => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{text: trimText(turn.content, 1200)}]
    })).filter(turn => turn.parts[0].text);
    const entity = trimText(payload.context?.entity, 100);
    const category = trimText(payload.context?.category, 40);
    const contextualPrompt = category || entity ?
      "The site UI selection is not authoritative: category=" + category + ", entity=" + entity + "." : "";
    const model = String(env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
    if (!/^[A-Za-z0-9_.-]{3,80}$/.test(model)) {
      return json({ok: false, message: "AI-ის მოდელის პარამეტრი არასწორია."}, 503, origin, allowed);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 23000);
    try {
      const upstream = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
        {
          method: "POST",
          headers: {"Content-Type": "application/json", "x-goog-api-key": key},
          body: JSON.stringify({
            systemInstruction: {parts: [{text: SYSTEM_PROMPT + (contextualPrompt ? " " + contextualPrompt : "")}]},
            contents: [...previous, {role: "user", parts: [{text: message}]}],
            generationConfig: {maxOutputTokens: 700, temperature: 0.5}
          }),
          signal: controller.signal
        }
      );
      if (!upstream.ok) {
        console.error("FishHunt AI Gemini status:", upstream.status);
        const exhausted = upstream.status === 429;
        return json({ok: false, message: exhausted ?
          "AI-ის უფასო ლიმიტი ამოიწურა. მოგვიანებით სცადე." :
          "AI ამჟამად მიუწვდომელია. გადაამოწმე უფასო API-ის გასაღები, მოდელი და ლიმიტები."
        }, exhausted ? 429 : 503, origin, allowed);
      }
      const result = await upstream.json();
      const answer = (result?.candidates?.[0]?.content?.parts || [])
        .map(part => typeof part.text === "string" ? part.text : "").join("\n").trim();
      if (!answer) return json({
        ok: false, message: "AI-მ პასუხი ვერ დააბრუნა. სხვანაირად დასვი კითხვა."
      }, 503, origin, allowed);
      return json({ok: true, answer: answer.slice(0, 5500)}, 200, origin, allowed);
    } catch (error) {
      console.error("FishHunt AI gateway error:", error.name);
      return json({ok: false, message: "AI-სთან კავშირი ვერ შედგა. სცადე ხელახლა."}, 503, origin, allowed);
    } finally {
      clearTimeout(timer);
    }
  }
};
