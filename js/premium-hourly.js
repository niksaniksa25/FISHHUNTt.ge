(function(){
  'use strict';
  const DAY_MS=86400000;
  const $=id=>document.getElementById(id);
  const todayLocal=()=>{
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const addDays=(iso,n)=>{
    const [y,m,d]=String(iso).split('-').map(Number); const x=new Date(y,m-1,d); x.setDate(x.getDate()+Number(n||0));
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  };
  const plan=()=>window.GNPremium?.currentPlan?.()||'free';
  const days=()=>plan()==='pro'?7:plan()==='plus'?3:1;
  const unlocked=()=>plan()!=='free';
  const planLabel=()=>plan()==='pro'?'AI PRO • 7 დღე • ნებისმიერი საათი':plan()==='plus'?'PLUS • 3 დღე • ნებისმიერი საათი':'FREE • 1 დღე • დღის საშუალო';
  const planPrice=()=>plan()==='pro'?'7.99 ₾':plan()==='plus'?'2.99 ₾':'0 ₾';
  function accessBar(id,host,mode='forecast'){
    if(!host)return null;
    let bar=$(id);
    if(!bar){bar=document.createElement('div');bar.id=id;bar.className='gn-hourly-access';const head=host.querySelector('.section-head');if(head?.nextSibling)host.insertBefore(bar,head.nextSibling);else host.prepend(bar);}
    const p=plan();
    if(p==='free'){
      bar.className='gn-hourly-access free';
      bar.innerHTML=`<div class="gn-access-icon">◒</div><div><b>FREE • დღის საშუალო</b><span>დღეს ხედავ საშუალო შანსს. ზუსტი საათის არჩევა იხსნება 2.99 ₾ Plus-ში.</span></div><a href="premium.html?plan=plus" class="btn ghost">გახსნა — 2.99 ₾</a>`;
    }else if(p==='plus'){
      bar.className='gn-hourly-access plus';
      bar.innerHTML=`<div class="gn-access-icon">⚡</div><div><b>PLUS • 3 დღე</b><span>აირჩიე ნებისმიერი 1 დღე მომდევნო 3 დღიდან და ნებისმიერი საათი 00:00–23:00.</span></div><span class="gn-access-badge">${planPrice()}</span>`;
    }else{
      bar.className='gn-hourly-access pro';
      bar.innerHTML=`<div class="gn-access-icon">👑</div><div><b>AI PRO • 7 დღე</b><span>მომდევნო 7 დღიდან ნებისმიერი დღე + ნებისმიერი საათი 00:00–23:00.</span></div><span class="gn-access-badge">${planPrice()}</span>`;
    }
    return bar;
  }
  function scoreForFishingRow(r){
    const c={temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.precip,precipitation_probability:r.rainProb,weather_code:r.code,relative_humidity_2m:r.humidity,cloud_cover:r.cloud,wind_gusts_10m:r.gust,visibility:r.visibility,local_hour:Number(r.time?.slice(0,2)||0)};
    if(window.selectedFish && typeof window.fishScore==='function') return window.fishScore(window.selectedFish,c,window.selectedWater);
    if(typeof window.fishingEnvironmentScore==='function') return window.fishingEnvironmentScore(c,window.selectedWater);
    return typeof window.scoreWeather==='function'?window.scoreWeather(c):60;
  }
  function fishingRows(){
    const d=window.plannerWeather; const date=$('startDate')?.value; if(!d||!date||!d.hourly?.time)return [];
    return d.hourly.time.map((t,i)=>({iso:t,time:t.slice(11,16),date:t.slice(0,10),temperature:Number(d.hourly.temperature_2m?.[i]??0),pressure:Number(d.hourly.pressure_msl?.[i]??1013),wind:Number(d.hourly.wind_speed_10m?.[i]??0),precip:Number(d.hourly.precipitation?.[i]??0),rainProb:Number(d.hourly.precipitation_probability?.[i]??0),humidity:Number(d.hourly.relative_humidity_2m?.[i]??60),cloud:Number(d.hourly.cloud_cover?.[i]??50),gust:Number(d.hourly.wind_gusts_10m?.[i]??0),visibility:Number(d.hourly.visibility?.[i]??0),code:Number(d.hourly.weather_code?.[i]??0)})).filter(r=>r.date===date);
  }
  function fishingAverage(){const rows=fishingRows(); if(!rows.length)return null; const vals=rows.map(scoreForFishingRow); return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);}
  function huntRows(){
    const d=window.huntWeather; const date=$('huntStartDate')?.value; if(!d||!date||!d.hourly?.time)return [];
    const rows=(typeof window.huntRowsForDate==='function')?window.huntRowsForDate(d,date):[]; return rows;
  }
  function huntAverage(){const rows=huntRows(); if(!rows.length||!window.selectedHunt||typeof window.huntScoreForHour!=='function')return null; const region=(window.HUNT_REGIONS||[]).find(r=>r[0]===$('huntRegion')?.value)||(window.HUNT_REGIONS||[])[0]; if(!region)return null; const vals=rows.map(r=>window.huntScoreForHour(window.selectedHunt,{temperature_2m:r.temperature,apparent_temperature:r.apparent,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.precip,precipitation_probability:r.rainProb,weather_code:r.code,relative_humidity_2m:r.humidity,cloud_cover:r.cloud,wind_gusts_10m:r.gust,visibility:r.visibility,local_hour:Number(r.time.slice(0,2))},region,Number(r.time.slice(0,2))));return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);}
  function addAverageCard(host,score,label='დღის საშუალო'){
    if(!host)return; let c=host.querySelector('.gn-hourly-average'); if(!c){c=document.createElement('div');c.className='gn-hourly-average';const anchor=host.querySelector('#fishingHourlyStrip,#huntHourlyStrip,#weatherHourlyStrip');if(anchor)host.insertBefore(c,anchor);else host.appendChild(c);}
    c.innerHTML=score==null?`<span class="gn-average-muted">საათობრივი მონაცემის ჩატვირთვის შემდეგ საშუალო აქ გამოჩნდება.</span>`:`<div class="gn-average-ring" style="--avg:${score}"><b>${score}%</b></div><div><span class="eyebrow">FREE VIEW</span><h3>${label}: ${score}%</h3><p>ეს არის არჩეული დღის ყველა საათის საშუალო საორიენტაციო შანსი. ზუსტი საათები Premium-ში იხსნება.</p></div>`;
  }
  function gateFishing(){
    const section=$('hourlyFishingSection'); const date=$('startDate'),hour=$('hourSelect'),daysSel=$('daysCount'),strip=$('fishingHourlyStrip'),best=$('bestTomorrow');
    if(!section||!date)return;
    const max=days(); const base=(window.plannerWeather?.daily?.time?.[0]||todayLocal()).slice(0,10); const maxDate=addDays(base,max-1);
    date.min=base; date.max=maxDate;
    if(date.value<date.min||date.value>date.max)date.value=date.min;
    if(daysSel){[...daysSel.options].forEach(o=>o.disabled=Number(o.value)>max);if(Number(daysSel.value)>max)daysSel.value=String(max);}
    if(hour){hour.disabled=!unlocked();hour.classList.toggle('gn-locked-control',!unlocked());hour.title=unlocked()?'':'Plus — ზუსტი საათის არჩევა';}
    if(best){best.disabled=!unlocked() || max<2;best.classList.toggle('gn-locked-control',!unlocked());}
    accessBar('gnFishingAccess',section);
    const free=!unlocked(); section.classList.toggle('gn-free-hourly',free);
    if(free){addAverageCard(section,fishingAverage(),'დღის საშუალო თევზის დაჭერის შანსი');}
    else section.querySelector('.gn-hourly-average')?.remove();
    if(strip){strip.querySelectorAll('.hour-card').forEach(c=>{c.style.pointerEvents=free?'none':'';c.classList.toggle('gn-hour-locked',free);c.setAttribute('aria-disabled',String(free));});}
  }
  function gateHunting(){
    const section=$('huntHourlySection'); const date=$('huntStartDate'),hour=$('huntHour'),daysSel=$('huntDays'),strip=$('huntHourlyStrip'),tomorrow=$('huntTomorrow');
    if(!section||!date)return;
    const max=days(); const base=(window.huntWeather?.daily?.time?.[0]||todayLocal()).slice(0,10); const maxDate=addDays(base,max-1);
    date.min=base;date.max=maxDate;if(date.value<date.min||date.value>date.max)date.value=date.min;
    if(daysSel){[...daysSel.options].forEach(o=>o.disabled=Number(o.value)>max);if(Number(daysSel.value)>max)daysSel.value=String(max);}
    if(hour){hour.disabled=!unlocked();hour.classList.toggle('gn-locked-control',!unlocked());}
    if(tomorrow){tomorrow.disabled=!unlocked()||max<2;tomorrow.classList.toggle('gn-locked-control',!unlocked());}
    accessBar('gnHuntAccess',section);
    const free=!unlocked();section.classList.toggle('gn-free-hourly',free);if(free)addAverageCard(section,huntAverage(),'დღის საშუალო ბუნების/ნადირობის შანსი');else section.querySelector('.gn-hourly-average')?.remove();
    if(strip)strip.querySelectorAll('.hour-card').forEach(c=>{c.style.pointerEvents=free?'none':'';c.classList.toggle('gn-hour-locked',free);c.setAttribute('aria-disabled',String(free));});
  }
  function gateHome(){
    const date=$('homeDateSelect'),hour=$('homeHourSelect'),strip=$('homeHourlyStrip'); if(!date)return;
    const p=plan(); date.disabled=p==='free'; hour.disabled=p==='free'; date.classList.toggle('gn-locked-control',p==='free');hour.classList.toggle('gn-locked-control',p==='free');
    const homeSection=strip?.closest('.home-hour-section, .home-hourly-section, .section'); if(homeSection)accessBar('gnHomeAccess',homeSection);
    if(p==='free'&&strip){strip.style.pointerEvents='none';strip.classList.add('gn-free-hours');}else if(strip){strip.style.pointerEvents='';strip.classList.remove('gn-free-hours');}
  }
  function gateWeather(){
    const section=document.getElementById('weatherHourlyStrip')?.closest('.section');const sel=$('weatherHourSelect'),strip=$('weatherHourlyStrip');if(!section)return;
    accessBar('gnWeatherAccess',section);const free=plan()==='free';if(sel){sel.disabled=free;sel.classList.toggle('gn-locked-control',free);}if(strip){strip.style.pointerEvents=free?'none':'';strip.classList.toggle('gn-free-hours',free);} 
    const scoreRows=()=>{const cards=[...document.querySelectorAll('#weatherHourlyStrip .weather-hour-card strong')];return cards.map(x=>Number(x.textContent)||0)};
    if(free){const vals=scoreRows();addAverageCard(section,vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null,'დღის საშუალო Outdoor Score');}
    else section.querySelector('.gn-hourly-average')?.remove();
  }
  function guardChange(e){
    const p=plan(); if(p!=='free')return;
    const t=e.target;
    if(['hourSelect','huntHour','homeHourSelect','weatherHourSelect'].includes(t?.id)){e.preventDefault();e.stopImmediatePropagation();window.GNPremium?.showToast?.('ზუსტი საათის არჩევა გახსნილია Plus-ში — 2.99 ₾.', 'plus');t.blur();return;}
    if(['startDate','huntStartDate'].includes(t?.id)){const today=todayLocal();if(t.value!==today){e.preventDefault();e.stopImmediatePropagation();t.value=today;window.GNPremium?.showToast?.('შემდეგი დღეების არჩევა გახსნილია Plus-ში — 2.99 ₾.','plus');}}
  }
  function bind(){
    document.addEventListener('change',guardChange,true);
    document.addEventListener('click',e=>{if(plan()!=='free')return;const h=e.target.closest?.('#fishingHourlyStrip .hour-card,#huntHourlyStrip .hour-card,#homeHourlyStrip .home-hour,#weatherHourlyStrip .weather-hour-card');if(h){e.preventDefault();e.stopImmediatePropagation();window.GNPremium?.showToast?.('ზუსტი საათის არჩევა გახსნილია Plus-ში — 2.99 ₾.','plus');}},true);
    const run=()=>{gateFishing();gateHunting();gateHome();gateWeather();};
    document.addEventListener('gn:premium-ready',run);
    document.addEventListener('gn:fishingUpdated',run);
    window.addEventListener('load',run);
    let n=0;const timer=setInterval(()=>{run();if(++n>18)clearInterval(timer)},800);
  }
  window.GNHourlyAccess={days,plan,refresh:()=>{gateFishing();gateHunting();gateHome();gateWeather();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
