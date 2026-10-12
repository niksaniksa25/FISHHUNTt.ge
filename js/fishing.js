let selectedFish=null;
let selectedFishCardScore=null;
let selectedWater=null;
let plannerWeather=null;
let selectedHourlyRow=null;
let hourlyToken=0;
let plannerRequestToken=0;
let liveFishingRequestToken=0;
let selectedFishingRuleMethod='rod';

function updateFishingRules(){
  const profile=document.getElementById('fishProfile'),rules=window.GeoWildlifeRules;
  if(!profile||!selectedFish||!rules)return;
  let host=document.getElementById('fishLegalRules');
  if(!host){
    host=document.createElement('div');host.id='fishLegalRules';host.className='planner-rules';
    host.innerHTML='<div class="season-rules-date"><label for="fishRuleMethod">ჭერის მეთოდი<select id="fishRuleMethod"><option value="rod">სამოყვარულო ჭერა</option><option value="release">გაშვებით რეკრეაციული ჭერა</option><option value="commercial">სარეწაო ჭერა (ლიცენზიით)</option><option value="other">სხვა მეთოდი — გადაამოწმე</option></select></label></div><div id="fishLegalStatus" aria-live="polite"></div>';
    profile.appendChild(host);
    document.getElementById('fishRuleMethod').value=selectedFishingRuleMethod;
    document.getElementById('fishRuleMethod').onchange=e=>{selectedFishingRuleMethod=e.target.value;updateFishingRules();};
  }
  rules.mount(document.getElementById('fishLegalStatus'),selectedFish,{kind:'fish',date:document.getElementById('startDate')?.value||rules.today(),method:selectedFishingRuleMethod,location:selectedWater?.[1]||'',waterId:selectedWater?.[0]||''});
}

function safeText(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function parseRange(v){return (String(v||'').match(/-?\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite);}
function fishImage(f, cb){
  GeoImage.resolveSpeciesImage(f[1], f[11], f[2]).then(src=>cb(src)).catch(()=>cb(GeoImage.placeholder(f[1],'fish')));
}

function conditionFromFishingRow(row){
  if(!row)return null;
  return {temperature_2m:row.temperature,pressure_msl:row.pressure,wind_speed_10m:row.wind,precipitation:row.precip,precipitation_probability:row.rainProb,weather_code:row.code,relative_humidity_2m:row.humidity,cloud_cover:row.cloud,wind_gusts_10m:row.gust,visibility:row.visibility,local_hour:Number(String(row.time||'12:00').slice(0,2))};
}
function currentFishingCondition(){
  if(selectedHourlyRow)return conditionFromFishingRow(selectedHourlyRow);
  if(plannerWeather?.current){const c=plannerWeather.current;return {...c,local_hour:Number(String(c.time||'').slice(11,13))||new Date().getHours()};}
  if(window.__gnFishingWeather)return window.__gnFishingWeather;
  return {temperature_2m:18,pressure_msl:1013,wind_speed_10m:7,precipitation:0,precipitation_probability:10,weather_code:1,relative_humidity_2m:60,local_hour:new Date().getHours()};
}
function chanceForFish(f,condition=currentFishingCondition(),water=selectedWater){
  if(window.GeoFishChance)return window.GeoFishChance(f,condition||{},water,true);
  return 42;
}
function refreshVisibleFishScores(){
  const condition=currentFishingCondition();
  document.querySelectorAll('#fishResults .fish-card[data-fish-id]').forEach(card=>{
    const f=(window.FISHES||[]).find(x=>String(x[0])===card.dataset.fishId);if(!f)return;
    const score=chanceForFish(f,condition,selectedWater);
    const markup=window.GeoChanceUI?.markup?window.GeoChanceUI.markup(score,'დაჭერის შანსი'):`<span class="fish-chance">${score}%</span>`;
    const slot=card.querySelector('.fish-chance-slot');if(slot)slot.innerHTML=markup;
    const titleChance=card.querySelector('.fish-card-title-row > .gn-chance');if(titleChance)titleChance.outerHTML=markup;
    card.dataset.chance=String(score);
  });
  updateSelectedFishChance();
}
function updateSelectedFishChance(){
  const target=document.getElementById('fishProfileChance');if(!target||!selectedFish)return;
  // Preserve the exact score the user clicked; live/hourly scores are shown separately below.
  const hasSnapshot=Number.isFinite(selectedFishCardScore);
  const score=hasSnapshot?selectedFishCardScore:chanceForFish(selectedFish,currentFishingCondition(),selectedWater);
  const label=hasSnapshot?'ბარათზე ნაჩვენები შეფასება':'არჩეული საათის დაჭერის შანსი';
  target.innerHTML=(window.GeoChanceUI?.markup?window.GeoChanceUI.markup(score,label):`<span class="fish-chance">${score}%</span>`)+(hasSnapshot?'<small class="fish-score-consistency-note">ეს არის ზუსტად ის შეფასება, რომელზეც დააჭირე. არჩეული ადგილისა და საათის განახლებული შეფასება ქვემოთ ჩანს.</small>':'');
}


function hourlyRowsForDate(data, iso){
  if(!data?.hourly?.time) return [];
  return data.hourly.time.map((t,i)=>({
    iso:t,
    time:t.slice(11,16),
    date:t.slice(0,10),
    temperature:Number(data.hourly.temperature_2m?.[i] ?? 0),
    pressure:Number(data.hourly.pressure_msl?.[i] ?? 1010),
    wind:Number(data.hourly.wind_speed_10m?.[i] ?? 0),
    precip:Number(data.hourly.precipitation?.[i] ?? 0),
    rainProb:Number(data.hourly.precipitation_probability?.[i] ?? 0),
    code:Number(data.hourly.weather_code?.[i] ?? 0),
    humidity:Number(data.hourly.relative_humidity_2m?.[i] ?? 60),
    cloud:Number(data.hourly.cloud_cover?.[i] ?? data.current?.cloud_cover ?? 50),
    gust:Number(data.hourly.wind_gusts_10m?.[i] ?? data.hourly.wind_speed_10m?.[i] ?? 0),
    visibility:Number(data.hourly.visibility?.[i] ?? 0),
    index:i
  })).filter(x=>x.date===iso);
}

function bestScoredHourForDate(data,iso){const rows=hourlyRowsForDate(data,iso);if(!rows.length||!selectedFish||!selectedWater)return null;return rows.map(r=>({r,score:fishScore(selectedFish,{temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.precip,precipitation_probability:r.rainProb,weather_code:r.code,relative_humidity_2m:r.humidity,local_hour:Number(r.time.slice(0,2))},selectedWater)})).reduce((a,b)=>!a||b.score>a.score?b:a,null);}
function chooseBestHourForDate(iso){const best=plannerWeather&&bestScoredHourForDate(plannerWeather,iso);if(!best)return;selectedHourlyRow=best.r;window.__gnFishingWeather=conditionFromFishingRow(best.r);const hour=document.getElementById('hourSelect');if(hour&&[...hour.options].some(o=>o.value===best.r.time))hour.value=best.r.time;}
function selectedHourForDate(data, iso){
  const rows=hourlyRowsForDate(data,iso);
  if(!rows.length) return null;
  const now=new Date();
  if(iso===(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'))){
    const future=rows.find(r=>new Date(r.iso)>=now);
    return future||rows[rows.length-1];
  }
  return rows.find(r=>r.time==='12:00')||rows[Math.floor(rows.length/2)];
}

function applyHourlyToLive(row){
  if(!row) return;
  selectedHourlyRow=row;
  const condition={temperature_2m:row.temperature,pressure_msl:row.pressure,wind_speed_10m:row.wind,precipitation:row.precip,precipitation_probability:row.rainProb,weather_code:row.code,relative_humidity_2m:row.humidity,cloud_cover:row.cloud,wind_gusts_10m:row.gust,visibility:row.visibility,local_hour:Number(row.time.slice(0,2))};
  const score=selectedFish ? fishScore(selectedFish,condition,selectedWater) : fishingEnvironmentScore(condition,selectedWater);
  const mm=codeMeta(row.code);
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val};
  set('fishLiveTime',row.time);
  set('fishLiveIcon',mm[0]);
  set('fishLiveTemp',Math.round(row.temperature)+'°');
  set('fishLiveDesc',`${mm[1]} • ${score}/100`);
  set('fishLiveScore',score);
  const gauge=document.getElementById('fishScoreGauge'); if(gauge) gauge.style.setProperty('--score-deg',(Math.max(0,Math.min(100,score))*3.6)+'deg');
  const band=document.getElementById('fishLiveBand'); if(band){ band.textContent=scoreBandLabel(score); band.dataset.level=scoreBandKey(score); }
  set('fishLivePressure',Math.round(row.pressure)+' hPa');
  set('fishLiveWind',Math.round(row.wind)+' კმ/სთ');
  set('fishLiveHumidity',Math.round(row.humidity)+'%');
  set('fishLiveRain',row.precip.toFixed(1)+' მმ');
  setPressureGauge(row.pressure,'pressureNeedle','pressureValue','pressureStatus','pressureAdvice');
  const lab=document.getElementById('selectedHourLabel');
  const hs=document.getElementById('hourSelect');if(hs&&[...hs.options].some(o=>o.value===row.time))hs.value=row.time;
  if(lab)lab.textContent=`არჩეული საათი: ${row.time}`;
  if(window.GNLiveFactors) window.GNLiveFactors.render({data:plannerWeather,row,subject:selectedFish,type:'fishing',locationName:selectedWater?.[1]||'არჩეული ადგილი'});
  const out=document.getElementById('fishingHourlySelected');
  if(out){
    out.innerHTML=`<div class="selected-hour-grid"><div><span>${mm[0]}</span><b>${row.time}</b><small>${mm[1]}</small></div><div><small>ტემპერატურა</small><b>${Math.round(row.temperature)}°C</b></div><div><small>წნევა</small><b>${Math.round(row.pressure)} hPa</b></div><div><small>ქარი</small><b>${Math.round(row.wind)} კმ/სთ</b></div><div><small>ნალექი</small><b>${row.precip.toFixed(1)} მმ</b></div><div><small>წვიმის ალბათობა</small><b>${row.rainProb}%</b></div><div><small>Fishing Score</small><b class="selected-score">${score}/100</b></div></div>`;
  }
  document.querySelectorAll('#fishingHourlyStrip .hour-card').forEach(el=>el.classList.toggle('active',el.dataset.iso===row.iso));
  window.__gnFishingWeather=condition;
  refreshVisibleFishScores();
}

function renderFishingHourly(data){
  const wrap=document.getElementById('fishingHourlyStrip');
  if(!wrap||!data) return;
  const date=document.getElementById('startDate')?.value || (window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'));
  const rows=hourlyRowsForDate(data,date);
  const loc=document.getElementById('hourlyFishingLocation');
  const dt=document.getElementById('hourlyFishingDate');
  if(loc)loc.textContent=selectedWater?.[1]||'თბილისი';
  if(dt)dt.textContent=fmtDate(date);
  if(!rows.length){wrap.innerHTML='<div class="empty">ამ თარიღისთვის საათობრივი მონაცემი მიუწვდომელია.</div>';return;}
  populateHourSelect(rows);
  const chosenHour=document.getElementById('hourSelect')?.value;
  const current=(chosenHour&&rows.find(r=>r.time===chosenHour))||(selectedHourlyRow&&selectedHourlyRow.date===date?selectedHourlyRow:selectedHourForDate(data,date));
  wrap.innerHTML=rows.map(row=>{
    const mm=codeMeta(row.code);
    const condition={temperature_2m:row.temperature,pressure_msl:row.pressure,wind_speed_10m:row.wind,precipitation:row.precip,precipitation_probability:row.rainProb,weather_code:row.code,relative_humidity_2m:row.humidity,cloud_cover:row.cloud,wind_gusts_10m:row.gust,visibility:row.visibility,local_hour:Number(row.time.slice(0,2))};
    const score=selectedFish ? fishScore(selectedFish,condition,selectedWater) : fishingEnvironmentScore(condition,selectedWater);
    const active=current?.iso===row.iso?' active':'';
    return `<button class="hour-card${active}" data-iso="${row.iso}"><small>${row.time}</small><span class="hour-icon">${mm[0]}</span><strong>${Math.round(row.temperature)}°</strong><em>${Math.round(row.pressure)}</em><b>${Math.round(row.wind)} კმ/სთ</b><span class="hour-score">${score}</span></button>`;
  }).join('');
  wrap.querySelectorAll('.hour-card').forEach(card=>card.onclick=()=>{const row=rows.find(r=>r.iso===card.dataset.iso);selectedFishCardScore=null;applyHourlyToLive(row);});
  applyHourlyToLive(current);
}

function renderFishResults(list){
  const box=document.getElementById('fishResults');
  box.innerHTML='';
  list.slice(0,100).forEach(f=>{
    const card=document.createElement('article');
    card.className='fish-card';
    card.tabIndex=0;
    const chance=chanceForFish(f,currentFishingCondition(),selectedWater);const chanceHtml=window.GeoChanceUI?.markup?window.GeoChanceUI.markup(chance,'დაჭერის შანსი'):`<span class="fish-chance">${chance}%</span>`;card.dataset.fishId=String(f[0]);card.dataset.chance=String(chance);card.innerHTML=`<div class="fish-img-wrap"><img class="fish-img" loading="lazy" alt="${safeText(f[1])}"><span class="fish-chance-slot">${chanceHtml}</span></div><div class="fish-card-body"><div class="fish-card-title-row"><div><span class="tag">${safeText(f[3])}</span><h3>${safeText(f[1])}</h3></div>${chanceHtml}</div><p>${safeText(f[2])} • ${safeText(f[4])}</p><div class="fish-card-meta"><span>⚖️ ${safeText(f[6])}</span><span>🌡️ ${safeText(f[7])}</span></div></div>`;
    fishImage(f,src=>{const img=card.querySelector('img');if(img)img.src=src;});
    card.onclick=()=>selectFish(f,true,Number(card.dataset.chance));
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectFish(f,true,Number(card.dataset.chance));}};
    box.appendChild(card);
  });
  if(!list.length) box.innerHTML='<div class="empty">ამ ძებნით თევზი ვერ მოიძებნა.</div>';
}

function renderFishProfileShell(){
  const profile=document.getElementById('fishProfile');
  if(!profile || !selectedFish) return;
  profile.innerHTML=`<div class="fish-profile-grid" data-fish-id="${safeText(selectedFish[0])}"><div><img id="profileFishImage" class="fish-profile-img" alt="${safeText(selectedFish[1])}"><div><span class="tag">${safeText(selectedFish[3])}</span><span class="tag">${safeText(selectedFish[4])}</span></div></div><div><span class="eyebrow">SELECTED FISH</span><h2>${safeText(selectedFish[1])}</h2><p class="muted">${safeText(selectedFish[2])} • ${safeText(selectedFish[11])}</p><div class="fish-stat-grid"><div class="fish-stat"><small>ინფორმაციული წონა</small><b>${safeText(selectedFish[6])}</b></div><div class="fish-stat"><small>სასურველი ტემპერატურა</small><b>${safeText(selectedFish[7])}</b></div><div class="fish-stat"><small>სასურველი წნევა</small><b>${safeText(selectedFish[8])}</b></div><div class="fish-stat"><small>სასურველი ქარი</small><b>${safeText(selectedFish[9])}</b></div></div><p><b>აქტივობის ტიპური დრო:</b> ${safeText(selectedFish[10])}</p><div id="fishProfileChance" class="fish-profile-chance">${window.GeoChanceUI?.markup?window.GeoChanceUI.markup(chanceForFish(selectedFish,currentFishingCondition(),selectedWater),'არჩეული საათის დაჭერის შანსი'): ''}</div><p class="muted">ლოკაცია: ${selectedWater ? safeText(selectedWater[1])+' • '+safeText(selectedWater[3]) : 'აირჩიე წყალსატევი ქვემოთ'}</p></div></div><div class="profile-forecast"><div class="eyebrow">7 DAY VIEW</div><div id="profileDays" class="profile-days"><div class="empty">ამინდის მონაცემები იტვირთება…</div></div></div>`;
  fishImage(selectedFish,src=>{const img=document.getElementById('profileFishImage');if(img)img.src=src;});
  updateSelectedFishChance();
  updateFishingRules();
}

function renderProfileForecast(){
  if(!selectedFish) return;
  const profile=document.getElementById('fishProfile');
  if(profile&&!profile.querySelector(`.fish-profile-grid[data-fish-id="${CSS.escape(String(selectedFish[0]))}"]`))renderFishProfileShell();
  updateSelectedFishChance();
  if(!selectedWater){const none=document.getElementById('profileDays');if(none)none.innerHTML='<div class="empty">ამ სახეობისთვის ბაზაში კონკრეტული სათევზაო ადგილი ჯერ არ არის მითითებული.</div>';return;}
  if(!plannerWeather) return;
  const wrap=document.getElementById('profileDays');
  if(!wrap)return;
  const days=Math.min(window.GNPremium?.maxForecastDays?.()||1,plannerWeather.daily.time.length);
  let html='';
  for(let i=0;i<days;i++){
    const iso=plannerWeather.daily.time[i];
    const pressure=pressureForDay(plannerWeather,iso);
    const c={temperature_2m:plannerWeather.daily.temperature_2m_max[i],pressure_msl:pressure,wind_speed_10m:plannerWeather.daily.wind_speed_10m_max[i],precipitation:plannerWeather.daily.precipitation_sum[i],precipitation_probability:plannerWeather.daily.precipitation_probability_max[i],weather_code:plannerWeather.daily.weather_code[i],relative_humidity_2m:60,local_hour:12};
    const bestHour=bestScoredHourForDate(plannerWeather,iso);const score=bestHour?.score??fishScore(selectedFish,c,selectedWater);
    const mm=codeMeta(plannerWeather.daily.weather_code[i]);
    const active=iso===(document.getElementById('startDate')?.value||'')?' active-day':'';
    html+=`<button class="profile-day${active}" data-iso="${iso}" data-best-hour="${bestHour?.r.time||'12:00'}"><b>${fmtDate(iso)}</b><span>${mm[0]}</span><strong>${score}/100</strong><small>⏰ საუკეთესო საათი: ${bestHour?.r.time||'12:00'}</small><small>${Math.round(c.temperature_2m)}° • ${Math.round(c.wind_speed_10m)} კმ/სთ</small><small>📍 ${safeText(selectedWater[1])}</small></button>`;
  }
  wrap.innerHTML=html;
  wrap.querySelectorAll('.profile-day').forEach(btn=>btn.onclick=()=>{selectedFishCardScore=null;const date=document.getElementById('startDate');if(date)date.value=btn.dataset.iso;chooseBestHourForDate(btn.dataset.iso);runPlanner();wrap.querySelectorAll('.profile-day').forEach(x=>x.classList.remove('active-day'));btn.classList.add('active-day');document.getElementById('planner')?.scrollIntoView({behavior:'smooth'});});
}

// Fish-to-water relationships are explicit in WATERS[6]. Only show places
// whose species list includes the selected fish (plus true duplicate-name IDs).
const FISH_ID_ALIASES={
  pikeperch:['zander'], zander:['pikeperch'],
  grasscarp:['whiteamur'], whiteamur:['grasscarp']
};
function compatibleWaterIndexes(fish){
  if(!fish)return WATERS.map((_,i)=>i);
  const ids=new Set([String(fish[0]||'').trim().toLowerCase(),...(FISH_ID_ALIASES[String(fish[0]||'').trim().toLowerCase()]||[])].map(x=>String(x).trim().toLowerCase()));
  return WATERS.map((w,i)=>({w,i})).filter(({w})=>String(w[6]||'').split(',').map(x=>x.trim().toLowerCase()).some(id=>ids.has(id))).map(x=>x.i);
}
function showNoFishLocations(){
  const days=document.getElementById('dayCards');if(days)days.innerHTML='';
  const callout=document.getElementById('bestCallout');if(callout)callout.innerHTML=selectedFish?`<b>${safeText(selectedFish[1])}</b>-ისთვის ზუსტად დაკავშირებული სათევზაო ადგილი ჯერ არ არის დამატებული ბაზაში. სხვა სახეობის ადგილებს არ გაჩვენებთ, რომ მცდარი ინფორმაცია არ მიიღო.`:'ჯერ აირჩიე თევზი და სათევზაო ადგილი.';
  const hourly=document.getElementById('fishingHourlyStrip');if(hourly)hourly.innerHTML='<div class="empty">ამ თევზისთვის შესაბამისი ლოკაცია ჯერ არ არის აღწერილი.</div>';
  const selected=document.getElementById('fishingHourlySelected');if(selected)selected.innerHTML='';
  const meta=document.getElementById('waterMeta');if(meta)meta.innerHTML='<span class="muted">აირჩიე თევზი — სია აჩვენებს მხოლოდ ამ სახეობისთვის მონიშნულ ადგილებს.</span>';
}
function syncWaterOptions(preferCompatible=true){
  const water=document.getElementById('waterSelect');if(!water)return;
  const oldWater=selectedWater;
  const previous=water.value===''?-1:Number(water.value);
  const indexes=compatibleWaterIndexes(selectedFish);
  water.innerHTML='';
  if(!indexes.length){
    const opt=document.createElement('option');opt.value='';opt.textContent=selectedFish?`ამ თევზისთვის ადგილი ჯერ არ არის დამატებული`:'აირჩიე სათევზაო ადგილი';water.appendChild(opt);
    selectedWater=null;plannerWeather=null;selectedHourlyRow=null;window.__gnFishingWeather=null;plannerRequestToken++;liveFishingRequestToken++;updateWaterMeta();showNoFishLocations();return;
  }
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=selectedFish?'აირჩიე ამ თევზის ბინადრობის ადგილი':'აირჩიე სათევზაო ადგილი';water.appendChild(placeholder);
  indexes.forEach(i=>{const w=WATERS[i],o=document.createElement('option');o.value=String(i);o.textContent=`${w[1]} • ${w[3]} • ${w[2]}`;water.appendChild(o);});
  let next=indexes.includes(previous)?previous:indexes[0];
  if(!preferCompatible&&!indexes.includes(previous))next=indexes[0];
  water.value=String(next);selectedWater=WATERS[next];
  if(oldWater!==selectedWater){plannerWeather=null;selectedHourlyRow=null;window.__gnFishingWeather=null;plannerRequestToken++;liveFishingRequestToken++;}
  updateWaterMeta();
}
function populateHourSelect(rows){const el=document.getElementById('hourSelect');if(!el||!rows?.length)return;const keep=el.value;el.innerHTML='<option value="">ავტომატურად — საუკეთესო საათი</option>'+rows.map(r=>`<option value="${r.time}">${r.time}</option>`).join('');if(rows.some(r=>r.time===keep))el.value=keep;}
function selectFish(f,scroll=true,sourceScore=null){
  selectedFish=f;selectedFishCardScore=Number.isFinite(Number(sourceScore))&&sourceScore!==null&&sourceScore!==''?Math.max(0,Math.min(100,Number(sourceScore))):null;
  syncWaterOptions(true);
  const label=document.getElementById('selectedFishLabel');
  if(label)label.textContent=`${f[1]} • ${f[2]}`;
  const fishSelect=document.getElementById('fishSelect');
  if(fishSelect){fishSelect.value=String(FISHES.indexOf(f));}
  renderFishProfileShell();
  const callout=document.getElementById('bestCallout');if(callout)callout.innerHTML='<span class="loading-box">არჩეული თევზისა და ადგილის საათობრივი შანსები ახლდება…</span>';const days=document.getElementById('dayCards');if(days)days.innerHTML='<div class="loading-box">პროგნოზი იტვირთება…</div>';
  runPlanner(true).catch(err=>console.error('planner error',err));
  if(scroll) document.getElementById('fishProfile')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function waterCompatibilityScore(f,water){
  if(!water||!f) return 55;
  const ids=String(water[6]||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const fishId=String(f[0]||'').trim().toLowerCase();
  const aliases=[fishId,...(FISH_ID_ALIASES[fishId]||[])];
  if(ids.some(id=>aliases.includes(id))) return 100;
  const wt=String(water[2]||'').toLowerCase();
  const ft=String(f[3]||'').toLowerCase();
  if(wt.includes('ზღვა')) return ft.includes('ზღვა') ? 62 : ft.includes('მდინარე') ? 20 : 32;
  if(wt.includes('მდინარე')) return ft.includes('ზღვა') ? 8 : ft.includes('მდინარე') ? 72 : 48;
  if(wt.includes('ტბა')||wt.includes('წყალსაცავი')) return ft.includes('ზღვა') ? 6 : ft.includes('მდინარე') ? 42 : 54;
  return 38;
}

function fitRange(value,range,tolerance){
  if(!Number.isFinite(value)||range.length!==2) return 65;
  const lo=Math.min(range[0],range[1]), hi=Math.max(range[0],range[1]);
  if(value>=lo&&value<=hi) return 100;
  const dist=value<lo?lo-value:value-hi;
  const t=Math.max(1,tolerance);
  return Math.max(0,Math.round(100-100*Math.pow(Math.min(2,dist/t),1.35)));
}

function temperatureDayFit(min,max,range){
  if(!Number.isFinite(min)||!Number.isFinite(max)||range.length!==2) return 65;
  const lo=Math.min(range[0],range[1]), hi=Math.max(range[0],range[1]);
  if(max>=lo && min<=hi){
    const overlap=Math.max(0,Math.min(max,hi)-Math.max(min,lo));
    const targetSpan=Math.max(1,hi-lo);
    const overlapPct=Math.min(1,overlap/targetSpan);
    const center=(min+max)/2;
    const centerFit=fitRange(center,range,Math.max(3,targetSpan*.65));
    return Math.round(76 + overlapPct*18 + centerFit*.06);
  }
  const dist=max<lo?lo-max:min-hi;
  return Math.max(0,Math.round(100-100*Math.pow(Math.min(2,dist/5),1.25)));
}

function weatherConditionScore(code){
  code=Number(code);
  if([95,96,99].includes(code)) return 8;
  if([82,65,75,73].includes(code)) return 22;
  if([81,80,71,61,63].includes(code)) return 48;
  if([55,53,51].includes(code)) return 68;
  if([45,48].includes(code)) return 72;
  if([1,2,3].includes(code)) return 92;
  if(code===0) return 100;
  return 78;
}

function scoreBandKey(score){
  const n=Number(score)||0;
  if(n>=85)return 'excellent'; if(n>=70)return 'good'; if(n>=55)return 'medium'; if(n>=40)return 'weak'; if(n>=20)return 'poor'; return 'very-poor';
}
function scoreBandLabel(score){
  const k=scoreBandKey(score);return ({excellent:'ძალიან კარგი',good:'კარგი',medium:'საშუალო',weak:'სუსტი',poor:'ცუდი','very-poor':'ძალიან ცუდი'})[k];
}
function activityWindowScore(f,hour){
  const txt=String(f?.[10]||'').toLowerCase();
  const h=((Number(hour)||12)%24+24)%24;
  if(txt.includes('მთელი')||txt.includes('ცვალებადი')) return 82;
  const windows=[];
  if(txt.includes('განთიადი')||txt.includes('გამთენიისას')) windows.push([5,8]);
  if(txt.includes('დილა')) windows.push([6,10]);
  if(txt.includes('დღე')) windows.push([10,16]);
  if(txt.includes('საღამო')) windows.push([17,21]);
  if(txt.includes('ღამე')) windows.push([21,24],[0,4]);
  if(!windows.length)return 72;
  for(const [a,b] of windows){ if(h>=a&&h<=b)return 100; }
  let best=999;
  for(const [a,b] of windows){ const d=h<a?a-h:h>b?h-b:0; best=Math.min(best,d); }
  return best<=2?78:best<=4?55:30;
}
function smoothRangeScore(value,range,tolerance){
  if(!Number.isFinite(value)||range.length!==2) return 65;
  const lo=Math.min(range[0],range[1]), hi=Math.max(range[0],range[1]);
  if(value>=lo&&value<=hi)return 100;
  const dist=value<lo?lo-value:value-hi;
  const t=Math.max(0.5,tolerance);
  const ratio=Math.min(2,dist/t);
  return Math.max(0,Math.round(100-100*Math.pow(ratio,1.15)));
}
function humidityScore(h){
  if(!Number.isFinite(h))return 70;
  if(h>=45&&h<=75)return 100;
  const dist=h<45?45-h:h-75;
  return Math.max(35,Math.round(100-dist*2.4));
}
function fishingEnvironmentScore(c,water){
  const generic=['env','ზოგადი','',String(water?.[2]||'მტკნარი'),'','','','18–24°C','1000–1025 hPa','0–15 კმ/სთ','დილა • საღამო',''];
  return fishScore(generic,c,water,false);
}
function fishScore(f,c,water=selectedWater,applyTime=true){
  if(window.GeoFishChance)return window.GeoFishChance(f,c||{},water,applyTime);
  return 42;
}

function pressureForDay(d,iso){
  if(!d?.hourly?.time)return 1010;
  const matches=d.hourly.time.map((x,i)=>({x,i})).filter(o=>o.x.startsWith(iso));
  if(!matches.length)return 1010;
  const noon=matches.find(o=>o.x.includes('12:00'))||matches[Math.floor(matches.length/2)];
  return Number(d.hourly.pressure_msl?.[noon.i]||1010);
}

function updateWaterMeta(){
  const el=document.getElementById('waterMeta');if(!el)return;
  if(!selectedWater){el.innerHTML=selectedFish?`<span class="muted">${safeText(selectedFish[1])}-ისთვის შესაბამისი ადგილი ჯერ არ არის მითითებული.</span>`:'<span class="muted">აირჩიე სათევზაო ადგილი.</span>';return;}
  const coords=Number.isFinite(Number(selectedWater[4]))&&Number.isFinite(Number(selectedWater[5]))?`<span>კოორდინატები: ${Number(selectedWater[4]).toFixed(5)}, ${Number(selectedWater[5]).toFixed(5)}</span>`:'';
  el.innerHTML=`<b>${safeText(selectedWater[1])}</b><span>${safeText(selectedWater[3])} • ${safeText(selectedWater[2])}</span>${coords}`;
}

async function runPlanner(profileRefresh=false){
  const requestId=++plannerRequestToken;
  updateFishingRules();
  if(!selectedFish||!selectedWater){
    if(selectedFish&&!compatibleWaterIndexes(selectedFish).length){showNoFishLocations();return;}
    const callout=document.getElementById('bestCallout');if(callout)callout.innerHTML='აირჩიე თევზი და მხოლოდ მისთვის ჩამონათვალში ნაჩვენები სათევზაო ადგილი.';return;
  }
  const start=document.getElementById('startDate').value||(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'));
  const days=Math.min(Number(document.getElementById('daysCount').value||1), window.GNPremium?.maxForecastDays?.()||1);
  const loadingDays=document.getElementById('dayCards');if(loadingDays)loadingDays.innerHTML='<div class="loading-box">არჩეული დღის საუკეთესო საათი და შანსი იტვირთება…</div>';
  const fishAtStart=selectedFish,waterAtStart=selectedWater;
  try{
    const weatherResult=await openMeteo(waterAtStart[4],waterAtStart[5]);
    if(requestId!==plannerRequestToken||selectedFish!==fishAtStart||selectedWater!==waterAtStart)return;
    plannerWeather=weatherResult;
    updateWaterMeta();
    renderFishingHourly(plannerWeather);
    const out=[];
    for(let i=0;i<days;i++){
      const dt=new Date(`${start}T00:00:00`);dt.setDate(dt.getDate()+i);const iso=window.GeoNatureCommon?.localDateISO?.(dt)||dt.toLocaleDateString('sv-SE');const idx=plannerWeather.daily.time.indexOf(iso);if(idx<0)continue;
      const rows=hourlyRowsForDate(plannerWeather,iso);
      const bestHour=rows.map(r=>({r,score:fishScore(selectedFish,{temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.precip,precipitation_probability:r.rainProb,weather_code:r.code,relative_humidity_2m:r.humidity,local_hour:Number(r.time.slice(0,2))},selectedWater)})).reduce((a,b)=>!a||b.score>a.score?b:a,null);
      if(!bestHour)continue;
      out.push({iso,score:bestHour.score,bestHour:bestHour.r.time,max:plannerWeather.daily.temperature_2m_max[idx],min:plannerWeather.daily.temperature_2m_min[idx],rain:plannerWeather.daily.precipitation_probability_max[idx]||0,wind:plannerWeather.daily.wind_speed_10m_max[idx]||0,pressure:bestHour.r.pressure,code:bestHour.r.code});
    }
    const best=out.reduce((a,b)=>!a||b.score>a.score?b:a,null);
    const box=document.getElementById('dayCards');
    if(box){box.innerHTML=out.map(x=>{const mm=codeMeta(x.code);return`<button class="day-card ${best?.iso===x.iso?'best':''}" data-date="${x.iso}"><h4>${fmtDate(x.iso)}</h4><div class="score">${x.score}</div><small>${mm[0]} ${mm[1]}</small><small>🌡️ ${Math.round(x.max)}° / ${Math.round(x.min)}°</small><small>⏰ საუკეთესო საათი: ${x.bestHour}</small><small>🎚️ ${Math.round(x.pressure)} hPa</small><small>💧 ${x.rain}%</small><small>💨 ${Math.round(x.wind)} კმ/სთ</small><small>📍 ${safeText(selectedWater[1])} • ${safeText(selectedWater[3])}</small></button>`}).join('');box.querySelectorAll('.day-card').forEach(b=>b.onclick=()=>{selectedFishCardScore=null;document.getElementById('startDate').value=b.dataset.date;chooseBestHourForDate(b.dataset.date);runPlanner();});}
    const bestCallout=document.getElementById('bestCallout');
    if(bestCallout)bestCallout.innerHTML=best?`<b>საუკეთესო დღე/საათი:</b> <strong>${fmtDate(best.iso)}</strong> — <strong>${best.score}/100</strong> • ⏰ ${best.bestHour}<br><span class="muted">${safeText(selectedFish[1])} • ${safeText(selectedWater[1])} • ${safeText(selectedWater[3])}</span><br><small class="muted">ქულაში გათვალისწინებულია თევზის სასურველი ტემპერატურა, წნევა, ქარი, ნალექი, ამინდის კოდი და ამ ადგილის შესაბამისობა.</small>`:'პროგნოზის ფანჯარაში ამ თარიღისთვის მონაცემი ვერ მოიძებნა.';
    renderProfileForecast();
  }catch(error){
    if(requestId!==plannerRequestToken)return;
    console.error(error);
    const box=document.getElementById('dayCards');if(box)box.innerHTML='<div class="empty">პროგნოზის ჩატვირთვა ვერ მოხერხდა. შეამოწმე ინტერნეტი და სცადე თავიდან.</div><button type="button" class="btn ghost" id="retryFishingPlanner">↻ თავიდან ცდა</button>';document.getElementById('retryFishingPlanner')?.addEventListener('click',()=>runPlanner(true));const callout=document.getElementById('bestCallout');if(callout)callout.textContent='ამ ეტაპზე საათობრივი პროგნოზი მიუწვდომელია — სცადე განახლება.';
    renderProfileForecast();
  }
}

async function loadLiveFishing(lat,lon,city){
  const requestId=++liveFishingRequestToken;
  try{
    const d=await openMeteo(lat,lon);
    if(requestId!==liveFishingRequestToken)return;
    if(selectedWater&&Number.isFinite(Number(selectedWater[4]))&&(Math.abs(Number(selectedWater[4])-Number(lat))>.001||Math.abs(Number(selectedWater[5])-Number(lon))>.001))return;
    const c=Object.assign({local_hour:new Date().getHours()},d.current),s=selectedFish?fishScore(selectedFish,c,selectedWater):fishingEnvironmentScore(c,selectedWater),m=codeMeta(c.weather_code);window.__gnFishingWeather=c;
    document.getElementById('fishLiveCity').textContent=city;document.getElementById('fishLiveTime').textContent='ახლა';document.getElementById('fishLiveIcon').textContent=m[0];document.getElementById('fishLiveTemp').textContent=Math.round(c.temperature_2m)+'°';document.getElementById('fishLiveDesc').textContent=m[1];document.getElementById('fishLiveScore').textContent=s;renderFishSearch();document.getElementById('fishLivePressure').textContent=Math.round(c.pressure_msl)+' hPa';document.getElementById('fishLiveWind').textContent=Math.round(c.wind_speed_10m)+' კმ/სთ';document.getElementById('fishLiveHumidity').textContent=Math.round(c.relative_humidity_2m)+'%';document.getElementById('fishLiveRain').textContent=Number(c.precipitation).toFixed(1)+' მმ';setPressureGauge(c.pressure_msl,'pressureNeedle','pressureValue','pressureStatus','pressureAdvice');refreshVisibleFishScores();
  }catch(e){console.error(e)}
}

function renderFishSearch(){
  const input=document.getElementById('fishSearch'),type=document.getElementById('fishType'),count=document.getElementById('fishCount'),suggestions=document.getElementById('fishSuggestions');
  const q=input.value.trim().toLowerCase(),t=type.value;
  const list=FISHES.filter(f=>{const hay=[f[1],f[2],f[11],f[4],f[5],f[3]].join(' ').toLowerCase();const typeOk=t==='all'||(t==='fresh'&&f[3].includes('მტკნარი'))||(t==='river'&&f[3].includes('მდინარე'))||(t==='sea'&&f[3].includes('ზღვა'));return typeOk&&(!q||hay.includes(q));});
  count.textContent=`${list.length} სახეობა`;
  suggestions.innerHTML=list.slice(0,10).map((f,i)=>`<button data-i="${i}">${safeText(f[1])}</button>`).join('');
  suggestions.querySelectorAll('button').forEach(b=>b.onclick=()=>selectFish(list[Number(b.dataset.i)]));
  renderFishResults(list);
}

async function initFishingPage(){
  const water=document.getElementById('waterSelect'),dateInput=document.getElementById('startDate'),today=new Date();
  const todayIso=window.GeoWildlifeRules?.today(today)||window.GeoNatureCommon?.localDateISO?.(today)||today.toLocaleDateString('sv-SE'); const maxD=new Date(today.getTime()+15*86400000); dateInput.min=todayIso;dateInput.max=window.GeoWildlifeRules?.today(maxD)||window.GeoNatureCommon?.localDateISO?.(maxD)||maxD.toLocaleDateString('sv-SE');dateInput.value=todayIso;
  water.innerHTML='';
  WATERS.forEach((w,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${w[1]} • ${w[3]} • ${w[2]}`;water.appendChild(o)});
  const fishSelect=document.getElementById('fishSelect');
  if(fishSelect){
    fishSelect.innerHTML='<option value="">აირჩიე თევზი</option>';
    FISHES.forEach((f,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${f[1]} • ${f[3]} • ${f[4]}`;fishSelect.appendChild(o);});
    fishSelect.onchange=()=>{
      if(fishSelect.value===''){
        selectedFish=null;selectedFishCardScore=null;syncWaterOptions(false);plannerWeather=null;selectedHourlyRow=null;window.__gnFishingWeather=null;plannerRequestToken++;
        const label=document.getElementById('selectedFishLabel');if(label)label.textContent='ჯერ არ აგირჩევია';
        const profile=document.getElementById('fishProfile');if(profile)profile.innerHTML='<div class="empty">აირჩიე თევზი, რომ ნახო მისი ბინადრობის ადგილები და პროგნოზი.</div>';
        const days=document.getElementById('dayCards');if(days)days.innerHTML='';
        const callout=document.getElementById('bestCallout');if(callout)callout.textContent='აირჩიე თევზი და შესაბამისი სათევზაო ადგილი.';
        if(selectedWater)loadLiveFishing(selectedWater[4],selectedWater[5],selectedWater[1]);
        return;
      }
      const i=Number(fishSelect.value);if(Number.isInteger(i)&&FISHES[i])selectFish(FISHES[i],false);
    };
  }
  const params=new URLSearchParams(location.search);
  const requestedPlace=params.get('place');
  let startWater=0;
  if(requestedPlace){const idx=WATERS.findIndex(w=>w[0]===requestedPlace||w[1]===requestedPlace);if(idx>=0)startWater=idx;}
  selectedWater=WATERS[startWater];water.value=String(startWater);updateWaterMeta();syncWaterOptions(false);
  water.onchange=async()=>{
    selectedFishCardScore=null;const raw=water.value;const idx=raw===''?NaN:Number(raw);const nextWater=Number.isInteger(idx)?WATERS[idx]||null:null;
    selectedWater=nextWater;plannerRequestToken++;liveFishingRequestToken++;plannerWeather=null;selectedHourlyRow=null;window.__gnFishingWeather=null;updateWaterMeta();refreshVisibleFishScores();
    const loadingCallout=document.getElementById('bestCallout');if(loadingCallout)loadingCallout.innerHTML='<span class="loading-box">არჩეული ადგილის საათობრივი პროგნოზი იტვირთება…</span>';const loadingDays=document.getElementById('dayCards');if(loadingDays)loadingDays.innerHTML='<div class="loading-box">დღის შანსები ახლდება…</div>';
    if(!selectedWater){showNoFishLocations();return;}
    const waterAtStart=selectedWater;
    try{const result=await openMeteo(waterAtStart[4],waterAtStart[5]);if(selectedWater!==waterAtStart)return;plannerWeather=result;renderFishingHourly(plannerWeather);if(selectedFish)await runPlanner();else await loadLiveFishing(waterAtStart[4],waterAtStart[5],waterAtStart[1]);}catch(e){console.error(e);if(selectedWater===waterAtStart){const callout=document.getElementById('bestCallout');if(callout)callout.innerHTML='<span class="empty">პროგნოზი დროებით ვერ ჩაიტვირთა.</span> <button type="button" class="btn ghost" id="retryWaterForecast">↻ თავიდან ცდა</button>';document.getElementById('retryWaterForecast')?.addEventListener('click',()=>{if(selectedFish)runPlanner(true);else loadLiveFishing(waterAtStart[4],waterAtStart[5],waterAtStart[1])});const days=document.getElementById('dayCards');if(days)days.innerHTML='';}}
  };
  window.GNPremium?.applyDayLimit(document.getElementById('daysCount'));
  document.getElementById('fishSearch').oninput=renderFishSearch;document.getElementById('fishType').onchange=renderFishSearch;
  document.getElementById('fishClear').onclick=()=>{document.getElementById('fishSearch').value='';document.getElementById('fishType').value='all';renderFishSearch();};
  dateInput.onchange=()=>{selectedFishCardScore=null;runPlanner();};document.getElementById('daysCount').onchange=()=>{selectedFishCardScore=null;window.GNPremium?.applyDayLimit(document.getElementById('daysCount'));runPlanner();};document.getElementById('planBtn').onclick=()=>{selectedFishCardScore=null;runPlanner();};document.getElementById('hourSelect')?.addEventListener('change',()=>{selectedFishCardScore=null;if(plannerWeather)renderFishingHourly(plannerWeather)});
  document.getElementById('bestTomorrow').onclick=()=>{selectedFishCardScore=null;const d=new Date((dateInput.value||window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'))+'T12:00:00');d.setDate(d.getDate()+1);dateInput.value=window.GeoNatureCommon?.localDateISO?.(d)||d.toLocaleDateString('sv-SE');document.getElementById('daysCount').value='1';runPlanner();};
  renderFishSearch();
  if(selectedWater)await loadLiveFishing(selectedWater[4],selectedWater[5],selectedWater[1]);
  if(selectedWater){try{plannerWeather=await openMeteo(selectedWater[4],selectedWater[5]);renderFishingHourly(plannerWeather);}catch(e){console.error(e)}}
  if(window.GNLiveFactors) window.GNLiveFactors.bind({liveDefault:true,refresh:async()=>{
    if(!selectedWater)return;const waterAtStart=selectedWater;
    try{const latest=await openMeteo(waterAtStart[4],waterAtStart[5]);if(selectedWater!==waterAtStart)return;plannerWeather=latest;renderFishingHourly(plannerWeather);if(selectedFish)await runPlanner(true);else await loadLiveFishing(waterAtStart[4],waterAtStart[5],waterAtStart[1]);}
    catch(e){console.error(e)}
  }});
}
window.__defineGetter__('selectedFish',()=>selectedFish);
window.__defineGetter__('selectedWater',()=>selectedWater);
window.__defineGetter__('plannerWeather',()=>plannerWeather);
window.fishScore=fishScore;
window.fishingEnvironmentScore=fishingEnvironmentScore;
window.scoreBandKey=scoreBandKey;
window.scoreBandLabel=scoreBandLabel;
window.activityWindowScore=activityWindowScore;
document.addEventListener('geonature:refresh-plus',()=>document.dispatchEvent(new CustomEvent('gn:fishingUpdated')));
