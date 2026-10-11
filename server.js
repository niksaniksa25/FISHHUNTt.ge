const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
const PUBLIC_BASE_URL=process.env.PUBLIC_BASE_URL||`http://localhost:${PORT}`;
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

// Resilient weather gateway: server-side proxy, timeout/retry, 5-minute cache,
// and stale-last-known-good fallback. The browser also has a direct fallback.
const weatherCache=new Map();
const WEATHER_CACHE_TTL=5*60*1000;
const WEATHER_STALE_TTL=90*60*1000;
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function fetchJsonTimeout(url,options={},timeoutMs=12000){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{ const r=await fetch(url,{...options,signal:ctrl.signal,headers:{Accept:'application/json',...(options.headers||{})}}); const txt=await r.text(); let data={}; try{data=JSON.parse(txt)}catch{throw new Error('Invalid weather JSON')} if(!r.ok)throw new Error(`HTTP ${r.status}`); return data; }
  finally{clearTimeout(t)}
}
function weatherUrl(lat,lon,model='best_match'){
  const q=new URLSearchParams({latitude:String(lat),longitude:String(lon),timezone:'auto',forecast_days:'16',models:model,
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly:'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max'});
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}
async function getWeatherData(lat,lon){
  const key=`${lat.toFixed(4)},${lon.toFixed(4)}`; const now=Date.now(); const cached=weatherCache.get(key);
  if(cached && now-cached.updatedAt<WEATHER_CACHE_TTL) return {...cached.data,__meta:{source:cached.source,updatedAt:cached.updatedAt,stale:false}};
  let lastErr=null;
  for(const model of ['best_match','ecmwf_ifs04','gfs_seamless']){
    for(let attempt=0;attempt<2;attempt++){
      try{
        const data=await fetchJsonTimeout(weatherUrl(lat,lon,model),{},12000);
        if(!data?.current || !data?.hourly || !data?.daily) throw new Error('Incomplete weather response');
        weatherCache.set(key,{data,updatedAt:now,source:`Open-Meteo • ${model}`});
        return {...data,__meta:{source:`Open-Meteo • ${model}`,updatedAt:now,stale:false}};
      }catch(e){lastErr=e;if(attempt===0)await sleep(350)}
    }
  }
  if(cached && now-cached.updatedAt<WEATHER_STALE_TTL){
    return {...cached.data,__meta:{source:cached.source,updatedAt:cached.updatedAt,stale:true}};
  }
  throw lastErr||new Error('Weather unavailable');
}

// Simple production-friendly account layer using Node's built-in crypto.
// Passwords are never stored as plain text. Accounts persist in users.json;
// sessions are random HttpOnly cookies persisted in sessions.json.
const USERS_FILE=path.join(__dirname,'users.json');
const SESSIONS_FILE=path.join(__dirname,'sessions.json');
const SESSION_TTL=30*24*60*60*1000;
const SESSION_SECRET=process.env.GEONATURE_SESSION_SECRET||'change-this-in-production';
function readJsonFile(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function writeJsonFile(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2),'utf8')}
let users=readJsonFile(USERS_FILE,[]);
let sessions=readJsonFile(SESSIONS_FILE,{});
const ORDERS_FILE=path.join(__dirname,'orders.json');
for(const [savedId,savedOrder] of Object.entries(readJsonFile(ORDERS_FILE,{}))) orders.set(savedId,savedOrder);
function persistOrders(){ writeJsonFile(ORDERS_FILE,Object.fromEntries(orders.entries())); }

const DONATIONS_FILE=path.join(__dirname,'donations.json');
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

const ANALYTICS_FILE=path.join(__dirname,'analytics.json');
const FEEDBACK_FILE=path.join(__dirname,'feedback.json');
let analytics=readJsonFile(ANALYTICS_FILE,{visitors:{},pageViews:[],pageViewsTotal:0,logins:[],loginsTotal:0,registrations:[],purchases:[],purchasesTotal:0,purchaseRevenueTotal:0});
analytics.visitors=analytics.visitors&&typeof analytics.visitors==='object'?analytics.visitors:{};
for(const k of ['pageViews','logins','registrations','purchases']) if(!Array.isArray(analytics[k])) analytics[k]=[];
for(const k of ['pageViewsTotal','loginsTotal','purchasesTotal','purchaseRevenueTotal']) if(!Number.isFinite(Number(analytics[k]))) analytics[k]=0;
analytics.pageViewsTotal=Math.max(analytics.pageViewsTotal,analytics.pageViews.length);
analytics.loginsTotal=Math.max(analytics.loginsTotal,analytics.logins.length);
analytics.purchasesTotal=Math.max(analytics.purchasesTotal,analytics.purchases.length);
if(analytics.purchaseRevenueTotal===0&&analytics.purchases.length) analytics.purchaseRevenueTotal=analytics.purchases.reduce((sum,x)=>sum+(Number(x.amount)||0),0);
let feedbackItems=readJsonFile(FEEDBACK_FILE,[]); if(!Array.isArray(feedbackItems)) feedbackItems=[];
const feedbackRate=new Map();
function persistAnalytics(){ writeJsonFile(ANALYTICS_FILE,analytics); }
function persistFeedback(){ writeJsonFile(FEEDBACK_FILE,feedbackItems); }
function keepRecent(arr,item,max=20000){ arr.push(item); if(arr.length>max) arr.splice(0,arr.length-max); }
function normalizeEmail(email){return String(email||'').trim().toLowerCase()}
function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function hashPassword(password,salt){return crypto.scryptSync(password,salt,64).toString('hex')}
function createPasswordHash(password){const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:hashPassword(password,salt)} }
function verifyPassword(password,user){try{const got=hashPassword(password,user.passwordSalt);return crypto.timingSafeEqual(Buffer.from(got,'hex'),Buffer.from(user.passwordHash,'hex'))}catch{return false}}
function cleanUser(user){return {id:user.id,email:user.email,createdAt:user.createdAt,role:user.role||'user',plan:user.plan||'free',planExpiresAt:user.planExpiresAt||null,displayName:user.displayName||'',avatarId:user.avatarId||'free-fish',backgroundId:user.backgroundId||'bg-fishing-lake'}}
function cookieToken(req){const m=String(req.headers.cookie||'').match(/(?:^|;\s*)gn_session=([^;]+)/);return m?decodeURIComponent(m[1]):''}
function currentUser(req){const token=cookieToken(req);const rec=sessions[token];if(!rec)return null;if(Date.now()>rec.expiresAt){delete sessions[token];writeJsonFile(SESSIONS_FILE,sessions);return null}return users.find(u=>u.id===rec.userId)||null}
function requestIsSecure(req){
  const forwarded=String(req?.headers?.['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
  return process.env.COOKIE_SECURE==='true' || forwarded==='https' || Boolean(req?.socket?.encrypted);
}
function setSessionCookie(res,userId,req,remember=true){
  const token=crypto.randomBytes(32).toString('base64url');
  const ttl=remember?SESSION_TTL:24*60*60*1000;
  sessions[token]={userId,createdAt:Date.now(),expiresAt:Date.now()+ttl};
  writeJsonFile(SESSIONS_FILE,sessions);
  const secure=requestIsSecure(req);
  const maxAge=remember?`; Max-Age=${Math.floor(ttl/1000)}`:'';
  res.setHeader('Set-Cookie',`gn_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secure?'; Secure':''}`);
}
function clearSessionCookie(res,req){
  const token=cookieToken(req);
  if(token){delete sessions[token];writeJsonFile(SESSIONS_FILE,sessions)}
  const secure=requestIsSecure(req);
  res.setHeader('Set-Cookie',`gn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`);
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
function setAdminCookie(res,req,remember=true){ const token=crypto.randomBytes(32).toString('base64url'); const ttl=remember?SESSION_TTL:8*60*60*1000; sessions['__admin__:'+token]={userId:'ADMIN',createdAt:Date.now(),expiresAt:Date.now()+ttl}; writeJsonFile(SESSIONS_FILE,sessions); const secure=requestIsSecure(req); res.setHeader('Set-Cookie',`gn_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttl/1000)}${secure?'; Secure':''}`); }
function clearAdminCookie(res,req){ const token=cookieValue(req,'gn_admin'); if(token){delete sessions['__admin__:'+token];writeJsonFile(SESSIONS_FILE,sessions)} const secure=requestIsSecure(req); res.setHeader('Set-Cookie',`gn_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`); }
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
  let p=new URL(req.url,`http://${req.headers.host}`).pathname; if(p==='/')p='/index.html';
  const safe=path.normalize(p).replace(/^\/+/, ''); const fp=path.join(__dirname,safe);
  if(!fp.startsWith(__dirname)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('Not found')}
  const ext=path.extname(fp).toLowerCase();const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
  const headers={'Content-Type':types[ext]||'application/octet-stream'}; if(['.html','.js','.css'].includes(ext)) headers['Cache-Control']='no-store, max-age=0'; res.writeHead(200,headers);fs.createReadStream(fp).pipe(res);
}

// ---------------- Web Push notifications ----------------
const PUSH_STATE_FILE=path.join(__dirname,'push-state.json');
let pushState=readJsonFile(PUSH_STATE_FILE,{vapid:null,subscriptions:[]});
function b64u(buf){return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function fromB64u(s){const str=String(s||'').replace(/-/g,'+').replace(/_/g,'/');return Buffer.from(str+'='.repeat((4-str.length%4)%4),'base64')}
function rawPublicKeyFromJwk(jwk){return Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')])}
function ensureVapid(){
  if(pushState.vapid?.publicJwk&&pushState.vapid?.privateJwk&&pushState.vapid?.publicKey){return pushState.vapid}
  const kp=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const publicJwk=kp.publicKey.export({format:'jwk'});
  const privateJwk=kp.privateKey.export({format:'jwk'});
  pushState.vapid={publicJwk,privateJwk,publicKey:b64u(rawPublicKeyFromJwk(publicJwk))};
  writeJsonFile(PUSH_STATE_FILE,pushState);
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
function hkdf(salt,ikm,info,len){return Buffer.from(crypto.hkdfSync('sha256',salt,ikm,info,len))}
function encryptWebPush(subscription,payload){
  const uaPublic=fromB64u(subscription.keys.p256dh); const auth=fromB64u(subscription.keys.auth); if(uaPublic.length!==65)throw new Error('Invalid p256dh');
  const v=ensureVapid(); const asPublic=rawPublicKeyFromJwk(v.publicJwk);
  const ecdh=crypto.createECDH('prime256v1'); ecdh.generateKeys(); const senderPublic=ecdh.getPublicKey(null,'uncompressed'); const shared=ecdh.computeSecret(uaPublic);
  const prkKey=hkdf(auth,shared,Buffer.alloc(0),32); const context=Buffer.concat([Buffer.from('WebPush: info\0'),uaPublic,asPublic]); const ikm=hkdf(Buffer.alloc(32),prkKey,context,32);
  const salt=crypto.randomBytes(16); const prk=hkdf(salt,ikm,Buffer.alloc(0),32); const cek=hkdf(Buffer.alloc(0),prk,Buffer.from('Content-Encoding: aes128gcm\0'),16); const nonce=hkdf(Buffer.alloc(0),prk,Buffer.from('Content-Encoding: nonce\0'),12);
  const padded=Buffer.concat([Buffer.from(JSON.stringify(payload)),Buffer.from([2])]); const cipher=crypto.createCipheriv('aes-128-gcm',cek,nonce); const ct=Buffer.concat([cipher.update(padded),cipher.final(),cipher.getAuthTag()]);
  const rs=Buffer.alloc(4);rs.writeUInt32BE(4096,0); const idLen=Buffer.from([senderPublic.length]); const body=Buffer.concat([salt,rs,idLen,senderPublic,ct]); return body;
}
async function sendPush(subscription,payload){
  const endpoint=new URL(subscription.endpoint); const audience=`${endpoint.protocol}//${endpoint.host}`; const vapid=signVapid(audience); const body=encryptWebPush(subscription,payload);
  const r=await fetch(subscription.endpoint,{method:'POST',headers:{TTL:'86400',Urgency:'normal','Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',Authorization:`vapid t=${vapid.jwt}, k=${vapid.publicKey}`},body});
  if(r.status===404||r.status===410)throw Object.assign(new Error('Push subscription expired'),{code:'GONE'}); if(!r.ok)throw new Error(`Push provider HTTP ${r.status}`); return true;
}

function donationCors(req,res){
  const origin=String(req.headers.origin||'');
  const configured=String(process.env.DONATION_FRONTEND_ORIGIN||'https://niksaniksa25.github.io').replace(/\/+$/,'');
  const local=/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if(origin && (origin.replace(/\/+$/,'')===configured || local)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
}
function pushCors(req,res){const origin=String(req.headers.origin||''); if(origin&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}else if(!origin){res.setHeader('Access-Control-Allow-Origin','*')}res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
function pushPrefsValid(p){return p&&Array.isArray(p.fish)&&Array.isArray(p.places)}
function normalizePushSub(sub){return {endpoint:String(sub?.endpoint||''),keys:{p256dh:String(sub?.keys?.p256dh||''),auth:String(sub?.keys?.auth||'')}}}
function calcPushScore(weather,fish){
  const cur=weather?.current||{}; const now=new Date(); let score=48; const temp=Number(cur.temperature_2m), wind=Number(cur.wind_speed_10m), precip=Number(cur.precipitation||0), pressure=Number(cur.pressure_msl||cur.surface_pressure||1015), hour=now.getHours();
  const tmin=Number(fish?.temp?.min),tmax=Number(fish?.temp?.max); if(Number.isFinite(temp)&&Number.isFinite(tmin)&&Number.isFinite(tmax)){const mid=(tmin+tmax)/2,span=Math.max(2,(tmax-tmin)/2);score+=Math.max(-18,18-Math.abs(temp-mid)/span*18)}
  const tags=new Set(fish?.tags||[]); const good=(tags.has('morning')&&hour>=5&&hour<=10)||(tags.has('day')&&hour>=9&&hour<=17)||(tags.has('evening')&&hour>=17&&hour<=21)||(tags.has('night')&&(hour>=21||hour<=3)); if(good)score+=18; else score-=3;
  if(Number.isFinite(wind))score+=wind<=8?10:wind<=15?5:wind<=22?0:-8; if(precip<=0.3)score+=7; else if(precip<=2)score+=2; else score-=7; if(pressure>=1005&&pressure<=1027)score+=5; return Math.max(0,Math.min(98,Math.round(score)));
}
async function runPushChecks(){
  let changed=false;
  for(const sub of pushState.subscriptions.slice()){
    if(!sub.enabled||!pushPrefsValid(sub.preferences)||!sub.subscription?.endpoint)continue;
    sub.lastSent=sub.lastSent||{};
    for(const fish of sub.preferences.fish.slice(0,5)){
      for(const place of sub.preferences.places.slice(0,5)){
        try{
          const w=await getWeatherData(Number(place.lat),Number(place.lon)); const score=calcPushScore(w,fish); const key=`${fish.id}|${place.id}`; const last=Number(sub.lastSent[key]||0);
          if(score<72 || Date.now()-last<6*60*60*1000)continue;
          await sendPush(sub.subscription,{title:'🎣 GeoNature • დროა!',body:`${fish.name} • ${place.name}: აქტივობის შანსი ${score}%. კარგი დროა შესამოწმებლად.`,url:`/fishing.html?fish=${encodeURIComponent(fish.id)}&water=${encodeURIComponent(place.id)}`,tag:`fish-${fish.id}-${place.id}`});
          sub.lastSent[key]=Date.now();changed=true;
        }catch(e){if(e.code==='GONE'){sub.enabled=false;changed=true}}
      }
    }
  }
  if(changed)writeJsonFile(PUSH_STATE_FILE,pushState);
}
setInterval(()=>{runPushChecks().catch(()=>{})},15*60*1000);
setTimeout(()=>{runPushChecks().catch(()=>{})},20*1000);
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host}`);

    if(u.pathname.startsWith('/api/push/')){
      pushCors(req,res);
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      ensureVapid();
      if(u.pathname==='/api/push/config'&&req.method==='GET')return json(res,200,{ok:true,publicKey:pushState.vapid.publicKey});
      if(u.pathname==='/api/push/subscribe'&&req.method==='POST'){
        const b=await body(req); const clientId=String(b.clientId||'').trim(); const subscription=normalizePushSub(b.subscription); if(clientId.length<8||!subscription.endpoint||!subscription.keys.p256dh||!subscription.keys.auth) return json(res,400,{ok:false,message:'Push მონაცემები არასრულია.'});
        const preferences=pushPrefsValid(b.preferences)?b.preferences:{fish:[],places:[]}; let rec=pushState.subscriptions.find(x=>x.clientId===clientId); if(!rec){rec={clientId,createdAt:Date.now(),enabled:true,lastSent:{}};pushState.subscriptions.push(rec)} rec.subscription=subscription;rec.preferences=preferences;rec.enabled=true;writeJsonFile(PUSH_STATE_FILE,pushState);return json(res,200,{ok:true,message:'შეტყობინებები ჩართულია.'});
      }
      if(u.pathname==='/api/push/preferences'&&req.method==='POST'){
        const b=await body(req);const rec=pushState.subscriptions.find(x=>x.clientId===String(b.clientId||''));if(!rec)return json(res,404,{ok:false,message:'Push ჯერ არ ჩაგირთავს.'});if(!pushPrefsValid(b.preferences))return json(res,400,{ok:false,message:'არჩევანი არასწორია.'});rec.preferences=b.preferences;rec.enabled=true;writeJsonFile(PUSH_STATE_FILE,pushState);return json(res,200,{ok:true,message:'არჩევანი შეინახა.'});
      }
      if(u.pathname==='/api/push/unsubscribe'&&req.method==='POST'){
        const b=await body(req);const rec=pushState.subscriptions.find(x=>x.clientId===String(b.clientId||''));if(rec){rec.enabled=false;writeJsonFile(PUSH_STATE_FILE,pushState)}return json(res,200,{ok:true});
      }
      if(u.pathname==='/api/push/test'&&req.method==='POST'){
        const b=await body(req);const rec=pushState.subscriptions.find(x=>x.clientId===String(b.clientId||''));if(!rec||!rec.subscription)return json(res,404,{ok:false,message:'ჯერ ჩართე შეტყობინებები.'});
        try{await sendPush(rec.subscription,{title:'🔔 GeoNature',body:'სატესტო შეტყობინება წარმატებით მოვიდა. Push მუშაობს!',url:'/dashboard.html',tag:'geonature-test'});return json(res,200,{ok:true,message:'📨 სატესტო შეტყობინება გაიგზავნა.'})}catch(e){if(e.code==='GONE'){rec.enabled=false;writeJsonFile(PUSH_STATE_FILE,pushState)}return json(res,502,{ok:false,message:'Push პროვაიდერმა შეტყობინება ვერ მიიღო.'})}
      }
      if(u.pathname==='/api/push/check-now'&&req.method==='POST'){runPushChecks().catch(()=>{});return json(res,200,{ok:true,message:'შემოწმება დაიწყო.'});}
    }

    if(u.pathname.startsWith('/api/donations/')){
      donationCors(req,res);
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      if(u.pathname==='/api/donations/leaderboard'&&req.method==='GET'){
        return json(res,200,{ok:true,donations:donationLeaderboard()});
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
      const title=String(b.title||'').replace(/[<>\u0000-\u001f]/g,'').slice(0,120);
      const now=Date.now(); const rec=analytics.visitors[visitorId]||{firstSeen:now,lastSeen:now,pageViews:0};
      rec.lastSeen=now; rec.lastPath=page; rec.pageViews=(rec.pageViews||0)+1; analytics.visitors[visitorId]=rec;
      keepRecent(analytics.pageViews,{visitorId,path:page,title,at:now},20000); analytics.pageViewsTotal=(analytics.pageViewsTotal||0)+1; persistAnalytics();
      return json(res,200,{ok:true});
    }
    if(u.pathname==='/api/feedback'&&req.method==='POST'){
      const b=await body(req); const visitorId=String(b.visitorId||'').trim();
      const message=String(b.message||'').replace(/\u0000/g,'').trim();
      const category=['bug','idea','question','other'].includes(String(b.category||''))?String(b.category):'bug';
      const contactEmail=normalizeEmail(b.email||''); const page=String(b.page||'/').split('?')[0].slice(0,180);
      if(message.length<8) return json(res,400,{ok:false,message:'აღწერე პრობლემა მინიმუმ 8 სიმბოლოთი.'});
      if(message.length>4000) return json(res,400,{ok:false,message:'შეტყობინება 4000 სიმბოლოზე მოკლე უნდა იყოს.'});
      if(contactEmail && !validEmail(contactEmail)) return json(res,400,{ok:false,message:'ელფოსტის ფორმატი არასწორია.'});
      const rateKey=/^[A-Za-z0-9_-]{16,80}$/.test(visitorId)?visitorId:'anonymous'; const now=Date.now(); const recent=(feedbackRate.get(rateKey)||[]).filter(t=>now-t<15*60*1000);
      if(recent.length>=5) return json(res,429,{ok:false,message:'ძალიან ბევრი შეტყობინება გაიგზავნა. სცადე 15 წუთში.'});
      recent.push(now); feedbackRate.set(rateKey,recent);
      const user=currentUser(req); const item={id:`fb_${now}_${crypto.randomBytes(5).toString('hex')}`,category,message,email:contactEmail||null,page:page.startsWith('/')?page:'/'+page,visitorId:/^[A-Za-z0-9_-]{16,80}$/.test(visitorId)?visitorId:null,userId:user?.id||null,accountEmail:user?.email||null,createdAt:now,status:'new'};
      feedbackItems.push(item); if(feedbackItems.length>5000) feedbackItems=feedbackItems.slice(-5000); persistFeedback();
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
      return json(res,200,{ok:true,stats:{users:regularUsers.length,registrations:regularUsers.length,activePlans,admins,orders:orders.size,uniqueVisitors:Object.keys(analytics.visitors).length,pageViews:analytics.pageViewsTotal||analytics.pageViews.length,logins:analytics.loginsTotal||analytics.logins.length,purchases:analytics.purchasesTotal||analytics.purchases.length,revenue:Math.round(revenue*100)/100,purchasesByPlan:byPlan,feedbackUnread,recent,recentPurchases:analytics.purchases.slice(-15).reverse()}});
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
      item.status=status; item.updatedAt=Date.now(); persistFeedback(); return json(res,200,{ok:true,item});
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
    if(u.pathname==='/api/health')return json(res,200,{ok:true,paymentProvider:'BOG',configured:Boolean(CLIENT_ID&&CLIENT_SECRET)});
    if(u.pathname==='/api/payments/pricing'&&req.method==='GET'){
      const plan=u.searchParams.get('plan')==='pro'?'pro':'plus'; const term=normalizeTerm(u.searchParams.get('term')); return json(res,200,{ok:true,plan,term,pricing:planPricing(plan),termPricing:termPricing(plan,term),terms:Object.fromEntries(Object.keys(TERM_OPTIONS).map(k=>[k,termPricing(plan,Number(k))])),plans:{plus:planPricing('plus'),pro:planPricing('pro')}});
    }
    if(u.pathname==='/api/payments/promo/validate'&&req.method==='POST'){
      const b=await body(req); const plan=b.plan==='pro'?'pro':'plus'; const term=normalizeTerm(b.termMonths); const result=resolvePromo(b.code,plan,term);
      if(b.code && !result.valid) return json(res,400,{ok:false,message:'Public promo code არასწორია.'});
      return json(res,200,{ok:true,plan,...result});
    }
    if(u.pathname==='/api/trial/create'&&req.method==='POST'){
      const b=await body(req); const plan=b.plan==='pro'?'pro':'plus';
      if(!BOG_TRIAL_SETUP_URL) return json(res,503,{ok:false,message:'BOG trial card-setup URL ჯერ არ არის კონფიგურირებული. ჩასვი BOG_TRIAL_SETUP_URL .env-ში.'});
      const email=String(b.email||currentUser(req)?.email||'').trim();
      if(!email) return json(res,400,{ok:false,message:'Trial-ისთვის ელფოსტა აუცილებელია.'});
      const session=createTrialSession(plan,email);
      return json(res,200,{ok:true,ref:session.ref,redirectUrl:trialUrlFor(session.ref,email,plan)});
    }
    if(u.pathname==='/api/trial/callback'&&req.method==='GET'){
      const ref=u.searchParams.get('ref')||''; const status=(u.searchParams.get('status')||'').toLowerCase(); const sess=trialSessions.get(ref);
      if(!sess) return json(res,404,{ok:false,message:'Trial session ვერ მოიძებნა.'});
      if(['success','succeeded','approved','attached'].includes(status)){ sess.cardAttached=true; sess.cardAttachedAt=Date.now(); trialSessions.set(ref,sess); return res.writeHead(302,{Location:`/trial.html?ref=${encodeURIComponent(ref)}&attached=1`}),res.end(); }
      return res.writeHead(302,{Location:`/trial.html?ref=${encodeURIComponent(ref)}&attached=0`}),res.end();
    }
    if(u.pathname==='/api/trial/status'&&req.method==='GET'){
      const ref=u.searchParams.get('ref')||''; const sess=trialSessions.get(ref); if(!sess) return json(res,404,{ok:false,message:'Trial session ვერ მოიძებნა.'}); return json(res,200,{ok:true,ref:sess.ref,plan:sess.plan,email:sess.email,cardAttached:sess.cardAttached,active:sess.active,createdAt:sess.createdAt,trialStartedAt:sess.trialStartedAt||null});
    }
    if(u.pathname==='/api/trial/activate'&&req.method==='POST'){
      const b=await body(req); const sess=trialSessions.get(String(b.ref||''));
      if(!sess) return json(res,404,{ok:false,message:'Trial session ვერ მოიძებნა.'});
      if(!sess.cardAttached) return json(res,400,{ok:false,message:'Trial-ის დაწყებამდე BOG-ში ბარათის მიბმა აუცილებელია.'});
      if(sess.active) return json(res,409,{ok:false,message:'ეს trial უკვე აქტიურია.'});
      sess.active=true; sess.trialStartedAt=Date.now(); sess.expiresAt=Date.now()+72*60*60*1000; trialSessions.set(sess.ref,sess);
      return json(res,200,{ok:true,plan:sess.plan,ref:sess.ref,trialStartedAt:sess.trialStartedAt,expiresAt:sess.expiresAt});
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
            if(status==='refunded') {
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
      const lat=Number(u.searchParams.get('latitude')); const lon=Number(u.searchParams.get('longitude'));
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180) return json(res,400,{ok:false,message:'Invalid coordinates'});
      const data=await getWeatherData(lat,lon);
      const meta=data.__meta||{}; delete data.__meta;
      res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=240');
      return json(res,200,{ok:true,data,meta});
    }
    serveStatic(req,res);
  }catch(e){console.error(e);json(res,500,{ok:false,message:e.message})}
});
server.listen(PORT,HOST,()=>console.log(`GeoNature server listening on http://${HOST}:${PORT}`));
