/* GeoNature Premium — product tiers and UI gating
   Real billing must be connected to a server-side payment provider.
   This file only controls client-side feature visibility after a plan is supplied by the backend.
*/
(function(){
  'use strict';
  const PLANS={free:0,plus:1,pro:2};
  const PLAN_INFO={
    free:{name:'Free',price:'0 ₾',days:1},
    plus:{name:'GeoNature Plus',price:'2.99 ₾ / თვე',days:3},
    pro:{name:'GeoNature AI Pro',price:'7.99 ₾ / თვე',days:7}
  };
  // Fill these with your real checkout URLs when your payment provider is connected.
  const CHECKOUT_URLS={plus:'payment.html?plan=plus',pro:'payment.html?plan=pro'};

  const TRIAL_MS=72*60*60*1000;
  function trialPlan(){
    try{
      const started=Number(localStorage.getItem('gn_trial_started_at')||0);
      const verified=localStorage.getItem('gn_trial_card_verified')==='1';
      const trial=localStorage.getItem('gn_trial_plan')||'';
      if(verified && started>0 && Date.now()>=started && (Date.now()-started)<TRIAL_MS && PLANS[trial]!==undefined && trial!=='free') return trial;
      if(started && (Date.now()-started)>=TRIAL_MS){
        localStorage.removeItem('gn_trial_started_at');
        localStorage.removeItem('gn_trial_plan');
      }
    }catch(_){}
    return '';
  }
  function adminUnlocked(){
    try{return localStorage.getItem('gn_admin_local')==='1';}catch(_){return false;}
  }
  function currentPlan(){
    try{
      if(adminUnlocked()) return 'pro';
      const tr=trialPlan(); if(tr) return tr;
      const expiry=Number(localStorage.getItem('gn_plan_expires_at')||0);
      if(expiry>0&&Date.now()>=expiry){try{localStorage.setItem('gn_plan','free');localStorage.removeItem('gn_plan_expires_at');localStorage.setItem('gn_plan_updated_at',new Date().toISOString());}catch{} return 'free';}
      const raw=localStorage.getItem('gn_plan')||'free';
      return PLANS[raw]!==undefined?raw:'free';
    }catch(_){return 'free';}
  }
  async function syncAdminState(){
    const base=String(window.GN_API_BASE_URL||document.querySelector('meta[name="gn-api-base"]')?.content||'').replace(/\/+$/,'');
    if(!base&&(location.protocol==='file:'||String(location.hostname||'').toLowerCase().endsWith('.github.io')))return adminUnlocked();
    try{
      const r=await fetch(base+'/api/admin/me',{credentials:'include',cache:'no-store'});
      if(r.ok){const d=await r.json(); if(d.admin){localStorage.setItem('gn_admin_local','1'); return true;}
        if(localStorage.getItem('gn_admin_local')==='1') localStorage.removeItem('gn_admin_local');
      }
    }catch(_){}
    return adminUnlocked();
  }
  function setPlan(plan){
    if(PLANS[plan]===undefined) return false;
    try{localStorage.setItem('gn_plan',plan);localStorage.setItem('gn_plan_updated_at',new Date().toISOString());const expiry=Number(localStorage.getItem('gn_plan_expires_at')||0);if(plan==='free'||(expiry>0&&expiry<=Date.now()))localStorage.removeItem('gn_plan_expires_at');}catch(_){return false;}
    document.documentElement.dataset.gnPlan=currentPlan();
    window.dispatchEvent(new CustomEvent('gn:premium-ready',{detail:{plan:currentPlan(),admin:adminUnlocked()}}));
    return true;
  }
  function has(required){return PLANS[currentPlan()]>=PLANS[required];}
  function maxForecastDays(){return PLAN_INFO[currentPlan()].days;}
  function formatPlan(required){return PLAN_INFO[required]?.name||required;}
  function staticDeployment(){const base=String(window.GN_API_BASE_URL||document.querySelector('meta[name="gn-api-base"]')?.content||'').trim();return !base&&(location.protocol==='file:'||String(location.hostname||'').toLowerCase().endsWith('.github.io'));}
  function pricingUrl(required){return `premium.html?plan=${encodeURIComponent(required)}`;}

  function showToast(message,required='plus'){
    let t=document.getElementById('gnPremiumToast');
    if(!t){
      t=document.createElement('div');t.id='gnPremiumToast';t.className='gn-premium-toast';
      document.body.appendChild(t);
    }
    t.innerHTML=`<div><b>🔒 ${formatPlan(required)} ფუნქცია</b><span>${message}${staticDeployment()?' გეგმის გააქტიურება ამჟამად მიუწვდომელია.':''}</span></div><a href="${pricingUrl(required)}">გეგმების ნახვა →</a>`;
    requestAnimationFrame(()=>t.classList.add('show'));
    clearTimeout(showToast._timer);showToast._timer=setTimeout(()=>t.classList.remove('show'),5500);
  }

  function applyDayLimit(select){
    if(!select)return;
    const max=maxForecastDays();
    [...select.options].forEach(o=>{
      const n=Number(o.value);
      o.disabled=Number.isFinite(n)&&n>max;
      o.dataset.requiredPlan=n<=1?'free':n<=3?'plus':'pro';
    });
    if(Number(select.value)>max)select.value=String(max);
    const parent=select.parentElement;
    if(parent){
      let note=parent.querySelector('.gn-plan-note');
      if(!note){note=document.createElement('small');note.className='gn-plan-note';parent.appendChild(note)}
      note.textContent=max===1?'Free • 1 დღე':max===3?'Plus • 3 დღე':'AI Pro • 7 დღე';
    }
    return max;
  }

  function limitItems(items){return Array.isArray(items)?items.slice(0,maxForecastDays()):items;}

  function gateLink(link,required){
    if(!link || link.dataset.gnGateBound==='1') return;
    link.dataset.gnGateBound='1';
    link.dataset.requiredPlan=required;
    link.classList.add('gn-gated-link');
    if(!has(required)){
      const mt=link.querySelector('.mt');
      if(mt && !mt.querySelector('.gn-lock')){
        const lock=document.createElement('span');lock.className='gn-lock';lock.textContent=`🔒 ${required==='plus'?'Plus':'AI Pro'}`;mt.appendChild(lock);
      }
    }
    link.addEventListener('click',e=>{if(has(required))return;e.preventDefault();e.stopPropagation();showToast(`ეს ფუნქცია გახსნილია ${formatPlan(required)} გეგმით.`,required);},true);
  }

  function applyNavGates(){
    document.querySelectorAll('.more-item').forEach(link=>{
      const href=(link.getAttribute('href')||'').split('#')[0];
      if(href==='together.html'||href==='knowledge.html'||href==='moon.html')gateLink(link,'plus');
      if(href==='field-kit.html')gateLink(link,'pro');
      if(href==='premium.html')return;
    });
    document.querySelectorAll('[data-required-plan]').forEach(link=>gateLink(link,link.dataset.requiredPlan));
    const nav=document.querySelector('#moreMenu');
    if(nav && !nav.querySelector('a[href="premium.html"]')){
      const divider=document.createElement('div');divider.className='more-divider';
      nav.appendChild(divider);
      const a=document.createElement('a');a.className='more-item premium-nav-item';a.href='premium.html';a.innerHTML='<span class="mi">⭐</span><span class="mt">Premium გეგმები<small>2.99 ₾ • 7.99 ₾</small></span>';
      nav.appendChild(a);
    }
    const pill=document.getElementById('headerLivePill');
    if(pill){
      const plan=currentPlan();
      let p=pill.querySelector('.gn-plan-badge');
      if(!p){p=document.createElement('b');p.className='gn-plan-badge';pill.appendChild(p)}
      p.textContent=plan==='free'?'FREE':plan==='plus'?'PLUS':'AI PRO';
    }
  }

  function guardPage(){
    const required=document.body?.dataset?.premiumPage;
    if(!required || has(required))return;
    const header=document.querySelector('.header');
    const footer=document.querySelector('.footer');
    [...document.body.children].forEach(el=>{if(el!==header&&el!==footer&&el.tagName!=='SCRIPT')el.style.display='none';});
    const gate=document.createElement('main');gate.className='gn-premium-gate';
    gate.innerHTML=`<div class="gn-premium-gate-card"><div class="gn-premium-icon">${required==='pro'?'🤖':'⭐'}</div><span class="eyebrow">GEONATURE PREMIUM</span><h1>ეს ფუნქცია ${formatPlan(required)}-შია</h1><p>${required==='pro'?'AI, 7-დღიანი პროგნოზები, რუკაზე ნებისმიერი ქალაქი/საათი და აღჭურვილობის ჩექლისტი AI Pro-ის ნაწილია.':'Plus ხსნის „მეტი“ მენიუს გაფართოებულ ნაწილს, 3-დღიან პროგნოზს, GeoNature ცოდნას, Together-ს და მთვარე & ღამის ცას.'}</p><div class="gn-gate-price"><b>${PLAN_INFO[required].price}</b><span>თვეში</span></div><div class="gn-gate-actions"><a class="btn primary" href="${pricingUrl(required)}">ნახე გეგმები და გადახდა →</a><a class="btn ghost" href="index.html">მთავარზე დაბრუნება</a></div></div></main>`;
    if(staticDeployment()){
      const card=gate.querySelector('.gn-premium-gate-card'),text=card?.querySelector('p'),actions=card?.querySelector('.gn-gate-actions');
      if(text)text.textContent=`ეს გვერდი ${formatPlan(required)} გეგმის ნაწილია. გააქტიურება ამჟამად მიუწვდომელია, რადგან გადახდის სერვისი ჯერ არ არის დაკავშირებული. შეგიძლია გამოიყენო უფასო ინსტრუმენტები.`;
      if(actions)actions.innerHTML='<a class="btn primary" href="fishing.html">თევზაობის დაგეგმვა</a><a class="btn ghost" href="weather.html">ამინდის ნახვა</a><a class="btn ghost" href="catalog.html">სახეობების კატალოგი</a>';
      if(card)card.insertAdjacentHTML('beforeend',`<p class="muted"><a href="${pricingUrl(required)}">გეგმის ფუნქციები და ფასები →</a></p>`);
    }
    document.body.insertBefore(gate,footer||null);
  }

  function mapGate(){
    if(!document.getElementById('map'))return;
    const pro=has('pro');
    ['mapSearch','mapSearchBtn','mapDate','mapHour'].forEach(id=>{
      const el=document.getElementById(id);if(!el)return;
      el.disabled=!pro;el.classList.toggle('gn-locked-control',!pro);
      el.title=pro?'':'AI Pro • ნებისმიერი ქალაქი და საათი';
    });
    const side=document.querySelector('.map-side');
    if(side&&!pro&&!side.querySelector('.map-premium-note')){
      const n=document.createElement('div');n.className='map-premium-note';n.innerHTML='<b>⭐ AI Pro</b><span>ნებისმიერი ქალაქი + ნებისმიერი საათი Live რუკაზე</span><a href="premium.html?plan=pro">გახსნა →</a>';
      side.insertBefore(n,side.firstChild);
    }
  }

  function startCheckout(plan){
    const url=CHECKOUT_URLS[plan];
    if(url){location.href=url;return;}
    showToast('გადახდის პროვაიდერი ჯერ არ არის დაკავშირებული. ფასები და Premium ბლოკირება მზადაა; შემდეგ ეტაპზე ჩასვი Stripe/TBC/BOG checkout URL.',plan);
  }

  function bindPricing(){
    document.querySelectorAll('[data-buy-plan]').forEach(btn=>{if(btn.dataset.gnPricingBound)return;btn.dataset.gnPricingBound='1';btn.addEventListener('click',e=>{e.preventDefault();startCheckout(btn.dataset.buyPlan)});});
    document.querySelectorAll('[data-demo-plan]').forEach(btn=>btn.addEventListener('click',e=>{
      e.preventDefault();
      if(location.hostname!=='localhost' && location.protocol!=='file:') return showToast('სატესტო გააქტიურება გამორთულია ონლაინ რეჟიმში.');
      setPlan(btn.dataset.demoPlan);location.reload();
    }));
    const current=document.getElementById('currentPlan');if(current)current.textContent=PLAN_INFO[currentPlan()].name;
  }

  async function init(){
    await syncAdminState();
    document.documentElement.dataset.gnPlan=currentPlan();
    applyNavGates();mapGate();guardPage();bindPricing();
    document.querySelectorAll('select#daysCount,select#huntDays').forEach(applyDayLimit);
    window.dispatchEvent(new CustomEvent('gn:premium-ready',{detail:{plan:currentPlan(),admin:adminUnlocked()}}));
  }

  window.GNPremium={PLANS,PLAN_INFO,CHECKOUT_URLS,currentPlan,setPlan,has,maxForecastDays,formatPlan,pricingUrl,showToast,applyDayLimit,limitItems,startCheckout,trialPlan,adminUnlocked,syncAdminState,staticDeployment};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
