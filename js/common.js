function localDateISO(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function setupMenu(){const b=document.getElementById('menuBtn'),n=document.getElementById('nav');if(b&&n)b.onclick=()=>n.classList.toggle('open')}
function codeMeta(code){const m={0:['☀️','მოწმენდილი'],1:['🌤️','უმეტესად მოწმენდილი'],2:['⛅','ნაწილობრივ ღრუბლიანი'],3:['☁️','ღრუბლიანი'],45:['🌫️','ნისლი'],48:['🌫️','ნისლი'],51:['🌦️','ჟინჟღლი'],53:['🌦️','ჟინჟღლი'],55:['🌧️','ძლიერი ჟინჟღლი'],61:['🌧️','წვიმა'],63:['🌧️','წვიმა'],65:['🌧️','ძლიერი წვიმა'],71:['🌨️','თოვა'],73:['🌨️','თოვა'],75:['❄️','ძლიერი თოვა'],80:['🌦️','წვიმის შხეფები'],81:['🌧️','წვიმის შხეფები'],82:['⛈️','ძლიერი შხეფები'],95:['⛈️','ჭექა-ქუხილი'],96:['⛈️','ჭექა-ქუხილი'],99:['⛈️','ძლიერი ჭექა-ქუხილი']};return m[code]||['🌥️','ცვალებადი']}
function scoreWeather(c){
  const t=Number(c?.temperature_2m);
  const w=Number(c?.wind_speed_10m);
  const p=Number(c?.precipitation);
  const pr=Number(c?.pressure_msl);
  const h=Number(c?.relative_humidity_2m);
  const code=Number(c?.weather_code);
  const rainProb=Number(c?.precipitation_probability);
  const n=(v,d)=>Number.isFinite(v)?v:d;
  const temp=n(t,20), wind=Math.max(0,n(w,0)), rain=Math.max(0,n(p,0)), pressure=n(pr,1013), humidity=n(h,55), probability=Math.max(0,n(rainProb,0));
  const tempScore=Math.max(35,100-Math.max(0,Math.abs(temp-21)-4)*5);
  const windScore=wind<=7?100:wind<=15?90-(wind-7)*3:wind<=25?66-(wind-15)*3.6:wind<=35?30-(wind-25)*2.2:5;
  const rainScore=rain<=0.2?100:rain<=1?92-rain*15:rain<=3?77-(rain-1)*14:rain<=6?49-(rain-3)*10:15;
  const pressureScore=Math.max(45,100-Math.abs(pressure-1013)*2.1);
  const humidityScore=humidity>=40&&humidity<=70?100:humidity<40?Math.max(55,100-(40-humidity)*2):Math.max(50,100-(humidity-70)*1.8);
  let weatherScore=100;
  if([95,96,99].includes(code)) weatherScore=15;
  else if([71,73,75,82].includes(code)) weatherScore=35;
  else if([65,80,81].includes(code)) weatherScore=48;
  else if([61,63,55].includes(code)) weatherScore=62;
  else if([45,48].includes(code)) weatherScore=68;
  else if([51,53].includes(code)) weatherScore=80;
  const probPenalty=Math.max(0,(probability-20)*0.3);
  const score=tempScore*.20 + windScore*.24 + rainScore*.24 + pressureScore*.10 + humidityScore*.10 + weatherScore*.12 - probPenalty;
  return Math.max(0,Math.min(100,Math.round(score)));
}
function outdoorScore(c){
  // Outdoor score is intentionally conservative. It is evaluated per hour,
  // using the actual hourly conditions plus gusts, rain probability,
  // visibility and (when available) daylight context.
  const n=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
  const t=n(c?.temperature_2m,20), apparent=n(c?.apparent_temperature,t);
  const w=Math.max(0,n(c?.wind_speed_10m,0)), gust=Math.max(0,n(c?.wind_gusts_10m,w));
  const rain=Math.max(0,n(c?.precipitation,0)), pressure=n(c?.pressure_msl,1013);
  const h=n(c?.relative_humidity_2m,60), code=Number(c?.weather_code);
  const rp=Math.max(0,n(c?.precipitation_probability,0));
  const cloud=Math.max(0,Math.min(100,n(c?.cloud_cover,50)));
  const visibility=Math.max(0,n(c?.visibility,10000));
  const hour=Number.isFinite(Number(c?.local_hour))?Number(c.local_hour):null;

  // Comfortable outdoor temperature uses apparent temperature so heat/chill
  // from wind is not ignored.
  const tempDist=apparent<16?16-apparent:apparent>27?apparent-27:0;
  const tempScore=tempDist===0?100:Math.max(8,100-tempDist*10.5);

  const windScore=w<=7?100:w<=12?90-(w-7)*3:w<=20?75-(w-12)*4:w<=30?43-(w-20)*4:w<=40?10-(w-30)*0.8:2;
  const gustScore=gust<=10?100:gust<=18?88-(gust-10)*3:gust<=28?64-(gust-18)*3.5:gust<=40?29-(gust-28)*2.1:3;

  const rainScore=rain<=0.1?100:rain<=1?82-rain*14:rain<=3?68-(rain-1)*15:rain<=6?38-(rain-3)*8:4;
  const probScore=rp<=10?100:rp<=25?82-(rp-10)*1.1:rp<=45?65-(rp-25)*1.3:rp<=65?39-(rp-45)*1.2:8;

  const pressureDist=Math.abs(pressure-1013);
  const pressureScore=pressureDist<=5?100:pressureDist<=12?92-(pressureDist-5)*4.2:pressureDist<=22?62-(pressureDist-12)*3.2:18;
  const humidityScore=h>=40&&h<=78?100:h<40?Math.max(42,100-(40-h)*2.4):Math.max(35,100-(h-78)*2.1);
  const cloudScore=cloud<=20?100:cloud<=45?90-(cloud-20)*1.2:cloud<=75?60-(cloud-45)*1.45:25-(cloud-75)*0.9;
  const visibilityScore=visibility>=10000?100:visibility>=6000?92:visibility>=3000?72:visibility>=1500?48:visibility>=700?25:5;

  let weatherScore=92;
  if([95,96,99].includes(code))weatherScore=2;
  else if([65,82].includes(code))weatherScore=12;
  else if([75,73,71].includes(code))weatherScore=20;
  else if([61,63,80,81].includes(code))weatherScore=32;
  else if([51,53,55].includes(code))weatherScore=52;
  else if([45,48].includes(code))weatherScore=60;
  else if(code===3)weatherScore=70;
  else if(code===2)weatherScore=84;
  else if(code===1)weatherScore=94;
  else if(code===0)weatherScore=100;

  // Night-time is not "bad" by itself, but general outdoor comfort/visibility
  // is lower outside daylight. Dedicated Night Sky has its own score.
  let lightScore=86;
  if(hour!==null){
    if(hour>=7&&hour<=18) lightScore=100;
    else if(hour>=5&&hour<=6 || hour>=19&&hour<=20) lightScore=72;
    else lightScore=48;
  }

  const raw=(tempScore*.18)+(windScore*.15)+(gustScore*.08)+(rainScore*.14)+(probScore*.08)+
            (pressureScore*.09)+(humidityScore*.05)+(cloudScore*.05)+(weatherScore*.09)+
            (visibilityScore*.01)+(lightScore*.08);
  // Slightly conservative curve prevents routine weather from looking like
  // a perfect 95-100 day while still rewarding genuinely good conditions.
  return Math.max(0,Math.min(100,Math.round(4+96*Math.pow(Math.max(0,Math.min(100,raw))/100,1.22))));
}
function pressureStatus(p){if(p<995)return ['დაბალი წნევა','დაბალი წნევა ხშირად ცვლის პირობებს; სხვა ფაქტორებთან ერთად შეაფასე.'];if(p>1025)return ['მაღალი წნევა','მაღალი წნევისას ამინდი ხშირად უფრო სტაბილურია, მაგრამ სხვა პირობებიც მნიშვნელოვანია.'];return ['ნორმალური დიაპაზონი','წნევა საშუალო დიაპაზონშია; შეადარე ტემპერატურას, ქარს და ნალექს.']}
function setPressureGauge(value,needleId,valueId,statusId,adviceId){const p=+value;if(!Number.isFinite(p))return;const pct=Math.max(0,Math.min(1,(p-960)/80));const deg=-90+180*pct;const n=document.getElementById(needleId);if(n)n.style.transform=`translateX(-50%) rotate(${deg}deg)`;const v=document.getElementById(valueId);if(v)v.textContent=Math.round(p);const [st,ad]=pressureStatus(p);const stEl=document.getElementById(statusId);const adEl=document.getElementById(adviceId);if(stEl)stEl.textContent=st;if(adEl)adEl.textContent=ad}
async function openMeteo(lat,lon){
  const coords=`latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`;
  const controller=()=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),12000);return {signal:c.signal,done:()=>clearTimeout(t)};};
  try{
    const c=controller();try{const r=await fetch(`/api/weather?${coords}`,{cache:'no-store',signal:c.signal});const d=await r.json();if(r.ok&&d?.data){d.data.__meta=d.meta||{};c.done();return d.data}}finally{c.done()}
  }catch{}
  const u=`https://api.open-meteo.com/v1/forecast?${coords}&timezone=auto&forecast_days=16&models=best_match&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max`;
  let lastErr=null;
  for(let i=0;i<2;i++){
    try{const c=controller();try{const r=await fetch(u,{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error('weather unavailable');const d=await r.json();d.__meta={source:'Open-Meteo direct fallback',updatedAt:Date.now(),stale:false};c.done();return d}catch(e){c.done();throw e}}catch(e){lastErr=e;await new Promise(r=>setTimeout(r,350))}
  }
  throw lastErr||new Error('weather unavailable')
}
async function geocode(q){const u=`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=ka&countrycodes=ge&q=${encodeURIComponent(q)}`;const r=await fetch(u,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('geocode failed');return r.json()}
function fmtDate(x){return new Date(x).toLocaleDateString('ka-GE',{weekday:'long',day:'2-digit',month:'short'})}
function fmtTime(x){return new Date(x).toLocaleTimeString('ka-GE',{hour:'2-digit',minute:'2-digit'})}
async function loadHomeWeather(lat,lon,city){try{const d=await openMeteo(lat,lon),c=d.current,m=codeMeta(c.weather_code),s=scoreWeather(c);document.getElementById('homeCity').textContent=city;document.getElementById('homeIcon').textContent=m[0];document.getElementById('homeTemp').textContent=Math.round(c.temperature_2m)+'°';document.getElementById('homeDesc').textContent=m[1];document.getElementById('homeScore').textContent=s;document.getElementById('homePressure').textContent=Math.round(c.pressure_msl)+' hPa';document.getElementById('homeWind').textContent=Math.round(c.wind_speed_10m)+' კმ/სთ';document.getElementById('homeHumidity').textContent=Math.round(c.relative_humidity_2m)+'%';document.getElementById('homeRain').textContent=Number(c.precipitation).toFixed(1)+' მმ'}catch(e){console.error(e)}}
async function initWeatherPage(lat,lon,city){
  const input=document.getElementById('weatherSearch'),res=document.getElementById('weatherSearchResults');
  let activeLat=lat,activeLon=lon,activeCity=city,selectedWeatherHour='';
  function weatherRows(d){
    const hs=d?.hourly?.time||[];return hs.map((t,i)=>({iso:t,time:t.slice(11,16),temperature:Number(d.hourly.temperature_2m?.[i]),pressure:Number(d.hourly.pressure_msl?.[i]),wind:Number(d.hourly.wind_speed_10m?.[i]),gust:Number(d.hourly.wind_gusts_10m?.[i]),precip:Number(d.hourly.precipitation?.[i]),rainProb:Number(d.hourly.precipitation_probability?.[i]),humidity:Number(d.hourly.relative_humidity_2m?.[i]),cloud:Number(d.hourly.cloud_cover?.[i]),visibility:Number(d.hourly.visibility?.[i]||0),code:Number(d.hourly.weather_code?.[i])})).filter(r=>r.iso.slice(0,10)===(d.current?.time||d.hourly.time?.[0]||'').slice(0,10));
  }
  function selectWeatherRow(d,row){
    if(!row)return;selectedWeatherHour=row.time;const el=document.getElementById('weatherHourSelect');if(el)el.value=row.time;
    const score=outdoorScore({temperature_2m:row.temperature,pressure_msl:row.pressure,wind_speed_10m:row.wind,precipitation:row.precip,precipitation_probability:row.rainProb,weather_code:row.code,relative_humidity_2m:row.humidity,cloud_cover:row.cloud,wind_gusts_10m:row.gust});
    const box=document.getElementById('weatherHourlySelected');if(box){const mm=codeMeta(row.code);box.innerHTML=`<div class="selected-hour-grid"><div><span>${mm[0]}</span><b>${row.time}</b><small>${mm[1]}</small></div><div><small>ტემპერატურა</small><b>${row.temperature.toFixed(1)}°C</b></div><div><small>წნევა</small><b>${row.pressure.toFixed(1)} hPa</b></div><div><small>ქარი</small><b>${row.wind.toFixed(1)} კმ/სთ</b></div><div><small>ნალექი</small><b>${row.precip.toFixed(1)} მმ</b></div><div><small>ღრუბლიანობა</small><b>${Math.round(row.cloud)}%</b></div><div><small>Outdoor Score</small><b class="selected-score">${score}/100</b></div></div>`;}
    document.querySelectorAll('#weatherHourlyStrip .weather-hour-card').forEach(el=>el.classList.toggle('active',el.dataset.iso===row.iso));
    if(window.GNLiveFactors)GNLiveFactors.render({data:d,row,subject:null,type:'weather',locationName:activeCity});
  }
  function renderWeatherHours(d){
    const rows=weatherRows(d),strip=document.getElementById('weatherHourlyStrip'),sel=document.getElementById('weatherHourSelect');if(!strip||!rows.length)return;
    const now=new Date();const current=rows.find(r=>r.time===`${String(now.getHours()).padStart(2,'0')}:00`)||rows[0];
    if(sel){sel.innerHTML=rows.map(r=>`<option value="${r.time}">${r.time}</option>`).join('');const keep=rows.some(r=>r.time===selectedWeatherHour)?selectedWeatherHour:current.time;sel.value=keep;sel.onchange=()=>{const r=rows.find(x=>x.time===sel.value);if(r)selectWeatherRow(d,r)};}
    strip.innerHTML=rows.map(r=>{const mm=codeMeta(r.code);return`<button type="button" class="weather-hour-card${(r.time===(sel?.value||current.time))?' active':''}" data-iso="${r.iso}"><small>${r.time}</small><span>${mm[0]}</span><b>${r.temperature.toFixed(1)}°</b><em>${Math.round(r.cloud)}% ☁</em><strong>${Math.round(outdoorScore({temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.precip,precipitation_probability:r.rainProb,weather_code:r.code,relative_humidity_2m:r.humidity,cloud_cover:r.cloud,wind_gusts_10m:r.gust}))}</strong></button>`}).join('');
    strip.querySelectorAll('.weather-hour-card').forEach(b=>b.onclick=()=>{const r=rows.find(x=>x.iso===b.dataset.iso);if(r)selectWeatherRow(d,r)});
    const chosen=rows.find(r=>r.time===(sel?.value||current.time))||current;selectWeatherRow(d,chosen);
  }
  async function load(a,b,n){
    try{activeLat=a;activeLon=b;activeCity=n;const d=await openMeteo(a,b),c=d.current,m=codeMeta(c.weather_code),s=scoreWeather(c);document.getElementById('weatherCity').textContent=n;document.getElementById('weatherIcon').textContent=m[0];document.getElementById('weatherTemp').textContent=Number(c.temperature_2m).toFixed(1);document.getElementById('weatherDesc').textContent=m[1];const srcEl=document.getElementById('weatherSourceStatus');if(srcEl&&d.__meta)srcEl.textContent=`წყარო: ${d.__meta.source||'Open-Meteo'}${d.__meta.stale?' • ბოლო ხელმისაწვდომი მონაცემი':''}`;document.getElementById('weatherScore').textContent=s;document.getElementById('wFeels').textContent=Number(c.apparent_temperature).toFixed(1)+'°C';document.getElementById('wPressure').textContent=Number(c.pressure_msl).toFixed(1)+' hPa';document.getElementById('wHumidity').textContent=Math.round(c.relative_humidity_2m)+'%';document.getElementById('wWind').textContent=Number(c.wind_speed_10m).toFixed(1)+' კმ/სთ';document.getElementById('wGust').textContent=Number(c.wind_gusts_10m).toFixed(1)+' კმ/სთ';document.getElementById('wRain').textContent=Number(c.precipitation).toFixed(1)+' მმ';setPressureGauge(c.pressure_msl,'weatherPressureNeedle','weatherPressureValue','weatherPressureStatus','weatherPressureAdvice');document.getElementById('weatherDaily').innerHTML=d.daily.time.slice(0,window.GNPremium?.maxForecastDays?.()||1).map((x,i)=>{const mm=codeMeta(d.daily.weather_code[i]);return`<article class="daily-card"><b>${fmtDate(x)}</b><div class="dicon">${mm[0]}</div><strong>${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°</strong><small>${mm[1]}</small><small>💧 ${d.daily.precipitation_probability_max[i]||0}%</small><small>💨 ${Math.round(d.daily.wind_speed_10m_max[i]||0)} კმ/სთ</small></article>`}).join('');renderWeatherHours(d);if(window.GNLiveFactors&&document.getElementById('assessmentFactors'))GNLiveFactors.render({data:d,row:GNLiveFactors.rowAt(d,(d.hourly?.time||[]).find(t=>t.slice(11,16)===selectedWeatherHour)||d.hourly?.time?.[0]),subject:null,type:'weather',locationName:n});}catch(e){console.error(e);document.getElementById('weatherDesc').textContent='Live ამინდის მონაცემები დროებით ვერ ჩაიტვირთა.'}}
  async function search(){const q=input.value.trim();if(!q)return;res.textContent='იტვირთება…';try{const data=await geocode(q);res.innerHTML=(data||[]).map((x,i)=>`<button data-i="${i}">${x.display_name}</button>`).join('')||'ვერ მოიძებნა';res.querySelectorAll('button').forEach(b=>b.onclick=()=>{const x=data[+b.dataset.i];load(+x.lat,+x.lon,x.display_name);res.innerHTML=`არჩეულია: ${x.display_name}`})}catch(e){res.textContent='ძებნა ვერ შესრულდა.'}}
  document.getElementById('weatherSearchBtn').onclick=search;input.onkeydown=e=>{if(e.key==='Enter')search()};document.getElementById('weatherGps').onclick=()=>navigator.geolocation.getCurrentPosition(p=>load(p.coords.latitude,p.coords.longitude,'ჩემი მდებარეობა'),()=>alert('GPS ნებართვა ვერ მივიღეთ.'));
  await load(lat,lon,city);
  if(window.GNLiveFactors)GNLiveFactors.bind({liveDefault:true,refresh:()=>load(activeLat,activeLon,activeCity)});
}
setupMenu();

function chanceBand(score){const n=Math.max(0,Math.min(100,Math.round(Number(score)||0)));if(n>=85)return ['excellent','ძალიან კარგი'];if(n>=70)return ['good','კარგი'];if(n>=50)return ['medium','საშუალო'];if(n>=30)return ['weak','სუსტი'];return ['poor','დაბალი'];}
function chanceMarkup(score,label='შანსი'){const n=Math.max(0,Math.min(100,Math.round(Number(score)||0))),[cls,text]=chanceBand(n);return `<div class="gn-chance gn-chance-${cls}" data-score="${n}"><span class="gn-chance-ring" style="--chance:${n}"><b>${n}%</b></span><span class="gn-chance-copy"><strong>${label}</strong><small>${text}</small></span></div>`;}
window.GeoChanceUI={band:chanceBand,markup:chanceMarkup};

window.GeoNatureCommon=window.GeoNatureCommon||{scoreWeather:scoreWeather,outdoorScore:outdoorScore,openMeteo:openMeteo,codeMeta:codeMeta,fmtDate:fmtDate,localDateISO:localDateISO};
