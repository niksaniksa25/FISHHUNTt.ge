'use strict';

// Server-side OpenAI Responses API adapter. Never embed secrets in static assets.
const requestCounts = new Map();
let daily = {day: '', count: 0};
let inflight = 0;
const SYSTEM_INSTRUCTIONS = [
  'You are FishHunt AI, a helpful assistant for Georgian fishing, nature and wildlife.',
  'Speak in Georgian by default; switch language only when asked.',
  'Use supplied conversation context to answer follow-up questions.',
  'Do not fabricate observations, current weather, official hunting seasons,',
  'fish presence at a lake, permits, or precise catch probability.',
  'If no live data is supplied, say that you do not have live observations.',
  'Selected category or entity is user-provided, not authoritative site data.',
  'For legal restrictions, remind users to verify current official Georgian rules.',
  'Promote safe and legal outdoor activity. Be clear, concise and practical.'
].join(' ');

function intSetting(name, fallback, min, max) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function messageString(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function extractText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const output = Array.isArray(data.output) ? data.output : [];
  return output.flatMap(item => Array.isArray(item.content) ? item.content : [])
    .filter(part => part && part.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text).join('\n').trim();
}
function ratePermit(req) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (daily.day !== day) daily = {day, count: 0};
  if (daily.count >= intSetting('FISHHUNT_AI_DAILY_REQUEST_LIMIT', 120, 1, 100000) || inflight >= 4) return false;
  // The global cap matters because proxies can accept spoofed X-Forwarded-For.
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const address = (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 70);
  if (requestCounts.size > 10000) {
    for (const [key, entry] of requestCounts) if (entry.expires <= now) requestCounts.delete(key);
  }
  const previous = requestCounts.get(address);
  const entry = previous && previous.expires > now ? previous : {count: 0, expires: now + 3600000};
  if (entry.count >= intSetting('FISHHUNT_AI_IP_HOURLY_LIMIT', 12, 1, 10000)) return false;
  entry.count++;
  requestCounts.set(address, entry);
  daily.count++;
  inflight++;
  return true;
}
async function handleAiChat(req, res, {readBody, json, originIsAllowed}) {
  if (req.method !== 'POST') return json(res, 405, {ok: false, message: 'Method not allowed'});
  const origin = String(req.headers.origin || '');
  if (!origin || !originIsAllowed(origin)) return json(res, 403, {ok: false, message: 'Origin not allowed'});
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return json(res, 415, {ok: false, message: 'JSON required'});
  }
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return json(res, 503, {ok: false, message: 'AI ჯერ არ არის ჩართული სერვერზე (API გასაღები აკლია).'});
  let payload;
  try { payload = await readBody(req); }
  catch { return json(res, 400, {ok: false, message: 'შეკითხვის ფორმატი არასწორია.'}); }
  const message = messageString(payload && payload.message, 1601);
  if (!message || message.length > 1600) return json(res, 400, {ok: false, message: 'შეკითხვა უნდა შეიცავდეს 1–1600 სიმბოლოს.'});
  if (payload.history !== undefined && !Array.isArray(payload.history)) {
    return json(res, 400, {ok: false, message: 'Invalid conversation'});
  }
  const previous = (payload.history || []).slice(-8)
    .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .map(item => ({role: item.role, content: messageString(item.content, 1200)}))
    .filter(item => item.content);
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};
  const category = messageString(context.category, 40);
  const entity = messageString(context.entity, 100);
  if (!ratePermit(req)) return json(res, 429, {ok: false, message: 'AI-ის დროებითი ლიმიტი ამოიწურა. სცადე მოგვიანებით.'});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const input = [
      {role: 'system', content: SYSTEM_INSTRUCTIONS},
      ...(category || entity ? [{role: 'system', content: 'Unverified UI selection: category=' + category + '; entity=' + entity}] : []),
      ...previous, {role: 'user', content: message}
    ];
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input,
        max_output_tokens: 650,
        store: false
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error('FishHunt AI upstream status:', response.status);
      return json(res, response.status === 429 ? 429 : 503, {
        ok: false, message: 'AI მოდელი დროებით მიუწვდომელია. გადაამოწმე API ბალანსი და სერვერის პარამეტრები.'
      });
    }
    const result = await response.json();
    const answer = extractText(result);
    if (!answer) return json(res, 503, {ok: false, message: 'AI-მ პასუხი ვერ დააბრუნა. სცადე ხელახლა.'});
    return json(res, 200, {ok: true, answer});
  } catch (error) {
    console.error('FishHunt AI request failed:', error.name || 'error');
    return json(res, 503, {ok: false, message: 'AI-თან კავშირი ვერ შედგა. სცადე ხელახლა.'});
  } finally {
    clearTimeout(timeout);
    inflight = Math.max(0, inflight - 1);
  }
}
module.exports = {handleAiChat, extractText};
