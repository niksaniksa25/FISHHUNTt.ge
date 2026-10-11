const C={0:["☀️","მოწმენდილი"],1:["🌤️","ძირითადად მოწმენდილი"],2:["⛅","ნაწილობრივ მოღრუბლული"],3:["☁️","მოღრუბლული"],45:["🌫️","ნისლი"],48:["🌫️","ნისლი"],51:["🌦️","ჟინჟღლი"],53:["🌦️","ჟინჟღლი"],55:["🌧️","ძლიერი ჟინჟღლი"],61:["🌦️","მსუბუქი წვიმა"],63:["🌧️","წვიმა"],65:["🌧️","ძლიერი წვიმა"],71:["🌨️","მსუბუქი თოვა"],73:["🌨️","თოვა"],75:["❄️","ძლიერი თოვა"],80:["🌦️","წვიმის შხეფები"],81:["🌧️","წვიმის შხეფები"],82:["⛈️","ძლიერი შხეფები"],95:["⛈️","ჭექა-ქუხილი"],96:["⛈️","სეტყვით ჭექა-ქუხილი"],99:["⛈️","ძლიერი ჭექა-ქუხილი"]};
const D=["ჩრდილოეთი","ჩრდილო-აღმოსავლეთი","აღმოსავლეთი","სამხრეთ-აღმოსავლეთი","სამხრეთი","სამხრეთ-დასავლეთი","დასავლეთი","ჩრდილო-დასავლეთი"];
const T={c:c=>C[c]||["🌥️","ცვალებადი ამინდი"],dir:d=>D[Math.round(Number(d||0)/45)%8],time:x=>new Date(x).toLocaleTimeString("ka-GE",{hour:"2-digit",minute:"2-digit"}),date:x=>new Date(x).toLocaleDateString("ka-GE",{weekday:"short",day:"2-digit",month:"short"})};
const $=id=>document.getElementById(id);

async function getWeather(lat,lon){
  const u=new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude",lat);u.searchParams.set("longitude",lon);u.searchParams.set("timezone","auto");u.searchParams.set("forecast_days","7");
  u.searchParams.set("current","temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m");
  u.searchParams.set("hourly","temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,visibility");
  u.searchParams.set("daily","weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max");
  const r=await fetch(u);if(!r.ok)throw new Error("weather request failed");return r.json();
}
async function searchPlaces(name){
  const u=new URL("https://geocoding-api.open-meteo.com/v1/search");u.searchParams.set("name",name);u.searchParams.set("count","8");u.searchParams.set("language","ka");u.searchParams.set("format","json");u.searchParams.set("countryCode","GE");
  const r=await fetch(u);if(!r.ok)throw new Error("search failed");return r.json();
}
function score(c){let s=100,t=+c.temperature_2m||0,w=+c.wind_speed_10m||0,p=+c.precipitation||0;if(t<-8)s-=30;else if(t<1)s-=14;else if(t>36)s-=26;else if(t>31)s-=12;if(w>45)s-=35;else if(w>28)s-=22;else if(w>15)s-=9;if(p>7)s-=35;else if(p>2)s-=18;else if(p>0)s-=6;return Math.max(0,Math.min(100,Math.round(s)))}
function scoreText(s){return s>=85?"ძალიან კარგი პირობები":s>=65?"კარგი პირობები":s>=45?"შერეული პირობები":"რთული პირობები"}
function set(id,value){const e=$(id);if(e)e.textContent=value}

function renderHome(d,city){
  const c=d.current,m=T.c(c.weather_code),s=score(c);set("heroPlace",city);set("heroScore",s);set("heroText",m[1]);set("heroTemp",Math.round(c.temperature_2m)+"°");set("heroWind",Math.round(c.wind_speed_10m)+" კმ/სთ");set("heroRain",Number(c.precipitation).toFixed(1)+" მმ");set("heroHum",Math.round(c.relative_humidity_2m)+"%");set("heroPress",Math.round(c.pressure_msl)+" hPa");set("heroFeels",Math.round(c.apparent_temperature)+"°C");
  [["temp",Math.round(c.temperature_2m)+"°C"],["feelsHome",Math.round(c.apparent_temperature)+"°C"],["pressureHome",Math.round(c.pressure_msl)+" hPa"],["humHome",Math.round(c.relative_humidity_2m)+"%"],["wind",Math.round(c.wind_speed_10m)+" კმ/სთ"],["dirHome",T.dir(c.wind_direction_10m)],["rain",Number(c.precipitation).toFixed(1)+" მმ"],["cloud",Math.round(c.cloud_cover)+"%"]].forEach(x=>set(x[0],x[1]));
}

function renderWeather(d,city){
  const c=d.current,m=T.c(c.weather_code),s=score(c);
  set("place",city);set("icon",m[0]);set("nowTemp",Math.round(c.temperature_2m));set("desc",m[1]);
  const vals={feels:Math.round(c.apparent_temperature)+"°C",hum:Math.round(c.relative_humidity_2m)+"%",press:Math.round(c.pressure_msl)+" hPa",surface:Math.round(c.surface_pressure)+" hPa",ws:Math.round(c.wind_speed_10m)+" კმ/სთ",wd:T.dir(c.wind_direction_10m),gust:Math.round(c.wind_gusts_10m)+" კმ/სთ",pr:Number(c.precipitation).toFixed(1)+" მმ",rain:Number(c.rain).toFixed(1)+" მმ",showers:Number(c.showers).toFixed(1)+" მმ",snow:Number(c.snowfall).toFixed(1)+" სმ",cl:Math.round(c.cloud_cover)+"%",day:c.is_day?"დღე":"ღამე"};
  Object.entries(vals).forEach(([k,v])=>set(k,v));set("score",s);set("scoreText",scoreText(s));const meter=$("meter");if(meter)meter.style.width=s+"%";set("sunrise",T.time(d.daily.sunrise[0]));set("sunset",T.time(d.daily.sunset[0]));set("uv",Number(d.daily.uv_index_max[0]||0).toFixed(1));
  const daily=$("daily");if(daily)daily.innerHTML=d.daily.time.map((x,i)=>{const mm=T.c(d.daily.weather_code[i]);return `<article class="daily"><strong>${T.date(x)}</strong><div class="dicon">${mm[0]}</div><div class="temps">${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°</div><small>${mm[1]}</small><br><small>💧 ${d.daily.precipitation_probability_max[i]||0}%</small><br><small>💨 ${Math.round(d.daily.wind_speed_10m_max[i]||0)} კმ/სთ</small><br><small>☀️ UV ${Number(d.daily.uv_index_max[i]||0).toFixed(1)}</small></article>`}).join("");
  const hourly=$("hourly");if(hourly){let idx=d.hourly.time.findIndex(x=>x>=d.current.time);if(idx<0)idx=0;hourly.innerHTML=d.hourly.time.slice(idx,idx+24).map((x,j)=>{let i=idx+j,mm=T.c(d.hourly.weather_code[i]);return `<article class="hour"><b>${T.time(x)}</b><div class="hicon">${mm[0]}</div><strong>${Math.round(d.hourly.temperature_2m[i])}°C</strong><small>💧 ${d.hourly.precipitation_probability[i]||0}%</small><small>💨 ${Math.round(d.hourly.wind_speed_10m[i]||0)} კმ/სთ</small><small>🎚️ ${Math.round(d.hourly.pressure_msl[i]||0)} hPa</small><small>👁 ${((d.hourly.visibility[i]||0)/1000).toFixed(1)} km</small></article>`}).join("");}
}

async function loadWeather(lat,lon,city){try{const d=await getWeather(lat,lon);if($("nowTemp"))renderWeather(d,city);else renderHome(d,city)}catch(e){console.error(e);const target=$("desc")||$("heroText");if(target)target.textContent="ამინდის მონაცემების მიღება ვერ მოხერხდა."}}

async function tryUserLocation(){
  if(!navigator.geolocation){loadWeather(41.7151,44.8271,"თბილისი");return}
  navigator.geolocation.getCurrentPosition(pos=>loadWeather(pos.coords.latitude,pos.coords.longitude,"ჩემი მდებარეობა"),()=>loadWeather(41.7151,44.8271,"თბილისი"),{enableHighAccuracy:true,timeout:8000,maximumAge:300000});
}

function setupWeatherSearch(){
  const input=$("q"),button=$("search"),results=$("results"),homeBtn=$("tbilisi");if(!input)return;
  async function go(){const text=input.value.trim();if(!text)return;results.textContent="იტვირთება...";try{const d=await searchPlaces(text);results.innerHTML=(d.results||[]).map((x,i)=>`<button class="search-chip" data-i="${i}">${x.name}${x.admin1?', '+x.admin1:''}</button>`).join("")||"<span>ადგილი ვერ მოიძებნა.</span>";results.querySelectorAll(".search-chip").forEach(b=>b.onclick=()=>{const x=d.results[+b.dataset.i];loadWeather(x.latitude,x.longitude,x.name);results.innerHTML=`<span>არჩეულია: ${x.name}</span>`})}catch(e){results.textContent="ძებნა დროებით მიუწვდომელია."}}
  button.onclick=go;input.addEventListener("keydown",e=>{if(e.key==="Enter")go()});homeBtn.onclick=()=>loadWeather(41.7151,44.8271,"თბილისი");
}

const SPECIES=[
["კავკასიური ირემი","ძუძუმწოვარი","🦌","ტყე და მთიანი რეგიონები","დიდი ბალახისმჭამელი, რომლის დაკვირვებაც უსაფრთხო დისტანციიდან არის შესაძლებელი."],["შველი","ძუძუმწოვარი","🦌","ტყე და ტყისპირი","ფრთხილი სახეობა, რომელიც ხშირად უფრო აქტიურია დილით და საღამოს."],["მგელი","ძუძუმწოვარი","🐺","ტყე და მთები","ადაპტირებული მტაცებელი, რომელსაც სივრცე უნდა დაუტოვო."],["მელა","ძუძუმწოვარი","🦊","ტყე, ველები","ფართოდ გავრცელებული მტაცებელი სხვადასხვა გარემოში."],["მურა დათვი","ძუძუმწოვარი","🐻","ტყე და მთები","დიდი გარეული ცხოველია; დაკვირვებისას დიდი დისტანცია მნიშვნელოვანია."],["ფოცხვერი","ძუძუმწოვარი","🐈","ტყე და კლდოვანი ზონა","ფარული ცხოვრების წესის მქონე მტაცებელი."],["ბექობის არწივი","ფრინველი","🦅","ღია ლანდშაფტი","დიდი მტაცებელი ფრინველი; ბუდესთან მიახლოება დაუშვებელია."],["კაკაბი","ფრინველი","🐦","მშრალი კლდოვანი ფერდობები","მიწაზე მცხოვრები ფრინველი."],["ქორი","ფრინველი","🦅","ტყე და ტყისპირი","სწრაფი მტაცებელი სხვადასხვა ჰაბიტატში."],["შაშვი","ფრინველი","🐦","ტყე და ბაღები","პატარა, ადვილად დასაკვირვებელი ფრინველი."],["კავკასიური გველგესლა","ქვეწარმავალი","🐍","მზიანი ფერდობები","ველურ ბუნებაში ნებისმიერ გველს დისტანცია დაუტოვე."],["კუ","ქვეწარმავალი","🐢","მშრალი თბილი ჰაბიტატები","ნელი მოძრაობის სახეობა; არ გადაიყვანო ბუნებიდან."]
];
function initSpecies(){const grid=$("speciesGrid"),input=$("speciesSearch"),type=$("speciesType");if(!grid)return;const render=()=>{let q=(input.value||"").toLowerCase(),t=type.value;grid.innerHTML=SPECIES.filter(s=>(t==="all"||s[1]===t)&&(s[0].toLowerCase().includes(q)||s[3].toLowerCase().includes(q))).map(s=>`<article class="species-card"><div class="species-art">${s[2]}</div><span class="tag">${s[1]}</span><h3>${s[0]}</h3><small>${s[3]}</small><p>${s[4]}</p></article>`).join("")};input.oninput=render;type.onchange=render;render()}


document.addEventListener("DOMContentLoaded",()=>{
  const b=$("menuButton"),n=$("mainNav");if(b&&n)b.onclick=()=>n.classList.toggle("open");
  setupWeatherSearch();initSpecies();
  if($("heroTemp"))tryUserLocation();
  if($("nowTemp"))loadWeather(41.7151,44.8271,"თბილისი");
});

// Live Leaflet map + current weather popups
const MAP_PLACES = [
  {id:'tbilisi',name:'თბილისი',region:'თბილისი',lat:41.7151,lon:44.8271,desc:'საქართველოს დედაქალაქი'},
  {id:'ozurgeti',name:'ოზურგეთი',region:'გურია',lat:41.924,lon:42.006,desc:'გურიის რეგიონი'},
  {id:'batumi',name:'ბათუმი',region:'აჭარა',lat:41.6168,lon:41.6367,desc:'აჭარის სანაპირო'},
  {id:'kutaisi',name:'ქუთაისი',region:'იმერეთი',lat:42.2679,lon:42.6946,desc:'იმერეთის რეგიონი'},
  {id:'borjomi',name:'ბორჯომი',region:'სამცხე-ჯავახეთი',lat:41.8387,lon:43.3793,desc:'ბორჯომის რეგიონი'},
  {id:'lagodekhi',name:'ლაგოდეხი',region:'კახეთი',lat:41.8268,lon:46.2767,desc:'ლაგოდეხის რეგიონი'},
  {id:'vashlovani',name:'ვაშლოვანი',region:'კახეთი',lat:41.1892,lon:46.4105,desc:'ვაშლოვანის დაცული ტერიტორიები'},
  {id:'mtirala',name:'მტირალა',region:'აჭარა',lat:41.684,lon:41.785,desc:'მტირალას ეროვნული პარკი'}
];

async function mapWeatherPopup(lat,lon){
  try{const d=await getWeather(lat,lon),c=d.current,m=T.c(c.weather_code);return `<div class="weather"><b>${m[0]} ${Math.round(c.temperature_2m)}°C</b><br><small>${m[1]} • ${Math.round(c.relative_humidity_2m)}% ტენიანობა</small><br><small>${Math.round(c.wind_speed_10m)} კმ/სთ • ${Math.round(c.pressure_msl)} hPa</small></div>`}catch(e){return `<div class="weather"><small>ამინდის მონაცემები დროებით მიუწვდომელია.</small></div>`}
}

function initLiveMap(){
  const mapEl=$('map'); if(!mapEl || typeof L==='undefined') return;
  const map=L.map('map').setView([42.1,43.7],7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  const markers={};
  const list=$('placeItems');
  const status=$('mapStatus');
  const results=$('mapResults');
  MAP_PLACES.forEach(p=>{
    const marker=L.marker([p.lat,p.lon]).addTo(map);
    marker.bindPopup(`<div class="mapPopup"><b>${p.name}</b><small>${p.region} • ${p.desc}</small><div id="wx-${p.id}"><small>ამინდი იტვირთება...</small></div></div>`);
    marker.on('click',async()=>{const box=document.getElementById(`wx-${p.id}`);if(box)box.innerHTML=await mapWeatherPopup(p.lat,p.lon)});
    markers[p.id]=marker;
  });
  function focus(p){map.setView([p.lat,p.lon],9,{animate:true});markers[p.id].openPopup();}
  list.innerHTML=MAP_PLACES.map(p=>`<div class="placeItem" data-id="${p.id}"><b>${p.name}</b><small>${p.region}</small><small>${p.desc}</small></div>`).join('');
  list.querySelectorAll('.placeItem').forEach(el=>el.onclick=()=>focus(MAP_PLACES.find(p=>p.id===el.dataset.id)));

  const locateBtn=$('locateBtn');
  locateBtn?.addEventListener('click',()=>{
    if(!navigator.geolocation){status.textContent='ბრაუზერი GPS-ს არ უჭერს მხარს.';return}
    status.textContent='მდებარეობა იტვირთება...';
    navigator.geolocation.getCurrentPosition(async pos=>{
      const {latitude,longitude}=pos.coords;
      map.setView([latitude,longitude],13,{animate:true});
      if(window._meMarker) map.removeLayer(window._meMarker);
      window._meMarker=L.circleMarker([latitude,longitude],{radius:9,color:'#b6ef72',fillColor:'#b6ef72',fillOpacity:.8,weight:3}).addTo(map);
      window._meMarker.bindPopup('<b>📍 ჩემი მიმდინარე მდებარეობა</b>').openPopup();
      const w=await mapWeatherPopup(latitude,longitude);status.textContent=`GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;window._meMarker.bindTooltip(w.replace(/<[^>]+>/g,''),{direction:'top'});
    },()=>status.textContent='GPS ნებართვა არ არის გაცემული ან მდებარეობა ვერ მოიძებნა.',{enableHighAccuracy:true,timeout:10000,maximumAge:300000});
  });
  const input=$('mapQ'),btn=$('mapBtn');
  async function search(){const q=input.value.trim();if(!q)return;results.textContent='იტვირთება...';try{const d=await searchPlaces(q);results.innerHTML=(d.results||[]).map((x,i)=>`<button class="chip" data-map-i="${i}">${x.name}${x.admin1?', '+x.admin1:''}</button>`).join('')||'<span>ადგილი ვერ მოიძებნა.</span>';results.querySelectorAll('[data-map-i]').forEach(b=>b.onclick=async()=>{const x=d.results[+b.dataset.mapI];map.setView([x.latitude,x.longitude],11,{animate:true});const tempId='search-'+Date.now();L.marker([x.latitude,x.longitude]).addTo(map).bindPopup(`<div class="mapPopup"><b>${x.name}</b><small>${x.admin1||''}</small><div id="${tempId}"><small>ამინდი იტვირთება...</small></div></div>`).openPopup();const box=document.getElementById(tempId);if(box)box.innerHTML=await mapWeatherPopup(x.latitude,x.longitude);results.innerHTML=`<span>არჩეულია: ${x.name}</span>`})}catch(e){results.textContent='ძებნა დროებით მიუწვდომელია.'}}
  btn?.addEventListener('click',search);input?.addEventListener('keydown',e=>{if(e.key==='Enter')search()});
  status.textContent='Live რუკა მზად არის';
}

document.addEventListener('DOMContentLoaded',()=>{initLiveMap();});
