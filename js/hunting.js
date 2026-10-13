let selectedHunt=null;
let selectedHuntChance=null;
let huntWeather=null;
let selectedHuntRuleArea='unknown';
let huntPlannerSeq=0,huntLiveSeq=0,huntSelectedRow=null;
let huntCardImageObserver=null;
const huntCardImageSubjects=new WeakMap();

function prepareHuntCardImages(){
  huntCardImageObserver?.disconnect();huntCardImageObserver=null;
  if(typeof window.IntersectionObserver!=='function')return;
  huntCardImageObserver=new window.IntersectionObserver(entries=>{
    for(const entry of entries){if(!entry.isIntersecting)continue;huntCardImageObserver.unobserve(entry.target);const x=huntCardImageSubjects.get(entry.target);if(x)loadHuntCardImage(entry.target,x);}
  },{rootMargin:'400px'});
}
function loadHuntCardImage(card,x){
  const img=card.querySelector('img');if(!card.isConnected||!img||card.dataset.imageRequested)return;
  card.dataset.imageRequested='true';
  huntImage(x,src=>{if(card.isConnected&&img.isConnected)img.src=src;});
}

function updateHuntRules(){
  const profile=document.getElementById('huntProfile'),rules=window.GeoWildlifeRules;
  if(!profile||!selectedHunt||!rules)return;
  let host=document.getElementById('huntLegalRules');
  if(!host){
    host=document.createElement('div');host.id='huntLegalRules';host.className='planner-rules';
    host.innerHTML='<div class="season-rules-date"><label for="huntRuleArea">მუნიციპალიტეტის ჯგუფი<select id="huntRuleArea"><option value="unknown">ჯერ არ არის დაზუსტებული</option><option value="standard">სხვა მუნიციპალიტეტები</option><option value="highland">ახალქალაქი / ნინოწმინდა / წალკა / დმანისი</option></select></label><small>ამინდის ქალაქი ნადირობის ზუსტი ადგილი არ არის. ქალაქის ადმინისტრაციულ საზღვრებში ნადირობა აკრძალულია.</small></div><div id="huntLegalStatus" aria-live="polite"></div>';
    profile.appendChild(host);
    document.getElementById('huntRuleArea').value=selectedHuntRuleArea;
    document.getElementById('huntRuleArea').onchange=e=>{selectedHuntRuleArea=e.target.value;updateHuntRules();};
  }
  rules.mount(document.getElementById('huntLegalStatus'),selectedHunt,{date:document.getElementById('huntStartDate')?.value||rules.today(),area:selectedHuntRuleArea,location:document.getElementById('huntRegion')?.value||''});
}

const HUNT_REGIONS=[
  ['თბილისი',41.7151,44.8271],['თელავი',41.9198,45.4732],['ბორჯომი',41.8410,43.3790],['ახალციხე',41.6390,42.9826],['ქუთაისი',42.2679,42.6946],['ამბროლაური',42.5211,43.1459],['მესტია',43.0458,42.7294],['ბათუმი',41.6168,41.6367],['ფოთი',42.1462,41.6719],['რუსთავი',41.5495,44.9932]
];
function hs(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function huntImage(x,cb){GeoImage.resolveSpeciesImage(x[1],x[3],x[2]).then(src=>cb(src)).catch(()=>cb(GeoImage.placeholder(x[1],x[0]==='bird'?'bird':'animal')))}
function outdoorScore(c){return (window.GeoNatureCommon&&typeof window.GeoNatureCommon.outdoorScore==='function')?window.GeoNatureCommon.outdoorScore(c):scoreWeather(c);}
function huntActivityScore(x,hour){
  const value=window.GeoNatureCommon?.numberOrNull?window.GeoNatureCommon.numberOrNull(hour):(hour===null||hour===undefined?null:Number(hour));
  if(!Number.isFinite(value))return null;
  const h=((value%24)+24)%24,txt=String(x?.[8]||'').toLowerCase(),windows=[];
  if(txt.includes('განთიადი')||txt.includes('გამთენიისას'))windows.push([4,8]);
  if(txt.includes('დილა'))windows.push([6,10]);if(txt.includes('დღე'))windows.push([10,16]);
  if(txt.includes('საღამო'))windows.push([17,21]);if(txt.includes('ბინდი'))windows.push([18,22]);
  if(txt.includes('ღამე'))windows.push([21,24],[0,4]);if(txt.includes('მთელი'))return 86;
  if(!windows.length)return 72;
  if(windows.some(([a,b])=>h>=a&&h<=b))return 100;
  const distance=Math.min(...windows.flatMap(([a,b])=>[a,b].map(edge=>Math.min(Math.abs(h-edge),24-Math.abs(h-edge)))));
  return distance<=2?78:distance<=4?52:26;
}
function huntLocationCompatibility(x,region){const spread=String(x?.[6]||'').toLowerCase(),name=String(region?.[0]||'');if(spread.includes('აღმოსავლეთი'))return ['თბილისი','თელავი','რუსთავი'].includes(name)?100:42;if(spread.includes('დასავლეთი'))return ['ქუთაისი','ბათუმი','ფოთი','ამბროლაური','მესტია'].includes(name)?100:42;if(spread.includes('მთიანი')||spread.includes('კავკასიონი'))return ['ბორჯომი','ახალციხე','ამბროლაური','მესტია'].includes(name)?100:38;return 72;}
function huntCondition(row){
  return window.GeoNatureCommon?.conditionsFromRow?window.GeoNatureCommon.conditionsFromRow(row):{temperature_2m:row.temperature,apparent_temperature:row.apparent,pressure_msl:row.pressure,wind_speed_10m:row.wind,precipitation:row.precip,precipitation_probability:row.rainProb,weather_code:row.code,relative_humidity_2m:row.humidity,cloud_cover:row.cloud,wind_gusts_10m:row.gust,visibility:row.visibility,local_hour:Number(row.time.slice(0,2))};
}
function huntScoreForHour(x,c,region,hour){
  const weather=outdoorScore(c),activity=huntActivityScore(x,hour);
  if(!Number.isFinite(weather)||!Number.isFinite(activity))return null;
  const raw=Math.max(0,Math.min(100,Math.round(weather*.60+activity*.22+huntLocationCompatibility(x,region)*.18)));
  let score=Math.max(0,Math.min(88,Math.round(8+raw*.80)));
  // Storms and strong wind must not look promising merely because a species is active.
  if([95,96,99].includes(Number(c.weather_code))||Number(c.wind_speed_10m)>=40||Number(c.wind_gusts_10m)>=60)score=Math.min(score,20);
  return score;
}
function huntRowsForDate(data,iso){
  if(window.GeoNatureCommon?.hourlyRows)return window.GeoNatureCommon.hourlyRows(data,iso);
  return (data?.hourly?.time||[]).filter(time=>time.slice(0,10)===iso).map(time=>window.GNLiveFactors?.rowAt(data,time)).filter(Boolean);
}
function huntScoredRows(data,iso,region,upcoming=false){
  const clock=window.GeoNatureCommon?.zonedDateTime?.(data)||{date:window.GeoWildlifeRules?.today(),hour:0};
  return huntRowsForDate(data,iso).map(row=>({r:row,score:huntScoreForHour(selectedHunt,huntCondition(row),region,Number(row.time.slice(0,2)))})).filter(item=>Number.isFinite(item.score)&&(!upcoming||iso!==clock.date||Number(item.r.time.slice(0,2))>=clock.hour));
}
function huntNumber(value,decimals=0,suffix=''){
  return Number.isFinite(value)?value.toFixed(decimals)+suffix:'—';
}
function renderHuntHourly(data,iso){
  const rows=huntRowsForDate(data,iso),wrap=document.getElementById('huntHourlyStrip');if(!wrap)return;
  const region=HUNT_REGIONS.find(r=>r[0]===document.getElementById('huntRegion')?.value)||HUNT_REGIONS[0],hourSelect=document.getElementById('huntHour');
  const keep=hourSelect?.value||'';
  if(hourSelect){hourSelect.innerHTML='<option value="">ავტომატურად — საუკეთესო საათი</option>'+rows.map(r=>`<option value="${r.time}">${r.time}</option>`).join('');if(rows.some(r=>r.time===keep))hourSelect.value=keep;}
  const best=huntScoredRows(data,iso,region,true).reduce((a,b)=>!a||b.score>a.score?b:a,null);
  const selected=(keep&&rows.find(row=>row.time===keep))||best?.r||rows[0];
  wrap.innerHTML=rows.map(row=>{
    const score=huntScoreForHour(selectedHunt,huntCondition(row),region,Number(row.time.slice(0,2))),meta=Number.isFinite(row.code)?codeMeta(row.code):['—','მონაცემი მიუწვდომელია'];
    return `<button type="button" class="hour-card${selected?.iso===row.iso?' active':''}" data-iso="${row.iso}"><small>${row.time}</small><span>${meta[0]}</span><strong>${huntNumber(row.temperature,0,'°')}</strong><em>${huntNumber(row.pressure)}</em><b>${huntNumber(row.wind,0,' კმ/სთ')}</b><span class="hour-score">${huntNumber(score)}</span></button>`;
  }).join('')||'<div class="empty">ამ დღის საათობრივი მონაცემი მიუწვდომელია.</div>';
  const apply=(row,manual=false)=>{
    huntSelectedRow=row;
    const score=huntScoreForHour(selectedHunt,huntCondition(row),region,Number(row.time.slice(0,2))),meta=Number.isFinite(row.code)?codeMeta(row.code):['—','მონაცემი მიუწვდომელია'];
    window.GNLiveFactors?.render({data,row,subject:selectedHunt,type:'hunting',locationName:region[0]});
    if(hourSelect&&manual)hourSelect.value=row.time;
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    set('huntSelectedHourLabel',`არჩეული საათი: ${row.time}`);set('huntHourlyLocation',region[0]);set('huntHourlyDate',fmtDate(iso));
    const box=document.getElementById('huntHourlySelected');
    if(box)box.innerHTML=`<div class="selected-hour-grid"><div><span>${meta[0]}</span><b>${row.time}</b><small>${meta[1]}</small></div><div><small>ტემპერატურა</small><b>${huntNumber(row.temperature,1,'°C')}</b></div><div><small>წნევა</small><b>${huntNumber(row.pressure,1,' hPa')}</b></div><div><small>ქარი</small><b>${huntNumber(row.wind,1,' კმ/სთ')}</b></div><div><small>ნალექი</small><b>${huntNumber(row.precip,1,' მმ')}</b></div><div><small>წვიმის ალბათობა</small><b>${huntNumber(row.rainProb,0,'%')}</b></div><div><small>აქტივობის ინდექსი</small><b class="selected-score">${huntNumber(score)}/100</b></div></div>${data.__meta?.stale?'<p class="muted">ბოლო ხელმისაწვდომი პროგნოზი • განახლება დროებით ვერ მოხერხდა.</p>':''}`;
    wrap.querySelectorAll('.hour-card').forEach(el=>el.classList.toggle('active',el.dataset.iso===row.iso));
  };
  wrap.querySelectorAll('.hour-card').forEach(button=>button.onclick=()=>{const row=rows.find(x=>x.iso===button.dataset.iso);if(row)apply(row,true);});
  if(selected)apply(selected);else{huntSelectedRow=null;const box=document.getElementById('huntHourlySelected');if(box)box.innerHTML='<div class="empty">ამ დღის საათობრივი მონაცემი მიუწვდომელია.</div>';}
  if(hourSelect)hourSelect.onchange=()=>{const row=rows.find(x=>x.time===hourSelect.value)||best?.r;if(row)apply(row);};
  window.GNHourlyAccess?.refresh?.();
  document.dispatchEvent(new CustomEvent('gn:huntingUpdated'));
}
function huntScoreForDay(data,i){
  const values=huntRowsForDate(data,data.daily.time[i]).map(row=>outdoorScore(huntCondition(row))).filter(Number.isFinite);
  return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;
}
function renderHuntCards(list){
  const box=document.getElementById('huntResults');prepareHuntCardImages();box.innerHTML='';
  list.forEach(x=>{const card=document.createElement('article');card.className='fish-card';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',x[1]+' — პროფილისა და პირობების ნახვა');const chance=window.GeoWildlifeChance?window.GeoWildlifeChance(x):null;const chanceHtml=window.GeoChanceUI?.markup?window.GeoChanceUI.markup(chance,'აქტივობის ინდექსი'):`<span class="fish-chance">${Number.isFinite(chance)?chance+'/100':'—'}</span>`;card.innerHTML=`<div class="hunt-card-top"><img class="fish-img" loading="lazy" alt="${hs(x[1])}"><div class="hunt-card-chance">${chanceHtml}</div></div><div class="fish-card-body"><div class="fish-card-title-row"><div><span class="tag">${hs(x[4])}</span><h3>${hs(x[1])}</h3></div></div><p>${hs(x[2])} • ${hs(x[5])}</p><div class="fish-card-meta"><span>📍 ${hs(x[6])}</span><span>🕒 ${hs(x[8])}</span></div></div>`;card.dataset.chance=String(chance);card.onclick=()=>selectHunt(x,chance);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectHunt(x,chance);const profile=document.getElementById('huntProfile');profile.tabIndex=-1;profile.focus({preventScroll:true});}};box.appendChild(card);huntCardImageSubjects.set(card,x);if(huntCardImageObserver)huntCardImageObserver.observe(card);else loadHuntCardImage(card,x);});
  if(!list.length)box.innerHTML='<div class="empty">ამ ძებნით ცხოველი ან ფრინველი ვერ მოიძებნა.</div>';
}
function renderHuntSearch(){
  const q=document.getElementById('huntSearchInput').value.trim().toLowerCase();const type=document.getElementById('huntType').value;
  const all=(window.HUNTING_WILDLIFE||[]).filter(x=>x[0]!=='reptile');
  const list=all.filter(x=>(type==='all'||x[0]===type)&&(!q||x.join(' ').toLowerCase().includes(q)));
  document.getElementById('huntCount').textContent=`${list.length} სახეობა`;
  const s=document.getElementById('huntSuggestions');s.innerHTML=q?list.slice(0,10).map((x,i)=>`<button type="button" data-i="${i}">${hs(x[1])}</button>`).join(''):'';s.querySelectorAll('button').forEach(b=>b.onclick=()=>selectHunt(list[Number(b.dataset.i)]));
  renderHuntCards(list);
}
function syncHuntRegions(preferCompatible=true){const el=document.getElementById('huntRegion');if(!el)return;let first=-1;[...el.options].forEach((o,i)=>{const region=HUNT_REGIONS[i],ok=!selectedHunt||huntLocationCompatibility(selectedHunt,region)>=72;o.disabled=!ok;o.textContent=ok?region[0]:region[0]+' — არ მუშაობს ამ სახეობაზე';if(ok&&first<0)first=i});if(preferCompatible&&selectedHunt){const cur=el.selectedIndex;if(!HUNT_REGIONS[cur]||huntLocationCompatibility(selectedHunt,HUNT_REGIONS[cur])<72){if(first>=0)el.value=HUNT_REGIONS[first][0]}}}
function selectHunt(x,chance){
  selectedHunt=x;selectedHuntChance=Number.isFinite(chance)?chance:(window.GeoWildlifeChance?window.GeoWildlifeChance(x):null);syncHuntRegions(true);document.getElementById('huntSelectedLabel').textContent=`${x[1]} • ${x[2]}`;renderHuntProfile();runHuntPlanner().catch(console.warn);document.getElementById('huntProfile').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderHuntProfile(){
  const p=document.getElementById('huntProfile');if(!selectedHunt)return;
  const chance=Number.isFinite(selectedHuntChance)?selectedHuntChance:(window.GeoWildlifeChance?window.GeoWildlifeChance(selectedHunt):null);const chanceHtml=window.GeoChanceUI?.markup?window.GeoChanceUI.markup(chance,'აქტივობის ინდექსი'):'';const forestNames=(window.FOREST_HABITATS?.[selectedHunt[1]]||[]);p.innerHTML=`<div class="fish-profile-grid"><div><img id="huntProfileImg" class="fish-profile-img" alt="${hs(selectedHunt[1])}"><div><span class="tag">${hs(selectedHunt[4])}</span><span class="tag">${hs(selectedHunt[7])}</span></div></div><div><div class="hunt-profile-topline"><span class="eyebrow">SELECTED WILDLIFE</span>${chanceHtml}</div><h2>${hs(selectedHunt[1])}</h2><p class="muted">${hs(selectedHunt[2])} • ${hs(selectedHunt[3])}</p><div class="hunt-fact-grid"><div class="hunt-fact"><small>ჰაბიტატი</small><b>${hs(selectedHunt[5])}</b></div><div class="hunt-fact"><small>გავრცელება</small><b>${hs(selectedHunt[6])}</b></div><div class="hunt-fact"><small>სეზონი</small><b>${hs(selectedHunt[7])}</b></div></div><p><b>აქტიურობის დრო:</b> ${hs(selectedHunt[8])}</p><div class="hunt-profile-actions"><a class="btn ghost" href="species.html?id=${encodeURIComponent(selectedHunt[1])}&chance=${encodeURIComponent(chance)}">სრული პროფილი →</a><a class="btn primary" href="#huntPlanner">Outdoor Planner</a></div></div></div>`;const forestBox=document.getElementById('huntForestLinks');if(forestBox)forestBox.innerHTML=forestNames.length?forestNames.map(n=>`<button class="forest-wild" type="button" data-forest-name="${hs(n)}"><strong>🌲 ${hs(n)}</strong><small>ტყის ჰაბიტატი → ნახვა</small></button>`).join(''):'<div class="empty">ამ სახეობისთვის კონკრეტული ტყის რუკა ჯერ არ არის დამატებული.</div>';forestBox?.querySelectorAll('[data-forest-name]').forEach(b=>b.onclick=()=>location.href=`forests.html?name=${encodeURIComponent(b.dataset.forestName)}`);
  const imageSubject=selectedHunt;huntImage(imageSubject,src=>{const img=document.getElementById('huntProfileImg');if(img&&selectedHunt===imageSubject)img.src=src});
  updateHuntRules();
}
async function loadHuntLive(options={}){
  const seq=++huntLiveSeq,region=HUNT_REGIONS.find(r=>r[0]===document.getElementById('huntRegion')?.value)||HUNT_REGIONS[0];
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  set('huntLiveCity',region[0]);set('huntLiveDesc','ამინდი იტვირთება…');
  try{
    const data=await openMeteo(region[1],region[2],{force:options.force===true});
    if(seq!==huntLiveSeq||document.getElementById('huntRegion')?.value!==region[0])return;
    const row=window.GeoNatureCommon?.currentWeatherRow?.(data)||window.GNLiveFactors?.rowAt(data,data.current?.time);
    if(!row)throw new Error('Current weather missing');
    const score=outdoorScore(huntCondition(row)),meta=Number.isFinite(row.code)?codeMeta(row.code):['—','მონაცემი მიუწვდომელია'];
    set('huntLiveTime',`${data.__meta?.stale?'ბოლო მონაცემი':'მიმდინარე'} • ${row.time}`);set('huntLiveIcon',meta[0]);set('huntLiveTemp',huntNumber(row.temperature,1,'°'));
    set('huntLiveDesc',`${meta[1]} • ${huntNumber(score)}/100`);set('huntLiveScore',huntNumber(score));set('huntLivePressure',huntNumber(row.pressure,1,' hPa'));set('huntLiveWind',huntNumber(row.wind,1,' კმ/სთ'));set('huntLiveHumidity',huntNumber(row.humidity,0,'%'));set('huntLiveRain',huntNumber(row.precip,1,' მმ'));
    setPressureGauge(row.pressure,'huntPressureNeedle','huntPressureValue','huntPressureStatus','huntPressureAdvice');
    if(!selectedHunt)window.GNLiveFactors?.render({data,row,subject:null,type:'weather',locationName:region[0],selectedCurrent:true});
  }catch(error){
    if(seq!==huntLiveSeq)return;
    for(const id of ['huntLiveTemp','huntLiveScore','huntLivePressure','huntLiveWind','huntLiveHumidity','huntLiveRain'])set(id,'—');
    set('huntLiveDesc','ამინდის განახლება ვერ მოხერხდა.');set('huntLiveTime','მონაცემი მიუწვდომელია');
    setPressureGauge(null,'huntPressureNeedle','huntPressureValue','huntPressureStatus','huntPressureAdvice');
    if(!selectedHunt)window.GNLiveFactors?.render({data:null,row:null,type:'weather',locationName:region[0],error:true});
    throw error;
  }
}
function renderHuntDays(data,start,days){
  const box=document.getElementById('huntDayCards'),out=[],region=HUNT_REGIONS.find(r=>r[0]===document.getElementById('huntRegion')?.value)||HUNT_REGIONS[0];
  for(let i=0;i<days;i++){
    const dt=new Date(start+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+i);const iso=dt.toISOString().slice(0,10),idx=data.daily?.time?.indexOf(iso)??-1;if(idx<0)continue;
    const bestHour=huntScoredRows(data,iso,region,true).reduce((a,b)=>!a||b.score>a.score?b:a,null);if(!bestHour)continue;
    out.push({iso,score:bestHour.score,bestHour:bestHour.r.time,max:data.daily.temperature_2m_max?.[idx],min:data.daily.temperature_2m_min?.[idx],rain:data.daily.precipitation_probability_max?.[idx],wind:data.daily.wind_speed_10m_max?.[idx],code:bestHour.r.code});
  }
  const best=out.reduce((a,b)=>!a||b.score>a.score?b:a,null);
  box.innerHTML=out.map(item=>{const meta=codeMeta(item.code);return `<button type="button" class="day-card ${best?.iso===item.iso?'best':''}" data-date="${item.iso}" data-best-hour="${item.bestHour}"><h4>${fmtDate(item.iso)}</h4><div class="score">${item.score}</div><small>${meta[0]} ${meta[1]}</small><small>⏰ საუკეთესო საათი: ${item.bestHour}</small><small>🌡️ ${huntNumber(item.max,0,'°')} / ${huntNumber(item.min,0,'°')}</small><small>💧 ${huntNumber(item.rain,0,'%')}</small><small>💨 ${huntNumber(item.wind,0,' კმ/სთ')}</small></button>`;}).join('')||'<div class="empty">არჩეული პერიოდის სრული პროგნოზი მიუწვდომელია.</div>';
  box.querySelectorAll('.day-card').forEach(button=>button.onclick=()=>{document.getElementById('huntStartDate').value=button.dataset.date;const hour=document.getElementById('huntHour');if(hour)hour.value=button.dataset.bestHour;runHuntPlanner().catch(console.warn);});
  document.getElementById('huntBestCallout').innerHTML=best?`<b>საუკეთესო დღე/საათი:</b> <strong>${fmtDate(best.iso)}</strong> — <strong>${best.score}/100</strong> • ⏰ ${best.bestHour}<br><span class="muted">${hs(selectedHunt[1])} • ${hs(region[0])}${data.__meta?.stale?' • ბოლო ხელმისაწვდომი პროგნოზი':''}</span>`:'პროგნოზის ფანჯარაში სრული მონაცემი ვერ მოიძებნა.';
}
async function runHuntPlanner(options={}){
  window.GNPremium?.applyDayLimit(document.getElementById('huntDays'));updateHuntRules();
  if(!selectedHunt){document.getElementById('huntBestCallout').textContent='ჯერ აირჩიე ცხოველი ან ფრინველი ზემოთ მოცემული ძებნიდან.';return;}
  const seq=++huntPlannerSeq,subject=selectedHunt,region=HUNT_REGIONS.find(r=>r[0]===document.getElementById('huntRegion').value)||HUNT_REGIONS[0];
  const dateInput=document.getElementById('huntStartDate');
  if(!dateInput.value)dateInput.value=window.GeoNatureCommon?.localDateISO?.();
  const start=dateInput.value;
  const days=Math.min(Number(document.getElementById('huntDays').value||1),window.GNPremium?.maxForecastDays?.()||1);
  huntWeather=null;huntSelectedRow=null;
  const button=document.getElementById('huntPlanBtn'),dayCards=document.getElementById('huntDayCards');
  if(button){button.disabled=true;button.setAttribute?.('aria-busy','true');}
  dayCards.setAttribute?.('aria-busy','true');dayCards.innerHTML='<div class="loading-box" role="status">არჩეული სახეობისა და რეგიონის პროგნოზი იტვირთება…</div>';
  document.getElementById('huntHourlyStrip').innerHTML='';document.getElementById('huntHourlySelected').innerHTML='<div class="loading-box">საათობრივი პირობები ახლდება…</div>';document.getElementById('huntBestCallout').textContent='პირობების შეფასება ახლდება…';
  window.GNLiveFactors?.render({data:null,row:null,subject,type:'hunting',locationName:region[0]});
  try{
    const data=await openMeteo(region[1],region[2],{force:options.force===true});
    if(seq!==huntPlannerSeq||subject!==selectedHunt||document.getElementById('huntRegion').value!==region[0]||document.getElementById('huntStartDate').value!==start)return;
    huntWeather=data;renderHuntDays(data,start,days);renderHuntHourly(data,start);
  }catch(error){
    if(seq!==huntPlannerSeq)return;
    huntWeather=null;huntSelectedRow=null;document.getElementById('huntDayCards').innerHTML='<div class="empty">პროგნოზის ჩატვირთვა ვერ მოხერხდა. შეამოწმე ინტერნეტი.</div><button type="button" class="btn ghost" id="retryHuntPlanner">↻ თავიდან ცდა</button>';
    document.getElementById('retryHuntPlanner')?.addEventListener('click',()=>runHuntPlanner({force:true}).catch(console.warn));
    document.getElementById('huntHourlyStrip').innerHTML='';document.getElementById('huntHourlySelected').innerHTML='<div class="empty">საათობრივი მონაცემი მიუწვდომელია.</div>';document.getElementById('huntBestCallout').textContent='შეფასება მიუწვდომელია.';
    document.dispatchEvent(new CustomEvent('gn:huntingUpdated'));window.GNHourlyAccess?.refresh?.();
    window.GNLiveFactors?.render({data:null,row:null,subject,type:'hunting',locationName:region[0],error:true});
    throw error;
  }finally{
    if(seq===huntPlannerSeq){if(button){button.disabled=false;button.setAttribute?.('aria-busy','false');}dayCards.setAttribute?.('aria-busy','false');}
  }
}
async function initHuntingPage(){
  const region=document.getElementById('huntRegion');region.innerHTML=HUNT_REGIONS.map(x=>`<option>${hs(x[0])}</option>`).join('');const requestedRegion=new URLSearchParams(location.search).get('region')||'';region.value=HUNT_REGIONS.some(r=>r[0]===requestedRegion)?requestedRegion:'თბილისი';syncHuntRegions(false);
  const d=document.getElementById('huntStartDate'),today=new Date();const todayIso=window.GeoWildlifeRules?.today(today)||window.GeoNatureCommon?.localDateISO?.(today)||today.toLocaleDateString('sv-SE');d.value=todayIso;d.min=d.value;const maxD=new Date(today.getTime()+15*86400000);d.max=window.GeoWildlifeRules?.today(maxD)||window.GeoNatureCommon?.localDateISO?.(maxD)||maxD.toLocaleDateString('sv-SE');
  document.getElementById('huntSearchInput').oninput=renderHuntSearch;document.getElementById('huntType').onchange=renderHuntSearch;document.getElementById('huntClear').onclick=()=>{document.getElementById('huntSearchInput').value='';document.getElementById('huntType').value='all';renderHuntSearch();document.getElementById('huntSearchInput').focus({preventScroll:true});};document.getElementById('huntPlanBtn').onclick=()=>runHuntPlanner().catch(console.warn);region.onchange=()=>{loadHuntLive().catch(console.warn);runHuntPlanner().catch(console.warn)};d.onchange=()=>runHuntPlanner().catch(console.warn);document.getElementById('huntDays').onchange=()=>runHuntPlanner().catch(console.warn);document.getElementById('huntTomorrow').onclick=()=>{const x=new Date((d.value||window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'))+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+1);const next=x.toISOString().slice(0,10);if(next>d.max)return;d.value=next;document.getElementById('huntDays').value='1';runHuntPlanner().catch(console.warn)};
  renderHuntSearch();await loadHuntLive().catch(console.warn);
  if(window.GNLiveFactors)window.GNLiveFactors.bind({liveDefault:true,refresh:async(options)=>{const jobs=[loadHuntLive(options)];if(selectedHunt)jobs.push(runHuntPlanner(options));const results=await Promise.allSettled(jobs);const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;}});
}
window.__defineGetter__('selectedHunt',()=>selectedHunt);
window.huntRowsForDate=huntRowsForDate;
window.huntScoreForHour=huntScoreForHour;
window.HUNT_REGIONS=HUNT_REGIONS;
window.__defineGetter__('huntWeather',()=>huntWeather);
window.GeoHuntingPlanner={conditionFromRow:huntCondition,scoreForRow:(row,region)=>huntScoreForHour(selectedHunt,huntCondition(row),region,Number(row.time.slice(0,2))),get selectedRow(){return huntSelectedRow;}};
