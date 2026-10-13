(function(){
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Math.round(n)));
  const numeric=value=>window.GeoNatureCommon?.numberOrNull?window.GeoNatureCommon.numberOrNull(value):(value===null||value===undefined||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null);
  const scoreText=score=>score===null||score===undefined?'—':`${score}/100`;
  function placeScore(w,c){
    const ids=String(w[6]||'').split(',').map(id=>id.trim()).filter(Boolean),aliases={zander:'pikeperch',whiteamur:'grasscarp'};
    const fish=[...new Set(ids.map(id=>(window.FISHES||[]).find(f=>f[0]===id||f[0]===aliases[id])).filter(Boolean))];
    const scores=fish.map(f=>GeoFishChance(f,c,w)).filter(score=>score!==null);
    if(!scores.length)return null;
    return clamp(scores.reduce((sum,score)=>sum+score,0)/scores.length);
  }
  function chanceHtml(score,label){return window.GeoChanceUI?.markup?window.GeoChanceUI.markup(score,label):`<span class="catalog-chance">${scoreText(score)}</span>`;}
  function fishCard(f,score,i){const img=window.GeoImage?.placeholder?GeoImage.placeholder(f[1],'fish'):'';return `<article class="fg-card fg-clickable" tabindex="0" data-fish="${esc(f[0])}"><div class="fg-card-image-wrap"><img class="fg-card-image" loading="lazy" src="${img}" alt="${esc(f[1])}"><span class="fg-rank">${score===null?'ინფორმაცია':'TOP '+(i+1)}</span><span class="fg-image-score">პირობების ინდექსი ${scoreText(score)}</span></div><div class="fg-card-body"><div class="fg-top"><div><h3>${esc(f[1])}</h3><div class="fg-sub">${esc(f[2])} • ${esc(f[3])}</div></div>${chanceHtml(score,'პირობების ინდექსი')}</div><div class="fg-bar"><span style="width:${score??0}%"></span></div><div class="fg-meta"><div><small>აქტიურობა</small><b>${esc(f[10])}</b></div><div><small>სასურველი წყლის ტემპ.</small><b>${esc(f[7])}</b></div></div></div></article>`;}
  function placeCard(w,score,i,entry={}){const fish=(w[6]||'').split(',').map(id=>(window.FISHES||[]).find(f=>f[0]===id)?.[1]).filter(Boolean).slice(0,5);const img=window.GeoImage?.placeholder?GeoImage.placeholder(`${w[1]} • ${w[3]}`,w[2]==='მდინარე'||w[2]==='ზღვა'?'water':'nature'):'';return `<article class="fg-card fg-location-card fg-clickable" tabindex="0" data-place="${esc(w[0])}"><div class="fg-card-image-wrap"><img class="fg-card-image fg-place-image" loading="lazy" src="${img}" alt="${esc(w[1])}"><span class="fg-rank">${score===null?'ინფორმაცია':'TOP '+(i+1)}</span><span class="fg-image-score">პირობების ინდექსი ${scoreText(score)}</span></div><div class="fg-card-body"><div class="fg-top"><div><div class="fg-sub">${esc(w[2])} • ${esc(w[3])}</div><h3>${esc(w[1])}</h3></div>${chanceHtml(score,'პირობების ინდექსი')}</div><p class="fg-desc">${esc(w[7]||'საინფორმაციო სათევზაო ლოკაცია')}</p><div class="fg-tag-row">${fish.map(x=>`<span class="fg-tag">🐟 ${esc(x)}</span>`).join('')}</div>${destinationWeatherControl(w,entry,'fishing')}<div class="fg-card-link">დეტალური ინფორმაცია →</div></div></article>`;}
  function huntPlaceScore(p,c){return window.outdoorScore?window.outdoorScore(c):null;}
  function huntPlaceCard(p,score,i,entry={}){const img=window.GeoImage?.placeholder?GeoImage.placeholder(`${p[1]} • ${p[3]}`,'nature'):'';const species=String(p[6]||'').split(',').slice(0,5);return `<article class="fg-card fg-hunt-place fg-clickable" tabindex="0" data-hunt-place="${esc(p[0])}"><div class="fg-card-image-wrap"><img class="fg-card-image fg-hunt-place-image" loading="lazy" src="${img}" alt="${esc(p[1])}"><span class="fg-rank">${score===null?'ინფორმაცია':'TOP '+(i+1)}</span><span class="fg-image-score">გარე პირობები ${scoreText(score)}</span></div><div class="fg-card-body"><div class="fg-top"><div><div class="fg-sub">${esc(p[2])} • ${esc(p[3])}</div><h3>${esc(p[1])}</h3></div>${chanceHtml(score,'გარე პირობები')}</div><p class="fg-desc">${esc(p[7])}</p><div class="fg-tag-row">${species.map(x=>`<span class="fg-tag">🦌 ${esc(x)}</span>`).join('')}</div>${destinationWeatherControl(p,entry,'hunting')}<div class="fg-card-link">ნადირობის ცენტრში გახსნა →</div></div></article>`;}
  function animalCard(x,score,i){const kind=x[0]==='bird'?'ფრინველი':x[0]==='mammal'?'ცხოველი':'ქვეწარმავალი';const img=window.GeoImage?.placeholder?GeoImage.placeholder(x[1],x[0]==='bird'?'bird':x[0]==='mammal'?'animal':'nature'):'';return `<article class="fg-card fg-clickable" tabindex="0" data-species="${esc(x[1])}"><div class="fg-card-image-wrap"><img class="fg-card-image" loading="lazy" src="${img}" alt="${esc(x[1])}"><span class="fg-rank">${score===null?'ინფორმაცია':'TOP '+(i+1)}</span><span class="fg-image-score">აქტიურობა ${scoreText(score)}</span></div><div class="fg-card-body"><div class="fg-top"><div><h3>${esc(x[1])}</h3><div class="fg-sub">${esc(x[2])} • ${esc(kind)}</div></div>${chanceHtml(score,'ტიპური აქტიურობა')}</div><div class="fg-bar"><span style="width:${score??0}%"></span></div><div class="fg-meta"><div><small>აქტიური პერიოდი</small><b>${esc(x[8])}</b></div><div><small>სეზონი</small><b>${esc(x[7])}</b></div></div></div></article>`;}
  function currentCondition(data){const current=data?.current;return current?{...current,local_hour:numeric(String(current.time||'').slice(11,13))}:{};}
  async function getWeather(options={}){
    let lat=41.7151,lon=44.8271,label='თბილისი';
    try{
      if(navigator.geolocation){const pos=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(resolve,()=>resolve(null),{timeout:2500,maximumAge:300000}));if(pos?.coords&&window.GeoNatureCommon.validCoordinates(pos.coords.latitude,pos.coords.longitude)){lat=pos.coords.latitude;lon=pos.coords.longitude;label='ჩემი მდებარეობა';}}
      const data=await openMeteo(lat,lon,options);return {weather:currentCondition(data),label,data};
    }catch(error){return {weather:{},label:`${label} • ამინდი მიუწვდომელია`,data:null};}
  }
  function hasCoordinates(item){return !!item&&window.GeoNatureCommon.validCoordinates(item[4],item[5]);}
  function destinationWeatherControl(place,entry,kind){
    if(!hasCoordinates(place))return '<small class="muted">ზუსტი კოორდინატები და ადგილობრივი ამინდი მიუწვდომელია.</small>';
    const context=entry.weatherTime?`<small class="muted">${esc(entry.weatherTime.replace('T',' '))} • ${entry.stale?'ბოლო ხელმისაწვდომი მოდელური ამინდი':'Open-Meteo მოდელური ამინდი'}</small>`:'';
    return context+`<button type="button" class="btn ghost" data-destination-weather="${esc(place[0])}" data-destination-kind="${kind}" ${entry.loading?'disabled':''}>${entry.loading?'პირობები იტვირთება…':'↻ ამ ადგილის პირობების ნახვა'}</button>`;
  }
  async function loadDestination(entry,kind){
    const place=entry.w||entry.p;if(entry.loading||!hasCoordinates(place))return;
    entry.loading=true;
    if(kind==='fishing')renderPlaces();else renderHuntPlaces();
    try{const data=await openMeteo(place[4],place[5]);entry.score=kind==='fishing'?placeScore(place,currentCondition(data)):huntPlaceScore(place,currentCondition(data));entry.stale=!!data.__meta?.stale;entry.weatherTime=data.current?.time;}
    catch(error){entry.score=null;entry.weatherTime=null;}
    entry.loading=false;
    const entries=kind==='fishing'?allPlaces:allHuntPlaces;entries.sort((a,b)=>(b.score??-1)-(a.score??-1));
    if(kind==='fishing')renderPlaces();else renderHuntPlaces();
  }
  function bindDestinationWeather(){document.querySelectorAll('[data-destination-weather]').forEach(button=>{button.onclick=event=>{event.stopPropagation();const kind=button.dataset.destinationKind,entries=kind==='fishing'?allPlaces:allHuntPlaces,entry=entries.find(item=>(item.w||item.p)[0]===button.dataset.destinationWeather);if(entry)loadDestination(entry,kind);};button.onkeydown=event=>event.stopPropagation();});}
  let guideImageObserver=null;
  const guideImageLoaders=new WeakMap();
  function bindImages(){
    guideImageObserver?.disconnect();guideImageObserver=null;
    const load=img=>{const loader=guideImageLoaders.get(img);if(!loader||!img.isConnected||img.dataset.imageRequested)return;img.dataset.imageRequested='true';loader().then(src=>{if(img.isConnected&&src)img.src=src;}).catch(()=>{});};
    if(typeof window.IntersectionObserver==='function')guideImageObserver=new window.IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;guideImageObserver.unobserve(entry.target);load(entry.target);}},{rootMargin:'300px'});
    document.querySelectorAll('.fg-card-image').forEach(img=>{
      img.decoding='async';
      const card=img.closest('.fg-clickable');if(!card)return;
      const d=card.dataset;let loader;
      if(d.place){const w=(window.WATERS||[]).find(v=>v[0]===d.place);if(w)loader=()=>GeoImage.resolvePlaceImage(w[1],w[3],w[2]);}
      else if(d.huntPlace){const p=(window.HUNT_PLACES||[]).find(v=>v[0]===d.huntPlace);if(p)loader=()=>GeoImage.resolveNatureImage(p[1],p[1]);}
      else if(d.fish){const f=(window.FISHES||[]).find(v=>v[0]===d.fish);if(f)loader=()=>GeoImage.resolveSpeciesImage(f[1],f[11],f[2]);}
      else if(d.species){const x=(typeof WILDLIFE!=='undefined'?WILDLIFE:[]).find(v=>v[1]===d.species);if(x)loader=()=>GeoImage.resolveSpeciesImage(x[1],x[3],x[2]);}
      if(!loader||img.dataset.imageRequested)return;guideImageLoaders.set(img,loader);
      if(guideImageObserver)guideImageObserver.observe(img);else load(img);
    });
  }
  function bindClicks(){document.querySelectorAll('#fgPlaceGrid .fg-clickable').forEach(c=>{const entry=allPlaces.find(v=>v.w[0]===c.dataset.place),go=()=>location.href=`place-details.html?id=${encodeURIComponent(c.dataset.place)}${entry?.score===null||entry?.score===undefined?'':'&chance='+encodeURIComponent(entry.score)}`;c.onclick=go;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});document.querySelectorAll('#fgFishGrid .fg-clickable').forEach(c=>{const f=(window.FISHES||[]).find(v=>v[0]===c.dataset.fish),entry=allFish.find(v=>v.f[0]===c.dataset.fish),go=()=>location.href=`species.html?id=${encodeURIComponent(f?.[2]||f?.[1]||c.dataset.fish)}${entry?.score===null||entry?.score===undefined?'':'&chance='+encodeURIComponent(entry.score)}`;c.onclick=go;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});document.querySelectorAll('#fgAnimalGrid .fg-clickable').forEach(c=>{const entry=allAnimals.find(v=>v.x[1]===c.dataset.species),go=()=>location.href=`species.html?id=${encodeURIComponent(c.dataset.species)}${entry?.score===null||entry?.score===undefined?'':'&chance='+encodeURIComponent(entry.score)}`;c.onclick=go;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});document.querySelectorAll('#fgHuntPlaceGrid .fg-clickable').forEach(c=>{const p=(window.HUNT_PLACES||[]).find(v=>v[0]===c.dataset.huntPlace),go=()=>location.href=`hunting.html?region=${encodeURIComponent(p?.[8]||p?.[3]||'თბილისი')}`;c.onclick=go;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});}
  let allPlaces=[],allFish=[],allAnimals=[];
  let allHuntPlaces=[];
  function renderHuntPlaces(){const q=(document.getElementById('fgHuntPlaceSearch')?.value||'').trim().toLowerCase(),type=document.getElementById('fgHuntPlaceType')?.value||'all';const list=allHuntPlaces.filter(x=>(type==='all'||x.p[2]===type)&&(!q||(x.p[1]+' '+x.p[3]+' '+x.p[7]).toLowerCase().includes(q)));const box=document.getElementById('fgHuntPlaceGrid');if(!box)return;box.innerHTML=list.map((x,i)=>huntPlaceCard(x.p,x.score,i,x)).join('')||'<div class="empty">სანადირო/ბუნებაზე დაკვირვების ადგილი ვერ მოიძებნა.</div>';bindImages();bindClicks();bindDestinationWeather();}
  function renderPlaces(){const q=(document.getElementById('fgPlaceSearch')?.value||'').trim().toLowerCase(),type=document.getElementById('fgType')?.value||'all';const list=allPlaces.filter(x=>(type==='all'||x.w[2]===type)&&(!q||(x.w[1]+' '+x.w[3]+' '+x.w[7]).toLowerCase().includes(q)));const box=document.getElementById('fgPlaceGrid');box.innerHTML=list.map((x,i)=>placeCard(x.w,x.score,i,x)).join('')||'<div class="empty">სათევზაო ადგილი ვერ მოიძებნა.</div>';bindImages();bindClicks();bindDestinationWeather();}
  function renderFish(){const q=(document.getElementById('fgSearch')?.value||'').trim().toLowerCase(),type=document.getElementById('fgFishType')?.value||'all';const list=allFish.filter(x=>(type==='all'||String(x.f[3]).includes(type))&&(!q||(x.f[1]+' '+x.f[2]+' '+x.f[3]).toLowerCase().includes(q)));const box=document.getElementById('fgFishGrid');box.innerHTML=list.map((x,i)=>fishCard(x.f,x.score,i)).join('')||'<div class="empty">თევზი ვერ მოიძებნა.</div>';bindImages();bindClicks();bindDestinationWeather();}
  function init(){
    allFish=(window.FISHES||[]).map(f=>({f,score:null}));
    allPlaces=(window.WATERS||[]).map(w=>({w,score:null}));
    const wildlife=typeof WILDLIFE!=='undefined'?WILDLIFE:[];
    allAnimals=wildlife.map(x=>({x,score:null}));
    allHuntPlaces=(window.HUNT_PLACES||[]).map(p=>({p,score:null}));
    document.getElementById('fgFishCount').textContent=allFish.length;document.getElementById('fgPlaceCount').textContent=allPlaces.length;document.getElementById('fgAnimalCount').textContent=allAnimals.length;
    function renderAll(){renderPlaces();renderFish();document.getElementById('fgAnimalGrid').innerHTML=allAnimals.map((entry,i)=>animalCard(entry.x,entry.score,i)).join('');renderHuntPlaces();bindImages();bindClicks();bindDestinationWeather();}
    // The directory and filters are ready immediately, even when GPS or the
    // weather provider is slow. Scores stay unknown until conditions arrive.
    renderAll();
    document.getElementById('fgPlaceSearch')?.addEventListener('input',renderPlaces);document.getElementById('fgType')?.addEventListener('change',renderPlaces);document.getElementById('fgSearch')?.addEventListener('input',renderFish);document.getElementById('fgFishType')?.addEventListener('change',renderFish);document.getElementById('fgHuntPlaceSearch')?.addEventListener('input',renderHuntPlaces);document.getElementById('fgHuntPlaceType')?.addEventListener('change',renderHuntPlaces);
    const button=document.getElementById('fgRefresh'),status=document.getElementById('fgStatus');let refreshing=false;
    async function refresh(options={}){
      if(refreshing)return;refreshing=true;if(button){button.disabled=true;button.setAttribute('aria-busy','true');}if(status){status.setAttribute('role','status');status.textContent='ამინდის პირობები იტვირთება… ცნობარში ძებნა უკვე შეგიძლია.';}
      const {weather,label,data}=await getWeather(options),context={local_hour:weather.local_hour,date:data?.current?.time?.slice(0,10)};
      allFish.forEach(entry=>entry.score=GeoFishChance(entry.f,weather));allFish.sort((a,b)=>(b.score??-1)-(a.score??-1));
      allAnimals.forEach(entry=>entry.score=window.GeoWildlifeChance?window.GeoWildlifeChance(entry.x,context):null);allAnimals.sort((a,b)=>(b.score??-1)-(a.score??-1));
      document.getElementById('fgLocation').textContent=label;document.getElementById('fgOverall').textContent=scoreText(window.outdoorScore?window.outdoorScore(weather):null);
      const focused=document.activeElement,card=focused?.closest?.('.fg-clickable'),keys=['place','fish','species','huntPlace'],identity=card&&keys.find(key=>card.dataset[key]),scrollX=window.scrollX,scrollY=window.scrollY;
      renderAll();
      if(card&&identity){const replacement=[...document.querySelectorAll('.fg-clickable')].find(item=>item.dataset[identity]===card.dataset[identity]);replacement?.focus({preventScroll:true});if(window.scrollX!==scrollX||window.scrollY!==scrollY)window.scrollTo({left:scrollX,top:scrollY,behavior:'instant'});}
      if(status){const temp=numeric(weather.temperature_2m);status.textContent=`${label} • ${temp===null?'—':Math.round(temp)+'°'} • ${data?.__meta?.stale?'ბოლო ხელმისაწვდომი მოდელური ამინდი':data?'ამინდის მოდელის მიმდინარე მონაცემი':'მონაცემი მიუწვდომელია — განახლება თავიდან სცადე'}`;}
      refreshing=false;if(button){button.disabled=false;button.setAttribute('aria-busy','false');}
    }
    if(button)button.onclick=()=>refresh({force:true});
    refresh();
  }
  document.addEventListener('DOMContentLoaded',init);
})();
