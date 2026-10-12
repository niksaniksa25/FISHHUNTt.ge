(function(){
  'use strict';
  const DAY_MS=86400000;
  const $=id=>document.getElementById(id);
  const todayLocal=()=>window.GeoNatureCommon?.zonedDateTime?.('Asia/Tbilisi').date||new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tbilisi'});
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
    if(!bar){
      bar=document.createElement('div');bar.id=id;bar.className='gn-hourly-access';
      const head=host.querySelector('.section-head');
      if(head)head.insertAdjacentElement('afterend',bar);else host.prepend(bar);
    }
    const p=plan();
    if(p==='free'){
      bar.className='gn-hourly-access free';
      bar.innerHTML=`<div class="gn-access-icon">◒</div><div><b>FREE • დღის საშუალო</b><span>დღეს ხედავ საშუალო ინდექსს. ზუსტი საათის არჩევა იხსნება 2.99 ₾ Plus-ში.</span></div><a href="premium.html?plan=plus" class="btn ghost">გახსნა — 2.99 ₾</a>`;
    }else if(p==='plus'){
      bar.className='gn-hourly-access plus';
      bar.innerHTML=`<div class="gn-access-icon">⚡</div><div><b>PLUS • 3 დღე</b><span>აირჩიე ნებისმიერი 1 დღე მომდევნო 3 დღიდან და ნებისმიერი საათი 00:00–23:00.</span></div><span class="gn-access-badge">${planPrice()}</span>`;
    }else{
      bar.className='gn-hourly-access pro';
      bar.innerHTML=`<div class="gn-access-icon">👑</div><div><b>AI PRO • 7 დღე</b><span>მომდევნო 7 დღიდან ნებისმიერი დღე + ნებისმიერი საათი 00:00–23:00.</span></div><span class="gn-access-badge">${planPrice()}</span>`;
    }
    return bar;
  }
  function scoreForFishingRow(row){
    const conditions=window.GeoFishingPlanner?.conditionFromRow?.(row)||window.GeoNatureCommon?.conditionsFromRow?.(row);
    if(!conditions)return null;
    if(window.selectedFish&&typeof window.fishScore==='function')return window.fishScore(window.selectedFish,conditions,window.selectedWater);
    if(typeof window.fishingEnvironmentScore==='function')return window.fishingEnvironmentScore(conditions,window.selectedWater);
    return typeof window.scoreWeather==='function'?window.scoreWeather(conditions):null;
  }
  function fishingRows(){
    const data=window.plannerWeather,date=$('startDate')?.value;
    if(!data||!date)return [];
    if(window.GeoFishingPlanner?.rowsForDate)return window.GeoFishingPlanner.rowsForDate(data,date);
    return window.GeoNatureCommon?.hourlyRows?.(data,date)||[];
  }
  function average(rows,score){
    if(!rows.length)return null;
    const values=rows.map(score);
    // Incomplete weather must not silently count as zero or as ideal conditions.
    if(values.some(value=>!Number.isFinite(value)))return null;
    return Math.round(values.reduce((a,b)=>a+b,0)/values.length);
  }
  function fishingAverage(){return average(fishingRows(),scoreForFishingRow);}
  function huntRows(){
    const data=window.huntWeather,date=$('huntStartDate')?.value;
    return data&&date&&typeof window.huntRowsForDate==='function'?window.huntRowsForDate(data,date):[];
  }
  function huntAverage(){
    if(!window.selectedHunt||typeof window.huntScoreForHour!=='function')return null;
    const region=(window.HUNT_REGIONS||[]).find(item=>item[0]===$('huntRegion')?.value)||(window.HUNT_REGIONS||[])[0];
    if(!region)return null;
    return average(huntRows(),row=>window.huntScoreForHour(window.selectedHunt,window.GeoHuntingPlanner?.conditionFromRow?.(row)||window.GeoNatureCommon?.conditionsFromRow?.(row),region,Number(row.time.slice(0,2))));
  }
  function addAverageCard(host,score,label='დღის საშუალო'){
    if(!host)return; let c=host.querySelector('.gn-hourly-average'); if(!c){c=document.createElement('div');c.className='gn-hourly-average';const anchor=host.querySelector('#fishingHourlyStrip,#huntHourlyStrip,#weatherHourlyStrip');if(anchor)anchor.insertAdjacentElement('beforebegin',c);else host.appendChild(c);}
    c.innerHTML=score==null?`<span class="gn-average-muted">საშუალოსთვის სრული საათობრივი მონაცემი ჯერ მიუწვდომელია.</span>`:`<div class="gn-average-ring" style="--avg:${score}"><b>${score}</b></div><div><span class="eyebrow">FREE VIEW</span><h3>${label}: ${score}/100</h3><p>ეს არის არჩეული დღის საათების საშუალო საორიენტაციო ინდექსი. ეს დაჭერის/დანახვის დადასტურებული ალბათობა არ არის. საათის არჩევა Premium-ში იხსნება.</p></div>`;
  }
  function gateFishing(){
    const section=$('hourlyFishingSection'); const date=$('startDate'),hour=$('hourSelect'),daysSel=$('daysCount'),strip=$('fishingHourlyStrip'),best=$('bestTomorrow');
    if(!section||!date)return;
    const max=days(); const base=todayLocal(); const maxDate=addDays(base,max-1);
    date.min=base; date.max=maxDate;
    if(date.value<date.min||date.value>date.max)date.value=date.min;
    if(daysSel){[...daysSel.options].forEach(o=>o.disabled=Number(o.value)>max);if(Number(daysSel.value)>max)daysSel.value=String(max);}
    if(hour){hour.disabled=!unlocked();hour.classList.toggle('gn-locked-control',!unlocked());hour.title=unlocked()?'':'Plus — ზუსტი საათის არჩევა';}
    if(best){best.disabled=!unlocked() || max<2;best.classList.toggle('gn-locked-control',!unlocked());}
    accessBar('gnFishingAccess',section);
    const free=!unlocked(); section.classList.toggle('gn-free-hourly',free);
    if(free){addAverageCard(section,fishingAverage(),'დღის საშუალო თევზის აქტივობის ინდექსი');}
    else section.querySelector('.gn-hourly-average')?.remove();
    if(strip){strip.querySelectorAll('.hour-card').forEach(c=>{c.style.pointerEvents=free?'none':'';c.classList.toggle('gn-hour-locked',free);c.setAttribute('aria-disabled',String(free));});}
  }
  function gateHunting(){
    const section=$('huntHourlySection'); const date=$('huntStartDate'),hour=$('huntHour'),daysSel=$('huntDays'),strip=$('huntHourlyStrip'),tomorrow=$('huntTomorrow');
    if(!section||!date)return;
    const max=days(); const base=todayLocal(); const maxDate=addDays(base,max-1);
    date.min=base;date.max=maxDate;if(date.value<date.min||date.value>date.max)date.value=date.min;
    if(daysSel){[...daysSel.options].forEach(o=>o.disabled=Number(o.value)>max);if(Number(daysSel.value)>max)daysSel.value=String(max);}
    if(hour){hour.disabled=!unlocked();hour.classList.toggle('gn-locked-control',!unlocked());}
    if(tomorrow){tomorrow.disabled=!unlocked()||max<2;tomorrow.classList.toggle('gn-locked-control',!unlocked());}
    accessBar('gnHuntAccess',section);
    const free=!unlocked();section.classList.toggle('gn-free-hourly',free);if(free)addAverageCard(section,huntAverage(),'დღის საშუალო ბუნების აქტივობის ინდექსი');else section.querySelector('.gn-hourly-average')?.remove();
    if(strip)strip.querySelectorAll('.hour-card').forEach(c=>{c.style.pointerEvents=free?'none':'';c.classList.toggle('gn-hour-locked',free);c.setAttribute('aria-disabled',String(free));});
  }
  function gateHome(){
    const date=$('homeDateSelect'),hour=$('homeHourSelect'),strip=$('homeHourlyStrip'); if(!date)return;
    const p=plan(); date.disabled=p==='free'; date.classList.toggle('gn-locked-control',p==='free');if(hour){hour.disabled=p==='free';hour.classList.toggle('gn-locked-control',p==='free');}
    const homeSection=strip?.closest('.home-hour-section, .home-hourly-section, .section'); if(homeSection)accessBar('gnHomeAccess',homeSection);
    if(p==='free'&&strip){strip.style.pointerEvents='none';strip.classList.add('gn-free-hours');}else if(strip){strip.style.pointerEvents='';strip.classList.remove('gn-free-hours');}
  }
  function gateWeather(){
    const section=document.getElementById('weatherHourlyStrip')?.closest('.section');const sel=$('weatherHourSelect'),strip=$('weatherHourlyStrip');if(!section)return;
    accessBar('gnWeatherAccess',section);const free=plan()==='free';if(sel){sel.disabled=free;sel.classList.toggle('gn-locked-control',free);}if(strip){strip.style.pointerEvents=free?'none':'';strip.classList.toggle('gn-free-hours',free);} 
    const scoreRows=()=>{const cards=[...document.querySelectorAll('#weatherHourlyStrip .weather-hour-card strong')];return cards.map(x=>x.textContent.trim()==='—'?null:Number(x.textContent))};
    if(free){const vals=scoreRows();addAverageCard(section,vals.length&&vals.every(Number.isFinite)?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null,'დღის საშუალო Outdoor Score');}
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
    window.addEventListener('gn:premium-ready',run);
    document.addEventListener('gn:fishingUpdated',run);
    document.addEventListener('gn:huntingUpdated',run);
    document.addEventListener('gn:weatherUpdated',run);
    window.addEventListener('load',run);
    let n=0;const timer=setInterval(()=>{run();if(++n>18)clearInterval(timer)},800);
  }
  window.GNHourlyAccess={days,plan,refresh:()=>{gateFishing();gateHunting();gateHome();gateWeather();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
