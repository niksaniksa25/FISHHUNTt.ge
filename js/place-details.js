(function(){
const esc=v=>GeoImage.esc(v);
function findPlace(){const key=(new URLSearchParams(location.search).get('id')||'').trim().toLowerCase();return (window.WATERS||[]).find(w=>String(w[0]).toLowerCase()===key || String(w[1]).toLowerCase()===key)||null}
function fishNames(ids){return String(ids||'').split(',').map(id=>FISHES.find(f=>f[0]===id)?.[1]||id).filter(Boolean)}
async function resolveWater(w){if(window.GeoNatureCommon.validCoordinates(w[4],w[5]))return{lat:Number(w[4]),lon:Number(w[5])};throw new Error('Exact location coordinates unavailable');}
const common=()=>window.GeoNatureCommon;
let tripContext=null;
function currentTripContext(){
  if(!tripContext)return null;
  const value=JSON.parse(JSON.stringify(tripContext));
  if(value.status==='live'&&Date.now()-Date.parse(value.sourceTime)>90*60000){value.status='stale';value.index=null;}
  return value;
}
window.FishHuntPlaceContext=Object.freeze({current:currentTripContext});
function publishTripContext(w,data){
  const row=data?common().currentWeatherRow(data):null,stamp=data?common().weatherObservationTime(data):null;
  const valid=row&&['temperature','wind','precip','code'].every(key=>common().numberOrNull(row[key])!==null);
  const fresh=valid&&Number.isFinite(stamp)&&!data.__meta?.stale&&Date.now()-stamp<=90*60000&&stamp-Date.now()<=15*60000;
  const base=window.FishHuntTripTools?.placeSnapshot?.(w[0])||{};
  tripContext={...base,placeId:w[0],placeName:w[1],kind:w[2],region:w[3],lat:common().numberOrNull(w[4]),lon:common().numberOrNull(w[5]),description:w[7]||'',fishNames:fishNames(w[6]),fishName:fishNames(w[6]).slice(0,3).join(' • '),weather:row?{temperature:row.temperature,wind:row.wind,precip:row.precip,pressure:row.pressure,humidity:row.humidity}:null,index:fresh?displayedOutdoorScore(common().conditionsFromRow(row)):null,status:data?(fresh?'live':'stale'):'unavailable',sourceTime:Number.isFinite(stamp)?new Date(stamp).toISOString():null,at:new Date().toISOString(),timezone:data?.timezone||'Asia/Tbilisi',legalSummary:base.legalSummary||'სახეობის, ჭერის მეთოდისა და ტერიტორიის მოქმედი რეჟიმი გასვლამდე გადაამოწმე.'};
  if(typeof CustomEvent==='function')document.dispatchEvent?.(new CustomEvent('fishhunt:place-context',{detail:currentTripContext(),bubbles:true}));
}
const fmt=(value,unit='',digits=1)=>common().numberOrNull(value)===null?'—':Number(value).toFixed(digits)+unit;
function infoCard(i,label,value){return `<article class="info-card"><div class="info-icon">${i}</div><small>${esc(label)}</small><b>${esc(value??'—')}</b></article>`;}
function displayedOutdoorScore(condition){return common().outdoorScore(condition);}
function weatherHtml(data){
  const row=common().currentWeatherRow(data),condition=common().conditionsFromRow(row),meta=codeMeta(row?.code),score=displayedOutdoorScore(condition);
  const items=[['🌡️','ტემპერატურა',fmt(row?.temperature,'°C')],['💨','ქარი',fmt(row?.wind,' კმ/სთ')],['💧','ტენიანობა',fmt(row?.humidity,'%',0)],['🧭','წნევა',fmt(row?.pressure,' hPa')],['☔','ნალექი',fmt(row?.precip,' მმ')],['🌤️','მდგომარეობა',meta[1]]];
  const status=data.__meta?.stale?'ბოლო ხელმისაწვდომი მონაცემი':'მიმდინარე მოდელის მონაცემი';
  return `<div class="weather-status">${status} • ${esc(data.current.time.replace('T',' '))} • ${esc(data.timezone||'')}</div><div class="outdoor-score"><div><small>OUTDOOR SCORE</small><strong>${score??'—'}</strong><span>/100</span></div><div class="outdoor-score-note"><b>${meta[0]} ${esc(meta[1])}</b><span>პირობების საორიენტაციო ინდექსი</span></div></div><div class="environment-grid">${items.map(x=>`<div class="environment-item"><span>${x[0]} ${esc(x[1])}</span><b>${esc(x[2])}</b></div>`).join('')}</div>`;
}
function forecastHtml(data){return(data.daily?.time||[]).slice(0,window.GNPremium?.maxForecastDays?.()||1).map((date,i)=>{
  const d=data.daily,meta=codeMeta(d.weather_code?.[i]);const scores=common().hourlyRows(data,date).map(row=>displayedOutdoorScore(common().conditionsFromRow(row))).filter(Number.isFinite);const best=scores.length?Math.max(...scores):null;
  return `<article class="place-day"><b>${esc(fmtDate(date))}</b><span>${meta[0]}</span><strong>${fmt(d.temperature_2m_max?.[i],'°',0)} / ${fmt(d.temperature_2m_min?.[i],'°',0)}</strong><small>${esc(meta[1])}</small><small>☔ ${fmt(d.precipitation_probability_max?.[i],'%',0)}</small><small>💨 ${fmt(d.wind_speed_10m_max?.[i],' კმ/სთ',0)}</small><em>საუკეთესო საათის ინდექსი: ${best===null?'—':best+'/100'}</em></article>`;
}).join('');}
function hourlyHtml(data,date){return common().hourlyRows(data,date).map(row=>{const meta=codeMeta(row.code),score=displayedOutdoorScore(common().conditionsFromRow(row));return `<button type="button" class="hour-detail" data-iso="${esc(row.iso)}"><small>${esc(row.time)}</small><span>${meta[0]}</span><b>${fmt(row.temperature,'°')}</b><em>${fmt(row.wind,' კმ/სთ')}</em><strong>${score??'—'}</strong></button>`;}).join('');}
function showMissingPlace(){
  document.title='FishHunt • ლოკაცია ვერ მოიძებნა';
  document.getElementById('placeName').textContent='ლოკაცია ვერ მოიძებნა';
  document.getElementById('placeLead').innerHTML='ეს ბმული ცნობარში არსებულ ადგილს არ ემთხვევა. <a class="btn ghost" href="fishing-places.html">ადგილის მოძებნა →</a>';
  document.getElementById('environment').innerHTML='<div class="empty">აირჩიე ადგილი ცნობარიდან, რომ მისი რუკა და ამინდის პირობები ნახო.</div>';
  document.getElementById('weatherRefresh').disabled=true;
  for(const id of ['infoGrid','history','fishLinks','assessmentFactors','forecast','hourly','mapBtn'])document.getElementById(id)?.closest?.('section')?.setAttribute('hidden','');
  const image=document.getElementById('heroImg');image.src=GeoImage.placeholder('სათევზაო ადგილები','water');image.alt='სათევზაო ადგილები';
}
async function init(){const w=findPlace(),nameEl=document.getElementById('placeName');if(!w){showMissingPlace();return;}document.title=`FishHunt • ${w[1]}`;document.getElementById('placeTags').innerHTML=`<span class="catalog-tag">${esc(w[2])}</span><span class="catalog-tag">${esc(w[3])}</span><span class="catalog-tag live-place-tag">ამინდი მოწმდება</span>`;nameEl.textContent=w[1];document.getElementById('placeLead').textContent=w[7]||'საქართველოს წყალსატევის საინფორმაციო ლოკაცია.';
const queryParams=new URLSearchParams(location.search);
const mapScore=common().numberOrNull(queryParams.get('score')),incomingChance=common().numberOrNull(queryParams.get('chance'));
const rawDate=queryParams.get('date')||'',rawHour=queryParams.get('hour');
const parsedDate=Date.parse(rawDate+'T00:00:00Z');
const mapDate=/^\d{4}-\d{2}-\d{2}$/.test(rawDate)&&Number.isFinite(parsedDate)&&new Date(parsedDate).toISOString().slice(0,10)===rawDate?rawDate:'';
const hourValue=common().numberOrNull(rawHour),mapHour=hourValue!==null&&Number.isInteger(hourValue)&&hourValue>=0&&hourValue<=23?hourValue:null;
const showMapScore=mapScore!==null&&mapScore>=0&&mapScore<=100,showIncomingChance=incomingChance!==null&&incomingChance>=0&&incomingChance<=100;

const fish=fishNames(w[6]);
// These actions use the directory coordinates and remain usable when weather is unavailable.
const mapButton=document.getElementById('mapBtn'),planButton=document.getElementById('planBtn');
if(mapButton){
  if(common().validCoordinates(w[4],w[5]))mapButton.href=`map.html?lat=${Number(w[4])}&lon=${Number(w[5])}&name=${encodeURIComponent(w[1])}`;
  else{mapButton.href='map.html';mapButton.textContent='🗺️ რუკის გახსნა';mapButton.title='ამ ლოკაციის ზუსტი კოორდინატები ჯერ მიუწვდომელია.';}
}
if(planButton)planButton.href=`fishing.html?place=${encodeURIComponent(w[0])}`;
const fishIds=String(w[6]||'').split(',').map(x=>x.trim()).filter(Boolean);document.getElementById('quickStats').innerHTML=[['🌊','ტიპი',w[2]],['📍','რეგიონი',w[3]],['🐟','თევზის სახეობები',fish.length],['⭐','პროფილი','დეტალური']].map(s=>`<div class="quick-stat"><small>${s[0]} ${esc(s[1])}</small><b>${esc(s[2])}</b></div>`).join('');
document.getElementById('infoGrid').innerHTML=[['🌊','წყლის ტიპი',w[2]],['📍','რეგიონი',w[3]],['🐟','ძირითადი თევზები',fish.length?fish.join(' • '):'მონაცემი არ არის'],['🧭','კოორდინატები','ამინდის მონაცემებთან ერთად'],['🎣','დაგეგმვა','შესაძლებელია Fishing Planner-ით'],['🌤️','Outdoor','Live შეფასება რეალური ამინდის მიხედვით']].map(x=>infoCard(x[0],x[1],x[2])).join('');
if(showMapScore||showIncomingChance){const snap=document.createElement('section');snap.className='container section place-origin-score-section';snap.innerHTML=`<div class="place-origin-score"><small>წინა გვერდზე ნაჩვენები საორიენტაციო ინდექსი</small><strong>${Math.round(showMapScore?mapScore:incomingChance)}/100</strong><span>${esc(mapDate)}${mapHour===null?'':` • ${String(mapHour).padStart(2,'0')}:00`}</span><em>ეს ბმულიდან მიღებული შეფასებაა. ქვემოთ ამინდი ამ ლოკაციისთვის თავიდან მოწმდება.</em></div>`;const target=document.getElementById('environment')?.closest('section');if(target)target.parentNode.insertBefore(snap,target);}

document.getElementById('history').textContent=`${w[1]} არის ${w[3]}-ის ${w[2].toLowerCase()} ტიპის საინფორმაციო ლოკაცია. ადგილის პირობები შეიძლება სეზონის, წყლის დონის, დინების, ქარისა და ნალექის მიხედვით სწრაფად შეიცვალოს. ამიტომ საუკეთესო შედეგისთვის Live ამინდი და უსაფრთხოების პირობები შეადარე გასვლამდე.`;
document.getElementById('facts').innerHTML=[`ლოკაციის ტიპი: ${w[2]}.`,`რეგიონი: ${w[3]}.`,`საინფორმაციო აღწერა: ${w[7]||'მოცემული წყლის მონაკვეთი.'}`,`დაკავშირებული თევზები: ${fish.length?fish.join(', '):'სია არ არის'}.`,`Outdoor Score ეფუძნება მიმდინარე გარემო პირობებს.`].map(x=>`<li>${esc(x)}</li>`).join('');
document.getElementById('fishLinks').innerHTML=fish.length?fishIds.map(id=>{const f=(window.FISHES||[]).find(v=>v[0]===id);const n=f?.[1]||id;const key=f?.[2]||f?.[1]||id;return `<a class="fish-link" href="species.html?id=${encodeURIComponent(key)}">🐟 ${esc(n)} <span>→</span></a>`}).join(''):'<p class="muted">ამ ლოკაციისთვის თევზის სია მითითებული არ არის.</p>';

const ph=GeoImage.placeholder(`${w[1]} • ${w[3]}`,w[2]==='მდინარე'||w[2]==='ზღვა'?'water':'nature');document.getElementById('heroImg').src=ph;document.getElementById('heroImg').alt=w[1];GeoImage.resolvePlaceImage(w[1],w[3],w[2]).then(src=>{document.getElementById('heroImg').src=src}).catch(()=>{});
let selectedISO='',requestId=0;
async function loadWeather(options={}){
  const token=++requestId,box=document.getElementById('environment');box.innerHTML='<div class="loading-box">ამინდი იტვირთება…</div>';
  publishTripContext(w,null);
  try{
    const geo=await resolveWater(w),data=await openMeteo(geo.lat,geo.lon,options);if(token!==requestId)return;
    publishTripContext(w,data);
    box.innerHTML=weatherHtml(data);document.getElementById('forecast').innerHTML=forecastHtml(data);
    const date=mapDate||data.current.time.slice(0,10),hourly=document.getElementById('hourly');hourly.innerHTML=hourlyHtml(data,date)||'<p class="muted">ამ თარიღისთვის საათობრივი პროგნოზი მიუწვდომელია.</p>';
    if(!selectedISO&&mapDate&&mapHour!==null)selectedISO=`${mapDate}T${String(mapHour).padStart(2,'0')}:00`;
    function renderFactors(){const row=selectedISO?common().weatherRowAt(data,selectedISO):common().currentWeatherRow(data);if(window.GNLiveFactors)GNLiveFactors.render({data,row,type:'weather',subject:null,locationName:w[1],error:!row});}
    renderFactors();
    hourly.querySelectorAll('.hour-detail').forEach(button=>button.onclick=()=>{selectedISO=button.dataset.iso;hourly.querySelectorAll('.hour-detail').forEach(item=>item.classList.toggle('active',item===button));renderFactors();});
    const tag=document.querySelector('.live-place-tag');if(tag)tag.textContent=data.__meta?.stale?'ბოლო მონაცემი':'ამინდი';
  }catch(error){
    if(token!==requestId)return;
    publishTripContext(w,null);
    box.innerHTML=`<div class="loading-box">${common().validCoordinates(w[4],w[5])?'ამინდის მონაცემები დროებით ვერ ჩაიტვირთა. სცადე განახლება.':'ზუსტი კოორდინატები მიუწვდომელია — ამ ადგილის ამინდის შეფასება ვერ გამოითვლება.'}</div>`;
    document.getElementById('forecast').replaceChildren();document.getElementById('hourly').replaceChildren();
    if(window.GNLiveFactors)GNLiveFactors.render({row:null,data:null,locationName:w[1],live:false,error:true});
    const tag=document.querySelector('.live-place-tag');if(tag)tag.textContent='საინფორმაციო ლოკაცია';
  }
}
document.getElementById('weatherRefresh').onclick=()=>loadWeather({force:true});loadWeather();if(window.GNLiveFactors)GNLiveFactors.bind({liveDefault:true,refresh:loadWeather});}

document.addEventListener('DOMContentLoaded',init);
})();
