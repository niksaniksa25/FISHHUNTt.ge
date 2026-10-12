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

function fishingNumber(value){
  if(window.GeoNatureCommon?.numberOrNull)return window.GeoNatureCommon.numberOrNull(value);
  if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function fishingValue(value,unit='',digits=0){const n=fishingNumber(value);return n===null?'—':n.toFixed(digits)+unit;}
function conditionFromFishingRow(row){
  if(!row)return {};
  if(window.GeoNatureCommon?.conditionsFromRow)return window.GeoNatureCommon.conditionsFromRow(row);
  return {temperature_2m:row.temperature,pressure_msl:row.pressure,wind_speed_10m:row.wind,precipitation:row.precip,precipitation_probability:row.rainProb,weather_code:row.code,relative_humidity_2m:row.humidity,cloud_cover:row.cloud,wind_gusts_10m:row.gust,visibility:row.visibility,local_hour:fishingNumber(String(row.time||'').slice(0,2))};
}
function currentFishingCondition(){
  if(selectedHourlyRow)return conditionFromFishingRow(selectedHourlyRow);
  if(plannerWeather?.current){const c=plannerWeather.current;return {...c,local_hour:fishingNumber(String(c.time||'').slice(11,13))};}
  return window.__gnFishingWeather||{};
}
function chanceForFish(f,condition=currentFishingCondition(),water=selectedWater){
  return window.GeoFishChance?window.GeoFishChance(f,condition||{},water,true):null;
}
function fishingScoreMarkup(score,label='პირობების ინდექსი'){
  return window.GeoChanceUI?.markup?window.GeoChanceUI.markup(score,label):`<span class="fish-chance">${score===null?'—':score+'/100'}</span>`;
}
function refreshVisibleFishScores(){
  const condition=currentFishingCondition();
  document.querySelectorAll('#fishResults .fish-card[data-fish-id]').forEach(card=>{
    const f=(window.FISHES||[]).find(x=>String(x[0])===card.dataset.fishId);if(!f)return;
    const score=chanceForFish(f,condition,selectedWater),markup=fishingScoreMarkup(score);
    const slot=card.querySelector('.fish-chance-slot');if(slot)slot.innerHTML=markup;
    const titleChance=card.querySelector('.fish-card-title-row > .gn-chance');if(titleChance)titleChance.outerHTML=markup;
    card.dataset.chance=score===null?'':String(score);
  });
  updateSelectedFishChance();
}
function updateSelectedFishChance(){
  const target=document.getElementById('fishProfileChance');if(!target||!selectedFish)return;
  const score=chanceForFish(selectedFish,currentFishingCondition(),selectedWater);
  target.innerHTML=fishingScoreMarkup(score,'არჩეული საათის პირობები')+'<small class="fish-score-consistency-note">0–100 ქულა არის საორიენტაციო პირობების ინდექსი და არა დაჭერის ალბათობა. წყლის ტემპერატურა, დონე და თევზის რაოდენობა ამინდის პროგნოზით არ იზომება.</small>';
}
function hourlyRowsForDate(data,iso){
  if(window.GeoNatureCommon?.hourlyRows)return window.GeoNatureCommon.hourlyRows(data,iso);
  if(!data?.hourly?.time)return [];
  const keys={temperature:'temperature_2m',pressure:'pressure_msl',wind:'wind_speed_10m',precip:'precipitation',rainProb:'precipitation_probability',code:'weather_code',humidity:'relative_humidity_2m',cloud:'cloud_cover',gust:'wind_gusts_10m',visibility:'visibility'};
  return data.hourly.time.map((t,i)=>{const row={iso:t,time:t.slice(11,16),date:t.slice(0,10),index:i,local_hour:Number(t.slice(11,13))};for(const [key,field]of Object.entries(keys))row[key]=fishingNumber(data.hourly[field]?.[i]);return row;}).filter(row=>row.date===iso);
}
function scoredFishingHours(data,iso){
  if(!selectedFish||!selectedWater)return [];
  const now=window.GeoNatureCommon?.zonedDateTime?.(data),hour=now?.hour;
  const rows=hourlyRowsForDate(data,iso).filter(row=>iso!==now?.date||row.local_hour>=hour);
  return rows.map(r=>({r,score:fishScore(selectedFish,conditionFromFishingRow(r),selectedWater)})).filter(item=>item.score!==null).sort((a,b)=>b.score-a.score||a.r.iso.localeCompare(b.r.iso));
}
function bestScoredHourForDate(data,iso){return scoredFishingHours(data,iso)[0]||null;}
function chooseBestHourForDate(iso){const best=plannerWeather&&bestScoredHourForDate(plannerWeather,iso);if(!best)return;selectedHourlyRow=best.r;window.__gnFishingWeather=conditionFromFishingRow(best.r);const hour=document.getElementById('hourSelect');if(hour&&[...hour.options].some(o=>o.value===best.r.time))hour.value=best.r.time;}
function selectedHourForDate(data,iso){
  const rows=hourlyRowsForDate(data,iso);if(!rows.length)return null;
  const now=window.GeoNatureCommon?.zonedDateTime?.(data)||{date:data.current?.time?.slice(0,10),time:data.current?.time?.slice(11,16)};
  if(iso===now.date){const currentHour=String(now.time||'00:00').slice(0,2)+':00';return rows.find(row=>row.time>=currentHour)||rows[rows.length-1];}
  return bestScoredHourForDate(data,iso)?.r||rows.find(row=>row.time==='12:00')||rows[Math.floor(rows.length/2)];
}
function waterHasCoordinates(water){return !!water&&fishingNumber(water[4])!==null&&fishingNumber(water[5])!==null&&Math.abs(Number(water[4]))<=90&&Math.abs(Number(water[5]))<=180;}
function clearFishingWeather(message='ამინდის მონაცემები იტვირთება…'){
  plannerWeather=null;selectedHourlyRow=null;window.__gnFishingWeather=null;
  const set=(id,value)=>{const element=document.getElementById(id);if(element)element.textContent=value;};
  ['fishLiveTemp','fishLiveScore','fishLivePressure','fishLiveWind','fishLiveHumidity','fishLiveRain'].forEach(id=>set(id,'—'));
  set('fishLiveCity',selectedWater?.[1]||'ადგილი არჩეული არ არის');set('fishLiveTime','—');set('selectedHourLabel','საათის მონაცემი მიუწვდომელია');set('fishLiveDesc',message);set('fishLiveBand','მონაცემი მიუწვდომელია');set('fishLiveMode','პროგნოზი');
  const gauge=document.getElementById('fishScoreGauge');if(gauge)gauge.style.setProperty('--score-deg','0deg');
  const selected=document.getElementById('fishingHourlySelected');if(selected)selected.textContent=message;
  const strip=document.getElementById('fishingHourlyStrip');if(strip)strip.innerHTML='';
  const hour=document.getElementById('hourSelect');if(hour)hour.innerHTML='<option value="">საათები მიუწვდომელია</option>';
  setPressureGauge(null,'pressureNeedle','pressureValue','pressureStatus','pressureAdvice');
  if(window.GNLiveFactors)window.GNLiveFactors.render({data:null,row:null,subject:selectedFish,type:'fishing',locationName:selectedWater?.[1]||'ადგილი არჩეული არ არის',live:false});
  refreshVisibleFishScores();document.dispatchEvent(new CustomEvent('gn:fishingUpdated'));
}
function showMissingWaterCoordinates(){
  const message='ამ ადგილის ზუსტი კოორდინატები ჯერ არ არის მითითებული; ადგილობრივი ამინდის შეფასება მიუწვდომელია.';
  clearFishingWeather(message);const callout=document.getElementById('bestCallout');if(callout)callout.textContent=message;
  const days=document.getElementById('dayCards');if(days)days.innerHTML='';
  const profileDays=document.getElementById('profileDays');if(profileDays)profileDays.textContent=message;
}

function applyHourlyToLive(row){
  if(!row) return;
  selectedHourlyRow=row;
  const condition=conditionFromFishingRow(row);
  const score=selectedFish ? fishScore(selectedFish,condition,selectedWater) : fishingEnvironmentScore(condition,selectedWater);
  const mm=codeMeta(row.code);
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val};
  set('fishLiveCity',selectedWater?.[1]||'არჩეული ადგილი');
  set('fishLiveTime',`${fmtDate(row.date)} • ${row.time}`);
  set('fishLiveMode',plannerWeather?.__meta?.stale?'ბოლო ხელმისაწვდომი პროგნოზი':'საათობრივი პროგნოზი');
  set('fishLiveIcon',mm[0]);
  set('fishLiveTemp',fishingValue(row.temperature,'°'));
  set('fishLiveDesc',`${mm[1]} • ${score===null?'შეფასება მიუწვდომელია':score+'/100'}`);
  set('fishLiveScore',score===null?'—':score);
  const gauge=document.getElementById('fishScoreGauge'); if(gauge) gauge.style.setProperty('--score-deg',(Math.max(0,Math.min(100,score))*3.6)+'deg');
  const band=document.getElementById('fishLiveBand'); if(band){ band.textContent=score===null?'მონაცემი მიუწვდომელია':scoreBandLabel(score); band.dataset.level=scoreBandKey(score); }
  set('fishLivePressure',fishingValue(row.pressure,' hPa'));
  set('fishLiveWind',fishingValue(row.wind,' კმ/სთ'));
  set('fishLiveHumidity',fishingValue(row.humidity,'%'));
  set('fishLiveRain',fishingValue(row.precip,' მმ',1));
  setPressureGauge(row.pressure,'pressureNeedle','pressureValue','pressureStatus','pressureAdvice');
  const lab=document.getElementById('selectedHourLabel');
  const hs=document.getElementById('hourSelect');if(hs&&[...hs.options].some(o=>o.value===row.time))hs.value=row.time;
  if(lab)lab.textContent=`არჩეული საათი: ${row.time}`;
  if(window.GNLiveFactors) window.GNLiveFactors.render({data:plannerWeather,row,subject:selectedFish,type:'fishing',locationName:selectedWater?.[1]||'არჩეული ადგილი'});
  const out=document.getElementById('fishingHourlySelected');
  if(out){
    out.innerHTML=`<div class="selected-hour-grid"><div><span>${mm[0]}</span><b>${row.time}</b><small>${mm[1]}</small></div><div><small>ტემპერატურა</small><b>${fishingValue(row.temperature,'°C')}</b></div><div><small>წნევა</small><b>${fishingValue(row.pressure,' hPa')}</b></div><div><small>ქარი</small><b>${fishingValue(row.wind,' კმ/სთ')}</b></div><div><small>ნალექი</small><b>${fishingValue(row.precip,' მმ',1)}</b></div><div><small>წვიმის ალბათობა</small><b>${fishingValue(row.rainProb,'%')}</b></div><div><small>Fishing Score</small><b class="selected-score">${score===null?'—':score+'/100'}</b></div></div>`;
  }
  document.querySelectorAll('#fishingHourlyStrip .hour-card').forEach(el=>el.classList.toggle('active',el.dataset.iso===row.iso));
  window.__gnFishingWeather=condition;
  refreshVisibleFishScores();
  document.dispatchEvent(new CustomEvent('gn:fishingUpdated'));
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
  if(!rows.length){clearFishingWeather('ამ თარიღისთვის საათობრივი მონაცემი მიუწვდომელია.');wrap.innerHTML='<div class="empty">ამ თარიღისთვის საათობრივი მონაცემი მიუწვდომელია.</div>';return;}
  populateHourSelect(rows);
  const chosenHour=document.getElementById('hourSelect')?.value;
  const current=(chosenHour&&rows.find(r=>r.time===chosenHour))||bestScoredHourForDate(data,date)?.r||selectedHourForDate(data,date);
  wrap.innerHTML=rows.map(row=>{
    const mm=codeMeta(row.code);
    const condition=conditionFromFishingRow(row);
    const score=selectedFish ? fishScore(selectedFish,condition,selectedWater) : fishingEnvironmentScore(condition,selectedWater);
    const active=current?.iso===row.iso?' active':'';
    return `<button class="hour-card${active}" data-iso="${row.iso}"><small>${row.time}</small><span class="hour-icon">${mm[0]}</span><strong>${fishingValue(row.temperature,'°')}</strong><em>${fishingValue(row.pressure)}</em><b>${fishingValue(row.wind,' კმ/სთ')}</b><span class="hour-score">${score===null?'—':score}</span></button>`;
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
    const chance=chanceForFish(f,currentFishingCondition(),selectedWater);const chanceHtml=fishingScoreMarkup(chance);card.dataset.fishId=String(f[0]);card.dataset.chance=chance===null?'':String(chance);card.innerHTML=`<div class="fish-img-wrap"><img class="fish-img" loading="lazy" alt="${safeText(f[1])}"><span class="fish-chance-slot">${chanceHtml}</span></div><div class="fish-card-body"><div class="fish-card-title-row"><div><span class="tag">${safeText(f[3])}</span><h3>${safeText(f[1])}</h3></div>${chanceHtml}</div><p>${safeText(f[2])} • ${safeText(f[4])}</p><div class="fish-card-meta"><span>⚖️ ${safeText(f[6])}</span><span>🌡️ ${safeText(f[7])}</span></div></div>`;
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
  profile.innerHTML=`<div class="fish-profile-grid" data-fish-id="${safeText(selectedFish[0])}"><div><img id="profileFishImage" class="fish-profile-img" alt="${safeText(selectedFish[1])}"><div><span class="tag">${safeText(selectedFish[3])}</span><span class="tag">${safeText(selectedFish[4])}</span></div></div><div><span class="eyebrow">SELECTED FISH</span><h2>${safeText(selectedFish[1])}</h2><p class="muted">${safeText(selectedFish[2])} • ${safeText(selectedFish[11])}</p><div class="fish-stat-grid"><div class="fish-stat"><small>ინფორმაციული წონა</small><b>${safeText(selectedFish[6])}</b></div><div class="fish-stat"><small>სასურველი წყლის ტემპერატურა</small><b>${safeText(selectedFish[7])}</b></div><div class="fish-stat"><small>სასურველი წნევა</small><b>${safeText(selectedFish[8])}</b></div><div class="fish-stat"><small>სასურველი ქარი</small><b>${safeText(selectedFish[9])}</b></div></div><p><b>აქტივობის ტიპური დრო:</b> ${safeText(selectedFish[10])}</p><div id="fishProfileChance" class="fish-profile-chance">${window.GeoChanceUI?.markup?window.GeoChanceUI.markup(chanceForFish(selectedFish,currentFishingCondition(),selectedWater),'არჩეული საათის პირობები'): ''}</div><p class="muted">ლოკაცია: ${selectedWater ? safeText(selectedWater[1])+' • '+safeText(selectedWater[3]) : 'აირჩიე წყალსატევი ქვემოთ'}</p></div></div><div class="profile-forecast"><div class="eyebrow">7 DAY VIEW</div><div id="profileDays" class="profile-days"><div class="empty">ამინდის მონაცემები იტვირთება…</div></div></div>`;
  const fishAtStart=selectedFish,imgAtStart=document.getElementById('profileFishImage');
  fishImage(fishAtStart,src=>{if(imgAtStart?.isConnected&&selectedFish===fishAtStart)imgAtStart.src=src;});
  updateSelectedFishChance();
  updateFishingRules();
}

function renderProfileForecast(){
  if(!selectedFish) return;
  const profile=document.getElementById('fishProfile');
  if(profile&&!profile.querySelector(`.fish-profile-grid[data-fish-id="${CSS.escape(String(selectedFish[0]))}"]`))renderFishProfileShell();
  updateSelectedFishChance();
  if(!selectedWater){const none=document.getElementById('profileDays');if(none)none.innerHTML='<div class="empty">ამ სახეობისთვის ბაზაში კონკრეტული სათევზაო ადგილი ჯერ არ არის მითითებული.</div>';return;}
  if(!plannerWeather){const empty=document.getElementById('profileDays');if(empty)empty.textContent='ამინდის პროგნოზი მიუწვდომელია.';return;}
  const wrap=document.getElementById('profileDays');
  if(!wrap)return;
  const days=Math.min(window.GNPremium?.maxForecastDays?.()||1,plannerWeather.daily.time.length);
  let html='';
  for(let i=0;i<days;i++){
    const iso=plannerWeather.daily.time[i];
    const bestHour=bestScoredHourForDate(plannerWeather,iso),score=bestHour?.score??null,row=bestHour?.r;
    const mm=codeMeta(row?.code);
    const active=iso===(document.getElementById('startDate')?.value||'')?' active-day':'';
    html+=`<button class="profile-day${active}" data-iso="${iso}" data-best-hour="${row?.time||''}"><b>${fmtDate(iso)}</b><span>${mm[0]}</span><strong>${score===null?'—':score+'/100'}</strong><small>⏰ საუკეთესო საათი: ${row?.time||'მონაცემი მიუწვდომელია'}</small><small>${fishingValue(row?.temperature,'°')} • ${fishingValue(row?.wind,' კმ/სთ')}</small><small>📍 ${safeText(selectedWater[1])}</small></button>`;
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
  clearFishingWeather('ამ სახეობისთვის შესაბამისი ადგილის ამინდი მიუწვდომელია.');
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
  indexes.forEach(i=>{const w=WATERS[i],o=document.createElement('option');o.value=String(i);o.textContent=`${w[1]} • ${w[3]} • ${w[2]}${waterHasCoordinates(w)?'':' • კოორდინატები დაუზუსტებელია'}`;water.appendChild(o);});
  let next=indexes.includes(previous)?previous:indexes[0];
  if(!preferCompatible&&!indexes.includes(previous))next=indexes[0];
  water.value=String(next);selectedWater=WATERS[next];
  if(oldWater!==selectedWater){clearFishingWeather('არჩეული ადგილის პროგნოზი იტვირთება…');plannerRequestToken++;liveFishingRequestToken++;}
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
  refreshVisibleFishScores();
  const callout=document.getElementById('bestCallout');if(callout)callout.innerHTML='<span class="loading-box">არჩეული თევზისა და ადგილის საათობრივი პირობები ახლდება…</span>';const days=document.getElementById('dayCards');if(days)days.innerHTML='<div class="loading-box">პროგნოზი იტვირთება…</div>';
  runPlanner(true).catch(err=>console.error('planner error',err));
  if(scroll) document.getElementById('fishProfile')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function waterCompatibilityScore(f,water){
  if(!water||!f) return null;
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
  const n=fishingNumber(score);if(n===null)return 'unknown';
  if(n>=85)return 'excellent'; if(n>=70)return 'good'; if(n>=55)return 'medium'; if(n>=40)return 'weak'; if(n>=20)return 'poor'; return 'very-poor';
}
function scoreBandLabel(score){
  const k=scoreBandKey(score);return ({unknown:'მონაცემი მიუწვდომელია',excellent:'ძალიან კარგი',good:'კარგი',medium:'საშუალო',weak:'სუსტი',poor:'ცუდი','very-poor':'ძალიან ცუდი'})[k];
}
function activityWindowScore(f,hour){return window.GeoFishConditions?.activityFit?.(f?.[10],hour)??null;}

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
  return null;
}


function updateWaterMeta(){
  const el=document.getElementById('waterMeta');if(!el)return;
  if(!selectedWater){el.innerHTML=selectedFish?`<span class="muted">${safeText(selectedFish[1])}-ისთვის შესაბამისი ადგილი ჯერ არ არის მითითებული.</span>`:'<span class="muted">აირჩიე სათევზაო ადგილი.</span>';return;}
  const coords=waterHasCoordinates(selectedWater)?`<span>კოორდინატები: ${Number(selectedWater[4]).toFixed(5)}, ${Number(selectedWater[5]).toFixed(5)}</span>`:'';
  el.innerHTML=`<b>${safeText(selectedWater[1])}</b><span>${safeText(selectedWater[3])} • ${safeText(selectedWater[2])}</span>${coords}`;
}

async function runPlanner(profileRefresh=false){
  const requestId=++plannerRequestToken;
  updateFishingRules();
  if(!selectedFish||!selectedWater){
    if(selectedFish&&!compatibleWaterIndexes(selectedFish).length){showNoFishLocations();return;}
    const callout=document.getElementById('bestCallout');if(callout)callout.innerHTML='აირჩიე თევზი და მხოლოდ მისთვის ჩამონათვალში ნაჩვენები სათევზაო ადგილი.';return;
  }
  if(!waterHasCoordinates(selectedWater)){showMissingWaterCoordinates();return;}
  const start=document.getElementById('startDate').value||(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'));
  const days=Math.min(Number(document.getElementById('daysCount').value||1), window.GNPremium?.maxForecastDays?.()||1);
  const loadingDays=document.getElementById('dayCards');if(loadingDays)loadingDays.innerHTML='<div class="loading-box">არჩეული დღის საუკეთესო საათი და პირობები იტვირთება…</div>';
  const fishAtStart=selectedFish,waterAtStart=selectedWater;
  try{
    const weatherResult=await openMeteo(waterAtStart[4],waterAtStart[5]);
    if(requestId!==plannerRequestToken||selectedFish!==fishAtStart||selectedWater!==waterAtStart)return;
    plannerWeather=weatherResult;
    updateWaterMeta();
    renderFishingHourly(plannerWeather);
    if(!plannerWeather){renderProfileForecast();return;}
    const out=[];
    for(let i=0;i<days;i++){
      const dt=new Date(`${start}T12:00:00Z`);dt.setUTCDate(dt.getUTCDate()+i);const iso=dt.toISOString().slice(0,10);const idx=plannerWeather.daily.time.indexOf(iso);if(idx<0)continue;
      const bestHour=bestScoredHourForDate(plannerWeather,iso);
      if(!bestHour)continue;
      out.push({iso,score:bestHour.score,bestHour:bestHour.r.time,max:plannerWeather.daily.temperature_2m_max[idx],min:plannerWeather.daily.temperature_2m_min[idx],rain:plannerWeather.daily.precipitation_probability_max[idx]||0,wind:plannerWeather.daily.wind_speed_10m_max[idx]||0,pressure:bestHour.r.pressure,code:bestHour.r.code});
    }
    const best=out.reduce((a,b)=>!a||b.score>a.score?b:a,null);
    const box=document.getElementById('dayCards');
    if(box){box.innerHTML=out.map(x=>{const mm=codeMeta(x.code);return`<button class="day-card ${best?.iso===x.iso?'best':''}" data-date="${x.iso}"><h4>${fmtDate(x.iso)}</h4><div class="score">${x.score}</div><small>${mm[0]} ${mm[1]}</small><small>🌡️ ${Math.round(x.max)}° / ${Math.round(x.min)}°</small><small>⏰ საუკეთესო საათი: ${x.bestHour}</small><small>🎚️ ${Math.round(x.pressure)} hPa</small><small>💧 ${x.rain}%</small><small>💨 ${Math.round(x.wind)} კმ/სთ</small><small>📍 ${safeText(selectedWater[1])} • ${safeText(selectedWater[3])}</small></button>`}).join('');box.querySelectorAll('.day-card').forEach(b=>b.onclick=()=>{selectedFishCardScore=null;document.getElementById('startDate').value=b.dataset.date;chooseBestHourForDate(b.dataset.date);runPlanner();});}
    const bestCallout=document.getElementById('bestCallout');
    if(bestCallout)bestCallout.innerHTML=best?`<b>საუკეთესო დღე/საათი:</b> <strong>${fmtDate(best.iso)}</strong> — <strong>${best.score}/100</strong> • ⏰ ${best.bestHour}<br><span class="muted">${safeText(selectedFish[1])} • ${safeText(selectedWater[1])} • ${safeText(selectedWater[3])}</span><br><small class="muted">ეს არის პირობების საორიენტაციო ინდექსი და არა დაჭერის პროცენტი. ჰაერის ტემპერატურა წყლის გაზომვას არ ცვლის; სახეობის ტიპური დრო და ადგილის შესაბამისობა ცალკე გათვალისწინებულია.</small>`:'პროგნოზის ფანჯარაში ამ თარიღისთვის მონაცემი ვერ მოიძებნა.';
    renderProfileForecast();
    document.dispatchEvent(new CustomEvent('gn:fishingUpdated'));
  }catch(error){
    if(requestId!==plannerRequestToken)return;
    console.error(error);
    clearFishingWeather('პროგნოზი დროებით მიუწვდომელია.');
    const box=document.getElementById('dayCards');if(box)box.innerHTML='<div class="empty">პროგნოზის ჩატვირთვა ვერ მოხერხდა. შეამოწმე ინტერნეტი და სცადე თავიდან.</div><button type="button" class="btn ghost" id="retryFishingPlanner">↻ თავიდან ცდა</button>';document.getElementById('retryFishingPlanner')?.addEventListener('click',()=>runPlanner(true));const callout=document.getElementById('bestCallout');if(callout)callout.textContent='ამ ეტაპზე საათობრივი პროგნოზი მიუწვდომელია — სცადე განახლება.';
    renderProfileForecast();
  }
}

async function loadLiveFishing(lat,lon,city){
  const requestId=++liveFishingRequestToken,waterAtStart=selectedWater;
  if(!waterHasCoordinates(waterAtStart)){showMissingWaterCoordinates();return;}
  try{
    const data=await openMeteo(lat,lon);
    if(requestId!==liveFishingRequestToken||selectedWater!==waterAtStart)return;
    plannerWeather=data;
    renderFishingHourly(data);renderFishSearch();
  }catch(error){
    if(requestId!==liveFishingRequestToken||selectedWater!==waterAtStart)return;
    console.error(error);clearFishingWeather('ამინდის პროგნოზი დროებით ვერ ჩაიტვირთა.');
  }
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
    const loadingCallout=document.getElementById('bestCallout');if(loadingCallout)loadingCallout.innerHTML='<span class="loading-box">არჩეული ადგილის საათობრივი პროგნოზი იტვირთება…</span>';const loadingDays=document.getElementById('dayCards');if(loadingDays)loadingDays.innerHTML='<div class="loading-box">დღის პირობები ახლდება…</div>';
    if(!selectedWater){clearFishingWeather('სათევზაო ადგილი არჩეული არ არის.');showNoFishLocations();return;}
    if(!waterHasCoordinates(selectedWater)){showMissingWaterCoordinates();return;}
    clearFishingWeather('არჩეული ადგილის პროგნოზი იტვირთება…');
    const waterAtStart=selectedWater;
    try{const result=await openMeteo(waterAtStart[4],waterAtStart[5]);if(selectedWater!==waterAtStart)return;plannerWeather=result;renderFishingHourly(plannerWeather);if(selectedFish)await runPlanner();else await loadLiveFishing(waterAtStart[4],waterAtStart[5],waterAtStart[1]);}catch(e){console.error(e);if(selectedWater===waterAtStart){clearFishingWeather('პროგნოზი დროებით ვერ ჩაიტვირთა.');const callout=document.getElementById('bestCallout');if(callout)callout.innerHTML='<span class="empty">პროგნოზი დროებით ვერ ჩაიტვირთა.</span> <button type="button" class="btn ghost" id="retryWaterForecast">↻ თავიდან ცდა</button>';document.getElementById('retryWaterForecast')?.addEventListener('click',()=>{if(selectedFish)runPlanner(true);else loadLiveFishing(waterAtStart[4],waterAtStart[5],waterAtStart[1])});const days=document.getElementById('dayCards');if(days)days.innerHTML='';}}
  };
  window.GNPremium?.applyDayLimit(document.getElementById('daysCount'));
  document.getElementById('fishSearch').oninput=renderFishSearch;document.getElementById('fishType').onchange=renderFishSearch;
  document.getElementById('fishClear').onclick=()=>{document.getElementById('fishSearch').value='';document.getElementById('fishType').value='all';renderFishSearch();};
  dateInput.onchange=()=>{selectedFishCardScore=null;runPlanner();};document.getElementById('daysCount').onchange=()=>{selectedFishCardScore=null;window.GNPremium?.applyDayLimit(document.getElementById('daysCount'));runPlanner();};document.getElementById('planBtn').onclick=()=>{selectedFishCardScore=null;runPlanner();};document.getElementById('hourSelect')?.addEventListener('change',()=>{selectedFishCardScore=null;if(plannerWeather)renderFishingHourly(plannerWeather)});
  document.getElementById('bestTomorrow').onclick=()=>{selectedFishCardScore=null;const d=new Date((dateInput.value||window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'))+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);const next=d.toISOString().slice(0,10);if(next>dateInput.max)return;dateInput.value=next;document.getElementById('daysCount').value='1';runPlanner();};
  renderFishSearch();
  if(selectedWater)await loadLiveFishing(selectedWater[4],selectedWater[5],selectedWater[1]);
  if(window.GNLiveFactors) window.GNLiveFactors.bind({liveDefault:true,refresh:async()=>{
    if(!selectedWater)return;
    if(!waterHasCoordinates(selectedWater)){showMissingWaterCoordinates();return;}
    const waterAtStart=selectedWater;
    try{const latest=await openMeteo(waterAtStart[4],waterAtStart[5]);if(selectedWater!==waterAtStart)return;plannerWeather=latest;renderFishingHourly(plannerWeather);if(selectedFish)await runPlanner(true);else await loadLiveFishing(waterAtStart[4],waterAtStart[5],waterAtStart[1]);}
    catch(e){if(selectedWater===waterAtStart)clearFishingWeather('განახლება ვერ მოხერხდა.');console.error(e)}
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

window.GeoFishingPlanner={rowsForDate:hourlyRowsForDate,conditionFromRow:conditionFromFishingRow,scoredHours:scoredFishingHours,bestHour:bestScoredHourForDate,get selectedRow(){return selectedHourlyRow;}};
