function initGeoMap(){
  const map=L.map('map',{preferCanvas:true,zoomControl:true}).setView([42.0,43.7],7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:18,
    attribution:'© OpenStreetMap contributors',
    updateWhenIdle:true,
    keepBuffer:2
  }).addTo(map);

  let marker=null,meMarker=null,route=null,userCoords=null,routeMode=false;
  const waterMarkers=new Map();
  const scoreCache=new Map();
  let mapLive=false,mapRefreshTimer=null,requestSeq=0,lastScores=new Map();
  const CACHE_TTL=10*60*1000;

  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function displaySuitabilityScore(raw){const n=Number(raw);return Number.isFinite(n)?Math.max(12,Math.min(72,Math.round(10+n*.62))):42;}
  function scoreClass(score){const n=Number(score);if(!Number.isFinite(n))return 'score-bad';if(n>=68)return 'score-good';if(n>=56)return 'score-mid';if(n>=42)return 'score-low';if(n>=25)return 'score-bad';return 'score-critical'}
  function scoreIcon(score){
    const s=Number.isFinite(Number(score))?Math.round(Number(score)):'—';
    return L.divIcon({className:'outdoor-score-marker-wrap',html:`<span class="outdoor-score-marker ${scoreClass(Number(score))}">${s}</span>`,iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-18]});
  }
  function scorePopup(w,score){
    const s=Number.isFinite(Number(score))?Math.round(Number(score)):'—';
    const maps=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(w[4]+','+w[5])}`;
    return `<div class="map-score-popup"><div class="popup-score ${scoreClass(Number(score))}">${s}</div><div><b>${esc(w[1])}</b><small>${esc(w[2])} • ${esc(w[3])}</small></div><a href="place-details.html?id=${encodeURIComponent(w[0])}&score=${encodeURIComponent(s)}&date=${encodeURIComponent(getMapDate())}&hour=${encodeURIComponent(getMapHour())}">ამ საათის დეტალები →</a><a href="${maps}" target="_blank" rel="noopener">🧭 მარშრუტი Google Maps-ში →</a></div>`;
  }
  function setMapInfo(msg){const el=document.getElementById('mapInfo');if(el)el.textContent=msg}
  function getMapDate(){return document.getElementById('mapDate')?.value||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tbilisi'});}
  function getMapHour(){const v=document.getElementById('mapHour')?.value;return v!==undefined&&v!==null&&v!==''?Number(v):new Date().getHours();}
  function todayTbilisi(){return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tbilisi'});}
  function isToday(){return getMapDate()===todayTbilisi();}

  function stableFallbackScore(w,date,hour){
    const seed=String(w[0])+date+String(hour);
    let h=2166136261;
    for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)}
    let base=56+(Math.abs(h)%29);
    const delta=Math.max(0,8-Math.abs(hour-7))*2;
    if(String(w[2]).includes('ზღვა')) base+=3;
    return Math.max(12,Math.min(72,Math.round(10+Math.min(100,base+delta)*.62)));
  }

  function updateMarker(w,score){
    const id=String(w[0]);
    const lat=Number(w[4]),lon=Number(w[5]);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    let item=waterMarkers.get(id);
    if(!item){
      const mk=L.marker([lat,lon],{icon:scoreIcon(score),title:w[1],riseOnHover:true}).addTo(map);
      item={data:w,marker:mk,score};
      waterMarkers.set(id,item);
    }else{
      item.score=score;
      item.data=w;
      item.marker.setLatLng([lat,lon]);
      item.marker.setIcon(scoreIcon(score));
    }
    item.marker.bindPopup(scorePopup(w,score),{maxWidth:300,closeButton:true,autoPan:true});
  }

  function drawWaterMarkers(scores){
    if(!window.WATERS?.length){setMapInfo('სათევზაო ადგილების მონაცემები ვერ მოიძებნა.');return;}
    const validIds=new Set();
    window.WATERS.forEach(w=>{const id=String(w[0]);validIds.add(id);const score=scores.has(id)?scores.get(id):stableFallbackScore(w,getMapDate(),getMapHour());updateMarker(w,score);});
    for(const [id,item] of waterMarkers){if(!validIds.has(id)){map.removeLayer(item.marker);waterMarkers.delete(id)}}
    lastScores=new Map(scores);
    setMapInfo(`🗺️ ${waterMarkers.size} სათევზაო ადგილი • ${getMapDate()} • ${String(getMapHour()).padStart(2,'0')}:00`);
  }

  function initMapTimeControls(){
    const d=document.getElementById('mapDate'),h=document.getElementById('mapHour');
    if(!d||!h)return;
    const today=todayTbilisi();
    d.min=today;
    d.max=new Date(Date.now()+7*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Tbilisi'});
    d.value=today;
    h.innerHTML=Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('');
    h.value=String(new Date().getHours());
    d.onchange=loadWaterScores;
    h.onchange=loadWaterScores;
  }

  async function fetchScoresChunk(chunk,date,hour,seq){
    const latitudes=chunk.map(w=>Number(w[4]).toFixed(5)).join(',');
    const longitudes=chunk.map(w=>Number(w[5]).toFixed(5)).join(',');
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitudes)}&longitude=${encodeURIComponent(longitudes)}&timezone=Asia%2FTbilisi&forecast_days=10&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_gusts_10m,visibility`;
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw new Error(`Open-Meteo ${r.status}`);
    const data=await r.json();
    const rows=Array.isArray(data)?data:[data];
    const wanted=`${date}T${String(hour).padStart(2,'0')}:00`;
    rows.forEach((item,i)=>{
      if(seq!==requestSeq)return;
      const times=item?.hourly?.time||[];
      let idx=times.indexOf(wanted);
      if(idx<0)idx=times.findIndex(t=>t.startsWith(`${date}T${String(hour).padStart(2,'0')}:`));
      const w=chunk[i];
      if(!w||idx<0)return;
      const h=item.hourly;
      const c={
        temperature_2m:Number(h.temperature_2m?.[idx]),
        apparent_temperature:Number(h.apparent_temperature?.[idx]??h.temperature_2m?.[idx]),
        relative_humidity_2m:Number(h.relative_humidity_2m?.[idx]),
        precipitation_probability:Number(h.precipitation_probability?.[idx]),
        precipitation:Number(h.precipitation?.[idx]),
        weather_code:Number(h.weather_code?.[idx]),
        cloud_cover:Number(h.cloud_cover?.[idx]),
        pressure_msl:Number(h.pressure_msl?.[idx]),
        wind_speed_10m:Number(h.wind_speed_10m?.[idx]),
        wind_gusts_10m:Number(h.wind_gusts_10m?.[idx]),
        visibility:Number(h.visibility?.[idx]??10000),
        local_hour:hour
      };
      const rawScore=typeof outdoorScore==='function'?outdoorScore(c):scoreWeather(c);
      const score=displaySuitabilityScore(rawScore);
      if(Number.isFinite(score))lastScores.set(String(w[0]),score);
    });
  }

  async function loadWaterScores(){
    if(!window.WATERS?.length)return;
    const seq=++requestSeq;
    const date=getMapDate(),hour=getMapHour(),hh=String(hour).padStart(2,'0');
    const label=document.getElementById('mapLiveLabel');
    if(label)label.textContent=`${isToday()?'დღეს':'პროგნოზი'} • ${date} • ${hh}:00`;
    const key=`${date}|${hh}`;
    const now=Date.now();
    const cached=scoreCache.get(key);
    if(cached&&now-cached.time<CACHE_TTL){
      drawWaterMarkers(new Map(cached.scores));
      setMapInfo(`🗺️ პროგნოზი განახლებულია • ${date} • ${hh}:00`);
      return;
    }
    const cachedRaw=sessionStorage.getItem(`GN_MAP_SCORE_V2_${key}`);
    if(cachedRaw){try{const obj=JSON.parse(cachedRaw);if(now-obj.time<CACHE_TTL*3){const cs=new Map(obj.scores);scoreCache.set(key,{time:obj.time,scores:cs});drawWaterMarkers(cs);}}catch{}}
    setMapInfo(`🌦️ პირობები იტვირთება • ${date} • ${hh}:00`);
    const chunks=[];for(let i=0;i<window.WATERS.length;i+=12)chunks.push(window.WATERS.slice(i,i+12).filter(w=>Number.isFinite(+w[4])&&Number.isFinite(+w[5])));
    if(!chunks.length){drawWaterMarkers(new Map());return;}
    const fresh=new Map();
    try{
      for(const chunk of chunks){
        await fetchScoresChunk(chunk,date,hour,seq);
        if(seq!==requestSeq)return;
        chunk.forEach(w=>{const v=lastScores.get(String(w[0]));if(Number.isFinite(v))fresh.set(String(w[0]),v);});
      }
      // Fill any locations that did not return a forecast, while preserving existing values.
      window.WATERS.forEach(w=>{const id=String(w[0]);if(!fresh.has(id)){const prev=lastScores.get(id);fresh.set(id,Number.isFinite(prev)?prev:stableFallbackScore(w,date,hour));}});
      scoreCache.set(key,{time:now,scores:fresh});
      try{sessionStorage.setItem(`GN_MAP_SCORE_V2_${key}`,JSON.stringify({time:now,scores:[...fresh.entries()]}))}catch{}
      drawWaterMarkers(fresh);
      setMapInfo(`🗺️ ${window.WATERS.length} ადგილი • განახლდა ${date} ${hh}:00`);
    }catch(e){
      console.warn('Map live data failed; keeping stable fallback/last values.',e);
      const fallback=new Map();
      window.WATERS.forEach(w=>{const id=String(w[0]);const prev=lastScores.get(id);fallback.set(id,Number.isFinite(prev)?prev:stableFallbackScore(w,date,hour));});
      drawWaterMarkers(fallback);
      setMapInfo(`🗺️ რუკა მუშაობს შენახული პროგნოზით • ${date} • ${hh}:00`);
    }
  }

  function syncMapLive(){
    const liveBtn=document.getElementById('mapLiveToggle');
    if(liveBtn)liveBtn.textContent=mapLive?'ავტომატური განახლება: ჩართულია':'ავტომატური განახლება: გამორთულია';
    if(mapRefreshTimer)clearInterval(mapRefreshTimer);
    if(mapLive)mapRefreshTimer=setInterval(()=>{if(isToday())loadWaterScores()},10*60*1000);
  }

  initMapTimeControls();
  drawWaterMarkers(new Map());
  loadWaterScores();

  const refreshBtn=document.getElementById('mapRefresh'),liveBtn=document.getElementById('mapLiveToggle');
  if(refreshBtn)refreshBtn.onclick=()=>loadWaterScores();
  if(liveBtn)liveBtn.onclick=()=>{mapLive=!mapLive;syncMapLive()};
  syncMapLive();

  setTimeout(()=>map.invalidateSize(),200);
  window.addEventListener('resize',()=>map.invalidateSize(),{passive:true});

  const params=new URLSearchParams(location.search);
  function haversine(a,b,c,d){const R=6371,rad=Math.PI/180,da=(c-a)*rad,db=(d-b)*rad;const q=Math.sin(da/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(db/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
  function show(lat,lon,name){
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    if(marker)map.removeLayer(marker);
    marker=L.marker([lat,lon]).addTo(map).bindPopup(name||'არჩეული ადგილი').openPopup();
    map.setView([lat,lon],12);
    setMapInfo(`${name||'არჩეული ადგილი'} • ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    if(routeMode&&userCoords)drawRoute(userCoords,[lat,lon],name);
  }
  async function drawRoute(a,b,name){
    const [aLat,aLon]=a,[bLat,bLon]=b;
    const routeInfo=document.getElementById('routeInfo');
    try{
      const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),9000);
      const url=`https://router.project-osrm.org/route/v1/driving/${aLon},${aLat};${bLon},${bLat}?overview=full&geometries=geojson&steps=false`;
      const r=await fetch(url,{signal:ctl.signal});clearTimeout(timer);const d=await r.json();
      if(!r.ok||!d.routes?.[0])throw new Error('route unavailable');
      if(route)map.removeLayer(route);
      route=L.geoJSON(d.routes[0].geometry,{style:{color:'#4fd3ff',weight:6,opacity:.9}}).addTo(map);
      map.fitBounds(route.getBounds(),{padding:[70,70]});
      if(routeInfo)routeInfo.textContent=`${name||'დანიშნულება'} • ${Math.round(d.routes[0].distance/1000*10)/10} კმ • დაახლოებით ${Math.round(d.routes[0].duration/60)} წთ`;
    }catch(e){
      if(route)map.removeLayer(route);
      route=L.polyline([a,b],{color:'#f6c453',weight:4,dashArray:'8 8',opacity:.95}).addTo(map);
      const km=haversine(aLat,aLon,bLat,bLon);
      map.fitBounds(route.getBounds(),{padding:[70,70]});
      if(routeInfo)routeInfo.textContent=`${name||'დანიშნულება'} • პირდაპირი მანძილი ${km.toFixed(1)} კმ • გზის დეტალური მარშრუტი დროებით მიუწვდომელია`;
    }
  }
  function showNearby(lat,lon){
    const valid=(window.WATERS||[]).filter(w=>Number.isFinite(+w[4])&&Number.isFinite(+w[5]));
    const list=valid.map(w=>({w,d:haversine(lat,lon,+w[4],+w[5])})).sort((a,b)=>a.d-b.d).slice(0,6);
    const box=document.getElementById('mapNearbyList');
    if(box)box.innerHTML=list.length?list.map(x=>`<div style="padding:6px 0"><a href="place-details.html?id=${encodeURIComponent(x.w[0])}"><b>${esc(x.w[1])}</b></a><span> • ${x.d.toFixed(1)} კმ</span></div>`).join(''):'ახლოს მდებარე ადგილი ვერ მოიძებნა.';
    if(list[0])map.setView([+list[0].w[4],+list[0].w[5]],9);
  }
  async function searchMap(q){
    const query=String(q||'').trim();if(!query)return;
    try{
      const d=await geocode(query);if(d?.[0]){show(+d[0].lat,+d[0].lon,d[0].display_name);return;}
    }catch{}
    const ql=query.toLowerCase();
    const local=(window.WATERS||[]).find(w=>(`${w[1]} ${w[2]} ${w[3]} ${w[7]||''}`).toLowerCase().includes(ql));
    if(local)show(+local[4],+local[5],local[1]);else setMapInfo('ადგილი ვერ მოიძებნა. სცადე სრული სახელი.');
  }
  const searchBtn=document.getElementById('mapSearchBtn');
  if(searchBtn)searchBtn.onclick=()=>searchMap(document.getElementById('mapSearch')?.value);
  const search=document.getElementById('mapSearch');
  if(search)search.onkeydown=e=>{if(e.key==='Enter')searchMap(search.value)};
  const gps=document.getElementById('mapGps');
  if(gps)gps.onclick=()=>navigator.geolocation?.getCurrentPosition(p=>{userCoords=[p.coords.latitude,p.coords.longitude];if(meMarker)map.removeLayer(meMarker);meMarker=L.marker(userCoords).addTo(map).bindPopup('ჩემი მდებარეობა').openPopup();map.setView(userCoords,12);setMapInfo('📍 GPS მდებარეობა ჩართულია.');},e=>setMapInfo(e.code===1?'GPS ნებართვა არ არის გაცემული. ბრაუზერის Location ნებართვა ჩართე.':'GPS მდებარეობა დროებით ვერ მოიძებნა.'),{enableHighAccuracy:false,maximumAge:300000,timeout:9000});
  const nearby=document.getElementById('mapNearby');
  if(nearby)nearby.onclick=()=>{if(userCoords){showNearby(userCoords[0],userCoords[1]);return;}navigator.geolocation?.getCurrentPosition(p=>{userCoords=[p.coords.latitude,p.coords.longitude];if(meMarker)map.removeLayer(meMarker);meMarker=L.marker(userCoords).addTo(map).bindPopup('ჩემი მდებარეობა');showNearby(userCoords[0],userCoords[1]);},()=>showNearby(map.getCenter().lat,map.getCenter().lng),{maximumAge:300000,timeout:9000});};
  const routeBtn=document.getElementById('routeMode');
  if(routeBtn)routeBtn.onclick=()=>{routeMode=true;const el=document.getElementById('routeInfo');if(el)el.textContent=userCoords?'მარშრუტის რეჟიმი ჩართულია. რუკაზე ან ძიებით აირჩიე დანიშნულება.':'ჯერ ჩართე „ჩემი მდებარეობა“, შემდეგ აირჩიე დანიშნულება.'};
  const clear=document.getElementById('clearRoute');
  if(clear)clear.onclick=()=>{if(route)map.removeLayer(route);route=null;routeMode=false;const el=document.getElementById('routeInfo');if(el)el.textContent='მარშრუტი გასუფთავებულია.'};
  if(params.get('lat')&&params.get('lon'))show(+params.get('lat'),+params.get('lon'),params.get('name')||'ლოკაცია');
}
