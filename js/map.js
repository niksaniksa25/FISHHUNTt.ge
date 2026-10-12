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
  let mapLive=true,mapRefreshTimer=null,requestSeq=0,followCurrent=true;
  let activeScoreControllers=[],routeSeq=0,routeController=null,searchSeq=0;
  const CACHE_TTL=10*60*1000;

  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function displaySuitabilityScore(raw){return Number.isFinite(raw)?Math.max(0,Math.min(100,Math.round(raw))):null;}
  function scoreClass(score){const n=score;if(!Number.isFinite(n))return 'score-unavailable';if(n>=85)return 'score-excellent';if(n>=70)return 'score-good';if(n>=55)return 'score-mid';if(n>=40)return 'score-low';if(n>=20)return 'score-bad';return 'score-critical'}
  function scoreIcon(score){
    const s=Number.isFinite(score)?Math.round(score):'—';
    return L.divIcon({className:'outdoor-score-marker-wrap',html:`<span class="outdoor-score-marker ${scoreClass(score)}">${s}</span>`,iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-18]});
  }
  function scorePopup(w,score){
    const s=Number.isFinite(score)?Math.round(score):'—';
    const maps=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(w[4]+','+w[5])}`;
    return `<div class="map-score-popup"><div class="popup-score ${scoreClass(score)}">${s}</div><div><b>${esc(w[1])}</b><small>${esc(w[2])} • ${esc(w[3])}</small></div><a href="place-details.html?id=${encodeURIComponent(w[0])}${Number.isFinite(score)?`&score=${encodeURIComponent(s)}`:''}&date=${encodeURIComponent(getMapDate())}&hour=${encodeURIComponent(getMapHour())}">ამ საათის დეტალები →</a><a href="${maps}" target="_blank" rel="noopener">🧭 მარშრუტი Google Maps-ში →</a></div>`;
  }
  function setMapInfo(msg){const el=document.getElementById('mapInfo');if(el)el.textContent=msg}
  function mapClock(){return window.GeoNatureCommon?.zonedDateTime?.('Asia/Tbilisi')||{date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tbilisi'}),hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tbilisi',hour:'2-digit',hourCycle:'h23'}).format(new Date()))};}
  function getMapDate(){return document.getElementById('mapDate')?.value||mapClock().date;}
  function getMapHour(){const value=document.getElementById('mapHour')?.value;return value!==undefined&&value!==null&&value!==''?Number(value):mapClock().hour;}
  function todayTbilisi(){return mapClock().date;}
  function isToday(){return getMapDate()===todayTbilisi();}
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
    window.WATERS.forEach(w=>{const id=String(w[0]);validIds.add(id);const score=scores.has(id)?scores.get(id):null;updateMarker(w,score);});
    for(const [id,item] of waterMarkers){if(!validIds.has(id)){map.removeLayer(item.marker);waterMarkers.delete(id)}}
    setMapInfo(`🗺️ ${waterMarkers.size} სათევზაო ადგილი • ${getMapDate()} • ${String(getMapHour()).padStart(2,'0')}:00`);
  }

  function initMapTimeControls(){
    const d=document.getElementById('mapDate'),h=document.getElementById('mapHour');
    if(!d||!h)return;
    const today=todayTbilisi();
    d.min=today;
    d.max=new Date(Date.now()+7*86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Tbilisi'});
    d.value=today;
    h.innerHTML=Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('');
    h.value=String(mapClock().hour);
    d.onchange=()=>{followCurrent=false;loadWaterScores();};
    h.onchange=()=>{followCurrent=false;loadWaterScores();};
  }

  async function fetchScoresChunk(chunk,date,hour,seq){
    const controller=new AbortController();activeScoreControllers.push(controller);
    const timeout=setTimeout(()=>controller.abort(),15000);
    const latitudes=chunk.map(w=>Number(w[4]).toFixed(5)).join(','),longitudes=chunk.map(w=>Number(w[5]).toFixed(5)).join(',');
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitudes)}&longitude=${encodeURIComponent(longitudes)}&timezone=Asia%2FTbilisi&forecast_days=10&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_gusts_10m,visibility`;
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`Open-Meteo ${response.status}`);
      const data=await response.json(),payloads=Array.isArray(data)?data:[data],scores=new Map();
      const wanted=`${date}T${String(hour).padStart(2,'0')}:00`;
      if(seq!==requestSeq)return scores;
      payloads.forEach((item,index)=>{
        const water=chunk[index];if(!water)return;
        const row=window.GeoNatureCommon?.weatherRowAt?.(item,wanted);if(!row)return;
        const conditions=window.GeoNatureCommon.conditionsFromRow(row),raw=outdoorScore(conditions),score=displaySuitabilityScore(raw);
        if(Number.isFinite(score))scores.set(String(water[0]),score);
      });
      return scores;
    }finally{clearTimeout(timeout);activeScoreControllers=activeScoreControllers.filter(item=>item!==controller);}
  }
  function readScoreCache(key){
    const cached=scoreCache.get(key);if(cached)return cached;
    try{
      const raw=sessionStorage.getItem(`GN_MAP_SCORE_V3_${key}`);if(!raw)return null;
      const parsed=JSON.parse(raw);if(!Number.isFinite(parsed.time)||parsed.time>Date.now()+300000||Date.now()-parsed.time>6*3600000||!Array.isArray(parsed.scores))return null;
      const scores=new Map(parsed.scores.filter(entry=>Array.isArray(entry)&&entry.length===2&&typeof entry[0]==='string'&&Number.isFinite(entry[1])&&entry[1]>=0&&entry[1]<=100));
      return {time:parsed.time,scores};
    }catch{return null;}
  }
  async function loadWaterScores(options={}){
    if(!window.WATERS?.length)return;
    const force=options?.force===true,seq=++requestSeq;
    activeScoreControllers.forEach(controller=>controller.abort());activeScoreControllers=[];
    const date=getMapDate(),hour=getMapHour(),hh=String(hour).padStart(2,'0'),key=`${date}|${hh}`;
    const label=document.getElementById('mapLiveLabel'),refreshBtn=document.getElementById('mapRefresh');
    if(label)label.textContent=`${isToday()?'დღეს':'პროგნოზი'} • ${date} • ${hh}:00`;
    const cached=readScoreCache(key),now=Date.now();
    drawWaterMarkers(cached?.scores||new Map());
    if(cached&&!force&&now-cached.time<CACHE_TTL){
      setMapInfo(`🗺️ ${cached.scores.size}/${window.WATERS.length} ადგილი • მიღებულია ${new Date(cached.time).toLocaleTimeString('ka-GE',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'})} • ${date} ${hh}:00`);return;
    }
    if(refreshBtn)refreshBtn.disabled=true;
    setMapInfo(`🌦️ პირობები იტვირთება • ${date} • ${hh}:00`);
    const valid=window.WATERS.filter(water=>Number.isFinite(+water[4])&&Number.isFinite(+water[5])),chunks=[];
    for(let i=0;i<valid.length;i+=12)chunks.push(valid.slice(i,i+12));
    const fresh=new Map();let failures=0,nextChunk=0;
    const worker=async()=>{
      while(nextChunk<chunks.length&&seq===requestSeq){
        const chunk=chunks[nextChunk++];
        try{const result=await fetchScoresChunk(chunk,date,hour,seq);if(seq!==requestSeq)return;for(const [id,score] of result)fresh.set(id,score);}
        catch(error){if(seq!==requestSeq)return;failures++;}
      }
    };
    try{
      await Promise.all(Array.from({length:Math.min(3,chunks.length)},worker));if(seq!==requestSeq)return;
      if(fresh.size){
        const updatedAt=Date.now();scoreCache.set(key,{time:updatedAt,scores:new Map(fresh)});
        try{sessionStorage.setItem(`GN_MAP_SCORE_V3_${key}`,JSON.stringify({time:updatedAt,scores:[...fresh]}));}catch{}
        drawWaterMarkers(fresh);
        const updateTime=new Date(updatedAt).toLocaleTimeString('ka-GE',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'});
        setMapInfo(`🗺️ ${fresh.size}/${valid.length} ადგილი • მიღებულია ${updateTime} • ${date} ${hh}:00${fresh.size<valid.length?' • — მონაცემი მიუწვდომელია':''}`);
      }else if(cached){
        drawWaterMarkers(cached.scores);setMapInfo(`🗺️ ბოლო შენახული პროგნოზი • ${date} • ${hh}:00 • განახლება ვერ მოხერხდა`);
      }else{
        drawWaterMarkers(new Map());setMapInfo(`🗺️ ${valid.length} ადგილი • ${date} • ${hh}:00 • ამინდის მონაცემი მიუწვდომელია`);
      }
      if(label&&(failures||fresh.size<valid.length))label.textContent=`პროგნოზი • ${date} ${hh}:00 • ${fresh.size?'ნაწილობრივი მონაცემი':cached?'ბოლო შენახული მონაცემი':'მონაცემი მიუწვდომელია'}`;
    }finally{if(seq===requestSeq&&refreshBtn)refreshBtn.disabled=false;}
  }
  function refreshLiveMap(){
    if(followCurrent){const clock=mapClock(),date=document.getElementById('mapDate'),hour=document.getElementById('mapHour');if(date)date.value=clock.date;if(hour)hour.value=String(clock.hour);}
    return loadWaterScores({force:true});
  }
  function syncMapLive(){
    const button=document.getElementById('mapLiveToggle');
    if(button){button.textContent=mapLive?'ავტომატური განახლება: ჩართულია':'ავტომატური განახლება: გამორთულია';button.setAttribute('aria-pressed',String(mapLive));}
    if(mapRefreshTimer)clearInterval(mapRefreshTimer);mapRefreshTimer=null;
    if(mapLive)mapRefreshTimer=setInterval(()=>{if(!document.hidden)refreshLiveMap();},5*60*1000);
  }
  initMapTimeControls();
  drawWaterMarkers(new Map());
  loadWaterScores();

  const refreshBtn=document.getElementById('mapRefresh'),liveBtn=document.getElementById('mapLiveToggle');
  if(refreshBtn)refreshBtn.onclick=()=>refreshLiveMap();
  if(liveBtn)liveBtn.onclick=()=>{mapLive=!mapLive;syncMapLive();if(mapLive)refreshLiveMap()};
  syncMapLive();

  setTimeout(()=>map.invalidateSize(),200);
  window.addEventListener('resize',()=>map.invalidateSize(),{passive:true});

  const params=new URLSearchParams(location.search);
  function haversine(a,b,c,d){const R=6371,rad=Math.PI/180,da=(c-a)*rad,db=(d-b)*rad;const q=Math.sin(da/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(db/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
  function show(lat,lon,name){
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    if(marker)map.removeLayer(marker);
    marker=L.marker([lat,lon]).addTo(map).bindPopup(esc(name||'არჩეული ადგილი')).openPopup();
    map.setView([lat,lon],12);
    setMapInfo(`${name||'არჩეული ადგილი'} • ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    if(routeMode&&userCoords)drawRoute(userCoords,[lat,lon],name);
  }
  async function drawRoute(a,b,name){
    const seq=++routeSeq;if(routeController)routeController.abort();routeController=new AbortController();
    const controller=routeController,timeout=setTimeout(()=>controller.abort(),9000),[aLat,aLon]=a,[bLat,bLon]=b;
    const routeInfo=document.getElementById('routeInfo');
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${aLon},${aLat};${bLon},${bLat}?overview=full&geometries=geojson&steps=false`;
      const response=await fetch(url,{signal:controller.signal}),data=await response.json();
      if(seq!==routeSeq||!routeMode)return;
      const result=data.routes?.[0];if(!response.ok||!result?.geometry||!Number.isFinite(result.distance)||!Number.isFinite(result.duration))throw new Error('route unavailable');
      if(route)map.removeLayer(route);route=L.geoJSON(result.geometry,{style:{color:'#4fd3ff',weight:6,opacity:.9}}).addTo(map);map.fitBounds(route.getBounds(),{padding:[70,70]});
      if(routeInfo)routeInfo.textContent=`${name||'დანიშნულება'} • ${(result.distance/1000).toFixed(1)} კმ • დაახლოებით ${Math.round(result.duration/60)} წთ`;
    }catch(error){
      if(seq!==routeSeq||!routeMode)return;
      if(route)map.removeLayer(route);route=L.polyline([a,b],{color:'#f6c453',weight:4,dashArray:'8 8',opacity:.95}).addTo(map);map.fitBounds(route.getBounds(),{padding:[70,70]});
      if(routeInfo)routeInfo.textContent=`${name||'დანიშნულება'} • პირდაპირი მანძილი ${haversine(aLat,aLon,bLat,bLon).toFixed(1)} კმ • გზის მარშრუტი დროებით მიუწვდომელია`;
    }finally{clearTimeout(timeout);if(routeController===controller)routeController=null;}
  }
  function showNearby(lat,lon){
    const valid=(window.WATERS||[]).filter(w=>Number.isFinite(+w[4])&&Number.isFinite(+w[5]));
    const list=valid.map(w=>({w,d:haversine(lat,lon,+w[4],+w[5])})).sort((a,b)=>a.d-b.d).slice(0,6);
    const box=document.getElementById('mapNearbyList');
    if(box)box.innerHTML=list.length?list.map(x=>`<div style="padding:6px 0"><a href="place-details.html?id=${encodeURIComponent(x.w[0])}"><b>${esc(x.w[1])}</b></a><span> • ${x.d.toFixed(1)} კმ</span></div>`).join(''):'ახლოს მდებარე ადგილი ვერ მოიძებნა.';
    if(list[0])map.setView([+list[0].w[4],+list[0].w[5]],9);
  }
  async function searchMap(q){
    const query=String(q||'').trim();if(!query)return;const seq=++searchSeq;
    try{
      const d=await geocode(query);if(seq!==searchSeq)return;if(d?.[0]){show(+d[0].lat,+d[0].lon,d[0].display_name);return;}
    }catch{}
    if(seq!==searchSeq)return;const ql=query.toLowerCase();
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
  if(clear)clear.onclick=()=>{++routeSeq;if(routeController)routeController.abort();routeController=null;if(route)map.removeLayer(route);route=null;routeMode=false;const el=document.getElementById('routeInfo');if(el)el.textContent='მარშრუტი გასუფთავებულია.'};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mapLive)refreshLiveMap();});
  window.addEventListener('pagehide',()=>{if(mapRefreshTimer)clearInterval(mapRefreshTimer);activeScoreControllers.forEach(controller=>controller.abort());if(routeController)routeController.abort();});
  if(params.get('lat')&&params.get('lon'))show(+params.get('lat'),+params.get('lon'),params.get('name')||'ლოკაცია');
}
