(function(){
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Math.round(n)));
  const numeric=value=>window.GeoNatureCommon.numberOrNull(value);
  const validScore=value=>{const n=numeric(value);return n!==null&&n>=0&&n<=100?n:null;};
  const scoreText=score=>score===null?'—':`${score}/100`;
  function compareEntries(a,b){if(a.score===null&&b.score!==null)return 1;if(a.score!==null&&b.score===null)return-1;return(b.score??0)-(a.score??0)||a.originalIndex-b.originalIndex;}
  function placeScore(w,c){
    const ids=String(w[6]||'').split(',').map(id=>id.trim()).filter(Boolean),aliases={zander:'pikeperch',whiteamur:'grasscarp'};
    const fish=[...new Set(ids.map(id=>(window.FISHES||[]).find(f=>f[0]===id||f[0]===aliases[id])).filter(Boolean))];
    const scores=fish.map(f=>validScore(window.GeoFishChance(f,c,w))).filter(score=>score!==null);
    return scores.length?clamp(scores.reduce((sum,score)=>sum+score,0)/scores.length):null;
  }
  function chanceHtml(score,label){return window.GeoChanceUI?.markup?window.GeoChanceUI.markup(score,label):`<span class="catalog-chance">${scoreText(score)}</span>`;}
  function fishURL(f,score){return `species.html?id=${encodeURIComponent(f[0])}${score===null?'':'&chance='+encodeURIComponent(score)}`;}
  function animalURL(x,score){return `species.html?id=${encodeURIComponent(x[1])}${score===null?'':'&chance='+encodeURIComponent(score)}`;}
  function placeURL(w,score){return `place-details.html?id=${encodeURIComponent(w[0])}${score===null?'':'&chance='+encodeURIComponent(score)}`;}
  function huntURL(p){return `hunting.html?region=${encodeURIComponent(p[8]||p[3]||'თბილისი')}`;}
  function fishCard(f,score,i){
    const img=window.GeoImage?.placeholder?GeoImage.placeholder(f[1],'fish'):'';
    return `<article class="fg-card fg-clickable" tabindex="0" role="link" data-fish="${esc(f[0])}" data-score="${score??''}"><div class="fg-card-image-wrap"><img class="fg-card-image" loading="lazy" src="${img}" alt="${esc(f[1])}"><span class="fg-rank">${score===null?'ინფორმაცია':'TOP '+(i+1)}</span><span class="fg-image-score">პირობების ინდექსი ${scoreText(score)}</span></div><div class="fg-card-body"><div class="fg-top"><div><h3><a class="fg-detail-link" href="${esc(fishURL(f,score))}">${esc(f[1])}</a></h3><div class="fg-sub">${esc(f[2])} • ${esc(f[3])}</div></div><span class="fg-score-slot">${chanceHtml(score,'პირობების ინდექსი')}</span></div><div class="fg-bar"><span style="width:${score??0}%"></span></div><div class="fg-meta"><div><small>აქტიურობა</small><b>${esc(f[10])}</b></div><div><small>სასურველი წყლის ტემპ.</small><b>${esc(f[7])}</b></div></div></div></article>`;
  }
  function placeCard(w,score,i,entry){
    const fish=String(w[6]||'').split(',').map(id=>(window.FISHES||[]).find(f=>f[0]===id)?.[1]).filter(Boolean).slice(0,5),img=GeoImage.placeholder(`${w[1]} • ${w[3]}`,w[2]==='მდინარე'||w[2]==='ზღვა'?'water':'nature');
    return `<article class="fg-card fg-location-card fg-clickable" tabindex="0" role="link" data-place="${esc(w[0])}" data-score="${score??''}"><div class="fg-card-image-wrap"><img class="fg-card-image fg-place-image" loading="lazy" src="${img}" alt="${esc(w[1])}"><span class="fg-rank">${score===null?'ინფორმაცია':'TOP '+(i+1)}</span><span class="fg-image-score">პირობების ინდექსი ${scoreText(score)}</span></div><div class="fg-card-body"><div class="fg-top"><div><div class="fg-sub">${esc(w[2])} • ${esc(w[3])}</div><h3><a class="fg-detail-link" href="${esc(placeURL(w,score))}">${esc(w[1])}</a></h3></div><span class="fg-score-slot">${chanceHtml(score,'პირობების ინდექსი')}</span></div><p class="fg-desc">${esc(w[7]||'საინფორმაციო სათევზაო ლოკაცია')}</p><div class="fg-tag-row">${fish.map(x=>`<span class="fg-tag">🐟 ${esc(x)}</span>`).join('')}</div>${destinationWeatherControl(w,entry,'fishing')}<a class="fg-card-link fg-detail-link" href="${esc(placeURL(w,score))}">დეტალური ინფორმაცია →</a></div></article>`;
  }
  function huntPlaceCard(p,score,i,entry){
    const img=GeoImage.placeholder(`${p[1]} • ${p[3]}`,'nature'),species=String(p[6]||'').split(',').slice(0,5);
    return `<article class="fg-card fg-hunt-place fg-clickable" tabindex="0" role="link" data-hunt-place="${esc(p[0])}" data-score="${score??''}"><div class="fg-card-image-wrap"><img class="fg-card-image fg-hunt-place-image" loading="lazy" src="${img}" alt="${esc(p[1])}"><span class="fg-rank">${score===null?'ინფორმაცია':'TOP '+(i+1)}</span><span class="fg-image-score">გარე პირობები ${scoreText(score)}</span></div><div class="fg-card-body"><div class="fg-top"><div><div class="fg-sub">${esc(p[2])} • ${esc(p[3])}</div><h3><a class="fg-detail-link" href="${esc(huntURL(p))}">${esc(p[1])}</a></h3></div><span class="fg-score-slot">${chanceHtml(score,'გარე პირობები')}</span></div><p class="fg-desc">${esc(p[7])}</p><div class="fg-tag-row">${species.map(x=>`<span class="fg-tag">🦌 ${esc(x)}</span>`).join('')}</div>${destinationWeatherControl(p,entry,'hunting')}<a class="fg-card-link fg-detail-link" href="${esc(huntURL(p))}">ნადირობის ცენტრში გახსნა →</a></div></article>`;
  }
  function animalCard(x,score,i){
    const kind=x[0]==='bird'?'ფრინველი':x[0]==='mammal'?'ცხოველი':'ქვეწარმავალი',img=GeoImage.placeholder(x[1],x[0]==='bird'?'bird':x[0]==='mammal'?'animal':'nature');
    return `<article class="fg-card fg-clickable" tabindex="0" role="link" data-species="${esc(x[1])}" data-score="${score??''}"><div class="fg-card-image-wrap"><img class="fg-card-image" loading="lazy" src="${img}" alt="${esc(x[1])}"><span class="fg-rank">${score===null?'ინფორმაცია':'TOP '+(i+1)}</span><span class="fg-image-score">აქტიურობა ${scoreText(score)}</span></div><div class="fg-card-body"><div class="fg-top"><div><h3><a class="fg-detail-link" href="${esc(animalURL(x,score))}">${esc(x[1])}</a></h3><div class="fg-sub">${esc(x[2])} • ${esc(kind)}</div></div><span class="fg-score-slot">${chanceHtml(score,'ტიპური აქტიურობა')}</span></div><div class="fg-bar"><span style="width:${score??0}%"></span></div><div class="fg-meta"><div><small>აქტიური პერიოდი</small><b>${esc(x[8])}</b></div><div><small>სეზონი</small><b>${esc(x[7])}</b></div></div></div></article>`;
  }
  function currentCondition(data){const common=window.GeoNatureCommon,row=common.currentWeatherRow(data);return common.conditionsFromRow(row)||{};}
  async function getWeather(options={}){
    let lat=41.7151,lon=44.8271,label='თბილისი';
    try{
      if(navigator.geolocation){const pos=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(resolve,()=>resolve(null),{timeout:2500,maximumAge:300000}));if(pos?.coords&&window.GeoNatureCommon.validCoordinates(pos.coords.latitude,pos.coords.longitude)){lat=pos.coords.latitude;lon=pos.coords.longitude;label='ჩემი მდებარეობა';}}
      const data=await openMeteo(lat,lon,options);return{weather:currentCondition(data),label,data};
    }catch(error){return{weather:{},label:`${label} • ამინდი მიუწვდომელია`,data:null};}
  }
  function hasCoordinates(item){return !!item&&window.GeoNatureCommon.validCoordinates(item[4],item[5]);}
  function destinationContext(entry){return entry.weatherTime?`${entry.weatherTime.replace('T',' ')} • ${entry.stale?'ბოლო ხელმისაწვდომი მოდელური ამინდი':'Open-Meteo მოდელური ამინდი'}`:'';}
  function destinationWeatherControl(place,entry,kind){
    if(!hasCoordinates(place))return '<small class="muted">ზუსტი კოორდინატები და ადგილობრივი ამინდი მიუწვდომელია.</small>';
    return `<small class="muted" data-destination-context>${esc(destinationContext(entry))}</small><button type="button" class="btn ghost" data-destination-weather="${esc(place[0])}" data-destination-kind="${kind}" ${entry.loading?'disabled':''}>${entry.loading?'პირობები იტვირთება…':'↻ ამ ადგილის პირობების ნახვა'}</button>`;
  }
  let allPlaces=[],allFish=[],allAnimals=[],allHuntPlaces=[];
  function moveCards(box,ordered){
    const before=[...box.children];if(ordered.every((card,index)=>card===before[index]))return;
    const focused=document.activeElement,restore=focused&&box.contains(focused),left=window.scrollX,top=window.scrollY;
    ordered.forEach((card,index)=>{const at=box.children[index];if(card===at)return;if(typeof box.moveBefore==='function')box.moveBefore(card,at||null);else box.insertBefore(card,at||null);});
    if(restore&&document.activeElement!==focused)focused.focus({preventScroll:true});
    if(window.scrollX!==left||window.scrollY!==top)window.scrollTo({left,top,behavior:'instant'});
  }
  function updateGrid(id,entries,key,entryKey,label,imageLabel,url){
    const box=document.getElementById(id);if(!box)return;
    const byId=new Map(entries.map(entry=>[entryKey(entry),entry])),visible=[...box.querySelectorAll('.fg-clickable')].map(card=>({card,entry:byId.get(card.dataset[key])})).filter(item=>item.entry);
    visible.sort((a,b)=>compareEntries(a.entry,b.entry));
    visible.forEach(({card,entry},index)=>{
      const score=entry.score;card.dataset.score=score??'';
      const rank=card.querySelector('.fg-rank'),image=card.querySelector('.fg-image-score'),slot=card.querySelector('.fg-score-slot'),bar=card.querySelector('.fg-bar > span');
      if(rank)rank.textContent=score===null?'ინფორმაცია':'TOP '+(index+1);if(image)image.textContent=imageLabel+' '+scoreText(score);if(slot)slot.innerHTML=chanceHtml(score,label);if(bar)bar.style.width=(score??0)+'%';
      card.querySelectorAll('.fg-detail-link').forEach(link=>link.href=url(entry));
      const button=card.querySelector('[data-destination-weather]'),context=card.querySelector('[data-destination-context]');
      if(button){button.disabled=!!entry.loading;button.textContent=entry.loading?'პირობები იტვირთება…':'↻ ამ ადგილის პირობების ნახვა';}if(context)context.textContent=destinationContext(entry);
    });
    if(visible.length)moveCards(box,visible.map(item=>item.card));
  }
  function updateFish(){updateGrid('fgFishGrid',allFish,'fish',entry=>entry.f[0],'პირობების ინდექსი','პირობების ინდექსი',entry=>fishURL(entry.f,entry.score));}
  function updateAnimals(){updateGrid('fgAnimalGrid',allAnimals,'species',entry=>entry.x[1],'ტიპური აქტიურობა','აქტიურობა',entry=>animalURL(entry.x,entry.score));}
  function updateDestinations(kind){if(kind==='fishing')updateGrid('fgPlaceGrid',allPlaces,'place',entry=>entry.w[0],'პირობების ინდექსი','პირობების ინდექსი',entry=>placeURL(entry.w,entry.score));else updateGrid('fgHuntPlaceGrid',allHuntPlaces,'huntPlace',entry=>entry.p[0],'გარე პირობები','გარე პირობები',entry=>huntURL(entry.p));}
  async function loadDestination(entry,kind){
    const place=entry.w||entry.p;if(entry.loading||!hasCoordinates(place))return;
    entry.loading=true;updateDestinations(kind);
    try{const data=await openMeteo(place[4],place[5]);entry.score=validScore(kind==='fishing'?placeScore(place,currentCondition(data)):window.outdoorScore?.(currentCondition(data)));entry.stale=!!data.__meta?.stale;entry.weatherTime=data.current?.time;}
    catch(error){entry.score=null;entry.weatherTime=null;entry.stale=false;}
    finally{entry.loading=false;(kind==='fishing'?allPlaces:allHuntPlaces).sort(compareEntries);updateDestinations(kind);}
  }
  function bindDestinationWeather(){document.querySelectorAll('[data-destination-weather]').forEach(button=>{button.onclick=event=>{event.stopPropagation();const kind=button.dataset.destinationKind,entries=kind==='fishing'?allPlaces:allHuntPlaces,entry=entries.find(item=>(item.w||item.p)[0]===button.dataset.destinationWeather);if(entry)return loadDestination(entry,kind);};button.onkeydown=event=>event.stopPropagation();});}
  let guideImageObserver=null;const guideImageLoaders=new WeakMap();
  function bindImages(){
    guideImageObserver?.disconnect();guideImageObserver=null;
    const load=img=>{const loader=guideImageLoaders.get(img);if(!loader||!img.isConnected||img.dataset.imageRequested)return;img.dataset.imageRequested='true';loader().then(src=>{if(img.isConnected&&src)img.src=src;}).catch(()=>{});};
    if(typeof window.IntersectionObserver==='function')guideImageObserver=new window.IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;guideImageObserver.unobserve(entry.target);load(entry.target);}},{rootMargin:'300px'});
    document.querySelectorAll('.fg-card-image').forEach(img=>{
      img.decoding='async';const card=img.closest('.fg-clickable');if(!card)return;const d=card.dataset;let loader;
      if(d.place){const w=(window.WATERS||[]).find(v=>v[0]===d.place);if(w)loader=()=>GeoImage.resolvePlaceImage(w[1],w[3],w[2]);}
      else if(d.huntPlace){const p=(window.HUNT_PLACES||[]).find(v=>v[0]===d.huntPlace);if(p)loader=()=>GeoImage.resolveNatureImage(p[1],p[1]);}
      else if(d.fish){const f=(window.FISHES||[]).find(v=>v[0]===d.fish);if(f)loader=()=>GeoImage.resolveSpeciesImage(f[1],f[11],f[2]);}
      else if(d.species){const x=(typeof WILDLIFE!=='undefined'?WILDLIFE:[]).find(v=>v[1]===d.species);if(x)loader=()=>GeoImage.resolveSpeciesImage(x[1],x[3],x[2]);}
      if(!loader||img.dataset.imageRequested)return;guideImageLoaders.set(img,loader);if(guideImageObserver)guideImageObserver.observe(img);else load(img);
    });
  }
  function bindCard(card,go){card.onclick=event=>{if(!event.target?.closest?.('a,button,input,select,textarea'))go();};card.onkeydown=event=>{if(event.target!==card)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();go();}};}
  function bindClicks(){
    document.querySelectorAll('#fgPlaceGrid .fg-clickable').forEach(card=>{const entry=allPlaces.find(x=>x.w[0]===card.dataset.place);if(entry)bindCard(card,()=>location.href=placeURL(entry.w,entry.score));});
    document.querySelectorAll('#fgFishGrid .fg-clickable').forEach(card=>{const entry=allFish.find(x=>x.f[0]===card.dataset.fish);if(entry)bindCard(card,()=>location.href=fishURL(entry.f,entry.score));});
    document.querySelectorAll('#fgAnimalGrid .fg-clickable').forEach(card=>{const entry=allAnimals.find(x=>x.x[1]===card.dataset.species);if(entry)bindCard(card,()=>location.href=animalURL(entry.x,entry.score));});
    document.querySelectorAll('#fgHuntPlaceGrid .fg-clickable').forEach(card=>{const entry=allHuntPlaces.find(x=>x.p[0]===card.dataset.huntPlace);if(entry)bindCard(card,()=>location.href=huntURL(entry.p));});
  }
  function renderHuntPlaces(){const q=(document.getElementById('fgHuntPlaceSearch')?.value||'').trim().toLowerCase(),type=document.getElementById('fgHuntPlaceType')?.value||'all',list=allHuntPlaces.filter(x=>(type==='all'||x.p[2]===type)&&(!q||[x.p[1],x.p[3],x.p[7]].join(' ').toLowerCase().includes(q))),box=document.getElementById('fgHuntPlaceGrid');if(!box)return;box.innerHTML=list.map((x,i)=>huntPlaceCard(x.p,x.score,i,x)).join('')||'<div class="empty">სანადირო/ბუნებაზე დაკვირვების ადგილი ვერ მოიძებნა.</div>';bindImages();bindClicks();bindDestinationWeather();}
  function renderPlaces(){const q=(document.getElementById('fgPlaceSearch')?.value||'').trim().toLowerCase(),type=document.getElementById('fgType')?.value||'all',list=allPlaces.filter(x=>(type==='all'||x.w[2]===type)&&(!q||[x.w[1],x.w[3],x.w[7]].join(' ').toLowerCase().includes(q))),box=document.getElementById('fgPlaceGrid');box.innerHTML=list.map((x,i)=>placeCard(x.w,x.score,i,x)).join('')||'<div class="empty">სათევზაო ადგილი ვერ მოიძებნა.</div>';bindImages();bindClicks();bindDestinationWeather();}
  function renderFish(){const q=(document.getElementById('fgSearch')?.value||'').trim().toLowerCase(),type=document.getElementById('fgFishType')?.value||'all',list=allFish.filter(x=>{const habitat=String(x.f[3]);return(type==='all'||(type==='მტკნარი'?(habitat.includes('მტკნარი')||habitat.includes('მდინარე')):habitat.includes(type)))&&(!q||[x.f[1],x.f[2],x.f[3],x.f[11]].join(' ').toLowerCase().includes(q));}),box=document.getElementById('fgFishGrid');box.innerHTML=list.map((x,i)=>fishCard(x.f,x.score,i)).join('')||'<div class="empty">თევზი ვერ მოიძებნა.</div>';bindImages();bindClicks();bindDestinationWeather();}
  function init(){
    allFish=(window.FISHES||[]).map((f,originalIndex)=>({f,score:null,originalIndex}));allPlaces=(window.WATERS||[]).map((w,originalIndex)=>({w,score:null,originalIndex}));
    const wildlife=typeof WILDLIFE!=='undefined'?WILDLIFE:[];allAnimals=wildlife.map((x,originalIndex)=>({x,score:null,originalIndex}));allHuntPlaces=(window.HUNT_PLACES||[]).map((p,originalIndex)=>({p,score:null,originalIndex}));
    document.getElementById('fgFishCount').textContent=allFish.length;document.getElementById('fgPlaceCount').textContent=allPlaces.length;document.getElementById('fgAnimalCount').textContent=allAnimals.length;
    renderPlaces();renderFish();document.getElementById('fgAnimalGrid').innerHTML=allAnimals.map((entry,i)=>animalCard(entry.x,entry.score,i)).join('');renderHuntPlaces();bindImages();bindClicks();bindDestinationWeather();
    document.getElementById('fgPlaceSearch')?.addEventListener('input',renderPlaces);document.getElementById('fgType')?.addEventListener('change',renderPlaces);document.getElementById('fgSearch')?.addEventListener('input',renderFish);document.getElementById('fgFishType')?.addEventListener('change',renderFish);document.getElementById('fgHuntPlaceSearch')?.addEventListener('input',renderHuntPlaces);document.getElementById('fgHuntPlaceType')?.addEventListener('change',renderHuntPlaces);
    const button=document.getElementById('fgRefresh'),status=document.getElementById('fgStatus');let refreshPromise=null;
    function refresh(options={}){
      if(refreshPromise)return refreshPromise;
      if(button){button.disabled=true;button.setAttribute('aria-busy','true');}if(status){status.setAttribute('role','status');status.textContent='ამინდის პირობები იტვირთება… ცნობარში ძებნა უკვე შეგიძლია.';}
      refreshPromise=(async()=>{
        const {weather,label,data}=await getWeather(options),context={local_hour:weather.local_hour,date:data?.current?.time?.slice(0,10)};
        allFish.forEach(entry=>entry.score=validScore(window.GeoFishChance(entry.f,weather)));allFish.sort(compareEntries);allAnimals.forEach(entry=>entry.score=validScore(window.GeoWildlifeChance?.(entry.x,context)));allAnimals.sort(compareEntries);
        document.getElementById('fgLocation').textContent=label;document.getElementById('fgOverall').textContent=scoreText(validScore(window.outdoorScore?.(weather)));updateFish();updateAnimals();
        if(status){const temp=numeric(weather.temperature_2m);status.textContent=`${label} • ${temp===null?'—':Math.round(temp)+'°'} • ${data?.__meta?.stale?'ბოლო ხელმისაწვდომი მოდელური ამინდი':data?'ამინდის მოდელის მიმდინარე მონაცემი':'მონაცემი მიუწვდომელია — განახლება თავიდან სცადე'}`;}
      })().catch(error=>{
        allFish.forEach(entry=>entry.score=null);allFish.sort(compareEntries);updateFish();document.getElementById('fgOverall').textContent='—';if(status)status.textContent='განახლება ვერ მოხერხდა. სცადე თავიდან.';console.warn('Guide weather refresh failed',error);
      }).finally(()=>{refreshPromise=null;if(button){button.disabled=false;button.setAttribute('aria-busy','false');}});
      return refreshPromise;
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh({force:true});});
    window.GeoGuideRanking={refresh};if(button)button.onclick=()=>refresh({force:true});refresh();setInterval(()=>{if(!document.hidden)return refresh();},300000);
  }
  document.addEventListener('DOMContentLoaded',init);
})();
