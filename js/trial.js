(function(){
'use strict';
const DURATION=72*60*60*1000,KEY_START='gn_trial_started_at',KEY_PLAN='gn_trial_plan',KEY_USED='gn_trial_used',KEY_REF='gn_trial_ref',KEY_VERIFIED='gn_trial_card_verified';
const base=String(window.GN_API_BASE_URL||document.querySelector('meta[name="gn-api-base"]')?.content||'').replace(/\/+$/,'');
const staticOnly=!base&&(location.protocol==='file:'||String(location.hostname||'').toLowerCase().endsWith('.github.io'));
const $=id=>document.getElementById(id),read=key=>{try{return localStorage.getItem(key)||'';}catch{return'';}};
let checking=false,busy=false,confirmedRef='',pollTimer=null,countdownTimer=null;
function local(){const started=Number(read(KEY_START)),plan=read(KEY_PLAN),elapsed=Date.now()-started,active=read(KEY_VERIFIED)==='1'&&started>0&&elapsed>=0&&elapsed<DURATION&&['plus','pro'].includes(plan);return {started,plan,active,remaining:active?DURATION-elapsed:0};}
function fmt(ms){const seconds=Math.max(0,Math.floor(ms/1000)),days=Math.floor(seconds/86400),hours=Math.floor((seconds%86400)/3600),minutes=Math.floor((seconds%3600)/60);return `${days} დღე ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;}
function status(message,ok=false){const element=$('trialStatus');if(element){element.textContent=message;element.classList.toggle('ok',ok);}}
function reference(){return new URLSearchParams(location.search).get('ref')||read(KEY_REF);}
async function api(path,options={}){const response=await fetch(base+path,{cache:'no-store',credentials:'include',...options}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||'სერვერთან კავშირი ვერ მოხერხდა. სცადე მოგვიანებით.');return data;}
function remember(data,ref){const started=Number(data.trialStartedAt);if(!['plus','pro'].includes(data.plan)||!Number.isFinite(started)||started<=0||started>Date.now()+60000)throw Error('საცდელი პერიოდის გააქტიურება ვერ დადასტურდა.');localStorage.setItem(KEY_REF,ref);localStorage.setItem(KEY_USED,'1');localStorage.setItem(KEY_START,String(started));localStorage.setItem(KEY_PLAN,data.plan);localStorage.setItem(KEY_VERIFIED,'1');if(pollTimer){clearInterval(pollTimer);pollTimer=null;}if(!countdownTimer)countdownTimer=setInterval(render,1000);}
async function refresh(ref){
  if(staticOnly||!ref||checking||busy||document.hidden||local().active||read(KEY_USED)==='1')return;
  checking=true;confirmedRef='';if($('activateTrialBtn'))$('activateTrialBtn').disabled=true;
  try{const data=await api('/api/trial/status?ref='+encodeURIComponent(ref));
    if(reference()!==ref)return;
    if(data.active){remember(data,ref);render();return;}
    if(data.cardAttached===true){localStorage.setItem(KEY_REF,ref);confirmedRef=ref;const badge=$('cardBadge');if(badge){badge.textContent='ბარათის მიბმა დადასტურებულია';badge.classList.add('attached');}if($('activateTrialBtn'))$('activateTrialBtn').disabled=false;status('ბარათის მიბმა დადასტურდა. შეგიძლია დაიწყო 72-საათიანი საცდელი პერიოდი.',true);}
    else{if($('cardBadge'))$('cardBadge').textContent='ბარათი ჯერ არ არის მიბმული';status('საცდელი პერიოდის დაწყებამდე ბარათის მიბმა აუცილებელია. მონაცემები შეიყვანე მხოლოდ ბანკის უსაფრთხო გვერდზე.');}
  }catch(error){status(error.message);if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}
  finally{checking=false;}
}
async function attach(plan){
  if(staticOnly||busy)return;const email=String($('trialEmail')?.value||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status('შეიყვანე მოქმედი ელფოსტა.');$('trialEmail')?.focus();return;}
  const button=$('attachCardBtn');busy=true;button.disabled=true;status('ბანკის უსაფრთხო გვერდი მზადდება…');
  try{const data=await api('/api/trial/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,email})});const url=new URL(String(data.redirectUrl||''),document.baseURI);if(!data.ref||url.protocol!=='https:')throw Error('ბარათის მიბმის უსაფრთხო გვერდი ვერ დადასტურდა.');localStorage.setItem(KEY_REF,data.ref);confirmedRef='';location.href=url.href;}
  catch(error){status(error.message);busy=false;button.disabled=false;}
}
async function activate(){
  const ref=reference(),button=$('activateTrialBtn');if(staticOnly||busy)return;if(!ref||ref!==confirmedRef){status('ჯერ დაადასტურე ბარათის მიბმა ბანკის უსაფრთხო გვერდზე.');return;}
  busy=true;button.disabled=true;status('საცდელი პერიოდი აქტიურდება…');
  try{const data=await api('/api/trial/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref})});remember(data,ref);location.href=data.plan==='pro'?'ai.html':'fishing.html';}
  catch(error){status(error.message);busy=false;button.disabled=false;}
}
function render(){
  const trial=local(),start=$('activateTrialBtn');if(trial.active){status(`${trial.plan==='pro'?'AI Pro':'Plus'} საცდელი პერიოდი აქტიურია • დარჩა ${fmt(trial.remaining)}.`,true);if(start)start.disabled=true;return;}
  if(read(KEY_USED)==='1'){status('საცდელი პერიოდი დასრულებულია. შეგიძლია ნახო ხელმისაწვდომი გეგმები.');if(start)start.disabled=true;return;}
  if(staticOnly){status('საცდელი პერიოდი ჯერ მიუწვდომელია: ბარათის მიბმის სერვისი არ არის დაკავშირებული. ბარათის მონაცემების შეყვანა საჭირო არ არის.');if(start)start.disabled=true;if($('attachCardBtn'))$('attachCardBtn').disabled=true;}
}
document.addEventListener('DOMContentLoaded',()=>{
  const plan=new URLSearchParams(location.search).get('plan')==='pro'?'pro':'plus';document.querySelectorAll('[data-trial-plan]').forEach(element=>element.textContent=plan==='pro'?'AI Pro':'Plus');$('trialStatus')?.setAttribute('role','status');$('trialStatus')?.setAttribute('aria-live','polite');if($('attachCardBtn'))$('attachCardBtn').onclick=()=>attach(plan);if($('activateTrialBtn'))$('activateTrialBtn').onclick=activate;render();
  if(!staticOnly){refresh(reference());if(local().active)countdownTimer=setInterval(render,1000);if(reference()&&!local().active&&read(KEY_USED)!=='1')pollTimer=setInterval(()=>refresh(reference()),15000);}
});
window.addEventListener('pagehide',()=>{clearInterval(pollTimer);clearInterval(countdownTimer);pollTimer=null;countdownTimer=null;});
window.addEventListener('pageshow',event=>{if(!event.persisted)return;render();if(staticOnly)return;if(local().active&&!countdownTimer)countdownTimer=setInterval(render,1000);else if(reference()&&read(KEY_USED)!=='1'){refresh(reference());if(!pollTimer)pollTimer=setInterval(()=>refresh(reference()),15000);}});
window.GeoNatureTrial={local,fmt};
})();
