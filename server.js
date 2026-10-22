const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { URL } = require('node:url');

// GeoNature BOG payment gateway adapter.
// IMPORTANT: BOG merchant credentials belong only in .env on the server.
// The endpoint URLs below are configurable because BOG may change its API contract.
function loadEnv(){
  try{const txt=fs.readFileSync(path.join(__dirname,'.env'),'utf8');for(const line of txt.split(/\r?\n/)){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}}catch{}
}
loadEnv();
const PORT=Number(process.env.PORT||8787);
const HOST=process.env.HOST||'0.0.0.0';
const BOG_TOKEN_URL=process.env.BOG_TOKEN_URL||'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token';
const BOG_ORDER_URL=process.env.BOG_ORDER_URL||'https://api.bog.ge/payments/v1/ecommerce/orders';
const PUBLIC_BASE_URL=process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL||`http://localhost:${PORT}`;
const DATA_DIR=process.env.GEONATURE_DATA_DIR||__dirname;
fs.mkdirSync(DATA_DIR,{recursive:true});
const CLIENT_ID=process.env.BOG_CLIENT_ID||'';
const CLIENT_SECRET=process.env.BOG_CLIENT_SECRET||'';
const SALE_END=Date.parse(process.env.GEONATURE_PLUS_SALE_END||'2026-11-01T00:00:00+04:00');
const plans={plus:{name:'GeoNature Plus',regularPrice:5.99,salePrice:2.99,days:3},pro:{name:'GeoNature AI Pro',regularPrice:15.00,salePrice:7.99,days:7}};
function currentPlanPrice(plan){const p=plans[plan]; if(!p) return 0; return p.salePrice; }
function planPricing(plan){const p=plans[plan]; if(!p) return null; const saleActive=plan==='plus' ? Date.now()<SALE_END : true; return {name:p.name,regularPrice:p.regularPrice,currentPrice:p.salePrice,days:p.days,saleActive,saleEnds:plan==='plus'?SALE_END:null};}
const TERM_OPTIONS={1:{months:1,discount:0,label:'1 თვე'},3:{months:3,discount:10,label:'3 თვე • 10% ფასდაკლება'},6:{months:6,discount:15,label:'6 თვე • 15% ფასდაკლება'},12:{months:12,discount:25,label:'1 წელი • 25% ფასდაკლება'}};
function normalizeTerm(term){const n=Number(term);return TERM_OPTIONS[n]?n:1;}
function termPricing(plan,term){const p=plans[plan];if(!p)return null;const months=normalizeTerm(term);const opt=TERM_OPTIONS[months];const monthly=planPricing(plan);const base=Math.round(monthly.currentPrice*months*100)/100;const discount=Math.round(base*opt.discount)/100;const total=Math.max(0,Math.round((base-discount)*100)/100);return {plan,months,label:opt.label,discountPercent:opt.discount,monthlyPrice:monthly.currentPrice,baseTotal:base,discount,finalTotal:total,currency:'GEL',saleActive:monthly.saleActive,saleEnds:monthly.saleEnds};}
const orders=new Map();
const trialSessions=new Map();
const BOG_TRIAL_SETUP_URL=process.env.BOG_TRIAL_SETUP_URL||'';

// Weather gateway: explicit units, bounded requests, and location-specific
// last-known-good results. Concurrent reads of a location share one request.
const weatherCache=new Map();
const weatherPending=new Map();
function weatherSetting(name,fallback,min,max){
  const value=Number(process.env[name]);
  return process.env[name]!==undefined && Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;
}
const WEATHER_CACHE_TTL=weatherSetting('GEONATURE_WEATHER_CACHE_TTL_MS',5*60*1000,0,30*60*1000);
const WEATHER_STALE_TTL=Math.max(WEATHER_CACHE_TTL,weatherSetting('GEONATURE_WEATHER_STALE_TTL_MS',90*60*1000,0,24*60*60*1000));
const WEATHER_REQUEST_BUDGET=weatherSetting('GEONATURE_WEATHER_REQUEST_TIMEOUT_MS',10000,100,30000);
const WEATHER_ATTEMPT_TIMEOUT=weatherSetting('GEONATURE_WEATHER_ATTEMPT_TIMEOUT_MS',3500,50,12000);
const WEATHER_CACHE_LIMIT=256;
const WEATHER_API_URL=process.env.GEONATURE_WEATHER_API_URL||'https://api.open-meteo.com/v1/forecast';
async function fetchJsonTimeout(url,options={},timeoutMs=WEATHER_ATTEMPT_TIMEOUT){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:ctrl.signal,headers:{Accept:'application/json',...(options.headers||{})}});
    if(!response.ok)throw new Error(`Weather provider HTTP ${response.status}`);
    const text=await response.text();
    try{return JSON.parse(text)}catch{throw new Error('Invalid weather JSON')}
  }finally{clearTimeout(t)}
}
function weatherUrl(lat,lon,model='best_match'){
  // ECMWF has a 15-day horizon; asking it for 16 days can reject a fallback.
  const q=new URLSearchParams({latitude:String(lat),longitude:String(lon),timezone:'auto',forecast_days:model==='ecmwf_ifs04'?'15':'16',models:model,
    temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm',timeformat:'iso8601',
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',
    hourly:'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,is_day',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max'});
  const url=new URL(WEATHER_API_URL);
  url.search=q.toString();
  return url.toString();
}
function validateWeatherData(data,lat,lon){
  const numeric=value=>typeof value==='number'&&Number.isFinite(value);
  const validTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)&&Number.isFinite(Date.parse(value+'Z'))&&new Date(value+'Z').toISOString().slice(0,value.length)===value;
  const weatherCode=value=>[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(value);
  if(!data||typeof data!=='object'||!numeric(data.latitude)||!numeric(data.longitude)||Math.abs(data.latitude)>90||Math.abs(data.longitude)>180||
    !numeric(data.utc_offset_seconds)||Math.abs(data.utc_offset_seconds)>14*60*60||typeof data.timezone!=='string'||!validTime(data.current?.time))throw new Error('Incomplete weather response');
  try{new Intl.DateTimeFormat('en',{timeZone:data.timezone})}catch{throw new Error('Invalid weather timezone')}
  const longitudeDistance=Math.min(Math.abs(lon-data.longitude),360-Math.abs(lon-data.longitude));
  if(Math.abs(lat-data.latitude)>1||longitudeDistance>1)throw new Error('Weather coordinates do not match requested location');
  const current=data.current;
  for(const field of ['temperature_2m','apparent_temperature','relative_humidity_2m','precipitation','weather_code','cloud_cover','pressure_msl','wind_speed_10m','wind_direction_10m','wind_gusts_10m','is_day']){
    if(!numeric(current[field]))throw new Error('Incomplete current weather');
  }
  if(!weatherCode(current.weather_code)||![0,1].includes(current.is_day)||current.temperature_2m<-100||current.temperature_2m>70||current.relative_humidity_2m<0||current.relative_humidity_2m>100||current.cloud_cover<0||current.cloud_cover>100||current.precipitation<0||current.wind_speed_10m<0||current.wind_gusts_10m<0||current.pressure_msl<800||current.pressure_msl>1100)throw new Error('Invalid current weather values');
  if(data.current_units?.temperature_2m!=='°C'||data.current_units?.wind_speed_10m!=='km/h'||data.current_units?.precipitation!=='mm'||data.current_units?.pressure_msl!=='hPa')throw new Error('Unsupported weather units');
  const hourly=data.hourly,daily=data.daily;
  if(!Array.isArray(hourly?.time)||!hourly.time.length||!hourly.time.every(validTime)||!Array.isArray(daily?.time)||!daily.time.length||!daily.time.every(time=>typeof time==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(time)&&validTime(time+'T00:00')))throw new Error('Incomplete weather timeline');
  for(const field of ['temperature_2m','apparent_temperature','relative_humidity_2m','precipitation_probability','precipitation','weather_code','cloud_cover','pressure_msl','wind_speed_10m','wind_direction_10m','wind_gusts_10m','visibility','is_day']){
    const values=hourly[field];
    if(!Array.isArray(values)||values.length!==hourly.time.length||!values.some(numeric)||values.some(value=>value!==null&&!numeric(value)))throw new Error('Incomplete hourly weather');
    if(['relative_humidity_2m','precipitation_probability','cloud_cover'].includes(field)&&values.some(value=>numeric(value)&&(value<0||value>100)))throw new Error('Invalid hourly percentages');
    if(['precipitation','wind_speed_10m','wind_gusts_10m','visibility'].includes(field)&&values.some(value=>numeric(value)&&value<0))throw new Error('Invalid hourly values');
    if(field==='weather_code'&&values.some(value=>value!==null&&!weatherCode(value)))throw new Error('Invalid hourly weather codes');
    if(field==='is_day'&&values.some(value=>value!==null&&![0,1].includes(value)))throw new Error('Invalid hourly daylight');
  }
  for(const field of ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max','precipitation_sum','wind_speed_10m_max','sunrise','sunset','uv_index_max']){
    const values=daily[field];
    if(!Array.isArray(values)||values.length!==daily.time.length||!values.some(value=>field==='sunrise'||field==='sunset'?validTime(value):numeric(value))||values.some(value=>value!==null&&!(field==='sunrise'||field==='sunset'?validTime(value):numeric(value))))throw new Error('Incomplete daily weather');
  }
  const currentTime=Date.parse(current.time+'Z')-data.utc_offset_seconds*1000;
  if(currentTime>Date.now()+30*60*1000||currentTime<Date.now()-90*60*1000)throw new Error('Outdated current weather');
  if(!hourly.time.includes(current.time.slice(0,13)+':00'))throw new Error('Current weather missing from forecast');
  return currentTime;
}
function weatherResult(entry,lat,lon,stale){
  return {...entry.data,__meta:{source:entry.source,updatedAt:entry.updatedAt,fetchedAt:entry.updatedAt,
    ageMs:Math.max(0,Date.now()-entry.updatedAt),currentTime:entry.currentTime,stale,
    requestedLatitude:lat,requestedLongitude:lon,timezone:entry.data.timezone,utcOffsetSeconds:entry.data.utc_offset_seconds}};
}
async function getWeatherData(lat,lon,{force=false}={}){
  const key=`${lat.toFixed(6)},${lon.toFixed(6)}`; const now=Date.now(); const cached=weatherCache.get(key);
  if(weatherPending.has(key))return weatherPending.get(key);
  if(!force&&cached&&now-cached.updatedAt<WEATHER_CACHE_TTL&&now-cached.currentTime<90*60*1000)return weatherResult(cached,lat,lon,false);
  if(weatherPending.size>=WEATHER_CACHE_LIMIT)throw new Error('Weather service busy');
  const pending=(async()=>{
    let lastError=null;
    for(const model of ['best_match','gfs_seamless','ecmwf_ifs04']){
      const remaining=WEATHER_REQUEST_BUDGET-(Date.now()-now);
      if(remaining<=0)break;
      try{
        const data=await fetchJsonTimeout(weatherUrl(lat,lon,model),{},Math.min(remaining,WEATHER_ATTEMPT_TIMEOUT));
        const currentTime=validateWeatherData(data,lat,lon);
        const entry={data,updatedAt:Date.now(),currentTime,source:`Open-Meteo • ${model}`};
        for(const [location,item] of weatherCache)if(Date.now()-item.updatedAt>=WEATHER_STALE_TTL)weatherCache.delete(location);
        weatherCache.delete(key);
        if(weatherCache.size>=WEATHER_CACHE_LIMIT)weatherCache.delete(weatherCache.keys().next().value);
        weatherCache.set(key,entry);
        return weatherResult(entry,lat,lon,false);
      }catch(error){lastError=error}
    }
    if(cached&&Date.now()-cached.updatedAt<WEATHER_STALE_TTL)return weatherResult(cached,lat,lon,true);
    throw lastError||new Error('Weather unavailable');
  })();
  weatherPending.set(key,pending);
  try{return await pending}finally{weatherPending.delete(key)}
}

// Simple production-friendly account layer using Node's built-in crypto.
// Passwords are never stored as plain text. Accounts persist in users.json;
// sessions are random HttpOnly cookies persisted in sessions.json.
const USERS_FILE=path.join(DATA_DIR,'users.json');
const SESSIONS_FILE=path.join(DATA_DIR,'sessions.json');
const SESSION_TTL=30*24*60*60*1000;
const SESSION_SECRET=process.env.GEONATURE_SESSION_SECRET||'change-this-in-production';
function readJsonFile(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function writeJsonFile(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2),'utf8')}
let users=readJsonFile(USERS_FILE,[]);
let sessions=readJsonFile(SESSIONS_FILE,{});
const ORDERS_FILE=path.join(DATA_DIR,'orders.json');
for(const [savedId,savedOrder] of Object.entries(readJsonFile(ORDERS_FILE,{}))) orders.set(savedId,savedOrder);
function persistOrders(){ writeJsonFile(ORDERS_FILE,Object.fromEntries(orders.entries())); }

const DONATIONS_FILE=path.join(DATA_DIR,'donations.json');
let donations=readJsonFile(DONATIONS_FILE,[]);
if(!Array.isArray(donations)) donations=[];
function persistDonations(){ writeJsonFile(DONATIONS_FILE,donations); }
function donationLeaderboard(){
  const groups=new Map();
  for(const d of donations){
    if(d?.verified!==true || d?.status!=='paid' || !Number.isFinite(Number(d.amount)) || Number(d.amount)<=0) continue;
    const donorName=String(d.displayName||'').trim().replace(/\s+/g,' ').slice(0,30);
    const anonymous=!donorName;
    const key=anonymous ? 'anonymous:'+String(d.orderId||'') : 'named:'+donorName.toLocaleLowerCase();
    const item=groups.get(key)||{id:key,name:donorName||'ანონიმური მხარდამჭერი',totalAmount:0,donationCount:0,lastDonatedAt:0};
    item.totalAmount=Math.round((item.totalAmount+Number(d.amount))*100)/100;
    item.donationCount+=1;
    item.lastDonatedAt=Math.max(item.lastDonatedAt,Number(d.paidAt)||0);
    groups.set(key,item);
  }
  return Array.from(groups.values())
    .sort((a,b)=>b.totalAmount-a.totalAmount || b.lastDonatedAt-a.lastDonatedAt)
    .slice(0,20)
    .map((d,index)=>({rank:index+1,name:d.name,totalAmount:d.totalAmount,donationCount:d.donationCount,lastDonatedAt:d.lastDonatedAt}));
}

const ANALYTICS_FILE=path.join(DATA_DIR,'analytics.json');
const FEEDBACK_FILE=path.join(DATA_DIR,'feedback.json');
let analytics=readJsonFile(ANALYTICS_FILE,{visitors:{},pageViews:[],pageViewsTotal:0,inviteOpens:[],logins:[],loginsTotal:0,registrations:[],purchases:[],purchasesTotal:0,purchaseRevenueTotal:0});
analytics.visitors=analytics.visitors&&typeof analytics.visitors==='object'?analytics.visitors:{};
for(const k of ['pageViews','logins','registrations','purchases','inviteOpens']) if(!Array.isArray(analytics[k])) analytics[k]=[];
for(const k of ['pageViewsTotal','loginsTotal','purchasesTotal','purchaseRevenueTotal']) if(!Number.isFinite(Number(analytics[k]))) analytics[k]=0;
analytics.pageViewsTotal=Math.max(analytics.pageViewsTotal,analytics.pageViews.length);
analytics.loginsTotal=Math.max(analytics.loginsTotal,analytics.logins.length);
analytics.purchasesTotal=Math.max(analytics.purchasesTotal,analytics.purchases.length);
if(analytics.purchaseRevenueTotal===0&&analytics.purchases.length) analytics.purchaseRevenueTotal=analytics.purchases.reduce((sum,x)=>sum+(Number(x.amount)||0),0);
let feedbackItems=readJsonFile(FEEDBACK_FILE,[]); if(!Array.isArray(feedbackItems)) feedbackItems=[];
const feedbackRate=new Map();
function persistAnalytics(){ writeJsonFile(ANALYTICS_FILE,analytics); }
function persistFeedback(items=feedbackItems){
  // A confirmed report must survive a restart, including a failed write.
  const temporary=FEEDBACK_FILE+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  try{
    fs.writeFileSync(temporary,JSON.stringify(items,null,2),{encoding:'utf8',mode:0o600});
    fs.renameSync(temporary,FEEDBACK_FILE);
  }finally{try{fs.unlinkSync(temporary)}catch{}}
}
function keepRecent(arr,item,max=20000){ arr.push(item); if(arr.length>max) arr.splice(0,arr.length-max); }
function normalizeEmail(email){return String(email||'').trim().toLowerCase()}
function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function hashPassword(password,salt){return crypto.scryptSync(password,salt,64).toString('hex')}
function createPasswordHash(password){const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:hashPassword(password,salt)} }
function verifyPassword(password,user){try{const got=hashPassword(password,user.passwordSalt);return crypto.timingSafeEqual(Buffer.from(got,'hex'),Buffer.from(user.passwordHash,'hex'))}catch{return false}}
function cleanUser(user){return {id:user.id,email:user.email,createdAt:user.createdAt,role:user.role||'user',plan:user.plan||'free',planExpiresAt:user.planExpiresAt||null,displayName:user.displayName||'',avatarId:user.avatarId||'free-fish',backgroundId:user.backgroundId||'bg-fishing-lake',xp:Math.max(0,Number(user.xp)||0)}}
function cookieToken(req){const m=String(req.headers.cookie||'').match(/(?:^|;\s*)gn_session=([^;]+)/);return m?decodeURIComponent(m[1]):''}
function currentUser(req){const token=cookieToken(req);const rec=sessions[token];if(!rec)return null;if(Date.now()>rec.expiresAt){delete sessions[token];writeJsonFile(SESSIONS_FILE,sessions);return null}return users.find(u=>u.id===rec.userId)||null}
function requestIsSecure(req){
  const forwarded=String(req?.headers?.['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
  return process.env.COOKIE_SECURE==='true' || forwarded==='https' || Boolean(req?.socket?.encrypted);
}
function cookieSameSite(req){
  const origin=String(req?.headers?.origin||'').replace(/\/+$/,'');
  if(originIsAllowed(origin) && requestIsSecure(req)) return 'SameSite=None; Secure';
  return 'SameSite=Lax'+(requestIsSecure(req)?'; Secure':'');
}
function setSessionCookie(res,userId,req,remember=true){
  const token=crypto.randomBytes(32).toString('base64url');
  const ttl=remember?SESSION_TTL:24*60*60*1000;
  sessions[token]={userId,createdAt:Date.now(),expiresAt:Date.now()+ttl};
  writeJsonFile(SESSIONS_FILE,sessions);
  const secure=requestIsSecure(req);
  const maxAge=remember?`; Max-Age=${Math.floor(ttl/1000)}`:'';
  res.setHeader('Set-Cookie',`gn_session=${encodeURIComponent(token)}; Path=/; HttpOnly; ${cookieSameSite(req)}${maxAge}`);
}
function clearSessionCookie(res,req){
  const token=cookieToken(req);
  if(token){delete sessions[token];writeJsonFile(SESSIONS_FILE,sessions)}
  const secure=requestIsSecure(req);
  res.setHeader('Set-Cookie',`gn_session=; Path=/; HttpOnly; ${cookieSameSite(req)}; Max-Age=0`);
}

// Server-side promo validation. Never trust discount calculations from the browser.
const PUBLIC_PROMOS={
  niko50:{kind:'discount',percent:50,label:'niko50 • 50% ფასდაკლება'},
  niko25:{kind:'discount',percent:25,label:'niko25 • 25% ფასდაკლება'},
  andro10:{kind:'discount',percent:10,label:'andro10 • 10% ფასდაკლება'},
  andro20:{kind:'discount',percent:20,label:'andro20 • 20% ფასდაკლება'},
  avtobest:{kind:'discount',percent:100,label:'avtobest • 100% ფასდაკლება',freeActivation:true}
};
const ADMIN_PANEL_SALT=process.env.GEONATURE_ADMIN_PANEL_SALT||'';
const ADMIN_PANEL_HASH=process.env.GEONATURE_ADMIN_PANEL_HASH||'';
const ADMIN_PANEL_PASSWORD=process.env.GEONATURE_ADMIN_PANEL_PASSWORD||'';
// Admin password must be configured through private server environment variables.

function verifyAdminPanelPassword(value){
  if(!value) return false;
  if(ADMIN_PANEL_PASSWORD && String(value)===ADMIN_PANEL_PASSWORD) return true;
  if(!ADMIN_PANEL_SALT || !ADMIN_PANEL_HASH) return false;
  try{
    const got=crypto.scryptSync(String(value),ADMIN_PANEL_SALT,32).toString('hex');
    const expected=Buffer.from(ADMIN_PANEL_HASH,'hex');
    const candidate=Buffer.from(got,'hex');
    return candidate.length===expected.length && crypto.timingSafeEqual(candidate,expected);
  }catch{return false;}
}
function cookieValue(req,name){ const re=new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'); const m=String(req.headers.cookie||'').match(re); return m?decodeURIComponent(m[1]):''; }
function currentAdmin(req){ const token=cookieValue(req,'gn_admin'); const rec=token? sessions['__admin__:'+token]:null; if(!rec)return null; if(Date.now()>rec.expiresAt){ delete sessions['__admin__:'+token]; writeJsonFile(SESSIONS_FILE,sessions); return null; } return {role:'admin'}; }
function setAdminCookie(res,req,remember=true){ const token=crypto.randomBytes(32).toString('base64url'); const ttl=remember?SESSION_TTL:8*60*60*1000; sessions['__admin__:'+token]={userId:'ADMIN',createdAt:Date.now(),expiresAt:Date.now()+ttl}; writeJsonFile(SESSIONS_FILE,sessions); res.setHeader('Set-Cookie',`gn_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; ${cookieSameSite(req)}; Max-Age=${Math.floor(ttl/1000)}`); }
function clearAdminCookie(res,req){ const token=cookieValue(req,'gn_admin'); if(token){delete sessions['__admin__:'+token];writeJsonFile(SESSIONS_FILE,sessions)} res.setHeader('Set-Cookie',`gn_admin=; Path=/; HttpOnly; ${cookieSameSite(req)}; Max-Age=0`); }
function resolvePromo(code,plan,term=1){
  const clean=String(code||'').trim();
  const pricing=planPricing(plan); const p=plans[plan]; const tp=termPricing(plan,term);
  if(!p||!pricing||!clean) return {valid:false,code:'',percent:0,discount:0,total:tp?.finalTotal||pricing?.currentPrice||0,term:tp};
  // Public promo codes are case-insensitive and ignore spaces; e.g. 'andro 20' and 'ANDRO20'.
  const normalizedCode=clean.toLowerCase().replace(/\s+/g,'');
  const promoKey=Object.keys(PUBLIC_PROMOS).find(k=>k.toLowerCase().replace(/\s+/g,'')===normalizedCode);
  const promo=promoKey?PUBLIC_PROMOS[promoKey]:null;
  if(!promo) return {valid:false,code:clean,percent:0,discount:0,total:tp.finalTotal,term:tp};
  // Round the payable amount to cents, then derive the exact discount from it.
  // This avoids cent-rounding asymmetry for prices such as 2.99 at 50% off.
  const total=Math.max(0,Math.round((tp.finalTotal*(1-promo.percent/100))*100)/100);
  const discount=Math.max(0,Math.round((tp.finalTotal-total)*100)/100);
  return {valid:true,code:promoKey,percent:promo.percent,discount,total,freeActivation:Boolean(promo.freeActivation&&total===0),label:promo.label,saleActive:pricing.saleActive,saleEnds:pricing.saleEnds,term:tp};
}

function json(res,status,body){const out=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(out)}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e6)req.destroy()});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)})}
async function bogToken(){
  if(!CLIENT_ID||!CLIENT_SECRET)throw new Error('BOG_CLIENT_ID / BOG_CLIENT_SECRET not configured');
  const auth=Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const r=await fetch(BOG_TOKEN_URL,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  const t=await r.text(); if(!r.ok)throw new Error(`BOG token ${r.status}: ${t.slice(0,400)}`); return JSON.parse(t).access_token;
}
function trialUrlFor(ref,email,plan){
  if(!BOG_TRIAL_SETUP_URL) return '';
  return BOG_TRIAL_SETUP_URL.replaceAll('{ref}',encodeURIComponent(ref)).replaceAll('{email}',encodeURIComponent(email||'')).replaceAll('{plan}',encodeURIComponent(plan)).replaceAll('{return}',encodeURIComponent(`${PUBLIC_BASE_URL}/api/trial/callback`));
}
function createTrialSession(plan,email){
  const ref=`trial_${plan}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  trialSessions.set(ref,{ref,plan,email:email||'',createdAt:Date.now(),cardAttached:false,active:false});
  return trialSessions.get(ref);
}

async function createBogOrder(plan,email,promoCode,termMonths=1,user=null){
  const p=plans[plan];
  const pricing=planPricing(plan);
  const term=termPricing(plan,termMonths);
  const promo=resolvePromo(promoCode,plan,term.months);
  if(promoCode && !promo.valid) throw new Error('არასწორი ან ვადაგასული promo code');
  const finalAmount=promoCode ? promo.total : term.finalTotal;
  const externalOrderId=`gn_${plan}_${term.months}m_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  if(finalAmount===0 && promo.valid && promo.freeActivation){
    const now=Date.now();
    // A public 100% code is granted for the selected plan term when an account is signed in.
    // Guest sessions get a local browser grant; signed-in users also receive the grant on their account.
    let planExpiresAt=null;
    { const until=new Date(now); until.setMonth(until.getMonth()+term.months); planExpiresAt=until.getTime(); }
    if(user){ user.plan=plan; user.planActivatedAt=now; user.lastPromoCode=promo.code; if(planExpiresAt) user.planExpiresAt=planExpiresAt; else delete user.planExpiresAt; writeJsonFile(USERS_FILE,users); }
    orders.set(externalOrderId,{plan,termMonths:term.months,status:'promo_activated',createdAt:now,promo,totalAmount:0,userId:user?.id||null,email:email||user?.email||null,planExpiresAt}); persistOrders();
    return {checkoutUrl:null,orderId:externalOrderId,admin:false,freeActivation:true,guestActivation:!user,plan,termMonths:term.months,term,promo,planExpiresAt,accountUpdated:Boolean(user),originalAmount:term.baseTotal,regularAmount:pricing.regularPrice*term.months,saleActive:pricing.saleActive,saleEnds:pricing.saleEnds,totalAmount:0};
  }
  const token=await bogToken();
  const payload={
    callback_url:`${PUBLIC_BASE_URL}/api/payments/bog/callback`,
    external_order_id:externalOrderId,
    purchase_units:{currency:'GEL',total_amount:finalAmount,basket:[{product_id:`geonature-${plan}-${term.months}m`,description:`${p.name} • ${term.label}` + (promo.valid ? ` • ${promo.label}` : ''),quantity:1,unit_price:finalAmount}]},
    buyer:{email:email||undefined},
    redirect_urls:{success:`${PUBLIC_BASE_URL}/payment-success.html?plan=${plan}&order=${encodeURIComponent(externalOrderId)}`,fail:`${PUBLIC_BASE_URL}/payment.html?plan=${plan}&status=failed`}
  };
  const r=await fetch(BOG_ORDER_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
  const txt=await r.text();if(!r.ok)throw new Error(`BOG order ${r.status}: ${txt.slice(0,800)}`);
  const data=JSON.parse(txt); const checkoutUrl=data?._links?.redirect?.href||data?.links?.redirect?.href||data?.redirect_url||data?.checkout_url;
  if(!checkoutUrl)throw new Error('BOG response did not include a checkout URL. Check merchant API contract.');
  orders.set(externalOrderId,{plan,termMonths:term.months,status:'created',createdAt:Date.now(),provider:data,promo,totalAmount:finalAmount}); persistOrders();
  return {checkoutUrl,orderId:externalOrderId,admin:false,plan,termMonths:term.months,term,promo,originalAmount:term.baseTotal,regularAmount:pricing.regularPrice*term.months,saleActive:pricing.saleActive,saleEnds:pricing.saleEnds,totalAmount:finalAmount};
}

async function getBogReceipt(bogOrderId){
  if(!bogOrderId || !CLIENT_ID || !CLIENT_SECRET) return null;
  const token=await bogToken();
  const url='https://api.bog.ge/payments/v1/receipt/'+encodeURIComponent(String(bogOrderId));
  const r=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json','Accept-Language':'ka'}});
  if(!r.ok) return null;
  try{return await r.json()}catch{return null}
}
async function verifyAndRecordDonation(externalOrderId,callback={}){
  const order=orders.get(externalOrderId);
  if(!order || order.kind!=='donation') return false;
  const bogOrderId=String(callback.order_id||order.provider?.id||order.provider?.order_id||'');
  if(!bogOrderId) return false;
  const receipt=await getBogReceipt(bogOrderId);
  if(!receipt) return false;
  const status=String(receipt.order_status?.key||receipt.status||'').toLowerCase();
  const external=String(receipt.external_order_id||'');
  const amount=Number(receipt.purchase_units?.total_amount ?? receipt.total_amount);
  const currency=String(receipt.purchase_units?.currency||receipt.currency||'').toUpperCase();
  const paymentCode=receipt.payment_detail?.code;
  if(status!=='completed' || (external && external!==externalOrderId) ||
     !Number.isFinite(amount) || Math.round(amount*100)!==Math.round(Number(order.totalAmount)*100) ||
     currency!=='GEL' || (paymentCode!==undefined && paymentCode!==null && Number(paymentCode)!==100)) return false;
  const paidAt=Date.parse(receipt.payment_date||'')||Date.now();
  order.status='paid'; order.paidAt=paidAt; order.verifiedAt=Date.now(); order.receiptStatus=status;
  orders.set(externalOrderId,order); persistOrders();
  if(!donations.some(d=>d.orderId===externalOrderId)){
    keepRecent(donations,{orderId:externalOrderId,displayName:String(order.donationName||''),amount:Number(order.totalAmount),currency:'GEL',status:'paid',verified:true,paidAt},5000);
    persistDonations();
  }
  return true;
}
async function createBogDonationOrder(amount,displayName){
  const n=Number(amount);
  if(!Number.isFinite(n) || n<1 || n>5000 || Math.abs(n*100-Math.round(n*100))>0.000001){
    throw new Error('დონაციის თანხა უნდა იყოს 1.00–5,000.00 ₾, მაქსიმუმ ორი ათწილადით.');
  }
  const name=String(displayName||'').replace(/[<>\u0000-\u001f]/g,'').trim().replace(/\s+/g,' ').slice(0,30);
  if(!CLIENT_ID || !CLIENT_SECRET) throw new Error('საქართველოს ბანკის Merchant/API მონაცემები ჯერ არ არის კონფიგურირებული სერვერზე.');
  const base=PUBLIC_BASE_URL.replace(/\/+$/,'');
  if(!/^https:\/\//i.test(base) || base.includes('your-domain.example')){
    throw new Error('სერვერს უნდა ჰქონდეს საჯარო HTTPS მისამართი. PUBLIC_BASE_URL შეცვალე ჰოსტინგის რეალური მისამართით.');
  }
  const finalAmount=Math.round(n*100)/100;
  const externalOrderId='fh_donation_'+Date.now()+'_'+crypto.randomBytes(12).toString('hex');
  const token=await bogToken();
  const payload={
    callback_url:base+'/api/payments/bog/callback',
    external_order_id:externalOrderId,
    capture:'automatic',
    purchase_units:{currency:'GEL',total_amount:finalAmount,basket:[{product_id:'fishhunt-donation',description:'FishHunt • ერთჯერადი დონაცია',quantity:1,unit_price:finalAmount}]},
    redirect_urls:{
      success:base+'/donate.html?status=return&order='+encodeURIComponent(externalOrderId),
      fail:base+'/donate.html?status=failed'
    }
  };
  const r=await fetch(BOG_ORDER_URL,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json','Accept-Language':'ka','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)});
  const txt=await r.text();
  if(!r.ok) throw new Error('BOG გადახდის შექმნა ვერ მოხერხდა (HTTP '+r.status+'). გადაამოწმე Merchant/API წვდომა და სერვერის კონფიგურაცია.');
  let data={}; try{data=JSON.parse(txt)}catch{throw new Error('BOG-მა არასწორი პასუხი დააბრუნა.')}
  const checkoutUrl=data?._links?.redirect?.href||data?.links?.redirect?.href||data?.redirect_url||data?.checkout_url;
  if(!checkoutUrl) throw new Error('BOG-ის პასუხში გადახდის ბმული არ მოიძებნა.');
  orders.set(externalOrderId,{kind:'donation',externalOrderId,status:'created',createdAt:Date.now(),provider:data,donationName:name,totalAmount:finalAmount,currency:'GEL'});
  persistOrders();
  return {ok:true,checkoutUrl,orderId:externalOrderId,amount:finalAmount,currency:'GEL'};
}

function serveStatic(req,res){
  const notFound=()=>{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');};
  if(req.method!=='GET'&&req.method!=='HEAD')return notFound();
  let requested;
  try{requested=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname);}
  catch{return notFound();}
  const relative=requested==='/'?'index.html':requested.replace(/^\/+/, '');
  if(relative.split(/[\\/]/).some(part=>part.startsWith('.')))return notFound();
  const privateFiles=new Set(['server.js','package.json','package-lock.json','users.json','sessions.json','orders.json','donations.json','analytics.json','feedback.json','push-state.json']);
  if(privateFiles.has(path.basename(relative)))return notFound();
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
  const fp=path.resolve(__dirname,relative),ext=path.extname(fp).toLowerCase();
  if(!types[ext])return notFound();
  try{
    const real=fs.realpathSync(fp),inside=path.relative(__dirname,real);
    if(inside.startsWith('..'+path.sep)||path.isAbsolute(inside)||!fs.statSync(real).isFile())return notFound();
    const actualExt=path.extname(real).toLowerCase();
    if(inside.split(/[\\/]/).some(part=>part.startsWith('.'))||privateFiles.has(path.basename(inside))||!types[actualExt])return notFound();
    const headers={'Content-Type':types[actualExt],'X-Content-Type-Options':'nosniff'};
    if(['.html','.js','.css'].includes(actualExt))headers['Cache-Control']='no-store, max-age=0';
    if(req.method==='HEAD'){res.writeHead(200,headers);return res.end();}
    const stream=fs.createReadStream(real);
    stream.once('error',()=>{if(res.headersSent)res.destroy();else notFound();});
    stream.once('open',()=>{res.writeHead(200,headers);stream.pipe(res);});
  }catch{return notFound();}
}

// ---------------- Web Push notifications ----------------
const PUSH_STATE_FILE=path.join(DATA_DIR,'push-state.json');
let pushState=readJsonFile(PUSH_STATE_FILE,{vapid:null,subscriptions:[]});
if(!pushState||typeof pushState!=='object'||Array.isArray(pushState))pushState={vapid:null,subscriptions:[]};
if(!Array.isArray(pushState.subscriptions))pushState.subscriptions=[];
else pushState.subscriptions=pushState.subscriptions.filter(item=>item&&typeof item==='object'&&!Array.isArray(item));
function persistPushState(next=pushState){
  const temporary=PUSH_STATE_FILE+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  try{fs.writeFileSync(temporary,JSON.stringify(next,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(temporary,PUSH_STATE_FILE)}
  finally{try{fs.unlinkSync(temporary)}catch{}}
}
// Use the same catalog and model as the fishing page, including habitat and
// published restrictions. These scripts only declare data and pure helpers.
const pushFishingModel=(()=>{
  const context={window:{}};
  for(const filename of ['fishing-data.js','wildlife-rules.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'js',filename),'utf8'),context,{filename,timeout:1000});
  return context.window;
})();
const pushFishById=new Map(pushFishingModel.FISHES.map(fish=>[fish[0],fish]));
const pushWaterById=new Map(pushFishingModel.WATERS.map(water=>[water[0],water]));
function normalizePushPreferences(preferences){
  if(!preferences||!Array.isArray(preferences.fish)||!preferences.fish.length||preferences.fish.length>5||!Array.isArray(preferences.places)||!preferences.places.length||preferences.places.length>5)return null;
  const hour=String(preferences.hour??'any'),threshold=preferences.threshold===undefined?72:Number(preferences.threshold);
  if(!(hour==='any'||/^(?:[01]\d|2[0-3])$/.test(hour))||!Number.isFinite(threshold)||threshold<40||threshold>95)return null;
  const fish=[],places=[];
  for(const selected of preferences.fish){
    const canonical=pushFishById.get(selected?.id);
    if(!canonical||fish.some(item=>item.id===canonical[0]))return null;
    fish.push({id:canonical[0],name:canonical[1]});
  }
  for(const selected of preferences.places){
    const canonical=pushWaterById.get(selected?.id);
    if(!canonical||typeof canonical[4]!=='number'||typeof canonical[5]!=='number'||!Number.isFinite(canonical[4])||!Number.isFinite(canonical[5])||Math.abs(canonical[4])>90||Math.abs(canonical[5])>180||places.some(item=>item.id===canonical[0]))return null;
    places.push({id:canonical[0],name:canonical[1],type:canonical[2],region:canonical[3],lat:canonical[4],lon:canonical[5]});
  }
  return {fish,places,hour,threshold};
}
function b64u(buf){return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function fromB64u(s){const str=String(s||'').replace(/-/g,'+').replace(/_/g,'/');return Buffer.from(str+'='.repeat((4-str.length%4)%4),'base64')}
function rawPublicKeyFromJwk(jwk){return Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')])}
function ensureVapid(){
  if(pushState.vapid?.publicJwk&&pushState.vapid?.privateJwk&&pushState.vapid?.publicKey){return pushState.vapid}
  const kp=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const publicJwk=kp.publicKey.export({format:'jwk'});
  const privateJwk=kp.privateKey.export({format:'jwk'});
  const next={...pushState,vapid:{publicJwk,privateJwk,publicKey:b64u(rawPublicKeyFromJwk(publicJwk))}};
  persistPushState(next);pushState=next;
  return pushState.vapid;
}
function es256DerToJose(sig){
  let o=0;if(sig[o++]!==0x30)throw new Error('Invalid ECDSA signature');let len=sig[o++];if(len&0x80)o+=(len&0x7f);if(sig[o++]!==0x02)throw new Error('Invalid ECDSA r');let rl=sig[o++];const r=sig.slice(o,o+rl);o+=rl;if(sig[o++]!==0x02)throw new Error('Invalid ECDSA s');let sl=sig[o++];const ss=sig.slice(o,o+sl);
  const norm=x=>{let i=0;while(i<x.length-1&&x[i]===0)i++;const y=x.slice(i);return Buffer.concat([Buffer.alloc(32-y.length),y])};
  return Buffer.concat([norm(r),norm(ss)]);
}
function signVapid(audience){
  const v=ensureVapid(); const header=b64u(Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'}))); const payload=b64u(Buffer.from(JSON.stringify({aud:audience,exp:Math.floor(Date.now()/1000)+12*60*60,sub:process.env.VAPID_SUBJECT||'mailto:geonature@example.com'})));
  const data=`${header}.${payload}`; const key=crypto.createPrivateKey({key:v.privateJwk,format:'jwk'}); const der=crypto.sign('sha256',Buffer.from(data),key); return {jwt:`${data}.${b64u(es256DerToJose(der))}`,publicKey:v.publicKey};
}
function hkdf(salt,ikm,info,len){return Buffer.from(crypto.hkdfSync('sha256',ikm,salt,info,len))}
function encryptWebPush(subscription,payload){
  const uaPublic=fromB64u(subscription.keys.p256dh),auth=fromB64u(subscription.keys.auth);
  if(uaPublic.length!==65||auth.length!==16)throw new Error('Invalid push encryption keys');
  const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
  const senderPublic=ecdh.getPublicKey(null,'uncompressed'),shared=ecdh.computeSecret(uaPublic);
  // RFC 8291: the context uses this message's ephemeral sender key. The
  // VAPID signing key authenticates delivery and is not an encryption key.
  const context=Buffer.concat([Buffer.from('WebPush: info\0'),uaPublic,senderPublic]);
  const ikm=hkdf(auth,shared,context,32),salt=crypto.randomBytes(16);
  const cek=hkdf(salt,ikm,Buffer.from('Content-Encoding: aes128gcm\0'),16);
  const nonce=hkdf(salt,ikm,Buffer.from('Content-Encoding: nonce\0'),12);
  const padded=Buffer.concat([Buffer.from(JSON.stringify(payload)),Buffer.from([2])]);
  if(padded.length+16>4096)throw new Error('Push payload is too large');
  const cipher=crypto.createCipheriv('aes-128-gcm',cek,nonce);
  const ciphertext=Buffer.concat([cipher.update(padded),cipher.final(),cipher.getAuthTag()]);
  const recordSize=Buffer.alloc(4);recordSize.writeUInt32BE(4096,0);
  return Buffer.concat([salt,recordSize,Buffer.from([senderPublic.length]),senderPublic,ciphertext]);
}
async function sendPush(subscription,payload){
  const valid=normalizePushSub(subscription);
  if(!valid)throw new Error('Invalid push subscription');
  const endpoint=new URL(valid.endpoint),audience=endpoint.origin,vapid=signVapid(audience),encrypted=encryptWebPush(valid,payload);
  const response=await fetch(valid.endpoint,{method:'POST',headers:{TTL:'900',Urgency:'normal','Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',Authorization:`vapid t=${vapid.jwt}, k=${vapid.publicKey}`},body:encrypted,signal:AbortSignal.timeout(10000)});
  if(response.status===404||response.status===410)throw Object.assign(new Error('Push subscription expired'),{code:'GONE'});
  if(!response.ok)throw new Error(`Push provider HTTP ${response.status}`);
  return true;
}

function configuredFrontendOrigin(){
  return String(process.env.GN_FRONTEND_ORIGIN||process.env.DONATION_FRONTEND_ORIGIN||'https://niksaniksa25.github.io').trim().replace(/\/+$/,'');
}
function originIsAllowed(origin){
  const configured=configuredFrontendOrigin();
  let backendOrigin='';
  try{backendOrigin=new URL(PUBLIC_BASE_URL).origin}catch{}
  const local=/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return Boolean(origin && (origin.replace(/\/+$/,'')===configured || origin.replace(/\/+$/,'')===backendOrigin || local));
}
function appCors(req,res){
  const origin=String(req.headers.origin||'');
  if(originIsAllowed(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Credentials','true');
  }
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers','Retry-After');
}
function donationCors(req,res){
  const origin=String(req.headers.origin||'');
  if(originIsAllowed(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
}
function pushCors(req,res){const origin=String(req.headers.origin||'');if(origin&&originIsAllowed(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}else if(!origin){res.setHeader('Access-Control-Allow-Origin','*')}res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
function pushPrefsValid(preferences){return Boolean(normalizePushPreferences(preferences))}
function normalizePushSub(subscription){
  try{
    const endpoint=new URL(String(subscription?.endpoint||''));
    const known=['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com','push.services.mozilla.com'].includes(endpoint.hostname)||endpoint.hostname.endsWith('.notify.windows.com');
    if(endpoint.protocol!=='https:'||!known||endpoint.username||endpoint.password||(endpoint.port&&endpoint.port!=='443')||endpoint.href.length>4096)return null;
    const p256dh=String(subscription?.keys?.p256dh||''),auth=String(subscription?.keys?.auth||'');
    if(!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh)||!/^[A-Za-z0-9_-]+={0,2}$/.test(auth))return null;
    const publicKey=fromB64u(p256dh),secret=fromB64u(auth);
    if(publicKey.length!==65||publicKey[0]!==4||secret.length!==16)return null;
    crypto.ECDH.convertKey(publicKey,'prime256v1',undefined,undefined,'uncompressed');
    return {endpoint:endpoint.href,keys:{p256dh,auth}};
  }catch{return null}
}
function calcPushScore(weather,fish,place){
  const canonicalFish=pushFishById.get(fish?.id),canonicalWater=pushWaterById.get(place?.id),meta=weather?.__meta,current=weather?.current;
  const now=Date.now();
  if(!canonicalFish||!canonicalWater||!meta||meta.stale!==false||!Number.isFinite(meta.updatedAt)||!Number.isFinite(meta.currentTime)||now-meta.updatedAt>15*60*1000||now-meta.currentTime>30*60*1000||meta.updatedAt>now+60*1000||meta.currentTime>now+30*60*1000||!current)return null;
  if(meta.requestedLatitude!==canonicalWater[4]||meta.requestedLongitude!==canonicalWater[5])return null;
  const observationTime=Date.parse(String(current.time||'')+'Z')-Number(weather.utc_offset_seconds)*1000;
  if(!Number.isFinite(observationTime)||Math.abs(observationTime-meta.currentTime)>1000)return null;
  const date=String(current.time||'').slice(0,10),hourText=String(current.time||'').slice(11,13);
  if(!/^(?:[01]\d|2[0-3])$/.test(hourText))return null;
  const restrictions=pushFishingModel.GeoWildlifeRules.evaluate(canonicalFish,{kind:'fish',date,method:'rod',waterId:canonicalWater[0]});
  if(!restrictions.dateValid||restrictions.status==='prohibited')return null;
  const explanation=pushFishingModel.GeoFishConditions.explain(canonicalFish,{...current,local_hour:Number(hourText)},canonicalWater,true);
  if(explanation.components.find(item=>item.key==='habitat')?.fit!==100)return null;
  return explanation.score;
}
function frontendLink(relativePath){
  const configured=String(process.env.GN_FRONTEND_URL||'https://niksaniksa25.github.io/FISHHUNTt.ge/').trim();
  let relative=String(relativePath||'');
  while(relative.startsWith('/'))relative=relative.slice(1);
  try{return new URL(relative,configured.endsWith('/')?configured:configured+'/').toString()}
  catch{return 'https://niksaniksa25.github.io/FISHHUNTt.ge/'+relative}
}
let pushCheckPending=null;
async function performPushChecks(){
  let changed=false;
  for(const sub of pushState.subscriptions.slice()){
    const preferences=normalizePushPreferences(sub.preferences);
    if(!sub.enabled||!preferences||!normalizePushSub(sub.subscription))continue;
    if(!sub.lastSent||typeof sub.lastSent!=='object'||Array.isArray(sub.lastSent))sub.lastSent={};
    for(const fish of preferences.fish){
      for(const place of preferences.places){
        try{
          const weather=await getWeatherData(place.lat,place.lon);
          if(!sub.enabled||!pushState.subscriptions.includes(sub))continue;
          const localHour=Number(String(weather.current?.time||'').slice(11,13));
          if(preferences.hour!=='any'&&Number(preferences.hour)!==localHour)continue;
          const score=calcPushScore(weather,fish,place),key=`${fish.id}|${place.id}`,last=Number(sub.lastSent[key]||0);
          if(score===null||score<preferences.threshold||Date.now()-last<6*60*60*1000)continue;
          await sendPush(sub.subscription,{title:'🎣 GeoNature • პირობები',body:`${fish.name} • ${place.name}: პირობების ინდექსი ${score}/100. საორიენტაციო შეფასებაა; დაჭერის ალბათობას არ წარმოადგენს. ადგილობრივი დრო: ${weather.current.time.slice(11,16)}. მოპოვების წესები გადაამოწმე.`,url:frontendLink(`fishing.html?fish=${encodeURIComponent(fish.id)}&place=${encodeURIComponent(place.id)}#fishProfile`),tag:`fish-${fish.id}-${place.id}`});
          sub.lastSent[key]=Date.now();changed=true;
        }catch(error){if(error.code==='GONE'){sub.enabled=false;changed=true}}
      }
    }
  }
  if(changed)persistPushState();
}
async function runPushChecks(){
  if(pushCheckPending)return pushCheckPending;
  pushCheckPending=performPushChecks();
  try{return await pushCheckPending}finally{pushCheckPending=null}
}
setInterval(()=>{runPushChecks().catch(()=>{})},15*60*1000);
setTimeout(()=>{runPushChecks().catch(()=>{})},20*1000);
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host}`);

    const usesAppCors=u.pathname==='/api/weather'||u.pathname==='/api/feedback'||u.pathname.startsWith('/api/analytics/')||u.pathname.startsWith('/api/admin/')||u.pathname.startsWith('/api/auth/')||u.pathname.startsWith('/api/leaderboard/')||u.pathname==='/api/ai/chat';
    if(usesAppCors){
      appCors(req,res);
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    }

    if(u.pathname==='/api/ai/chat') return require('./lib/ai-chat').handleAiChat(req,res,{readBody:body,json,originIsAllowed});

    if(u.pathname.startsWith('/api/push/')){
      pushCors(req,res);
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      ensureVapid();
      if(u.pathname==='/api/push/config'&&req.method==='GET')return json(res,200,{ok:true,publicKey:pushState.vapid.publicKey});
      if(u.pathname==='/api/push/subscribe'&&req.method==='POST'){
        const b=await body(req),clientId=String(b.clientId||'').trim(),subscription=normalizePushSub(b.subscription),preferences=normalizePushPreferences(b.preferences);
        if(!/^[A-Za-z0-9_-]{8,100}$/.test(clientId)||!subscription||!preferences)return json(res,400,{ok:false,message:'Push არჩევანი არასწორია. აირჩიე 1–5 თევზი და 1–5 კოორდინატიანი ადგილი.'});
        const previous=pushState.subscriptions.find(item=>item.clientId===clientId),record={...(previous||{clientId,createdAt:Date.now(),lastSent:{}}),subscription,preferences,enabled:true};
        const next={...pushState,subscriptions:previous?pushState.subscriptions.map(item=>item.clientId===clientId?record:item):[...pushState.subscriptions,record]};
        persistPushState(next);pushState=next;
        return json(res,200,{ok:true,message:'შეტყობინებები ჩართულია.'});
      }
      if(u.pathname==='/api/push/preferences'&&req.method==='POST'){
        const b=await body(req),rec=pushState.subscriptions.find(item=>item.clientId===String(b.clientId||'')),preferences=normalizePushPreferences(b.preferences);
        if(!rec)return json(res,404,{ok:false,message:'Push ჯერ არ ჩაგირთავს.'});
        if(!rec.enabled||!normalizePushSub(rec.subscription))return json(res,409,{ok:false,message:'შეტყობინებები არააქტიურია. ჯერ ხელახლა ჩართე.'});
        if(!preferences)return json(res,400,{ok:false,message:'აირჩიე 1–5 თევზი და 1–5 კოორდინატიანი ადგილი.'});
        const next={...pushState,subscriptions:pushState.subscriptions.map(item=>item===rec?{...rec,preferences}:item)};
        persistPushState(next);pushState=next;
        return json(res,200,{ok:true,message:'არჩევანი შეინახა.'});
      }
      if(u.pathname==='/api/push/unsubscribe'&&req.method==='POST'){
        const b=await body(req),rec=pushState.subscriptions.find(item=>item.clientId===String(b.clientId||''));
        if(rec){const next={...pushState,subscriptions:pushState.subscriptions.map(item=>item===rec?{...rec,enabled:false}:item)};persistPushState(next);pushState=next}
        return json(res,200,{ok:true});
      }
      if(u.pathname==='/api/push/test'&&req.method==='POST'){
        const b=await body(req);const rec=pushState.subscriptions.find(x=>x.clientId===String(b.clientId||''));if(!rec)return json(res,404,{ok:false,message:'ჯერ ჩართე შეტყობინებები.'});if(!rec.enabled||!normalizePushSub(rec.subscription))return json(res,409,{ok:false,message:'შეტყობინებები არააქტიურია. ჯერ ხელახლა ჩართე.'});
        try{await sendPush(rec.subscription,{title:'🔔 GeoNature',body:'სატესტო შეტყობინება წარმატებით მოვიდა. Push მუშაობს!',url:frontendLink('dashboard.html'),tag:'geonature-test'});return json(res,200,{ok:true,message:'📨 სატესტო შეტყობინება გაიგზავნა.'})}catch(e){if(e.code==='GONE'){rec.enabled=false;persistPushState()}return json(res,502,{ok:false,message:'Push პროვაიდერმა შეტყობინება ვერ მიიღო.'})}
      }
      if(u.pathname==='/api/push/check-now'&&req.method==='POST'){runPushChecks().catch(()=>{});return json(res,200,{ok:true,message:'შემოწმება დაიწყო.'});}
    }

    if(u.pathname.startsWith('/api/donations/')){
      donationCors(req,res);
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      if(u.pathname==='/api/donations/leaderboard'&&req.method==='GET'){
        const paid=donations.filter(d=>d?.verified===true&&d?.status==='paid'&&Number.isFinite(Number(d.amount))&&Number(d.amount)>0);
        const totalAmount=Math.round(paid.reduce((sum,d)=>sum+Number(d.amount),0)*100)/100;
        return json(res,200,{ok:true,donations:donationLeaderboard(),donationCount:paid.length,totalAmount});
      }
      if(u.pathname==='/api/donations/create-order'&&req.method==='POST'){
        const b=await body(req);
        const amount=typeof b.amount==='number'?b.amount:Number(String(b.amount||'').replace(',','.'));
        if(!Number.isFinite(amount)||amount<1||amount>5000||Math.abs(amount*100-Math.round(amount*100))>0.000001){
          return json(res,400,{ok:false,message:'აირჩიე მინიმუმ 1 ₾ და მაქსიმუმ 5,000 ₾ (ორ ათწილადამდე).'});
        }
        const out=await createBogDonationOrder(amount,b.displayName);
        return json(res,200,out);
      }
      if(u.pathname==='/api/donations/status'&&req.method==='GET'){
        const id=String(u.searchParams.get('order')||'');
        const order=orders.get(id);
        if(!order||order.kind!=='donation') return json(res,404,{ok:false,message:'დონაციის შეკვეთა ვერ მოიძებნა.'});
        if(order.status!=='paid'){
          try{await verifyAndRecordDonation(id,{order_id:order.provider?.id||order.provider?.order_id||''});}catch(e){console.error('BOG donation verification failed:',e.message);}
        }
        const latest=orders.get(id);
        return json(res,200,{ok:true,paid:latest?.status==='paid',status:latest?.status||'unknown'});
      }
    }

    if(u.pathname==='/api/analytics/visit'&&req.method==='POST'){
      const b=await body(req); const visitorId=String(b.visitorId||'').trim();
      if(!/^[A-Za-z0-9_-]{16,80}$/.test(visitorId)) return json(res,400,{ok:false,message:'Visitor ID არასწორია.'});
      let page=String(b.path||'/').split('?')[0].split('#')[0].slice(0,180);
      if(!page.startsWith('/')) page='/'+page;
      if(page==='/admin.html'||page.endsWith('/admin.html')) return json(res,200,{ok:true,ignored:true});
      const title=String(b.title||'').replace(/[<>\\u0000-\\u001f]/g,'').slice(0,120);
      const now=Date.now(); const user=currentUser(req);
      const rec=analytics.visitors[visitorId]||{firstSeen:now,lastSeen:now,pageViews:0};
      rec.lastSeen=now; rec.lastPath=page; rec.pageViews=(rec.pageViews||0)+1;
      if(user){rec.userId=user.id;rec.displayName=String(user.displayName||user.email?.split('@')[0]||'');rec.avatarId=user.avatarId||'free-fish';}
      analytics.visitors[visitorId]=rec;
      keepRecent(analytics.pageViews,{visitorId,path:page,title,at:now,userId:user?.id||null,displayName:user?String(user.displayName||user.email?.split('@')[0]||''):'',avatarId:user?.avatarId||'free-fish'},20000);
      const referralCode=String(b.referralCode||'').trim().slice(0,140);
      if(referralCode){
        const inviter=users.find(x=>x.id===referralCode);
        keepRecent(analytics.inviteOpens,{id:`inv_${now}_${crypto.randomBytes(4).toString('hex')}`,referralCode,inviterId:inviter?.id||null,inviterName:inviter?String(inviter.displayName||inviter.email?.split('@')[0]||'მომხმარებელი'):'ვერ ამოიცნო',inviterAvatarId:inviter?.avatarId||'free-fish',visitorId,openedPath:page,at:now,openerUserId:user?.id||null,openerName:user?String(user.displayName||user.email?.split('@')[0]||'მომხმარებელი'):'სტუმარი',status:'opened'},5000);
      }
      analytics.pageViewsTotal=(analytics.pageViewsTotal||0)+1; persistAnalytics();
      return json(res,200,{ok:true});
    }
    if(u.pathname==='/api/feedback'&&req.method==='POST'){
      let b; try{b=await body(req)}catch{return json(res,400,{ok:false,message:'შეტყობინების მონაცემები არასწორია.'})}
      if(!b||typeof b!=='object'||Array.isArray(b)) return json(res,400,{ok:false,message:'შეტყობინების მონაცემები არასწორია.'});
      const visitorId=String(b.visitorId||'').trim();
      const message=String(b.message||'').replace(/\u0000/g,'').trim();
      const category=['bug','idea','question','other'].includes(String(b.category||''))?String(b.category):'bug';
      const contactEmail=normalizeEmail(b.email||''); const page=String(b.page||'/').split('?')[0].slice(0,180);
      if(message.length<1) return json(res,400,{ok:false,message:'შეტყობინებაში მინიმუმ ერთი სიმბოლო ჩაწერე.'});
      if(message.length>4000) return json(res,400,{ok:false,message:'შეტყობინება 4000 სიმბოლოზე მოკლე უნდა იყოს.'});
      if(contactEmail && (contactEmail.length>160||!validEmail(contactEmail))) return json(res,400,{ok:false,message:'ელფოსტის ფორმატი არასწორია.'});
      const rateKey=/^[A-Za-z0-9_-]{16,80}$/.test(visitorId)?visitorId:'anonymous'; const now=Date.now(); const recent=(feedbackRate.get(rateKey)||[]).filter(t=>now-t<15*60*1000);
      if(recent.length>=5){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((recent[0]+15*60*1000-now)/1000))));return json(res,429,{ok:false,message:'ძალიან ბევრი შეტყობინება გაიგზავნა. სცადე 15 წუთში.'});}
      const user=currentUser(req); const item={id:`fb_${now}_${crypto.randomBytes(5).toString('hex')}`,category,message,email:contactEmail||null,page:page.startsWith('/')?page:'/'+page,visitorId:/^[A-Za-z0-9_-]{16,80}$/.test(visitorId)?visitorId:null,userId:user?.id||null,accountEmail:user?.email||null,createdAt:now,status:'new'};
      const nextItems=feedbackItems.concat(item).slice(-5000);
      try{persistFeedback(nextItems)}catch(err){console.error('Feedback persistence failed:',err.code||'unknown');return json(res,503,{ok:false,message:'შეტყობინება ვერ შეინახა. მოგვიანებით სცადე.'})}
      feedbackItems=nextItems;
      recent.push(now); feedbackRate.set(rateKey,recent);
      return json(res,201,{ok:true,message:'მადლობა! შეტყობინება ადმინისტრატორს გაეგზავნა.',id:item.id});
    }
    if(u.pathname==='/api/auth/me'&&req.method==='GET'){
      const user=currentUser(req); return json(res,200,{ok:true,user:user?cleanUser(user):null});
    }
    if(u.pathname==='/api/auth/signup'&&req.method==='POST'){
      const b=await body(req); const email=normalizeEmail(b.email); const password=String(b.password||'');
      if(!validEmail(email)) return json(res,400,{ok:false,message:'შეიყვანე სწორი Gmail / Email მისამართი.'});
      if(password.length<8) return json(res,400,{ok:false,message:'პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო.'});
      if(users.some(u=>u.email===email)) return json(res,409,{ok:false,message:'ეს ელფოსტა უკვე რეგისტრირებულია. შედი ანგარიშზე.'});
      const ph=createPasswordHash(password); const user={id:`usr_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`,email,passwordSalt:ph.salt,passwordHash:ph.hash,createdAt:Date.now(),role:'user',plan:'free',displayName:'',avatarId:'free-fish',backgroundId:'bg-fishing-lake'};
      users.push(user);writeJsonFile(USERS_FILE,users);keepRecent(analytics.registrations,{userId:user.id,at:user.createdAt},20000);persistAnalytics();setSessionCookie(res,user.id,req,b.remember!==false);return json(res,201,{ok:true,user:cleanUser(user)});
    }
    if(u.pathname==='/api/auth/signin'&&req.method==='POST'){
      const b=await body(req); const email=normalizeEmail(b.email); const password=String(b.password||''); const user=users.find(u=>u.email===email);
      if(!user||!verifyPassword(password,user)) return json(res,401,{ok:false,message:'ელფოსტა ან პაროლი არასწორია.'});
      keepRecent(analytics.logins,{userId:user.id,at:Date.now()},20000);analytics.loginsTotal=(analytics.loginsTotal||0)+1;persistAnalytics();setSessionCookie(res,user.id,req,b.remember!==false);return json(res,200,{ok:true,user:cleanUser(user)});
    }
    if(u.pathname==='/api/admin/login'&&req.method==='POST'){ const b=await body(req); if(!verifyAdminPanelPassword(b.password)) return json(res,401,{ok:false,message:'Admin პაროლი არასწორია.'}); setAdminCookie(res,req,b.remember!==false); return json(res,200,{ok:true}); }
    if(u.pathname==='/api/admin/me'&&req.method==='GET'){ return json(res,200,{ok:true,admin:Boolean(currentAdmin(req))}); }
    if(u.pathname==='/api/admin/logout'&&req.method==='POST'){ clearAdminCookie(res,req); return json(res,200,{ok:true}); }
    if(u.pathname==='/api/admin/stats'&&req.method==='GET'){
      if(!currentAdmin(req)) return json(res,401,{ok:false,message:'Admin access required.'});
      const regularUsers=users.filter(x=>(x.role||'user')!=='admin'); const activePlans=regularUsers.filter(x=>x.plan&&x.plan!=='free').length; const admins=users.filter(x=>x.role==='admin').length;
      const recent=users.slice(-10).reverse().map(x=>({email:x.email,plan:x.plan||'free',role:x.role||'user',createdAt:x.createdAt}));
      const byPlan={plus:0,pro:0,other:0}; for(const p of analytics.purchases){if(p.plan==='plus')byPlan.plus++;else if(p.plan==='pro')byPlan.pro++;else byPlan.other++;}
      const revenue=Number(analytics.purchaseRevenueTotal||analytics.purchases.reduce((sum,p)=>sum+(Number(p.amount)||0),0));
      const feedbackUnread=feedbackItems.filter(x=>x.status==='new').length;
      return json(res,200,{ok:true,stats:{users:regularUsers.length,registrations:regularUsers.length,activePlans,admins,orders:orders.size,uniqueVisitors:Object.keys(analytics.visitors).length,pageViews:analytics.pageViewsTotal||analytics.pageViews.length,logins:analytics.loginsTotal||analytics.logins.length,purchases:analytics.purchasesTotal||analytics.purchases.length,revenue:Math.round(revenue*100)/100,purchasesByPlan:byPlan,feedbackUnread,recent,recentPurchases:analytics.purchases.slice(-15).reverse(),recentPageViews:analytics.pageViews.slice(-100).reverse(),recentInviteOpens:analytics.inviteOpens.slice(-300).reverse(),inviteOpensTotal:analytics.inviteOpens.length}});
    }
    if(u.pathname==='/api/admin/feedback'&&req.method==='GET'){
      if(!currentAdmin(req)) return json(res,401,{ok:false,message:'Admin access required.'});
      const filter=u.searchParams.get('status')||'all'; const rows=feedbackItems.filter(x=>filter==='all'||x.status===filter).slice().reverse().slice(0,300);
      return json(res,200,{ok:true,items:rows,counts:{all:feedbackItems.length,new:feedbackItems.filter(x=>x.status==='new').length,read:feedbackItems.filter(x=>x.status==='read').length,resolved:feedbackItems.filter(x=>x.status==='resolved').length}});
    }
    if(u.pathname==='/api/admin/feedback/status'&&req.method==='PATCH'){
      if(!currentAdmin(req)) return json(res,401,{ok:false,message:'Admin access required.'});
      const b=await body(req); const id=String(b.id||''); const status=String(b.status||'');
      if(!['new','read','resolved'].includes(status)) return json(res,400,{ok:false,message:'სტატუსი არასწორია.'});
      const item=feedbackItems.find(x=>x.id===id); if(!item) return json(res,404,{ok:false,message:'შეტყობინება ვერ მოიძებნა.'});
      const updated={...item,status,updatedAt:Date.now()};
      const nextItems=feedbackItems.map(x=>x.id===id?updated:x);
      try{persistFeedback(nextItems)}catch(err){console.error('Feedback status persistence failed:',err.code||'unknown');return json(res,503,{ok:false,message:'სტატუსი ვერ შეინახა. მოგვიანებით სცადე.'})}
      feedbackItems=nextItems; return json(res,200,{ok:true,item:updated});
    }
    if(u.pathname==='/api/leaderboard/xp'&&req.method==='GET'){
      const leaderboard=users.filter(x=>(x.role||'user')!=='admin'&&Number(x.xp)>0)
        .map(x=>({id:x.id,name:String(x.displayName||x.email?.split('@')[0]||'GeoNature Explorer').slice(0,30),avatarId:x.avatarId||'free-fish',xp:Math.max(0,Number(x.xp)||0),updatedAt:Number(x.xpUpdatedAt||x.createdAt)||0}))
        .sort((a,b)=>b.xp-a.xp||a.name.localeCompare(b.name,'ka')).slice(0,50)
        .map((x,i)=>({rank:i+1,...x}));
      return json(res,200,{ok:true,leaderboard});
    }
    if(u.pathname==='/api/auth/xp'&&req.method==='POST'){
      const user=currentUser(req);if(!user)return json(res,401,{ok:false,message:'XP-ის სინქრონიზაციისთვის ანგარიშში შედი.'});
      const b=await body(req);const xp=Number(b.xp);
      if(!Number.isFinite(xp)||xp<0||xp>10000000)return json(res,400,{ok:false,message:'XP მნიშვნელობა არასწორია.'});
      user.xp=Math.round(xp);user.xpUpdatedAt=Date.now();writeJsonFile(USERS_FILE,users);
      return json(res,200,{ok:true,xp:user.xp});
    }
    if(u.pathname==='/api/auth/profile'&&req.method==='GET'){
      const user=currentUser(req); if(!user) return json(res,401,{ok:false,message:'ანგარიშში შესვლა აუცილებელია.'});
      return json(res,200,{ok:true,profile:{displayName:user.displayName||'',avatarId:user.avatarId||'free-fish',backgroundId:user.backgroundId||'bg-fishing-lake'}});
    }
    if(u.pathname==='/api/auth/profile'&&req.method==='PATCH'){
      const user=currentUser(req); if(!user) return json(res,401,{ok:false,message:'ანგარიშში შესვლა აუცილებელია.'});
      const b=await body(req); const name=String(b.displayName||'').trim().replace(/\s+/g,' ');
      const avatar=String(b.avatarId||'free-fish'); const background=String(b.backgroundId||'bg-fishing-lake'); const allowed=['free-fish','free-leaf','free-camp','free-fox','free-wave','free-ranger','plus-eagle','plus-wolf','plus-bear','plus-deer','plus-fishing','plus-compass','plus-canyon','plus-svaneti','plus-ranger','plus-nocturne','plus-fish-photo','plus-reel-photo','plus-hunt-photo','plus-football']; const bgAllowed=['bg-fishing-lake','bg-fishing-rod','bg-fish','bg-forest','bg-mountains','bg-lake','bg-football'];
      if(name.length<2||name.length>20) return json(res,400,{ok:false,message:'სახელი უნდა იყოს 2-20 სიმბოლო.'});
      if(!allowed.includes(avatar)) return json(res,400,{ok:false,message:'ეს ავატარი ვერ მოიძებნა.'}); if(!bgAllowed.includes(background)) return json(res,400,{ok:false,message:'ეს ფონი ვერ მოიძებნა.'});
      const plusAvatarIds=['plus-eagle','plus-wolf','plus-bear','plus-deer','plus-fishing','plus-compass','plus-canyon','plus-svaneti','plus-ranger','plus-nocturne','plus-fish-photo','plus-reel-photo','plus-hunt-photo','plus-football']; const plusBgIds=['bg-football']; if((plusAvatarIds.includes(avatar)||plusBgIds.includes(background)) && !['plus','pro'].includes(user.plan||'free') && !currentAdmin(req)) return json(res,403,{ok:false,message:'ეს PLUS არჩევანია.'});
      user.displayName=name;user.avatarId=avatar;user.backgroundId=background;writeJsonFile(USERS_FILE,users);
      return json(res,200,{ok:true,profile:{displayName:name,avatarId:avatar,backgroundId:background}});
    }
    if(u.pathname==='/api/auth/signout'&&req.method==='POST'){
      clearSessionCookie(res,req);return json(res,200,{ok:true});
    }
    if(u.pathname==='/api/health')return json(res,200,{ok:true,paymentProvider:'BOG',configured:Boolean(CLIENT_ID&&CLIENT_SECRET),trialConfigured:false});
    if(u.pathname==='/api/payments/pricing'&&req.method==='GET'){
      const plan=u.searchParams.get('plan')==='pro'?'pro':'plus'; const term=normalizeTerm(u.searchParams.get('term')); return json(res,200,{ok:true,plan,term,pricing:planPricing(plan),termPricing:termPricing(plan,term),terms:Object.fromEntries(Object.keys(TERM_OPTIONS).map(k=>[k,termPricing(plan,Number(k))])),plans:{plus:planPricing('plus'),pro:planPricing('pro')}});
    }
    if(u.pathname==='/api/payments/promo/validate'&&req.method==='POST'){
      const b=await body(req); const plan=b.plan==='pro'?'pro':'plus'; const term=normalizeTerm(b.termMonths); const result=resolvePromo(b.code,plan,term);
      if(b.code && !result.valid) return json(res,400,{ok:false,message:'Public promo code არასწორია.'});
      return json(res,200,{ok:true,plan,...result});
    }
    if((u.pathname==='/api/trial/create'&&req.method==='POST')||(u.pathname==='/api/trial/callback'&&req.method==='GET')||(u.pathname==='/api/trial/activate'&&req.method==='POST')){
      // A return URL's status is not bank verification. Keep card attachment and
      // activation unavailable until an authoritative provider check exists.
      return json(res,503,{ok:false,code:'trial_verification_unavailable',message:'საცდელი პერიოდის გააქტიურება ჯერ მიუწვდომელია: ბანკის მიერ ბარათის მიბმის დადასტურება დაკავშირებული არ არის.'});
    }
    if(u.pathname==='/api/trial/status'&&req.method==='GET'){
      const ref=u.searchParams.get('ref')||''; const sess=trialSessions.get(ref); if(!sess) return json(res,404,{ok:false,message:'Trial session ვერ მოიძებნა.'}); return json(res,200,{ok:true,ref:sess.ref,plan:sess.plan,email:sess.email,cardAttached:sess.cardAttached,active:sess.active,createdAt:sess.createdAt,trialStartedAt:sess.trialStartedAt||null});
    }
    if(u.pathname==='/api/payments/bog/create-order'&&req.method==='POST'){
      const b=await body(req); const plan=b.plan==='pro'?'pro':'plus'; const term=normalizeTerm(b.termMonths); const user=currentUser(req); const out=await createBogOrder(plan,b.email||user?.email,b.promoCode,term,user); return json(res,200,out);
    }
    if(u.pathname==='/api/payments/bog/callback'){
      const b=await body(req).catch(()=>({}));
      let orderId=String(b.external_order_id||b.externalOrderId||b.order?.external_order_id||'');
      const bogOrderId=String(b.order_id||b.orderId||b.order?.id||'');
      if(!orders.has(orderId) && bogOrderId){
        const matched=Array.from(orders.entries()).find((entry)=>String(entry[1]?.provider?.id||entry[1]?.provider?.order_id||'')===bogOrderId);
        if(matched) orderId=matched[0];
      }
      if(orderId&&orders.has(orderId)){
        const o=orders.get(orderId);
        const status=String(b.order_status?.key||b.status||b.status_key||b.order_status?.value||b.order_status||'callback_received').toLowerCase();
        o.callbackStatus=status; o.updatedAt=Date.now();
        if(o.kind==='donation'){
          if(status==='completed'){
            try{
              const verified=await verifyAndRecordDonation(orderId,{order_id:bogOrderId||o.provider?.id||o.provider?.order_id||''});
              if(!verified && o.status!=='paid') o.status='verification_pending';
            }catch(e){
              if(o.status!=='paid') o.status='verification_pending';
              console.error('BOG donation verification failed:',e.message);
            }
          }else if(['rejected','expired','refunded','partially_refunded','cancelled','failed'].includes(status)){
            o.status=status;
            if(status==='refunded'||status==='partially_refunded') {
              donations=donations.filter(d=>d.orderId!==orderId);
              persistDonations();
            }
          }else if(o.status!=='paid'){o.status=status;}
          orders.set(orderId,o); persistOrders();
          return json(res,200,{ok:true});
        }
        o.callback=b; o.status=status; orders.set(orderId,o); persistOrders();
        if(['completed','paid','succeeded','success','successful','approved'].includes(status)&&!analytics.purchases.some(x=>x.orderId===orderId)){
          const amount=Number(o.totalAmount??b.purchase_units?.total_amount??b.total_amount??0)||0;
          keepRecent(analytics.purchases,{orderId,plan:o.plan||'plus',termMonths:o.termMonths||1,amount,currency:'GEL',status:'confirmed',provider:'BOG',at:Date.now()},10000);
          analytics.purchasesTotal=(analytics.purchasesTotal||0)+1; analytics.purchaseRevenueTotal=Math.round(((analytics.purchaseRevenueTotal||0)+amount)*100)/100; persistAnalytics();
        }
      }
      return json(res,200,{ok:true});
    }
    if(u.pathname==='/api/payments/status'){
      const id=u.searchParams.get('order'); const o=orders.get(id); return json(res,200,{ok:true,order:o||null});
    }
    if(u.pathname==='/api/weather'&&req.method==='GET'){
      const rawLat=u.searchParams.get('latitude'),rawLon=u.searchParams.get('longitude');
      const lat=Number(rawLat),lon=Number(rawLon);
      if(rawLat===null||rawLon===null||!rawLat.trim()||!rawLon.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180)return json(res,400,{ok:false,message:'Invalid coordinates'});
      res.setHeader('Cache-Control','no-store');
      try{
        const result=await getWeatherData(lat,lon,{force:u.searchParams.get('refresh')==='1'});
        const {__meta:meta,...data}=result;
        return json(res,200,{ok:true,data,meta});
      }catch(error){
        console.error('Weather unavailable:',error.message);
        return json(res,503,{ok:false,message:'Weather is temporarily unavailable'});
      }
    }
    serveStatic(req,res);
  }catch(e){console.error(e);json(res,500,{ok:false,message:e.message})}
});
server.listen(PORT,HOST,()=>console.log(`GeoNature server listening on http://${HOST}:${server.address().port}`));
