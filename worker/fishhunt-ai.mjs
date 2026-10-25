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
    h.set("Access-Control-Allow-Methods", "POST, GET, PATCH, PUT, DELETE, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
      return json({ok:true,service:"FishHunt AI",configured:Boolean(env.GEMINI_API_KEY),
        adminConfigured:Boolean(env.ADMIN_KV && String(env.ADMIN_PASSWORD||"").length>=12),
        analyticsConfigured:Boolean(env.ADMIN_KV),accountConfigured:Boolean(env.FISHHUNT_ACCOUNTS),
        accountRecoveryConfigured:Boolean(env.FISHHUNT_ACCOUNTS)},200,origin,allowed);
    }
    if (url.pathname.startsWith("/api/account/")) {
      if (!allowed) return json({ok:false,message:"Origin not permitted"},403,origin,false);
      if (!env.FISHHUNT_ACCOUNTS) return json({ok:false,code:"account_not_configured",message:"ანგარიშების სინქრონიზაცია ჯერ არ არის ჩართული."},503,origin,true);
      try {
        // Durable Objects serialize credential creation and revision checks. KV alone
        // cannot safely enforce account uniqueness across different edge locations.
        let forwarded=request;
        if(!["GET","HEAD"].includes(request.method)){
          // Consume the HTTP body before the RPC boundary. Returning early from
          // a DO (for example sign-out or expired auth) must not leave a proxied
          // request stream attempting to drain after its response was sent.
          const input=await accountInput(request,/\/(?:signup|signin|recover|recovery-code)$/.test(url.pathname)?8000:160000);
          forwarded=new Request(request,{body:JSON.stringify(input)});
        }
        const id=env.FISHHUNT_ACCOUNTS.idFromName("fishhunt-accounts-v1");
        const response=await env.FISHHUNT_ACCOUNTS.get(id).fetch(forwarded);
        const headers=headersFor(origin,true);
        return new Response(response.body,{status:response.status,headers});
      } catch (error) {
        if(error instanceof AccountError)return json({ok:false,code:error.code,message:error.message,...error.extra},error.status,origin,true);
        console.error("Account service failed:",error.name);
        return json({ok:false,code:"account_unavailable",message:"ანგარიშების სერვერთან კავშირი ვერ მოხერხდა. შენახული მონაცემები უცვლელია."},503,origin,true);
      }
    }
    if (url.pathname === "/api/analytics/visit") {
      try {return await recordVisitor(request,env,origin,allowed);}
      catch(error){console.error("Analytics visit failed:",error.name);return json({ok:false,message:"ვიზიტის დაფიქსირება ამჟამად ვერ მოხერხდა."},503,origin,allowed);}
    }
    if (url.pathname.startsWith("/api/admin/") || url.pathname === "/api/feedback") {
      try {return await handleAdminApi(request,env,url,origin,allowed);}
      catch(error){console.error("Admin API failed:",error.name);return json({ok:false,message:"Admin სერვერის შეცდომა."},503,origin,allowed);}
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


// Cloudflare KV admin / feedback extension.
// ADMIN_PASSWORD is a private Worker Secret, ADMIN_KV is a KV namespace binding.
// No passwords or sessions are stored in GitHub Pages JavaScript.
const feedbackLimits = new Map();
const loginLimits = new Map();
function ipFor(req){return String(req.headers.get("CF-Connecting-IP") || "unknown").slice(0,80);}
function inMemoryLimit(map, req, count, windowMs) {
  const now=Date.now(), key=ipFor(req);
  if(map.size>2000) for(const [k,v] of map) if(v.expires<now) map.delete(k);
  const rec=map.get(key);
  const next=rec && rec.expires>now ? rec : {hits:0,expires:now+windowMs};
  next.hits++; map.set(key,next);
  return next.hits>count;
}
function bytesHex(bytes){return Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");}
async function sha256(data){return bytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(data))));}
async function safePasswordMatch(attempt,correct){
  const a=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(attempt)));
  const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(correct)));
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
async function adminSession(req,env){
  const header=String(req.headers.get("Authorization")||"");
  const match=/^Bearer ([0-9a-f]{64})$/.exec(header);
  if(!match || !env.ADMIN_KV) return null;
  const id=await sha256(match[1]);
  const found=await env.ADMIN_KV.get("admin:session:"+id);
  return found ? id : null;
}
async function jsonInput(req,max=8000){
  if(!String(req.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json"))return null;
  if(Number(req.headers.get("Content-Length")||0)>max)return null;
  const text=await req.text();
  if(text.length>max)return null;
  try{const result=JSON.parse(text);return result&&typeof result==="object"&&!Array.isArray(result)?result:null;}
  catch{return null;}
}
function adminReply(body,status,origin,allowed){return json(body,status,origin,allowed);}
async function handleAdminApi(req,env,url,origin,allowed){
  if(!allowed)return adminReply({ok:false,message:"Origin not permitted"},403,origin,false);
  const route=url.pathname;
  const configured=Boolean(env.ADMIN_KV && typeof env.ADMIN_PASSWORD==="string" && env.ADMIN_PASSWORD.length>=12);
  if(!configured)return adminReply({ok:false,message:"Admin ჯერ არ არის ჩართული: დააყენე ADMIN_KV და ADMIN_PASSWORD Cloudflare-ში."},503,origin,true);
  if(route==="/api/admin/login"){
    if(req.method!=="POST")return adminReply({ok:false,message:"Method not allowed"},405,origin,true);
    if(inMemoryLimit(loginLimits,req,10,15*60*1000))
      return adminReply({ok:false,message:"ბევრი მცდელობაა. სცადე მოგვიანებით."},429,origin,true);
    const lockKey="admin:lock:"+await sha256(ipFor(req));
    const fails=Number(await env.ADMIN_KV.get(lockKey)||0);
    if(fails>=6)return adminReply({ok:false,message:"შესვლა დროებით დაბლოკილია. სცადე 15 წუთში."},429,origin,true);
    const b=await jsonInput(req,1024);
    const password=typeof b?.password==="string"?b.password:"";
    if(!password || password.length>256 || !(await safePasswordMatch(password,env.ADMIN_PASSWORD))){
      await env.ADMIN_KV.put(lockKey,String(fails+1),{expirationTtl:900});
      return adminReply({ok:false,message:"Admin პაროლი არასწორია."},401,origin,true);
    }
    await env.ADMIN_KV.delete(lockKey);
    const token=bytesHex(crypto.getRandomValues(new Uint8Array(32)));
    const ttl=b.remember!==false ? 7*24*60*60 : 8*60*60;
    await env.ADMIN_KV.put("admin:session:"+await sha256(token),"1",{expirationTtl:ttl});
    return adminReply({ok:true,token,expiresAt:Date.now()+ttl*1000},200,origin,true);
  }
  if(route==="/api/feedback"){
    if(req.method!=="POST")return adminReply({ok:false,message:"Method not allowed"},405,origin,true);
    if(inMemoryLimit(feedbackLimits,req,3,60*60*1000))return adminReply({ok:false,message:"ბევრი შეტყობინებაა. სცადე მოგვიანებით."},429,origin,true);
    const b=await jsonInput(req,7500);
    const message=typeof b?.message==="string"?b.message.trim():"";
    const category=String(b?.category||"other");
    const email=typeof b?.email==="string"?b.email.trim().slice(0,160):"";
    if(!message || message.length>4000 || !["bug","idea","question","other"].includes(category) || (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))){
      return adminReply({ok:false,message:"შეტყობინება ან ელფოსტა არასწორია."},400,origin,true);
    }
    const id=crypto.randomUUID(), item={
      id,category,message,email,page:String(b?.page||b?.path||"/").slice(0,250),
      createdAt:Date.now(),updatedAt:Date.now(),status:"new"
    };
    await env.ADMIN_KV.put("admin:feedback:"+id,JSON.stringify(item));
    return adminReply({ok:true,id,message:"შეტყობინება შენახულია."},201,origin,true);
  }
  if(!route.startsWith("/api/admin/"))return adminReply({ok:false,message:"Not found"},404,origin,true);
  const sessionId=await adminSession(req,env);
  if(route==="/api/admin/me"&&req.method==="GET")return adminReply({ok:true,admin:Boolean(sessionId)},200,origin,true);
  if(!sessionId)return adminReply({ok:false,message:"Admin access required."},401,origin,true);
  if(route==="/api/admin/logout"&&req.method==="POST"){
    await env.ADMIN_KV.delete("admin:session:"+sessionId);
    return adminReply({ok:true},200,origin,true);
  }
  if(route==="/api/admin/stats"&&req.method==="GET"){
    // Count real browser-originated analytics events in KV (no invented values).
    // Never mistake this for verified human identities or payment data.
    const now=Date.now();
    const today=georgiaDay(now),yesterday=georgiaDay(now-86400000);
    const [todayCount,yesterdayCount,allTimeCount]=await Promise.all([
      countAnalyticsKeys(env.ADMIN_KV,"analytics:day:"+today+":"),
      countAnalyticsKeys(env.ADMIN_KV,"analytics:day:"+yesterday+":"),
      countAnalyticsKeys(env.ADMIN_KV,"analytics:unique:")
    ]);
    return adminReply({ok:true,stats:{
      visitorsToday:todayCount,visitorsYesterday:yesterdayCount,
      uniqueVisitors:allTimeCount,analyticsDay:today,
      // No Node API, purchases, or user database is attached to this Worker.
      pageViews:null,registrations:null,logins:null,
      purchases:null,revenue:null,activePlans:null,orders:null,
      recent:[],recentPurchases:[],recentPageViews:[],recentInviteOpens:[],
      purchasesByPlan:{},statsUnavailable:true,visitorAnalyticsAvailable:true,
      analyticsLimited:todayCount===null||yesterdayCount===null||allTimeCount===null
    }},200,origin,true);
  }
  if(route==="/api/admin/feedback"&&req.method==="GET"){
    const listed=await env.ADMIN_KV.list({prefix:"admin:feedback:",limit:300});
    const items=(await Promise.all(listed.keys.map(item=>env.ADMIN_KV.get(item.name,"json")))).filter(Boolean)
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const filter=url.searchParams.get("status")||"all";
    return adminReply({ok:true,items:filter==="all"?items:items.filter(item=>item.status===filter),
      counts:{all:items.length,new:items.filter(x=>x.status==="new").length,read:items.filter(x=>x.status==="read").length,resolved:items.filter(x=>x.status==="resolved").length},
      truncated:!listed.list_complete
    },200,origin,true);
  }
  if(route==="/api/admin/feedback/status"&&req.method==="PATCH"){
    const b=await jsonInput(req,1024), id=String(b?.id||""),status=String(b?.status||"");
    if(!/^[0-9a-f-]{36}$/.test(id)||!["new","read","resolved"].includes(status))
      return adminReply({ok:false,message:"Invalid feedback update"},400,origin,true);
    const key="admin:feedback:"+id,previous=await env.ADMIN_KV.get(key,"json");
    if(!previous)return adminReply({ok:false,message:"Feedback ვერ მოიძებნა."},404,origin,true);
    const updated={...previous,status,updatedAt:Date.now()};
    await env.ADMIN_KV.put(key,JSON.stringify(updated));
    return adminReply({ok:true,item:updated},200,origin,true);
  }
  return adminReply({ok:false,message:"Not found"},404,origin,true);
}


// Anonymous visit counting begins only once the updated Worker is deployed.
// Uses Asia/Tbilisi calendar days, and one KV record per visitor/day plus
// one per never-before-seen visitor (not raw IPs, names, or emails).
const visitLimits=new Map();
function georgiaDay(ms) {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Tbilisi",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date(ms));
  const get=type=>parts.find(p=>p.type===type).value;
  return get("year")+"-"+get("month")+"-"+get("day");
}
async function countAnalyticsKeys(store,prefix) {
  let cursor=undefined,total=0;
  // Never silently report truncated counts as exact.
  for(let page=0;page<10;page++){
    const result=await store.list({prefix,limit:1000,...(cursor?{cursor}:{})});
    total+=result.keys.length;
    if(result.list_complete===true)return total;
    if(!result.cursor)return null;
    cursor=result.cursor;
  }
  return null;
}
async function recordVisitor(req,env,origin,allowed) {
  if(!allowed)return json({ok:false,message:"Origin not permitted"},403,origin,false);
  if(req.method!=="POST")return json({ok:false,message:"Method not allowed"},405,origin,true);
  if(!env.ADMIN_KV)return json({ok:false,message:"Analytics storage not configured"},503,origin,true);
  if(inMemoryLimit(visitLimits,req,90,3600000))
    return json({ok:false,message:"Too many visit requests"},429,origin,true);
  const data=await jsonInput(req,1024);
  const visitorId=typeof data?.visitorId==="string"?data.visitorId:"";
  const page=typeof data?.path==="string"?data.path:"";
  if(!/^[A-Za-z0-9_-]{16,80}$/.test(visitorId)||
     !/^\/FISHHUNTt\.ge\/[A-Za-z0-9_./-]{0,160}$/.test(page)||
     page.includes(".."))
    return json({ok:false,message:"Invalid visit"},400,origin,true);
  const hash=await sha256(visitorId);
  const day=georgiaDay(Date.now());
  const dayKey="analytics:day:"+day+":"+hash;
  // Two writes on a visitor's first day; just one on subsequent days.
  // KV Free plan has daily write/read limits; counters are not fabricated on failure.
  const existing=await env.ADMIN_KV.get(dayKey);
  if(existing)return json({ok:true,recorded:false},200,origin,true);
  await env.ADMIN_KV.put(dayKey,"1",{expirationTtl:400*86400});
  const uniqueKey="analytics:unique:"+hash;
  const ever=await env.ADMIN_KV.get(uniqueKey);
  if(!ever)await env.ADMIN_KV.put(uniqueKey,"1");
  return json({ok:true,recorded:true},201,origin,true);
}

// Private account service. Deploy with the SQLite Durable Object binding
// FISHHUNT_ACCOUNTS; existing AI/admin KV data is never read or written here.
// A single named object is intentional: account creation, password checks and
// optimistic revision checks must share one strongly consistent writer.
const ACCOUNT_COLORS = new Set(['default','mint','gold','sky','aqua','rose','lavender','coral']);
const ACCOUNT_FRAMES = new Set(['none','first-catch','explorer','champion','aurora','copper']);
const ACCOUNT_AVATARS = new Set(['free-fish','free-leaf','free-camp','free-fox','free-wave','free-ranger','plus-eagle','plus-wolf','plus-bear','plus-deer','plus-fishing','plus-compass','plus-canyon','plus-svaneti','plus-ranger','plus-nocturne','plus-fish-photo','plus-reel-photo','plus-hunt-photo','plus-football']);
const ACCOUNT_BACKGROUNDS = new Set(['bg-fishing-lake','bg-fishing-rod','bg-fish','bg-forest','bg-mountains','bg-lake','bg-football']);
const ACCOUNT_DEFAULT_PROFILE = {displayName:'მკვლევარი',avatarId:'free-fish',backgroundId:'bg-fishing-lake',nameColor:'default',avatarFrame:'none'};
const ACCOUNT_PBKDF2_ITERATIONS=100000;
class AccountError extends Error {
  constructor(status,message,code='account_error',extra={}){super(message);this.status=status;this.code=code;this.extra=extra;}
}
function accountResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function accountText(value,max){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';}
function accountObject(value){return Boolean(value&&typeof value==='object'&&!Array.isArray(value));}
function accountEmail(value){return accountText(value,255).toLowerCase();}
function validAccountEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254;}
function accountRandom(bytes=32){const data=new Uint8Array(bytes);crypto.getRandomValues(data);return bytesHex(data);}
async function accountPassword(password,salt){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:ACCOUNT_PBKDF2_ITERATIONS,hash:'SHA-256'},key,256);
  return bytesHex(new Uint8Array(bits));
}
function accountConstantEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function accountPlus(user){const expires=Number(user.planExpiresAt||0);return user.role==='admin'||(['plus','pro'].includes(user.plan)&&Number.isFinite(expires)&&(!expires||expires>Date.now()));}
function accountProfile(user){const p={...ACCOUNT_DEFAULT_PROFILE,...user.profile};if(!ACCOUNT_COLORS.has(p.nameColor)||!accountPlus(user))p.nameColor='default';if(!ACCOUNT_FRAMES.has(p.avatarFrame)||(['aurora','copper'].includes(p.avatarFrame)&&!accountPlus(user)))p.avatarFrame='none';return p;}
function accountPublicUser(user){return {id:user.id,email:user.email,createdAt:user.createdAt,plan:accountPlus(user)?user.plan:'free',planExpiresAt:user.planExpiresAt||null,recoveryConfigured:Boolean(user.recoveryHash),...accountProfile(user)};}
function accountSessionVersion(value){return Number.isSafeInteger(value)&&value>=0?value:0;}
function accountRecoveryCode(value){return typeof value==='string'&&value.length<=128?value.replace(/[\s-]/g,'').toLowerCase():'';}
async function accountInput(request,max=160000){
  if(!String(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))throw new AccountError(415,'საჭიროა JSON ფორმატი.');
  const claimed=Number(request.headers.get('Content-Length')||0);if(claimed>max)throw new AccountError(413,'მონაცემების ზომა ზედმეტად დიდია.');
  const reader=request.body?.getReader();if(!reader)throw new AccountError(400,'მონაცემები არასწორია.');
  const parts=[];let length=0;while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>max){await reader.cancel();throw new AccountError(413,'მონაცემების ზომა ზედმეტად დიდია.');}parts.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AccountError(400,'მონაცემები არასწორია.');}
  if(!accountObject(data))throw new AccountError(400,'მონაცემები არასწორია.');return data;
}
function accountList(value,max,label){if(value===undefined)return [];if(!Array.isArray(value)||value.length>max)throw new AccountError(400,label+' სია ზედმეტად დიდია ან არასწორია.');return value;}
function accountStateText(value,max,label){if(value===undefined||value===null)return '';if(typeof value!=='string'||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new AccountError(400,label+' არასწორია.');if(value.length>max)throw new AccountError(400,label+' მაქსიმუმ '+max+' სიმბოლოს უნდა შეიცავდეს.');return value;}
function accountStringList(value,max,width,label){const out=[];for(const item of accountList(value,max,label)){if(typeof item!=='string')throw new AccountError(400,label+' სია არასწორია.');const text=accountStateText(item,width,label).trim();if(text&&!out.some(old=>old.toLowerCase()===text.toLowerCase()))out.push(text);}return out;}
function accountDate(value){const text=accountStateText(value,10,'თარიღი');if(!text)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text+'T12:00:00Z'))||new Date(text+'T12:00:00Z').toISOString().slice(0,10)!==text)throw new AccountError(400,'ჩანაწერის თარიღი არასწორია.');return text;}
function accountNumber(value,max=10000){if(value===undefined||value===null||value==='')return '';const number=Number(value);if(!Number.isFinite(number)||number<0||number>max)throw new AccountError(400,'ჩანაწერის რიცხვითი მნიშვნელობა არასწორია.');return number;}
function accountRecordId(value){const text=accountStateText(value,80,'ჩანაწერის ID');if(!text)throw new AccountError(400,'ჩანაწერს იდენტიფიკატორი აკლია.');return text;}
function accountTimestamp(value){if(value===undefined||value===null||value==='')return 0;const number=Number(value);if(!Number.isSafeInteger(number)||number<0)throw new AccountError(400,'ჩანაწერის დრო არასწორია.');return number;}
function accountTime(value){const text=accountStateText(value,5,'საათი');if(text&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text))throw new AccountError(400,'ჩანაწერის საათი არასწორია.');return text;}
function accountState(input){
  if(!accountObject(input))throw new AccountError(400,'შენახული მონაცემები არასწორია.');
  const out={name:accountStateText(input.name,20,'სახელი'),xp:Math.round(accountNumber(input.xp,10000000)||0),favorites:accountStringList(input.favorites,100,100,'რჩეულების'),favoriteXpNames:accountStringList(input.favoriteXpNames,100,100,'პროგრესის'),plans:[],catches:[],catchLog:[],checklists:{},badges:[]};
  for(const item of accountList(input.plans,50,'გეგმების')){
    if(!accountObject(item))throw new AccountError(400,'გეგმა არასწორია.');
    out.plans.push({id:accountRecordId(item.id),kind:accountStateText(item.kind,40,'გეგმის ტიპი'),title:accountStateText(item.title,120,'გეგმის სათაური'),meta:accountStateText(item.meta,300,'გეგმის აღწერა'),date:accountDate(item.date),createdAt:accountTimestamp(item.createdAt)});
  }
  for(const item of accountList(input.catches,100,'დაჭერების')){
    if(!accountObject(item)||!accountStateText(item.fish,100,'თევზის სახელი'))throw new AccountError(400,'დაჭერის ჩანაწერი არასწორია.');
    out.catches.push({id:accountRecordId(item.id),fish:accountStateText(item.fish,100,'თევზის სახელი'),place:accountStateText(item.place,120,'ადგილის სახელი'),weight:accountNumber(item.weight),date:accountDate(item.date),note:accountStateText(item.note,500,'ჩანაწერის შენიშვნა'),createdAt:accountTimestamp(item.createdAt)});
  }
  for(const item of accountList(input.catchLog,100,'დაჭერების')){
    if(!accountObject(item)||!accountStateText(item.species,100,'სახეობის სახელი'))throw new AccountError(400,'დაჭერის ჩანაწერი არასწორია.');
    out.catchLog.push({id:accountRecordId(item.id),species:accountStateText(item.species,100,'სახეობის სახელი'),place:accountStateText(item.place,120,'ადგილის სახელი'),date:accountDate(item.date),time:accountTime(item.time),weight:accountNumber(item.weight),length:accountNumber(item.length),bait:accountStateText(item.bait,100,'სატყუარა'),notes:accountStateText(item.notes,500,'ჩანაწერის შენიშვნა'),createdAt:accountTimestamp(item.createdAt)});
  }
  if(input.checklists!==undefined&&!accountObject(input.checklists))throw new AccountError(400,'ჩექლისტი არასწორია.');
  const lists=Object.entries(input.checklists||{});if(lists.length>16)throw new AccountError(400,'ჩექლისტების რაოდენობა ზედმეტად დიდია.');
  for(const [key,list]of lists){if(!/^[\w:-]{1,80}$/.test(key)||['__proto__','constructor','prototype'].includes(key)||!accountObject(list))throw new AccountError(400,'ჩექლისტი არასწორია.');const entries=Object.entries(list);if(entries.length>30)throw new AccountError(400,'ჩექლისტი ზედმეტად დიდია.');const cleaned=Object.create(null);for(const [name,value]of entries){if(typeof value!=='boolean')throw new AccountError(400,'ჩექლისტი არასწორია.');const label=accountStateText(name,160,'ჩექლისტის პუნქტი');if(label)cleaned[label]=value;}Object.defineProperty(out.checklists,key,{value:cleaned,enumerable:true});}
  const count=out.catches.length+out.catchLog.length;if(count)out.badges.push('first-catch');if(count>=5)out.badges.push('five-catches');if(out.plans.length)out.badges.push('planner');if(out.favorites.length>=3)out.badges.push('collector');if(out.xp>=500)out.badges.push('xp500');
  if(new TextEncoder().encode(JSON.stringify(out)).byteLength>100000)throw new AccountError(413,'შენახული მონაცემები ზედმეტად დიდია. ფოტოები ამ სინქრონიზაციაში არ შედის.');
  return out;
}
function accountProfileInput(input,user,state){
  const old=accountProfile(user),result={...old};
  if(input.displayName!==undefined){if(typeof input.displayName!=='string')throw new AccountError(400,'სახელი არასწორია.');const name=input.displayName.trim().replace(/\s+/g,' ');if(name.length<2||name.length>20)throw new AccountError(400,'სახელი უნდა იყოს 2–20 სიმბოლო.');result.displayName=name;}
  for(const [key,allowed]of [['avatarId',ACCOUNT_AVATARS],['backgroundId',ACCOUNT_BACKGROUNDS],['nameColor',ACCOUNT_COLORS],['avatarFrame',ACCOUNT_FRAMES]])if(input[key]!==undefined){if(!allowed.has(input[key]))throw new AccountError(400,'პროფილის არჩევანი არასწორია.');result[key]=input[key];}
  if(!accountPlus(user)&&(result.avatarId.startsWith('plus-')||result.backgroundId==='bg-football'||result.nameColor!=='default'||['aurora','copper'].includes(result.avatarFrame)))throw new AccountError(403,'ეს არჩევანი აქტიურ Plus ანგარიშს მოითხოვს.','plus_required');
  const total=(state?.catches?.length||0)+(state?.catchLog?.length||0);
  if(result.avatarFrame==='first-catch'&&!total)throw new AccountError(403,'ჩარჩოს გასახსნელად შეინახე პირველი დაჭერა.','frame_locked');
  if(result.avatarFrame==='explorer'&&!((state?.plans?.length||0)>0||(state?.favorites?.length||0)>=3))throw new AccountError(403,'ჩარჩოს გასახსნელად შეინახე გეგმა ან 3 რჩეული.','frame_locked');
  if(result.avatarFrame==='champion'&&Number(state?.xp||0)<500)throw new AccountError(403,'ჩარჩოს გასახსნელად საჭიროა 500 პირადი XP.','frame_locked');
  return result;
}

export class FishHuntAccountsDO {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.storage=ctx.storage;this.queue=Promise.resolve();this.maintenanceScheduled=false;}
  fetch(request){
    // serialize across awaits (including password derivation), rather than relying
    // on an isolate-local lock or on eventually consistent KV reads.
    const result=this.queue.then(()=>this.handle(request));this.queue=result.catch(()=>{});return result;
  }
  async scheduleMaintenance(){
    if(this.maintenanceScheduled||typeof this.storage.getAlarm!=='function')return;
    if(!await this.storage.getAlarm())await this.storage.setAlarm(Date.now()+3600000);
    this.maintenanceScheduled=true;
  }
  alarm(){
    const result=this.queue.then(async()=>{
      const now=Date.now();
      // Resume bounded scans instead of repeatedly reading only the first keys.
      // Active sessions and user/profile/history rows are never removed here.
      for(const [prefix,limit]of [['limit:',1500],['session:',1000]]){
        const cursorKey='maintenance:cursor:'+prefix,cursor=await this.get(cursorKey);
        const rows=await this.storage.list({prefix,limit,...(cursor?{startAfter:cursor}:{})});
        for(const [key,value]of rows)if(!Number.isFinite(value?.expiresAt)||value.expiresAt<=now)await this.storage.delete(key);
        await this.put(cursorKey,rows.size===limit?[...rows.keys()].at(-1):'');
      }
      await this.storage.setAlarm(now+3600000);this.maintenanceScheduled=true;
    });this.queue=result.catch(()=>{});return result;
  }
  async get(key){return await this.storage.get(key);}
  async put(key,value){await this.storage.put(key,value);}
  async limit(key,max,windowMs){const now=Date.now(),found=await this.get('limit:'+key);const next=found&&found.expiresAt>now?found:{count:0,expiresAt:now+windowMs};next.count++;await this.put('limit:'+key,next);if(next.count>max)throw new AccountError(429,'დროებითი ლიმიტი ამოიწურა. სცადე მოგვიანებით.','rate_limited');}
  async authenticate(request){
    const match=/^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization')||'');if(!match)throw new AccountError(401,'ანგარიშში შესვლა საჭიროა.','authentication_required');
    const key='session:'+await sha256(match[1]),session=await this.get(key);
    if(!session||!Number.isFinite(session.expiresAt)||session.expiresAt<=Date.now()){if(session)await this.storage.delete(key);throw new AccountError(401,'შესვლის ვადა ამოიწურა. შედი ხელახლა.','session_expired');}
    const user=await this.get('user:'+session.userId);if(!user)throw new AccountError(401,'ანგარიში ვერ მოიძებნა.','authentication_required');
    // Version zero preserves sessions created before recovery was available.
    // Resetting a password revokes every device atomically without scanning an
    // unbounded number of session rows during a public recovery request.
    if(accountSessionVersion(session.version)!==accountSessionVersion(user.sessionVersion)){await this.storage.delete(key);throw new AccountError(401,'პაროლი შეიცვალა. შედი ახალი პაროლით.','session_expired');}
    return {user,key};
  }
  async session(user,remember){const token=accountRandom(),expiresAt=Date.now()+(remember?30*86400000:86400000);await this.put('session:'+await sha256(token),{userId:user.id,expiresAt,version:accountSessionVersion(user.sessionVersion)});return {token,expiresAt};}
  async snapshot(user,kind){return await this.get('snapshot:'+user.id+':'+kind)||{revision:null,savedAt:0,[kind]:null};}
  conflict(snapshot,kind){throw new AccountError(409,'სხვა მოწყობილობაზე მონაცემები შეიცვალა. აირჩიე რომელი ვერსია შეინახო.','sync_conflict',{conflict:true,revision:snapshot.revision,revisions:[{revision:snapshot.revision,savedAt:snapshot.savedAt,[kind]:snapshot[kind]}]});}
  async saveSnapshot(user,kind,value,input){
    const emailKey=kind==='profile'?'email:'+await sha256(user.email):null;
    return this.storage.transaction(async txn=>{
      const previous=await txn.get('snapshot:'+user.id+':'+kind)||{revision:null,savedAt:0,[kind]:null};
      const resolving=Array.isArray(input.resolveRevisions)&&input.resolveRevisions.length===1&&input.resolveRevisions[0]===previous.revision;
      if(input.baseRevision!==previous.revision&&!resolving)this.conflict(previous,kind);
      const snapshot={revision:crypto.randomUUID(),savedAt:Date.now(),[kind]:value};
      await txn.put('history:'+user.id+':'+kind+':'+snapshot.revision,snapshot);
      await txn.put('snapshot:'+user.id+':'+kind,snapshot);
      if(kind==='profile'){
        const changed={...user,profile:value};
        await txn.put('user:'+user.id,changed);
        await txn.put(emailKey,changed);
      }
      const historyKey='history-index:'+user.id+':'+kind,history=await txn.get(historyKey)||[];history.push(snapshot.revision);
      while(history.length>20){const revision=history.shift();await txn.delete('history:'+user.id+':'+kind+':'+revision);}await txn.put(historyKey,history);
      return snapshot;
    });
  }
  async handle(request){
    try{
      await this.scheduleMaintenance();
      const route=new URL(request.url).pathname.replace('/api/account/',''),method=request.method;
      if(!['signup','signin','signout','me','profile','state','recovery-code','recover'].includes(route))throw new AccountError(404,'გვერდი ვერ მოიძებნა.');
      if(route==='recover'){
        if(method!=='POST')throw new AccountError(405,'Method not allowed');
        const input=await accountInput(request,8000),email=accountEmail(input.email),code=accountRecoveryCode(input.recoveryCode),password=input.newPassword;
        if(!validAccountEmail(email)||typeof password!=='string'||password.length<8||password.length>128||!/^[0-9a-f]{64}$/.test(code))throw new AccountError(400,'მიუთითე სწორი ელფოსტა, აღდგენის სრული კოდი და ახალი პაროლი (8–128 სიმბოლო).');
        const ip=await sha256(request.headers.get('CF-Connecting-IP')||'unknown'),emailHash=await sha256(email);
        await this.limit('recovery-global',200,3600000);await this.limit('recovery-ip:'+ip,12,3600000);await this.limit('recovery-email:'+emailHash,6,900000);
        const user=await this.get('email:'+emailHash),salt=accountRandom(16);
        // Derive on both known and unknown emails, including invalid-code cases.
        // The public response never reveals whether an account has recovery set.
        const passwordHash=await accountPassword(password,salt),codeHash=await sha256('fishhunt-recovery-v1:'+(user?.id||'missing')+':'+code);
        if(!user||!user.recoveryHash||!accountConstantEqual(codeHash,user.recoveryHash))throw new AccountError(401,'ელფოსტა ან აღდგენის კოდი არასწორია.','invalid_recovery');
        await this.storage.transaction(async txn=>{
          const latest=await txn.get('user:'+user.id);
          if(!latest||!latest.recoveryHash||!accountConstantEqual(latest.recoveryHash,codeHash))throw new AccountError(401,'ელფოსტა ან აღდგენის კოდი არასწორია.','invalid_recovery');
          const changed={...latest,passwordSalt:salt,passwordHash,passwordIterations:ACCOUNT_PBKDF2_ITERATIONS,sessionVersion:accountSessionVersion(latest.sessionVersion)+1};
          delete changed.recoveryHash;delete changed.recoveryCreatedAt;
          await txn.put('user:'+user.id,changed);await txn.put('email:'+emailHash,changed);
        });
        return accountResponse({ok:true,message:'პაროლი შეიცვალა. ყველა მოწყობილობიდან გამოსული ხარ. შედი ახალი პაროლით და შექმენი აღდგენის ახალი კოდი.'});
      }
      if(['signup','signin'].includes(route)){
        if(method!=='POST')throw new AccountError(405,'Method not allowed');
        const input=await accountInput(request,8000),email=accountEmail(input.email),password=input.password;
        if(!validAccountEmail(email)||typeof password!=='string'||password.length<8||password.length>128)throw new AccountError(400,'მიუთითე სწორი ელფოსტა და პაროლი (8–128 სიმბოლო).');
        const ip=await sha256(request.headers.get('CF-Connecting-IP')||'unknown'),emailHash=await sha256(email);
        await this.limit('auth-global',500,3600000);await this.limit('auth-ip:'+ip,30,3600000);await this.limit('auth-email:'+emailHash,12,900000);
        let user=await this.get('email:'+emailHash);
        if(route==='signup'){
          if(user)throw new AccountError(409,'ეს ელფოსტა უკვე რეგისტრირებულია. შედი ანგარიშში.','email_exists');
          const createdAt=Date.now(),salt=accountRandom(16);user={id:crypto.randomUUID(),email,createdAt,plan:'free',planExpiresAt:null,role:'user',passwordSalt:salt,passwordHash:await accountPassword(password,salt),passwordIterations:ACCOUNT_PBKDF2_ITERATIONS,profile:{...ACCOUNT_DEFAULT_PROFILE}};
          if(input.profile!==undefined){if(!accountObject(input.profile))throw new AccountError(400,'პროფილი არასწორია.');user.profile=accountProfileInput(input.profile,user,null);}
          const snapshot={revision:crypto.randomUUID(),savedAt:createdAt,profile:user.profile};
          // Transaction atomically claims this email with its user record. No
          // successful concurrent registration can replace another password.
          await this.storage.transaction(async txn=>{if(await txn.get('email:'+emailHash))throw new AccountError(409,'ეს ელფოსტა უკვე რეგისტრირებულია.','email_exists');await txn.put('email:'+emailHash,user);await txn.put('user:'+user.id,user);await txn.put('snapshot:'+user.id+':profile',snapshot);});
          const session=await this.session(user,Boolean(input.remember));
          return accountResponse({ok:true,...session,user:accountPublicUser(user),profile:accountProfile(user),revision:snapshot.revision},201);
        }
        // Always derive a password, even for an absent email, to avoid a cheap
        // response-time account enumeration path.
        const hash=await accountPassword(password,user?.passwordSalt||'fishhunt-missing-account-salt');
        if(!user||!accountConstantEqual(hash,user.passwordHash))throw new AccountError(401,'ელფოსტა ან პაროლი არასწორია.','invalid_credentials');
        const latest=await this.get('user:'+user.id);if(!latest)throw new AccountError(401,'ელფოსტა ან პაროლი არასწორია.','invalid_credentials');user=latest;
        const session=await this.session(user,Boolean(input.remember)),snapshot=await this.snapshot(user,'profile');
        return accountResponse({ok:true,...session,user:accountPublicUser(user),profile:accountProfile(user),revision:snapshot.revision});
      }
      const {user,key}=await this.authenticate(request);
      if(route==='signout'){if(method!=='POST')throw new AccountError(405,'Method not allowed');await this.storage.delete(key);return accountResponse({ok:true});}
      if(route==='me'){if(method!=='GET')throw new AccountError(405,'Method not allowed');const snapshot=await this.snapshot(user,'profile');return accountResponse({ok:true,user:accountPublicUser(user),profile:accountProfile(user),revision:snapshot.revision});}
      if(route==='recovery-code'){
        if(method!=='POST')throw new AccountError(405,'Method not allowed');
        const input=await accountInput(request,8000),password=input.password;
        if(typeof password!=='string'||password.length<8||password.length>128)throw new AccountError(400,'მიუთითე მიმდინარე პაროლი (8–128 სიმბოლო).');
        await this.limit('recovery-setup:'+user.id,6,900000);
        const hash=await accountPassword(password,user.passwordSalt);
        if(!accountConstantEqual(hash,user.passwordHash))throw new AccountError(403,'მიმდინარე პაროლი არასწორია.','invalid_current_password');
        const code=accountRandom(),recoveryHash=await sha256('fishhunt-recovery-v1:'+user.id+':'+code),changed={...user,recoveryHash,recoveryCreatedAt:Date.now()};
        await this.storage.transaction(async txn=>{await txn.put('user:'+user.id,changed);await txn.put('email:'+await sha256(user.email),changed);});
        // Plaintext is returned once and is never persisted or included in /me.
        return accountResponse({ok:true,recoveryCode:code.toUpperCase().match(/.{8}/g).join('-'),recoveryConfigured:true,user:accountPublicUser(changed)});
      }
      if(method==='GET'){const snapshot=await this.snapshot(user,route);return accountResponse({ok:true,...snapshot,...(route==='profile'?{profile:accountProfile(user)}:{progressVerified:false})});}
      if((route==='profile'&&method!=='PATCH')||(route==='state'&&method!=='PUT'))throw new AccountError(405,'Method not allowed');
      await this.limit('write:'+user.id,120,3600000);
      const input=await accountInput(request),state=await this.snapshot(user,'state');
      if(route==='profile'){
        const profile=accountProfileInput(input,user,state.state),snapshot=await this.saveSnapshot(user,'profile',profile,input);
        return accountResponse({ok:true,...snapshot});
      }
      const value=accountState(input.state),snapshot=await this.saveSnapshot(user,'state',value,input);
      return accountResponse({ok:true,...snapshot,progressVerified:false});
    }catch(error){if(error instanceof AccountError)return accountResponse({ok:false,code:error.code,message:error.message,...error.extra},error.status);console.error('Private account storage error:',error.name);return accountResponse({ok:false,code:'account_unavailable',message:'ანგარიშის შენახვა ვერ მოხერხდა. სცადე ხელახლა.'},503);}
  }
}
