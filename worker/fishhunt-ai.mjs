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
        adminConfigured:Boolean(env.ADMIN_KV && String(env.ADMIN_PASSWORD||"").length>=12)},200,origin,allowed);
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
    // This Worker does not record BOG payments or anonymous visits.
    // Always disclose missing sources instead of inventing analytics.
    return adminReply({ok:true,stats:{
      uniqueVisitors:null,pageViews:null,registrations:null,logins:null,
      purchases:null,revenue:null,activePlans:null,orders:null,
      recent:[],recentPurchases:[],recentPageViews:[],recentInviteOpens:[],
      purchasesByPlan:{},statsUnavailable:true
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
