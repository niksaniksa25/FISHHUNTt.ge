function numberOrNull(value){
  if(value===null||value===undefined||typeof value==='boolean'||(typeof value==='string'&&!value.trim()))return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function zonedDateTime(dataOrTimeZone='Asia/Tbilisi',now=new Date()){
  const timezone=typeof dataOrTimeZone==='string'?dataOrTimeZone:(dataOrTimeZone?.timezone||'Asia/Tbilisi');
  const dateValue=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(dateValue.getTime()))return null;
  let parts;
  try{parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(dateValue);}
  catch{return zonedDateTime('Asia/Tbilisi',dateValue);}
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const date=`${values.year}-${values.month}-${values.day}`,time=`${values.hour}:${values.minute}`;
  return {date,time,hour:Number(values.hour),iso:`${date}T${time}:${values.second}`,timezone};
}
function localDateISO(d=new Date(),timeZone='Asia/Tbilisi'){return zonedDateTime(timeZone,d)?.date||'';}
const WEATHER_ROW_FIELDS={temperature:'temperature_2m',apparent_temperature:'apparent_temperature',pressure:'pressure_msl',wind:'wind_speed_10m',gust:'wind_gusts_10m',precip:'precipitation',rainProb:'precipitation_probability',humidity:'relative_humidity_2m',cloud:'cloud_cover',visibility:'visibility',code:'weather_code',is_day:'is_day'};
function weatherRowAt(data,iso){
  const index=data?.hourly?.time?.indexOf(iso)??-1;if(index<0)return null;
  const row={iso,time:iso.slice(11,16),date:iso.slice(0,10),local_hour:numberOrNull(iso.slice(11,13)),source:'forecast'};
  for(const [key,field] of Object.entries(WEATHER_ROW_FIELDS))row[key]=numberOrNull(data.hourly[field]?.[index]);
  row.apparent=row.apparent_temperature;
  return row;
}
function hourlyRows(data,date){return (data?.hourly?.time||[]).filter(iso=>!date||iso.slice(0,10)===date).map(iso=>weatherRowAt(data,iso));}
function conditionsFromRow(row){
  if(!row)return null;
  const result={local_hour:numberOrNull(row.local_hour??row.time?.slice(0,2))};
  for(const [key,field] of Object.entries(WEATHER_ROW_FIELDS))result[field]=numberOrNull(row[key]);
  return result;
}
function currentWeatherRow(data){
  const iso=data?.current?.time;if(typeof iso!=='string')return null;
  const row=weatherRowAt(data,iso.slice(0,13)+':00')||{};
  Object.assign(row,{iso,time:iso.slice(11,16),date:iso.slice(0,10),local_hour:numberOrNull(iso.slice(11,13)),source:'current'});
  for(const [key,field] of Object.entries(WEATHER_ROW_FIELDS)){
    if(Object.hasOwn(data.current,field)||!['rainProb','visibility'].includes(key))row[key]=numberOrNull(data.current[field]);
  }
  row.apparent=row.apparent_temperature;
  return row;
}
function hasWeatherCore(c){
  return ['temperature_2m','wind_speed_10m','precipitation','weather_code'].every(key=>numberOrNull(c?.[key])!==null)&&numberOrNull(c.wind_speed_10m)>=0&&numberOrNull(c.precipitation)>=0&&[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(numberOrNull(c.weather_code));
}
function setupMenu(){
  const button=document.getElementById('menuBtn'),nav=document.getElementById('nav');
  if(!button||!nav||button.dataset.gnMenuBound)return;
  button.dataset.gnMenuBound='true';
  button.type='button';
  button.setAttribute('aria-controls',nav.id);
  const setOpen=open=>{
    nav.classList.toggle('open',Boolean(open));
    button.setAttribute('aria-expanded',String(Boolean(open)));
    button.setAttribute('aria-label',open?'მენიუს დახურვა':'მენიუს გახსნა');
  };
  setOpen(nav.classList.contains('open'));
  button.addEventListener('click',event=>{event.preventDefault();setOpen(!nav.classList.contains('open'));});
  nav.addEventListener('click',event=>{if(event.target.closest('a'))setOpen(false);});
  document.addEventListener('click',event=>{if(!nav.contains(event.target)&&!button.contains(event.target))setOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('open')){setOpen(false);button.focus();}});
  window.addEventListener('resize',()=>{if(window.innerWidth>=1025)setOpen(false);},{passive:true});
}
function codeMeta(code){if(numberOrNull(code)===null)return ['—','მონაცემი მიუწვდომელია'];const m={0:['☀️','მოწმენდილი'],1:['🌤️','უმეტესად მოწმენდილი'],2:['⛅','ნაწილობრივ ღრუბლიანი'],3:['☁️','ღრუბლიანი'],45:['🌫️','ნისლი'],48:['🌫️','ყინულოვანი ნისლი'],51:['🌦️','სუსტი ჟინჟღლი'],53:['🌦️','ჟინჟღლი'],55:['🌧️','ძლიერი ჟინჟღლი'],56:['🧊','ყინულოვანი ჟინჟღლი'],57:['🧊','ძლიერი ყინულოვანი ჟინჟღლი'],61:['🌧️','სუსტი წვიმა'],63:['🌧️','წვიმა'],65:['🌧️','ძლიერი წვიმა'],66:['🧊','ყინულოვანი წვიმა'],67:['🧊','ძლიერი ყინულოვანი წვიმა'],71:['🌨️','სუსტი თოვა'],73:['🌨️','თოვა'],75:['❄️','ძლიერი თოვა'],77:['❄️','თოვლის მარცვლები'],80:['🌦️','სუსტი წვიმის შხეფები'],81:['🌧️','წვიმის შხეფები'],82:['⛈️','ძლიერი შხეფები'],85:['🌨️','თოვლის შხეფები'],86:['❄️','ძლიერი თოვლის შხეფები'],95:['⛈️','ჭექა-ქუხილი'],96:['⛈️','ჭექა-ქუხილი და სეტყვა'],99:['⛈️','ძლიერი ჭექა-ქუხილი და სეტყვა']};return m[code]||['🌥️','ცვალებადი']}
function scoreWeather(c){
  if(!hasWeatherCore(c))return null;
  const t=numberOrNull(c?.temperature_2m);
  const w=numberOrNull(c?.wind_speed_10m);
  const p=numberOrNull(c?.precipitation);
  const pr=numberOrNull(c?.pressure_msl);
  const h=numberOrNull(c?.relative_humidity_2m);
  const code=numberOrNull(c?.weather_code);
  const rainProb=numberOrNull(c?.precipitation_probability);
  const n=(v,d)=>v===null?d:v;
  const temp=n(t,20), wind=Math.max(0,n(w,0)), rain=Math.max(0,n(p,0)), pressure=n(pr,1013), humidity=n(h,55), probability=Math.max(0,n(rainProb,0));
  const tempScore=Math.max(35,100-Math.max(0,Math.abs(temp-21)-4)*5);
  const windScore=wind<=7?100:wind<=15?90-(wind-7)*3:wind<=25?66-(wind-15)*3.6:wind<=35?30-(wind-25)*2.2:5;
  const rainScore=rain<=0.2?100:rain<=1?92-rain*15:rain<=3?77-(rain-1)*14:rain<=6?49-(rain-3)*10:15;
  const pressureScore=Math.max(45,100-Math.abs(pressure-1013)*2.1);
  const humidityScore=humidity>=40&&humidity<=70?100:humidity<40?Math.max(55,100-(40-humidity)*2):Math.max(50,100-(humidity-70)*1.8);
  let weatherScore=100;
  if([95,96,99].includes(code)) weatherScore=15;
  else if([56,57,66,67].includes(code))weatherScore=25;
  else if([71,73,75,77,82,85,86].includes(code)) weatherScore=35;
  else if([65,80,81].includes(code)) weatherScore=48;
  else if([61,63,55].includes(code)) weatherScore=62;
  else if([45,48].includes(code)) weatherScore=68;
  else if([51,53].includes(code)) weatherScore=80;
  const probPenalty=Math.max(0,(probability-20)*0.3);
  const terms=[[tempScore,.20],[windScore,.24],[rainScore,.24],[weatherScore,.12]];
  if(pr!==null)terms.push([pressureScore,.10]);if(h!==null)terms.push([humidityScore,.10]);
  const score=terms.reduce((sum,[value,weight])=>sum+value*weight,0)/terms.reduce((sum,[,weight])=>sum+weight,0)-probPenalty;
  const cap=[95,96,99].includes(code)?30:wind>=50||rain>=10?25:[56,57,66,67,86].includes(code)?35:100;
  return Math.max(0,Math.min(cap,Math.round(score)));
}
function outdoorScore(c){
  // Outdoor score is intentionally conservative. It is evaluated per hour,
  // using the actual hourly conditions plus gusts, rain probability,
  // visibility and (when available) daylight context.
  if(!hasWeatherCore(c))return null;
  const n=(v,d)=>numberOrNull(v)??d;
  const t=n(c?.temperature_2m,20), apparent=n(c?.apparent_temperature,t);
  const w=Math.max(0,n(c?.wind_speed_10m,0)), gust=Math.max(0,n(c?.wind_gusts_10m,w));
  const rain=Math.max(0,n(c?.precipitation,0)), pressure=n(c?.pressure_msl,1013);
  const h=n(c?.relative_humidity_2m,60), code=Number(c?.weather_code);
  const rp=Math.max(0,n(c?.precipitation_probability,0));
  const cloud=Math.max(0,Math.min(100,n(c?.cloud_cover,50)));
  const visibility=Math.max(0,n(c?.visibility,10000));
  const hour=numberOrNull(c?.local_hour);

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
  else if([56,57,66,67].includes(code))weatherScore=12;
  else if([65,82].includes(code))weatherScore=12;
  else if([75,73,71,77,85,86].includes(code))weatherScore=20;
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
  const daylight=numberOrNull(c?.is_day);
  if(daylight!==null)lightScore=daylight===1?100:48;
  else if(hour!==null){
    if(hour>=7&&hour<=18) lightScore=100;
    else if(hour>=5&&hour<=6 || hour>=19&&hour<=20) lightScore=72;
    else lightScore=48;
  }

  const terms=[[tempScore,.18],[windScore,.15],[rainScore,.14],[weatherScore,.09],[lightScore,.08]];
  for(const [field,value,weight] of [['wind_gusts_10m',gustScore,.08],['precipitation_probability',probScore,.08],['pressure_msl',pressureScore,.09],['relative_humidity_2m',humidityScore,.05],['cloud_cover',cloudScore,.05],['visibility',visibilityScore,.01]])if(numberOrNull(c?.[field])!==null)terms.push([value,weight]);
  const raw=terms.reduce((sum,[value,weight])=>sum+value*weight,0)/terms.reduce((sum,[,weight])=>sum+weight,0);
  // Slightly conservative curve prevents routine weather from looking like
  // a perfect 95-100 day while still rewarding genuinely good conditions.
  const cap=[95,96,99].includes(code)?25:gust>=60||w>=50||rain>=10||apparent>=45||apparent<=-15?25:[56,57,66,67,86].includes(code)?35:100;
  return Math.max(0,Math.min(cap,Math.round(4+96*Math.pow(Math.max(0,Math.min(100,raw))/100,1.22))));
}
function pressureStatus(p){if(p<995)return ['დაბალი წნევა','დაბალი წნევა ხშირად ცვლის პირობებს; სხვა ფაქტორებთან ერთად შეაფასე.'];if(p>1025)return ['მაღალი წნევა','მაღალი წნევისას ამინდი ხშირად უფრო სტაბილურია, მაგრამ სხვა პირობებიც მნიშვნელოვანია.'];return ['ნორმალური დიაპაზონი','წნევა საშუალო დიაპაზონშია; შეადარე ტემპერატურას, ქარს და ნალექს.']}
function setPressureGauge(value,needleId,valueId,statusId,adviceId){
  const p=numberOrNull(value),needle=document.getElementById(needleId),display=document.getElementById(valueId),status=document.getElementById(statusId),advice=document.getElementById(adviceId);
  if(needle)needle.hidden=p===null;
  if(p===null){if(display)display.textContent='—';if(status)status.textContent='მონაცემი მიუწვდომელია';if(advice)advice.textContent='წნევის მონაცემს ველოდებით.';return;}
  const pct=Math.max(0,Math.min(1,(p-960)/80));if(needle)needle.style.transform=`translateX(-50%) rotate(${-90+180*pct}deg)`;
  if(display)display.textContent=Math.round(p);
  const [label,text]=pressureStatus(p);if(status)status.textContent=label;if(advice)advice.textContent=text;
}
const pendingWeatherRequests=new Map();
function validCoordinates(lat,lon){const a=numberOrNull(lat),b=numberOrNull(lon);return a!==null&&b!==null&&Math.abs(a)<=90&&Math.abs(b)<=180;}
function validateForecast(data){
  if(!data?.current||!hasWeatherCore(data.current)||typeof data.current.time!=='string'||!Array.isArray(data.hourly?.time)||!data.hourly.time.length||!Array.isArray(data.daily?.time)||!data.daily.time.length)throw new Error('Incomplete weather data');
  const validTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)&&Number.isFinite(Date.parse(value+'Z'))&&new Date(value+'Z').toISOString().slice(0,16)===value.slice(0,16);
  const offset=numberOrNull(data.utc_offset_seconds);
  if(!validTime(data.current.time)||offset===null||Math.abs(offset)>14*3600||typeof data.timezone!=='string')throw new Error('Invalid weather timestamp');
  try{new Intl.DateTimeFormat('en',{timeZone:data.timezone});}catch{throw new Error('Invalid weather timezone');}
  if(!data.hourly.time.every(validTime)||!data.daily.time.every(date=>validTime(date+'T00:00')))throw new Error('Invalid forecast timeline');
  for(const key of ['temperature_2m','wind_speed_10m','precipitation','weather_code'])if(!Array.isArray(data.hourly[key])||data.hourly[key].length!==data.hourly.time.length)throw new Error('Incomplete hourly weather data');
  for(const key of ['weather_code','temperature_2m_max','temperature_2m_min'])if(!Array.isArray(data.daily[key])||data.daily[key].length!==data.daily.time.length)throw new Error('Incomplete daily weather data');
  for(const [field,expected] of [['temperature_2m','°C'],['wind_speed_10m','km/h'],['precipitation','mm'],['pressure_msl','hPa']]){
    for(const units of [data.current_units,data.hourly_units])if(units?.[field]&&units[field]!==expected)throw new Error('Unexpected weather units');
  }
  return data;
}
function weatherObservationTime(data){
  if(Number.isFinite(data?.__meta?.currentTime))return data.__meta.currentTime;
  const iso=data?.current?.time,offset=numberOrNull(data?.utc_offset_seconds);
  if(typeof iso!=='string'||offset===null)return null;
  const time=Date.parse(iso+'Z')-offset*1000;return Number.isFinite(time)?time:null;
}
async function openMeteo(lat,lon,options={}){
  if(!validCoordinates(lat,lon))throw new Error('Valid location coordinates are required');
  const key=`${Number(lat)},${Number(lon)}`;
  if(pendingWeatherRequests.has(key))return pendingWeatherRequests.get(key);
  const request=fetchWeather(Number(lat),Number(lon),options);
  pendingWeatherRequests.set(key,request);
  try{return await request;}finally{pendingWeatherRequests.delete(key);}
}
async function fetchWeather(lat,lon,options){
  const coords=`latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`;
  const controller=()=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),12000);return {signal:c.signal,done:()=>clearTimeout(t)};};
  if(!String(window.location?.hostname||'').endsWith('.github.io')||window.GN_API_BASE_URL){
    try{
      const c=controller();try{const route=`/api/weather?${coords}${options.force?'&refresh=1':''}`;const r=await fetch(window.GN_API_URL?window.GN_API_URL(route):route,{cache:'no-store',signal:c.signal});const d=await r.json();if(r.ok&&d?.data){validateForecast(d.data);d.data.__meta=d.meta||{};return d.data}}finally{c.done()}
    }catch{}
  }
  const u=`https://api.open-meteo.com/v1/forecast?${coords}&timezone=auto&forecast_days=16&models=best_match&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max`;
  let lastErr=null;
  for(let i=0;i<2;i++){
    try{const c=controller();try{const r=await fetch(u,{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error('weather unavailable');const d=validateForecast(await r.json());const updatedAt=Date.now(),currentTime=weatherObservationTime(d);d.__meta={source:'Open-Meteo',updatedAt,fetchedAt:updatedAt,currentTime,stale:currentTime===null||updatedAt-currentTime>90*60*1000||currentTime-updatedAt>30*60*1000};return d}finally{c.done()}}catch(e){lastErr=e;if(i===0)await new Promise(r=>setTimeout(r,350))}
  }
  throw lastErr||new Error('weather unavailable')
}
async function geocode(q){const u=`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=ka&countrycodes=ge&q=${encodeURIComponent(q)}`,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const r=await fetch(u,{headers:{Accept:'application/json'},signal:controller.signal});if(!r.ok)throw new Error('geocode failed');const data=await r.json();if(!Array.isArray(data))throw new Error('Invalid location results');return data;}finally{clearTimeout(timer);}}
function fmtDate(x){const local=typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x),date=new Date(local?x+'T12:00:00Z':x);return Number.isFinite(date.getTime())?date.toLocaleDateString('ka-GE',{weekday:'long',day:'2-digit',month:'short',timeZone:local?'UTC':'Asia/Tbilisi'}):'—';}
function fmtTime(x){if(typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x))return x.slice(11,16);const date=new Date(x);return Number.isFinite(date.getTime())?date.toLocaleTimeString('ka-GE',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tbilisi'}):'—';}
async function loadHomeWeather(lat,lon,city){try{const d=await openMeteo(lat,lon),c=d.current,m=codeMeta(c.weather_code),s=scoreWeather(c);document.getElementById('homeCity').textContent=city;document.getElementById('homeIcon').textContent=m[0];document.getElementById('homeTemp').textContent=Math.round(c.temperature_2m)+'°';document.getElementById('homeDesc').textContent=m[1];document.getElementById('homeScore').textContent=s;document.getElementById('homePressure').textContent=Math.round(c.pressure_msl)+' hPa';document.getElementById('homeWind').textContent=Math.round(c.wind_speed_10m)+' კმ/სთ';document.getElementById('homeHumidity').textContent=Math.round(c.relative_humidity_2m)+'%';document.getElementById('homeRain').textContent=Number(c.precipitation).toFixed(1)+' მმ'}catch(e){console.error(e)}}
function weatherLocationFromURL(search,defaults){
  const params=new URLSearchParams(typeof search==='string'?search:'');
  if(!params.has('lat')||!params.has('lon')||!validCoordinates(params.get('lat'),params.get('lon')))return {...defaults};
  const name=String(params.get('name')||defaults?.city||'არჩეული ადგილი').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ').slice(0,120);
  return {lat:Number(params.get('lat')),lon:Number(params.get('lon')),city:name||defaults?.city||'არჩეული ადგილი'};
}
async function initWeatherPage(lat,lon,city){
  const get=id=>document.getElementById(id),set=(id,value)=>{const el=get(id);if(el)el.textContent=value;};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(value,unit='',digits=1)=>numberOrNull(value)===null?'—':Number(value).toFixed(digits)+unit;
  const initial=weatherLocationFromURL(window.location?.search||'',{lat,lon,city});
  let activeLat=initial.lat,activeLon=initial.lon,activeCity=initial.city,data=null,selectedISO='',trackCurrent=true,requestId=0,searchId=0;
  function renderFactors(){
    if(!data)return;
    const row=trackCurrent?currentWeatherRow(data):weatherRowAt(data,selectedISO);
    if(row&&window.GNLiveFactors)GNLiveFactors.render({data,row,type:'weather',subject:null,locationName:activeCity,live:controller?.live!==false,selectedCurrent:trackCurrent});
  }
  function selectRow(iso){trackCurrent=false;selectedISO=iso;renderSelected();}
  function renderSelected(){
    if(!data)return;
    const row=trackCurrent?currentWeatherRow(data):weatherRowAt(data,selectedISO);
    if(!row)return;
    const currentHour=String(data.current.time).slice(0,13)+':00',chosenHour=trackCurrent?currentHour:row.iso;
    selectedISO=chosenHour;
    const select=get('weatherHourSelect');if(select)select.value=chosenHour;
    const score=outdoorScore(conditionsFromRow(row)),meta=codeMeta(row.code),box=get('weatherHourlySelected');
    if(box)box.innerHTML=`<div class="selected-hour-grid"><div><span>${meta[0]}</span><b>${esc(row.time)}</b><small>${trackCurrent?'მიმდინარე პირობები':'საათობრივი პროგნოზი'} • ${esc(meta[1])}</small></div><div><small>ტემპერატურა</small><b>${fmt(row.temperature,'°C')}</b></div><div><small>წნევა</small><b>${fmt(row.pressure,' hPa')}</b></div><div><small>ქარი</small><b>${fmt(row.wind,' კმ/სთ')}</b></div><div><small>ნალექი</small><b>${fmt(row.precip,' მმ')}</b></div><div><small>ღრუბლიანობა</small><b>${fmt(row.cloud,'%',0)}</b></div><div><small>Outdoor Score</small><b class="selected-score">${score===null?'—':score+'/100'}</b></div></div>`;
    document.querySelectorAll('#weatherHourlyStrip .weather-hour-card').forEach(el=>el.classList.toggle('active',el.dataset.iso===chosenHour));
    renderFactors();
    window.dispatchEvent(new CustomEvent('gn:weatherUpdated',{detail:{data,locationName:activeCity,selectedCurrent:trackCurrent}}));
  }
  function renderHours(){
    const date=data.current.time.slice(0,10),rows=hourlyRows(data,date),select=get('weatherHourSelect'),strip=get('weatherHourlyStrip');
    if(!rows.length)return;
    if(!trackCurrent&&!rows.some(row=>row.iso===selectedISO))trackCurrent=true;
    if(select){select.innerHTML=rows.map(row=>`<option value="${esc(row.iso)}">${esc(row.time)}</option>`).join('');select.onchange=()=>selectRow(select.value);}
    if(strip){strip.innerHTML=rows.map(row=>{const meta=codeMeta(row.code),score=outdoorScore(conditionsFromRow(row));return `<button type="button" class="weather-hour-card" data-iso="${esc(row.iso)}"><small>${esc(row.time)}</small><span>${meta[0]}</span><b>${fmt(row.temperature,'°')}</b><em>${fmt(row.cloud,'%',0)} ☁</em><strong>${score??'—'}</strong></button>`;}).join('');strip.querySelectorAll('button').forEach(button=>button.onclick=()=>selectRow(button.dataset.iso));}
    renderSelected();
  }
  function render(){
    const row=currentWeatherRow(data),meta=codeMeta(row?.code),score=outdoorScore(conditionsFromRow(row));
    set('weatherCity',activeCity);set('weatherIcon',meta[0]);set('weatherTemp',fmt(row?.temperature));set('weatherDesc',meta[1]);set('weatherScore',score??'—');
    set('wFeels',fmt(row?.apparent_temperature,'°C'));set('wPressure',fmt(row?.pressure,' hPa'));set('wHumidity',fmt(row?.humidity,'%',0));set('wWind',fmt(row?.wind,' კმ/სთ'));set('wGust',fmt(row?.gust,' კმ/სთ'));set('wRain',fmt(row?.precip,' მმ'));
    setPressureGauge(row?.pressure,'weatherPressureNeedle','weatherPressureValue','weatherPressureStatus','weatherPressureAdvice');
    const mode=data.__meta?.stale?'ბოლო ხელმისაწვდომი მონაცემი':'მიმდინარე მოდელის მონაცემი';
    set('weatherSourceStatus',`წყარო: ${data.__meta?.source||'Open-Meteo'} • ${mode} • ${data.current.time.replace('T',' ')} (${data.timezone||'ადგილობრივი დრო'})`);
    if(get('gnGoScore')){set('gnGoScore',score??'—');set('gnGoText',score===null?'მონაცემი არ არის საკმარისი.':score>=80?'კარგი პირობებია გარე აქტივობისთვის.':score>=50?'საშუალო პირობებია — შეამოწმე დეტალები.':'რთული პირობებია — გადაამოწმე ამინდი გასვლამდე.');}
    const daily=get('weatherDaily');if(daily)daily.innerHTML=data.daily.time.slice(0,window.GNPremium?.maxForecastDays?.()||1).map((date,i)=>{const d=data.daily,m=codeMeta(d.weather_code?.[i]);return `<article class="daily-card"><b>${esc(fmtDate(date))}</b><div class="dicon">${m[0]}</div><strong>${fmt(d.temperature_2m_max?.[i],'°',0)} / ${fmt(d.temperature_2m_min?.[i],'°',0)}</strong><small>${esc(m[1])}</small><small>💧 ${fmt(d.precipitation_probability_max?.[i],'%',0)}</small><small>💨 ${fmt(d.wind_speed_10m_max?.[i],' კმ/სთ',0)}</small></article>`;}).join('');
    renderHours();
  }
  function clearWeather(message){
    for(const id of ['weatherTemp','weatherScore','wFeels','wPressure','wHumidity','wWind','wGust','wRain','gnGoScore'])set(id,'—');
    set('weatherIcon','—');set('weatherDesc',message);set('weatherSourceStatus','Open-Meteo • მონაცემი მიუწვდომელია');set('gnGoText',message);
    setPressureGauge(null,'weatherPressureNeedle','weatherPressureValue','weatherPressureStatus','weatherPressureAdvice');
    for(const id of ['weatherDaily','weatherHourlyStrip','weatherHourlySelected'])if(get(id))get(id).replaceChildren();
    if(get('weatherHourSelect'))get('weatherHourSelect').replaceChildren();
    if(window.GNLiveFactors)GNLiveFactors.render({data:null,row:null,type:'weather',locationName:activeCity,live:false,error:true});
    window.dispatchEvent(new CustomEvent('gn:weatherUpdated',{detail:{data:null,locationName:activeCity}}));
  }
  async function load(a=activeLat,b=activeLon,name=activeCity,options={}){
    const token=++requestId,changed=a!==activeLat||b!==activeLon;
    activeLat=a;activeLon=b;activeCity=name;
    if(changed){data=null;trackCurrent=true;clearWeather('ამინდის მონაცემები იტვირთება…');set('weatherCity',name);}
    try{
      const result=await openMeteo(a,b,options);if(token!==requestId)return;
      data=result;render();
    }catch(error){
      if(token!==requestId)return;
      if(data){data={...data,__meta:{...data.__meta,stale:true}};render();set('weatherDesc','განახლება ვერ მოხერხდა — ნაჩვენებია ბოლო მონაცემი.');}
      else clearWeather('ამინდის მონაცემები დროებით ვერ ჩაიტვირთა. სცადე განახლება.');
    }
  }
  const controller=window.GNLiveFactors?.bind({liveDefault:true,refresh:options=>load(activeLat,activeLon,activeCity,options)});
  async function search(){
    const input=get('weatherSearch'),results=get('weatherSearchResults'),q=input?.value.trim();if(!q||!results)return;
    const token=++searchId;results.textContent='იტვირთება…';
    try{
      const found=await geocode(q);if(token!==searchId)return;
      results.replaceChildren();
      if(!found.length){results.textContent='ვერ მოიძებნა';return;}
      found.forEach(place=>{const button=document.createElement('button');button.type='button';button.textContent=place.display_name;button.onclick=()=>{if(validCoordinates(place.lat,place.lon)){load(Number(place.lat),Number(place.lon),place.display_name,{force:true});results.replaceChildren();}};results.appendChild(button);});
    }catch{if(token===searchId)results.textContent='ძებნა ვერ შესრულდა. სცადე ხელახლა.';}
  }
  if(get('weatherSearchBtn'))get('weatherSearchBtn').onclick=search;
  if(get('weatherNow'))get('weatherNow').onclick=()=>{trackCurrent=true;renderSelected();load(activeLat,activeLon,activeCity,{force:true});};
  if(get('weatherSearch'))get('weatherSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();search();}};
  if(get('weatherGps'))get('weatherGps').onclick=()=>{
    if(!navigator.geolocation){set('weatherDesc','ამ ბრაუზერში GPS მიუწვდომელია. გამოიყენე ძებნა.');return;}
    navigator.geolocation.getCurrentPosition(position=>load(position.coords.latitude,position.coords.longitude,'ჩემი მდებარეობა',{force:true}),()=>set('weatherDesc','GPS მდებარეობა ვერ მივიღეთ. გამოიყენე ძებნა.'),{timeout:10000,maximumAge:60000});
  };
  window.addEventListener('gn:premium-ready',()=>{if(data)render();});
  await load();
}

setupMenu();

function chanceBand(score){const value=numberOrNull(score);if(value===null)return ['unknown','მონაცემი მიუწვდომელია'];const n=Math.max(0,Math.min(100,Math.round(value)));if(n>=85)return ['excellent','ძალიან კარგი'];if(n>=70)return ['good','კარგი'];if(n>=50)return ['medium','საშუალო'];if(n>=30)return ['weak','სუსტი'];return ['poor','დაბალი'];}
function chanceMarkup(score,label='პირობების ინდექსი'){const value=numberOrNull(score),n=value===null?null:Math.max(0,Math.min(100,Math.round(value))),[cls,text]=chanceBand(n),safeLabel=String(label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return `<div class="gn-chance gn-chance-${cls}"${n===null?'':` data-score="${n}"`}><span class="gn-chance-ring" style="--chance:${n??0}"><b>${n===null?'—':n+'/100'}</b></span><span class="gn-chance-copy"><strong>${safeLabel}</strong><small>${text}</small></span></div>`;}
window.GeoChanceUI={band:chanceBand,markup:chanceMarkup};

window.GeoNatureCommon=Object.assign(window.GeoNatureCommon||{},{scoreWeather,outdoorScore,openMeteo,codeMeta,fmtDate,localDateISO,numberOrNull,zonedDateTime,weatherRowAt,hourlyRows,conditionsFromRow,currentWeatherRow,validCoordinates,weatherObservationTime,weatherLocationFromURL});
