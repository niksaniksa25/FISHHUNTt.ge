(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
  const band=s=>Number(s)>=80?'good':Number(s)>=50?'mid':'bad';
  const bandText=s=>Number(s)>=80?'კარგი':Number(s)>=50?'საშუალო':'ცუდი';
  function plan(){return window.GNPremium?.currentPlan?.()||'free'}
  function maxDays(){return window.GNPremium?.maxForecastDays?.()||1}
  function rowsFrom(data){
    const h=data?.hourly; if(!h?.time)return [];
    return h.time.map((iso,i)=>({iso,date:iso.slice(0,10),time:iso.slice(11,16),hour:Number(iso.slice(11,13)),temperature:Number(h.temperature_2m?.[i]??20),pressure:Number(h.pressure_msl?.[i]??1013),wind:Number(h.wind_speed_10m?.[i]??0),gust:Number(h.wind_gusts_10m?.[i]??0),rain:Number(h.precipitation?.[i]??0),rainProb:Number(h.precipitation_probability?.[i]??0),humidity:Number(h.relative_humidity_2m?.[i]??60),cloud:Number(h.cloud_cover?.[i]??50),visibility:Number(h.visibility?.[i]??0),code:Number(h.weather_code?.[i]??0)}));
  }
  function weatherShape(r){
    return {
      temperature_2m:r.temperature, apparent_temperature:r.apparent??r.temperature,
      pressure_msl:r.pressure, wind_speed_10m:r.wind, wind_gusts_10m:r.gust??r.wind,
      precipitation:r.rain, precipitation_probability:r.rainProb,
      relative_humidity_2m:r.humidity, cloud_cover:r.cloud??50,
      visibility:r.visibility??10000, weather_code:r.code, local_hour:r.hour
    };
  }
  function score(r,type){
    const weather=weatherShape(r);
    if(type==='fishing'&&typeof window.fishingEnvironmentScore==='function') return clamp(window.fishingEnvironmentScore(weather,undefined));
    if(typeof window.GeoNatureCommon?.outdoorScore==='function') return clamp(window.GeoNatureCommon.outdoorScore(weather));
    if(typeof window.outdoorScore==='function') return clamp(window.outdoorScore(weather));
    let s=75;
    s-=Math.min(25,Math.abs(r.temperature-18)*1.2);
    s-=Math.min(20,r.wind*0.8);
    s-=Math.min(18,r.rain*5);
    s-=r.rainProb*0.18;
    s-=Math.max(0,(r.gust??r.wind)-25)*0.5;
    return Math.round(clamp(s));
  }
  function bestByDate(data,type,days){
    const all=rowsFrom(data);
    const currentIso=String(data?.current?.time||'');
    const currentDate=currentIso.slice(0,10);
    const dates=[...new Set(all.map(r=>r.date))].slice(0,Math.max(1,days));
    return dates.map(d=>{
      let rr=all.filter(r=>r.date===d);
      if(d===currentDate&&currentIso)rr=rr.filter(r=>r.iso>=currentIso);
      if(!rr.length)return null;
      const best=rr.map(r=>({r,s:Math.round(score(r,type))})).sort((a,b)=>b.s-a.s||a.r.iso.localeCompare(b.r.iso))[0];
      return {date:d,...best};
    }).filter(Boolean);
  }
  function fmtDate(d){try{return new Date(`${d}T12:00:00`).toLocaleDateString('ka-GE',{weekday:'short',day:'numeric',month:'short'})}catch(_){return d}}
  function insertAfter(ref,el){ref?.after(el)}
  function addHomeExtras(){
    if(document.getElementById('gnExtraHome'))return;
    const host=document.createElement('section');
    host.id='gnExtraHome';host.className='container section gn-extras';
    host.innerHTML=`<div class="section-head"><div><span class="eyebrow">SMART MOMENTS</span><h2>დღის საუკეთესო გასვლის დრო</h2><p class="muted">ქულა ითვლება საათობრივი ამინდის ველებით; დღევანდელ შეფასებაში გასული საათები აღარ მონაწილეობს.</p></div></div>
      <div class="gn-extras-grid"><article class="panel gn-extra-card" id="gnBestMomentCard"><div class="row-between"><div><span class="eyebrow">🔥 BEST MOMENT</span><h3>დღის საუკეთესო დრო</h3></div><span id="gnBestMomentPlan" class="gn-plan-pill"></span></div><div id="gnBestMomentToday" class="gn-best-main"><span class="muted">Live მონაცემებს ველოდები…</span></div><div id="gnBestMomentDays" class="gn-best-days"></div></article></div>`;
    const notify=document.createElement('section');
    notify.id='gnNotificationCenter';notify.className='container section panel gn-extra-card';
    notify.innerHTML='<span class="eyebrow">SMART NOTIFICATIONS</span><h2>🔔 შენთვის მორგებული შეტყობინებები</h2><p class="muted">აირჩიე თევზი, ადგილი, საჭიროების შემთხვევაში საათი და მინიმალური ქულა.</p><div class="muted">შეტყობინებების პარამეტრები იტვირთება…</div>';
    const anchor=document.getElementById('homePremiumOffer')||document.getElementById('quickExplorer')||document.querySelector('.hero');
    insertAfter(anchor,host);insertAfter(host,notify);
  }
  function renderHome(data,row){
    const card=document.getElementById('gnBestMomentCard');if(!card)return;
    const currentIso=String(data?.current?.time||row?.iso||'');
    const today=currentIso.slice(0,10)||(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'));
    const candidates=rowsFrom(data).filter(r=>r.date===today&&(!currentIso||r.iso>=currentIso));
    const best=candidates.map(r=>({r,s:Math.round(score(r,'outdoor'))})).sort((a,b)=>b.s-a.s||a.r.iso.localeCompare(b.r.iso))[0];
    const box=document.getElementById('gnBestMomentToday');
    if(box&&best){
      box.innerHTML=`<div class="gn-best-score ${band(best.s)}"><b>${best.s}</b><span>/100</span></div><div><strong>${best.r.time}</strong><small>${best.r.temperature.toFixed(1)}°C • ${best.r.wind.toFixed(0)} კმ/სთ ქარი • ${Math.round(best.r.rainProb)}% წვიმა</small><em>${bandText(best.s)} პირობებია — დღევანდელ დარჩენილ საათებში საუკეთესო დრო</em></div>`;
    }else if(box){
      box.innerHTML='<span class="muted">დღევანდელი საათობრივი მონაცემები ჯერ არ არის ხელმისაწვდომი.</span>';
    }
    const n=maxDays();
    const days=bestByDate(data,'outdoor',Math.max(1,Math.min(7,n)));
    const daysBox=document.getElementById('gnBestMomentDays');
    if(daysBox)daysBox.innerHTML=days.map((d,i)=>{const locked=(i>=n);return `<div class="gn-best-day ${band(d.s)} ${locked?'locked':''}"><small>${fmtDate(d.date)}</small><b>${locked?'🔒':d.r.time}</b><span>${d.s}</span><em>${locked?'AI Pro':'საუკეთესო საათი'}</em></div>`}).join('');
    const pp=document.getElementById('gnBestMomentPlan');if(pp)pp.textContent=plan()==='pro'?'AI PRO':plan()==='plus'?'PLUS':'FREE';
    if(window.GeoNaturePush?.checkCurrentConditions)window.GeoNaturePush.checkCurrentConditions(data,row);
  }
  function fireAlert(scoreValue){
    const msg=`GeoNature: Outdoor Score არის ${Math.round(scoreValue)}/100 — კარგი პირობებია.`;
    if('Notification' in window&&Notification.permission==='granted'){try{new Notification('GeoNature • კარგი პირობებია',{body:msg})}catch(_){}}
  }
  function addDashboardExtras(){
    const root=document.getElementById('gnDashboard');if(!root||document.getElementById('gnPersonalInsights'))return;
    const host=document.createElement('div');host.id='gnPersonalInsights';host.className='gn-dashboard-extras';
    host.innerHTML=`<section class="panel gn-extra-card"><div class="row-between"><div><span class="eyebrow">PERSONAL GEONATURE</span><h2>🧠 შენი სტატისტიკა და რჩევა</h2></div><a class="btn ghost" href="fishing.html">ახალი გასვლის დაგეგმვა →</a></div><div id="gnPersonalInsightsGrid" class="gn-insight-grid"></div></section><section class="panel gn-extra-card"><div class="row-between"><div><span class="eyebrow">🤖 SMART GUIDE</span><h2>AI Guide</h2></div><a class="btn primary" href="ai.html">AI-ს კითხვა →</a></div><p class="muted">AI დაგეხმარება კონკრეტულ თევზზე, ადგილზე, ამინდზე ან გასვლის გეგმაზე. Pro გეგმაში მიიღებ გაფართოებულ AI ინსტრუმენტებს.</p></section>`;
    root.appendChild(host); renderPersonalInsights();
  }
  function renderPersonalInsights(){
    const box=document.getElementById('gnPersonalInsightsGrid');if(!box)return;let s={};try{s=JSON.parse(localStorage.getItem('geonature_plus_v1')||'{}')}catch(_){s={}};const catches=s.catches||[],plans=s.plans||[],favs=s.favorites||[];
    let topFish='ჯერ არ არის',topPlace='ჯერ არ არის',bestWeight=0,bestFish='—';
    const fishCount={},placeCount={};catches.forEach(c=>{if(c.fish)fishCount[c.fish]=(fishCount[c.fish]||0)+1;if(c.place)placeCount[c.place]=(placeCount[c.place]||0)+1;if(Number(c.weight||0)>bestWeight){bestWeight=Number(c.weight||0);bestFish=c.fish||'—'}});
    topFish=Object.entries(fishCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||topFish;topPlace=Object.entries(placeCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||topPlace;
    const xp=Number(s.xp||0),level=Math.max(1,Math.floor(xp/100)+1);const insight=topFish!=='ჯერ არ არის'?`შენ ყველაზე ხშირად ${esc(topFish)}-ს უთითებ Catch Log-ში. შემდეგ გასვლაზე ამ სახეობის საუკეთესო საათი შეამოწმე Planner-ში.`:'Catch Log ჯერ ცარიელია — პირველი ჩანაწერის შემდეგ GeoNature შენს პირად ტენდენციებსაც დაგანახებს.';
    box.innerHTML=[['🎣','საყვარელი თევზი',topFish],['📍','ხშირი ადგილი',topPlace],['🏆','პირადი რეკორდი',bestWeight?bestFish+' • '+bestWeight+' კგ':'ჯერ არ არის'],['⭐','რჩეულები',String(favs.length)],['🗺️','გეგმები',String(plans.length)],['⚡','Level',String(level)+' • '+xp+' XP']].map(x=>`<div class="gn-insight-item"><span>${x[0]}</span><small>${x[1]}</small><b>${esc(x[2])}</b></div>`).join('')+`<div class="gn-insight-wide"><small>💡 პირადი რჩევა</small><p>${insight}</p></div>`;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(location.pathname.endsWith('index.html')||location.pathname==='/'||location.pathname===''){addHomeExtras();}
    if(location.pathname.endsWith('dashboard.html')){setTimeout(addDashboardExtras,600);document.addEventListener('geonature:state',()=>{setTimeout(addDashboardExtras,250);setTimeout(renderPersonalInsights,300)})}
  });
})();
