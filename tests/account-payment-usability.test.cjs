const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture(file,{host='example.github.io',search='',fetcher,stored={}}={}){
  const nodes=new Map(),listeners=new Map(),timers=[],calls=[],values=new Map(Object.entries(stored));
  function node(id=''){const classes=new Set();return {id,value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,dataset:{},style:{},events:{},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),toggle(value,on){if(on)classes.add(value);else classes.delete(value);}},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this.events[type]=fn;},querySelector(){return null;},querySelectorAll(){return[];},append(){},appendChild(){},replaceChildren(){},focus(){},select(){}};}
  for(const id of ['bogStatus','bogPayBtn','payPrice','originalAmount','discountAmount','finalAmount','termChoices','plusSaleBanner','proSaleBanner','payPlanTitle','payPlanText','promoCode','applyPromoBtn','promoStatus','trialLink','trialStatus','activateTrialBtn','attachCardBtn','cardBadge','trialEmail'])nodes.set(id,node(id));
  nodes.get('activateTrialBtn').disabled=true;
  const context={Date,Intl,URL,URLSearchParams,Number,Math,CustomEvent:class{},location:{hostname:host,protocol:'https:',search,pathname:'/test',hash:'',href:''},localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)},document:{baseURI:'https://'+host+'/FISHHUNTt.ge/payment.html',readyState:'loading',hidden:false,documentElement:{dataset:{}},body:{appendChild(){}},getElementById:id=>nodes.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>node(),addEventListener:(key,fn)=>listeners.set(key,fn),dispatchEvent(){}},setInterval:fn=>{timers.push(fn);return timers.length;},clearInterval(){},setTimeout:fn=>{timers.push(fn);},clearTimeout(){},navigator:{},requestAnimationFrame:fn=>fn(),fetch:async(url,options)=>{calls.push({url,options});return fetcher?fetcher(url,options):{ok:false,status:404,json:async()=>({})};}};
  context.window=context;context.addEventListener=()=>{};context.dispatchEvent=()=>{};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context);
  return {context,nodes,values,calls,timers,async init(){await listeners.get('DOMContentLoaded')?.();}};
}
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const pricing=()=>response({pricing:{name:'Plus',regularPrice:5.99,currentPrice:2.99,saleActive:true}});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
test('static Pages payment and trial show unavailable without making backend requests or polling',async()=>{
  for(const file of ['bog-payment.js','trial.js']){
    const env=fixture(file,{search:'?ref=stale',stored:{gn_trial_ref:'old',gn_trial_card_verified:'1'}});await env.init();
    assert.equal(env.calls.length,0);assert.equal(env.timers.length,0);
    const status=env.nodes.get(file==='trial.js'?'trialStatus':'bogStatus').textContent;
    assert.match(status,/მიუწვდომელია|არ არის დაკავშირებული/);
    assert.equal(env.nodes.get(file==='trial.js'?'activateTrialBtn':'bogPayBtn').disabled,true);
  }
});
test('static 100 percent promo remains a price preview and cannot activate a plan',async()=>{
  const env=fixture('bog-payment.js');await env.init();env.nodes.get('promoCode').value='avtobest';await env.nodes.get('applyPromoBtn').onclick();
  assert.equal(env.nodes.get('finalAmount').textContent,'0.00 ₾');assert.equal(env.nodes.get('bogPayBtn').disabled,true);
  await env.nodes.get('bogPayBtn').onclick();assert.equal(env.calls.length,0);assert.equal(env.values.has('gn_plan'),false);assert.match(env.nodes.get('promoStatus').textContent,/წინასწარი გამოთვლა/);
});
test('an explicitly rejected server promo is not replaced by an optimistic public-code preview',async()=>{
  const env=fixture('bog-payment.js',{host:'localhost',fetcher:url=>url.includes('/pricing')?pricing():response({valid:false,message:'Promo expired'},400)});await env.init();env.nodes.get('promoCode').value='avtobest';await env.nodes.get('applyPromoBtn').onclick();
  assert.equal(env.nodes.get('finalAmount').textContent,'2.99 ₾');assert.equal(env.nodes.get('promoStatus').textContent,'Promo expired');assert.equal(env.values.has('gn_plan'),false);
});
test('changing a promo while validation is pending prevents a stale discount from applying',async()=>{
  const pending=deferred(),env=fixture('bog-payment.js',{host:'localhost',fetcher:url=>url.includes('/pricing')?pricing():pending.promise});await env.init();const input=env.nodes.get('promoCode');input.value='niko50';const applying=env.nodes.get('applyPromoBtn').onclick();input.value='other';input.events.input();pending.resolve(response({valid:true,code:'niko50',percent:50,total:1.5}));await applying;
  assert.equal(env.nodes.get('finalAmount').textContent,'2.99 ₾');assert.equal(env.nodes.get('applyPromoBtn').disabled,false);
});
test('rapid repeated checkout clicks create one order and reject non-HTTPS bank redirects',async()=>{
  const pending=deferred(),env=fixture('bog-payment.js',{host:'localhost',fetcher:url=>url.includes('/pricing')?pricing():pending.promise});await env.init();const button=env.nodes.get('bogPayBtn'),first=button.onclick();await button.onclick();assert.equal(env.calls.filter(call=>call.url.includes('create-order')).length,1);
  pending.resolve(response({checkoutUrl:'javascript:alert(1)'}));await first;assert.equal(env.context.location.href,'');assert.equal(button.disabled,false);assert.match(env.nodes.get('bogStatus').textContent,/უსაფრთხო მისამართი/);
});
test('a stale saved trial card state cannot enable activation until the current reference is confirmed',async()=>{
  const env=fixture('trial.js',{host:'localhost',search:'?ref=current',stored:{gn_trial_ref:'old',gn_trial_card_verified:'1'},fetcher:()=>response({cardAttached:false})});await env.init();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(env.calls.length,1);assert.match(env.calls[0].url,/ref=current/);assert.equal(env.nodes.get('activateTrialBtn').disabled,true);await env.nodes.get('activateTrialBtn').onclick();assert.equal(env.calls.length,1);
});
test('a future-dated trial timestamp never unlocks Premium',()=>{
  const stored={gn_trial_started_at:String(Date.now()+86400000),gn_trial_card_verified:'1',gn_trial_plan:'pro'};
  const trial=fixture('trial.js',{stored});assert.equal(trial.context.GeoNatureTrial.local().active,false);
  const premium=fixture('premium.js',{stored});assert.equal(premium.context.GNPremium.currentPlan(),'free');
});
test('plan saving deduplicates identical selections and preserves selected trip dates',()=>{
  const env=fixture('geonature-plus.js');const app=env.context.GeoNaturePlus;
  assert.equal(app.addPlan('fishing','კობრი','ჟინვალი • 2 დღე','2026-10-20'),true);assert.equal(app.addPlan('fishing','კობრი','ჟინვალი • 2 დღე','2026-10-20'),true);
  assert.equal(app.state().plans.length,1);assert.equal(app.state().plans[0].date,'2026-10-20');assert.equal(app.state().xp,20);
});
test('removing and readding a favorite does not award duplicate XP',()=>{
  const env=fixture('geonature-plus.js'),app=env.context.GeoNaturePlus;
  app.toggleFavorite('კობრი');app.toggleFavorite('კობრი');app.toggleFavorite('კობრი');
  assert.equal(app.state().favorites.length,1);assert.equal(app.state().xp,15);
});
test('storage failures preserve plans and favorites and report failure instead of success',()=>{
  const env=fixture('geonature-plus.js'),app=env.context.GeoNaturePlus;env.context.localStorage.setItem=()=>{throw Error('Quota exceeded');};
  assert.equal(app.addPlan('fishing','კობრი','ტბა'),false);assert.equal(app.toggleFavorite('კობრი'),false);assert.equal(app.state().plans.length,0);assert.equal(app.state().favorites.length,0);assert.equal(app.state().xp,0);
});
