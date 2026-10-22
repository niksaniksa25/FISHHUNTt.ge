function initGeoMap(){
  if(window.GNMap?.instance)return window.GNMap.instance;
  if(typeof L==='undefined'){
    const info=document.getElementById('mapInfo');
    if(info)info.textContent='რუკა ვერ ჩაიტვირთა. შეამოწმე ინტერნეტი და განაახლე გვერდი.';
    const canvas=document.getElementById('map');
    if(canvas){
      if(canvas.dataset)canvas.dataset.mapEngine='error';
      canvas.innerHTML='<div class="map-engine-error" role="alert"><b>რუკა ვერ ჩაიტვირთა</b><p>შეამოწმე ინტერნეტი და სცადე ხელახლა.</p><button class="btn primary" type="button" id="mapEngineRetry">ხელახლა ცდა</button></div>';
      const retry=document.getElementById('mapEngineRetry');
      if(retry)retry.onclick=()=>location.reload();
    }
    return;
  }
  const canvas=document.getElementById('map');if(canvas?.dataset)canvas.dataset.mapEngine='ready';
  const map=L.map('map',{preferCanvas:true,zoomControl:true}).setView([42.0,43.7],7);
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:18,
    attribution:'© OpenStreetMap contributors',
    updateWhenIdle:true,
    keepBuffer:2
  });
  let loadedTiles=0,failedTiles=0;
  function tileState(state){
    const canvas=document.getElementById('map');
    if(canvas?.dataset)canvas.dataset.mapTiles=state;
    if(typeof CustomEvent==='function')window.dispatchEvent?.(new CustomEvent('gn:map-tiles',{detail:{state}}));
  }
  tiles.on?.('loading',()=>{loadedTiles=0;failedTiles=0;tileState('loading');});
  tiles.on?.('tileload',()=>{loadedTiles++;});
  tiles.on?.('tileerror',()=>{failedTiles++;});
  tiles.on?.('load',()=>tileState(loadedTiles||!failedTiles?'ready':'error'));
  tiles.addTo(map);

  let marker=null,meMarker=null,route=null,userCoords=null,routeMode=false,destination=null;
  const waterMarkers=new Map();
  const scoreCache=new Map();
  let mapLive=true,mapRefreshTimer=null,requestSeq=0,followCurrent=true;
  let activeScoreControllers=[],routeSeq=0,routeController=null,searchSeq=0,locationRequest=null;
  let zooming=false,pendingView=null,viewIntent=0;
  const CACHE_TTL=10*60*1000;

  // Leaflet ignores setView while a CSS zoom transition is running. Keep only
  // the latest requested destination and apply it once the public zoom ends.
  function beginView(){pendingView=null;return ++viewIntent;}
  function flushView(){
    if(zooming||!pendingView)return;
    const next=pendingView;pendingView=null;
    if(next.intent!==viewIntent)return;
    map.stop?.();map.closePopup?.();next.apply();
  }
  function requestView(apply,intent){
    if(intent!==viewIntent)return;
    pendingView={apply,intent};flushView();
  }
  function moveView(coords,zoom,intent,after){
    requestView(()=>{map.setView(coords,zoom,{animate:false});after?.();},intent);
  }
  map.on('zoomstart',()=>{zooming=true;});
  map.on('zoomend',()=>{zooming=false;flushView();});

  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function validCoordinates(lat,lon){
    const scalar=value=>(typeof value==='number'||typeof value==='string')&&String(value).trim()!=='';
    if(!scalar(lat)||!scalar(lon))return false;
    return window.GeoNatureCommon?.validCoordinates?.(lat,lon)??(Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180);
  }
  function locatedWaters(){return (window.WATERS||[]).filter(w=>Array.isArray(w)&&validCoordinates(w[4],w[5]));}
  function displaySuitabilityScore(raw){return Number.isFinite(raw)?Math.max(0,Math.min(100,Math.round(raw))):null;}
  function scoreClass(score){const n=score;if(!Number.isFinite(n))return 'score-unavailable';if(n>=85)return 'score-excellent';if(n>=70)return 'score-good';if(n>=55)return 'score-mid';if(n>=40)return 'score-low';if(n>=20)return 'score-bad';return 'score-critical'}
  function scoreIcon(score){
    const s=Number.isFinite(score)?Math.round(score):'—';
    return L.divIcon({className:'outdoor-score-marker-wrap',html:`<span class="outdoor-score-marker ${scoreClass(score)}">${s}</span>`,iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-18]});
  }
  function scorePopup(w,score){
    const s=Number.isFinite(score)?Math.round(score):'—';
    const maps=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(w[4]+','+w[5])}`;
    const current=followCurrent&&isToday();
    return `<div class="map-score-popup"><div class="popup-score ${scoreClass(score)}">${s}</div><div><b>${esc(w[1])}</b><small>${esc(w[2])} • ${esc(w[3])}</small></div><a href="place-details.html?id=${encodeURIComponent(w[0])}${Number.isFinite(score)?`&score=${encodeURIComponent(s)}`:''}&date=${encodeURIComponent(getMapDate())}${current?'':`&hour=${encodeURIComponent(getMapHour())}`}">${current?'მიმდინარე პირობები':'არჩეული საათის პირობები'} →</a><a href="${maps}" target="_blank" rel="noopener">🧭 მარშრუტი Google Maps-ში →</a></div>`;
  }
  function setMapInfo(msg){const el=document.getElementById('mapInfo');if(el)el.textContent=msg}
  function mapClock(){return window.GeoNatureCommon?.zonedDateTime?.('Asia/Tbilisi')||{date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tbilisi'}),hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tbilisi',hour:'2-digit',hourCycle:'h23'}).format(new Date()))};}
  function getMapDate(){return document.getElementById('mapDate')?.value||mapClock().date;}
  function getMapHour(){const value=document.getElementById('mapHour')?.value;return value!==undefined&&value!==null&&value!==''?Number(value):mapClock().hour;}
  function todayTbilisi(){return mapClock().date;}
  function isToday(){return getMapDate()===todayTbilisi();}
  function updateMarker(w,score){
    if(!validCoordinates(w[4],w[5]))return;
    const id=String(w[0]);
    const lat=Number(w[4]),lon=Number(w[5]);
    let item=waterMarkers.get(id);
    if(!item){
      const mk=L.marker([lat,lon],{icon:scoreIcon(score),title:w[1],riseOnHover:true}).addTo(map);
      item={data:w,marker:mk,score};
      waterMarkers.set(id,item);
      mk.on('click',()=>{if(routeMode)show(Number(item.data[4]),Number(item.data[5]),item.data[1]);});
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
    locatedWaters().forEach(w=>{const id=String(w[0]);validIds.add(id);const score=scores.has(id)?scores.get(id):null;updateMarker(w,score);});
    for(const [id,item] of waterMarkers){if(!validIds.has(id)){map.removeLayer(item.marker);waterMarkers.delete(id)}}
    setMapInfo(`🗺️ ${waterMarkers.size} ადგილი ზუსტი კოორდინატით (ცნობარში ${window.WATERS.length}) • ${getMapDate()} • ${String(getMapHour()).padStart(2,'0')}:00`);
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

  async function fetchScoresChunk(chunk,date,hour,seq,current){
    const controller=new AbortController();activeScoreControllers.push(controller);
    const timeout=setTimeout(()=>controller.abort(),15000);
    const latitudes=chunk.map(w=>Number(w[4]).toFixed(5)).join(','),longitudes=chunk.map(w=>Number(w[5]).toFixed(5)).join(',');
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitudes)}&longitude=${encodeURIComponent(longitudes)}&timezone=Asia%2FTbilisi&forecast_days=10&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_gusts_10m,is_day&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_gusts_10m,visibility,is_day`;
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`Open-Meteo ${response.status}`);
      const data=await response.json(),payloads=Array.isArray(data)?data:[data],scores=new Map();
      const wanted=`${date}T${String(hour).padStart(2,'0')}:00`;
      if(seq!==requestSeq)return scores;
      payloads.forEach((item,index)=>{
        const water=chunk[index];if(!water)return;
        if(current){
          const observed=window.GeoNatureCommon?.weatherObservationTime?.(item);
          if(!Number.isFinite(observed)||Date.now()-observed>90*60*1000||observed-Date.now()>30*60*1000)return;
        }
        const row=current?window.GeoNatureCommon?.currentWeatherRow?.(item):window.GeoNatureCommon?.weatherRowAt?.(item,wanted);if(!row)return;
        const conditions=window.GeoNatureCommon.conditionsFromRow(row),raw=outdoorScore(conditions),score=displaySuitabilityScore(raw);
        if(Number.isFinite(score))scores.set(String(water[0]),score);
      });
      return scores;
    }finally{clearTimeout(timeout);activeScoreControllers=activeScoreControllers.filter(item=>item!==controller);}
  }
  function readScoreCache(key){
    const now=Date.now(),valid=cached=>cached&&Number.isFinite(cached.time)&&cached.time<=now+300000&&now-cached.time<=6*3600000;
    const cached=scoreCache.get(key);if(valid(cached))return cached;if(cached)scoreCache.delete(key);
    try{
      const raw=sessionStorage.getItem(`GN_MAP_SCORE_V4_${key}`);if(!raw)return null;
      const parsed=JSON.parse(raw);if(!valid(parsed)||!Array.isArray(parsed.scores))return null;
      const ids=new Set(locatedWaters().map(w=>String(w[0])));
      const scores=new Map(parsed.scores.filter(entry=>Array.isArray(entry)&&entry.length===2&&ids.has(entry[0])&&Number.isFinite(entry[1])&&entry[1]>=0&&entry[1]<=100));
      return {time:parsed.time,scores};
    }catch{return null;}
  }
  async function loadWaterScores(options={}){
    if(!window.WATERS?.length)return;
    const force=options?.force===true,seq=++requestSeq;
    activeScoreControllers.forEach(controller=>controller.abort());activeScoreControllers=[];
    const date=getMapDate(),hour=getMapHour(),hh=String(hour).padStart(2,'0'),current=followCurrent&&isToday(),key=`${date}|${hh}|${current?'current':'forecast'}`;
    const label=document.getElementById('mapLiveLabel'),refreshBtn=document.getElementById('mapRefresh');
    if(refreshBtn)refreshBtn.disabled=false;
    if(label)label.textContent=`${current?'მიმდინარე პირობები':'პროგნოზი'} • ${date} • ${hh}:00`;
    const cached=readScoreCache(key),now=Date.now();
    const valid=locatedWaters();
    drawWaterMarkers(cached?.scores||new Map());
    if(cached&&!force&&now-cached.time<CACHE_TTL){
      setMapInfo(`🗺️ ${cached.scores.size}/${valid.length} ადგილი • მიღებულია ${new Date(cached.time).toLocaleTimeString('ka-GE',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'})} • ${date} ${hh}:00`);return;
    }
    if(refreshBtn)refreshBtn.disabled=true;
    setMapInfo(`🌦️ პირობები იტვირთება • ${date} • ${hh}:00`);
    const chunks=[];
    for(let i=0;i<valid.length;i+=12)chunks.push(valid.slice(i,i+12));
    const fresh=new Map();let failures=0,nextChunk=0;
    const worker=async()=>{
      while(nextChunk<chunks.length&&seq===requestSeq){
        const chunk=chunks[nextChunk++];
        try{const result=await fetchScoresChunk(chunk,date,hour,seq,current);if(seq!==requestSeq)return;for(const [id,score] of result)fresh.set(id,score);}
        catch(error){if(seq!==requestSeq)return;failures++;}
      }
    };
    try{
      await Promise.all(Array.from({length:Math.min(3,chunks.length)},worker));if(seq!==requestSeq)return;
      if(fresh.size){
        const updatedAt=Date.now();scoreCache.set(key,{time:updatedAt,scores:new Map(fresh)});
        try{sessionStorage.setItem(`GN_MAP_SCORE_V4_${key}`,JSON.stringify({time:updatedAt,scores:[...fresh]}));}catch{}
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
  window.addEventListener('pageshow',()=>map.invalidateSize(),{passive:true});
  if(typeof ResizeObserver==='function'){
    const resize=new ResizeObserver(()=>map.invalidateSize({pan:false}));
    const canvas=document.getElementById('map');if(canvas)resize.observe(canvas);
  }

  const params=new URLSearchParams(location.search);
  function haversine(a,b,c,d){const R=6371,rad=Math.PI/180,da=(c-a)*rad,db=(d-b)*rad;const q=Math.sin(da/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(db/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
  function show(lat,lon,name,intent=beginView()){
    if(intent!==viewIntent)return;
    if(!validCoordinates(lat,lon))return;
    lat=Number(lat);lon=Number(lon);destination={coords:[lat,lon],name:name||'არჩეული ადგილი'};
    if(marker)map.removeLayer(marker);
    marker=L.marker([lat,lon]).addTo(map).bindPopup(esc(name||'არჩეული ადგილი'));
    const selected=marker;
    moveView([lat,lon],12,intent,()=>{if(marker===selected)selected.openPopup();});
    setMapInfo(`${name||'არჩეული ადგილი'} • ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    if(routeMode&&userCoords)drawRoute(userCoords,[lat,lon],name);
  }
  async function drawRoute(a,b,name){
    if(!validCoordinates(a?.[0],a?.[1])||!validCoordinates(b?.[0],b?.[1]))return;
    const seq=++routeSeq,intent=viewIntent;if(routeController)routeController.abort();routeController=new AbortController();
    const controller=routeController,timeout=setTimeout(()=>controller.abort(),9000),[aLat,aLon]=a,[bLat,bLon]=b;
    const routeInfo=document.getElementById('routeInfo');
    if(route)map.removeLayer(route);route=null;
    if(routeInfo)routeInfo.textContent=`${name||'დანიშნულება'} • გზის მარშრუტი იტვირთება…`;
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${aLon},${aLat};${bLon},${bLat}?overview=full&geometries=geojson&steps=false`;
      const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('route unavailable');const data=await response.json();
      if(seq!==routeSeq||!routeMode)return;
      const result=data.routes?.[0],coordinates=result?.geometry?.coordinates;
      if(result?.geometry?.type!=='LineString'||!Array.isArray(coordinates)||coordinates.length<2||!coordinates.every(pair=>Array.isArray(pair)&&validCoordinates(pair[1],pair[0]))||!Number.isFinite(result.distance)||result.distance<0||!Number.isFinite(result.duration)||result.duration<0)throw new Error('route unavailable');
      if(route)map.removeLayer(route);route=L.geoJSON(result.geometry,{style:{color:'#4fd3ff',weight:6,opacity:.9}}).addTo(map);const bounds=route.getBounds();requestView(()=>{if(routeMode&&seq===routeSeq)map.fitBounds(bounds,{padding:[70,70],animate:false});},intent);
      if(routeInfo)routeInfo.textContent=`${name||'დანიშნულება'} • ${(result.distance/1000).toFixed(1)} კმ • დაახლოებით ${Math.round(result.duration/60)} წთ`;
    }catch(error){
      if(seq!==routeSeq||!routeMode)return;
      if(route)map.removeLayer(route);route=L.polyline([a,b],{color:'#f6c453',weight:4,dashArray:'8 8',opacity:.95}).addTo(map);const bounds=route.getBounds();requestView(()=>{if(routeMode&&seq===routeSeq)map.fitBounds(bounds,{padding:[70,70],animate:false});},intent);
      if(routeInfo)routeInfo.textContent=`${name||'დანიშნულება'} • პირდაპირი მანძილი ${haversine(aLat,aLon,bLat,bLon).toFixed(1)} კმ • გზის მარშრუტი დროებით მიუწვდომელია`;
    }finally{clearTimeout(timeout);if(routeController===controller)routeController=null;}
  }
  function showNearby(lat,lon,fromGps=true,intent=beginView()){
    if(intent!==viewIntent)return;
    if(!validCoordinates(lat,lon))return;
    const valid=locatedWaters();
    const list=valid.map(w=>({w,d:haversine(lat,lon,+w[4],+w[5])})).sort((a,b)=>a.d-b.d).slice(0,6);
    const box=document.getElementById('mapNearbyList');
    if(box)box.innerHTML=list.length?list.map(x=>`<div style="padding:6px 0"><a href="place-details.html?id=${encodeURIComponent(x.w[0])}"><b>${esc(x.w[1])}</b></a><span> • ${x.d.toFixed(1)} კმ</span></div>`).join(''):'ახლოს მდებარე ადგილი ვერ მოიძებნა.';
    setMapInfo(fromGps?'📍 ახლომდებარე ადგილები დალაგებულია შენი GPS მდებარეობიდან.':'GPS მიუწვდომელია — მანძილები ითვლება რუკის ცენტრიდან.');
    if(list[0])moveView([+list[0].w[4],+list[0].w[5]],9,intent);
  }
  async function searchMap(q){
    const query=String(q||'').trim(),seq=++searchSeq,intent=beginView();
    const button=document.getElementById('mapSearchBtn');if(button)button.disabled=false;
    if(!query){setMapInfo('ჩაწერე ადგილის, სოფლის ან ქალაქის სახელი.');document.getElementById('mapSearch')?.focus();return;}
    const ql=query.toLowerCase(),matches=(window.WATERS||[]).filter(w=>(`${w[1]} ${w[2]} ${w[3]} ${w[7]||''}`).toLowerCase().includes(ql));
    const exact=matches.filter(w=>String(w[1]).toLowerCase()===ql);
    const named=exact.length?exact:matches.filter(w=>String(w[1]).toLowerCase().includes(ql));
    const local=named.find(w=>validCoordinates(w[4],w[5]));
    if(local){show(Number(local[4]),Number(local[5]),local[1],intent);return;}
    if(button)button.disabled=true;setMapInfo(`🔎 იძებნება: ${query}`);
    try{
      const results=await geocode(query);if(seq!==searchSeq||intent!==viewIntent)return;
      const found=Array.isArray(results)?results.find(item=>validCoordinates(item?.lat,item?.lon)):null;
      if(found){show(Number(found.lat),Number(found.lon),found.display_name,intent);return;}
      setMapInfo(matches.length?'ამ ადგილის ზუსტი კოორდინატები მიუწვდომელია. სცადე ახლომდებარე სოფლის ან ქალაქის სახელი.':'ადგილი ვერ მოიძებნა. სცადე სრული სახელი.');
    }catch{if(seq===searchSeq&&intent===viewIntent)setMapInfo('ძიება დროებით მიუწვდომელია. სცადე სათევზაო ადგილის სახელი ან შეამოწმე ინტერნეტი.');}
    finally{if(seq===searchSeq&&button)button.disabled=false;}
  }
  const searchBtn=document.getElementById('mapSearchBtn');
  if(searchBtn)searchBtn.onclick=()=>searchMap(document.getElementById('mapSearch')?.value);
  const search=document.getElementById('mapSearch');
  if(search){if(!search.getAttribute('aria-label'))search.setAttribute('aria-label','ადგილის ძიება');search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchMap(search.value)}};}
  for(const id of ['mapInfo','routeInfo']){const status=document.getElementById(id);if(status){status.setAttribute('role','status');status.setAttribute('aria-live','polite');}}
  function locate(){
    if(locationRequest)return locationRequest;
    if(!navigator.geolocation)return Promise.reject(new Error('unsupported'));
    for(const id of ['mapGps','mapNearby']){const button=document.getElementById(id);if(button)button.disabled=true;}
    const request=new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>{
      const {latitude,longitude}=position.coords||{};
      if(!validCoordinates(latitude,longitude)){reject(new Error('invalid'));return;}
      userCoords=[Number(latitude),Number(longitude)];
      if(meMarker)map.removeLayer(meMarker);meMarker=L.marker(userCoords).addTo(map).bindPopup('ჩემი მდებარეობა');
      resolve(userCoords);
    },reject,{enableHighAccuracy:false,maximumAge:300000,timeout:9000}));
    locationRequest=request.finally(()=>{locationRequest=null;for(const id of ['mapGps','mapNearby']){const button=document.getElementById(id);if(button)button.disabled=false;}});
    return locationRequest;
  }
  function locationError(error){return error?.message==='unsupported'?'ამ ბრაუზერში GPS ხელმისაწვდომი არ არის. მოძებნე ადგილი სახელით.':error?.code===1?'GPS ნებართვა არ არის გაცემული. ბრაუზერის Location ნებართვა ჩართე.':'GPS მდებარეობა დროებით ვერ მოიძებნა.';}
  const gps=document.getElementById('mapGps');
  if(gps)gps.onclick=async()=>{const intent=beginView();setMapInfo('📍 GPS მდებარეობა იტვირთება…');try{const coords=await locate();moveView(coords,12,intent,()=>{meMarker.openPopup();setMapInfo('📍 GPS მდებარეობა ჩართულია.');if(routeMode&&destination)drawRoute(coords,destination.coords,destination.name);});}catch(error){if(intent===viewIntent)setMapInfo(locationError(error));}};
  const nearby=document.getElementById('mapNearby');
  if(nearby)nearby.onclick=async()=>{const intent=beginView();if(userCoords){showNearby(...userCoords,true,intent);return;}setMapInfo('📍 ახლომდებარე ადგილებისთვის მდებარეობა იტვირთება…');try{const coords=await locate();showNearby(...coords,true,intent);}catch{const center=map.getCenter();showNearby(center.lat,center.lng,false,intent);}};
  const routeBtn=document.getElementById('routeMode');
  if(routeBtn){routeBtn.setAttribute('aria-pressed','false');routeBtn.onclick=async()=>{
    routeMode=true;routeBtn.setAttribute('aria-pressed','true');const seq=routeSeq,el=document.getElementById('routeInfo');
    if(!userCoords){if(el)el.textContent='📍 მარშრუტისთვის GPS მდებარეობა იტვირთება…';try{await locate();}catch(error){if(routeMode&&seq===routeSeq&&el)el.textContent=locationError(error);return;}}
    if(!routeMode||seq!==routeSeq)return;
    if(destination)drawRoute(userCoords,destination.coords,destination.name);else if(el)el.textContent='რუკაზე, ადგილის ნიშნულზე ან ძიებით აირჩიე დანიშნულება.';
  };}
  const clear=document.getElementById('clearRoute');
  if(clear)clear.onclick=()=>{++routeSeq;if(routeController)routeController.abort();routeController=null;if(route)map.removeLayer(route);route=null;routeMode=false;if(routeBtn)routeBtn.setAttribute('aria-pressed','false');const el=document.getElementById('routeInfo');if(el)el.textContent='მარშრუტი გასუფთავებულია.'};
  map.on('click',event=>{if(routeMode&&validCoordinates(event.latlng?.lat,event.latlng?.lng))show(event.latlng.lat,event.latlng.lng,'არჩეული დანიშნულება');});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mapLive)refreshLiveMap();});
  window.addEventListener('pagehide',()=>{if(mapRefreshTimer)clearInterval(mapRefreshTimer);activeScoreControllers.forEach(controller=>controller.abort());if(routeController)routeController.abort();});
  if(validCoordinates(params.get('lat'),params.get('lon')))show(Number(params.get('lat')),Number(params.get('lon')),params.get('name')||'ლოკაცია');
  window.GNMap={instance:map,refresh:refreshLiveMap,redrawTiles:()=>tiles.redraw?.()};
  if(typeof CustomEvent==='function')window.dispatchEvent?.(new CustomEvent('gn:map-ready',{detail:{map}}));
  return map;
}
