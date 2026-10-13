function fishNames(ids){return String(ids||'').split(',').map(id=>FISHES.find(f=>f[0]===id)?.[1]||id).filter(Boolean)}
function distanceKm(aLat,aLon,bLat,bLon){const R=6371,dLat=(bLat-aLat)*Math.PI/180,dLon=(bLon-aLon)*Math.PI/180;const aa=Math.sin(dLat/2)**2+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa))}

function initPlaces(){
  const search=document.getElementById('placeSearch'),type=document.getElementById('placeType'),region=document.getElementById('placeRegion'),sort=document.getElementById('placeSort'),grid=document.getElementById('placeResults'),empty=document.getElementById('placeEmpty'),shown=document.getElementById('shownCount'),count=document.getElementById('placeCount'),note=document.getElementById('placeSearchNote');
  const esc=GeoImage.esc,imagePlaces=new WeakMap();let imageObserver=null;
  count.textContent=WATERS.length;
  shown.setAttribute?.('aria-live','polite');
  note?.setAttribute?.('role','status');
  [...new Set(WATERS.map(x=>x[3]))].sort((a,b)=>a.localeCompare(b,'ka')).forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;region.appendChild(o)});
  function loadImage(img,w){GeoImage.resolvePlaceImage(w[1],w[3],w[2]).then(src=>{if(img.isConnected&&src)img.src=src}).catch(()=>{});}
  if(typeof window.IntersectionObserver==='function')imageObserver=new window.IntersectionObserver(entries=>{
    for(const entry of entries){if(!entry.isIntersecting)continue;imageObserver.unobserve(entry.target);const w=imagePlaces.get(entry.target);if(w)loadImage(entry.target,w);}
  },{rootMargin:'250px'});
  function render(){
    imageObserver?.disconnect?.();
    const q=search.value.trim().toLowerCase(),t=type.value,r=region.value,s=sort.value;
    const res=WATERS.filter(w=>(!q||[w[1],w[2],w[3],w[7],...fishNames(w[6])].join(' ').toLowerCase().includes(q))&&(t==='all'||w[2]===t)&&(r==='all'||w[3]===r));
    if(s==='name')res.sort((a,b)=>a[1].localeCompare(b[1],'ka'));
    if(s==='region')res.sort((a,b)=>a[3].localeCompare(b[3],'ka')||a[1].localeCompare(b[1],'ka'));
    if(s==='type')res.sort((a,b)=>a[2].localeCompare(b[2],'ka')||a[1].localeCompare(b[1],'ka'));
    shown.textContent=res.length;grid.innerHTML='';empty.classList.toggle('hidden',!!res.length);
    const fragment=document.createDocumentFragment();
    res.forEach(w=>{
      const card=document.createElement('a');card.className='location-card';card.href=`place-details.html?id=${encodeURIComponent(w[0])}`;
      card.innerHTML=`<div class="place-img-wrap"><img class="place-img" loading="lazy" decoding="async" alt="${esc(w[1])}" src="${GeoImage.placeholder(`${w[1]} • ${w[3]}`,w[2]==='მდინარე'||w[2]==='ზღვა'?'water':'nature')}"><span class="image-badge">${esc(w[2])}</span></div><div class="location-card-body"><div class="card-topline"><span class="tag">${esc(w[3])}</span><span class="small-live">ამინდის ნახვა</span></div><h3>${esc(w[1])}</h3><p>${esc(w[7]||'საინფორმაციო ლოკაცია.')}</p><div class="card-meta"><span>🐟 ${fishNames(w[6]).slice(0,3).map(esc).join(' • ')}</span><span>› დეტალები</span></div></div>`;
      const image=card.querySelector('img');imagePlaces.set(image,w);
      if(imageObserver)imageObserver.observe(image);else loadImage(image,w);
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);
  }
  search.oninput=render;type.onchange=render;region.onchange=render;sort.onchange=render;
  document.getElementById('placeReset').onclick=()=>{search.value='';type.value='all';region.value='all';sort.value='relevance';render();search.focus?.({preventScroll:true});};
  const gps=document.getElementById('placeGps'),gpsLabel=gps.textContent;
  const gpsError=message=>{gps.disabled=false;gps.textContent=gpsLabel;if(note)note.textContent=message;};
  gps.onclick=()=>{
    if(gps.disabled)return;
    if(!navigator.geolocation){gpsError('ამ ბრაუზერში მდებარეობის განსაზღვრა მიუწვდომელია. ადგილი ძებნით ან რეგიონით აირჩიე.');return;}
    gps.disabled=true;gps.textContent='📍 მდებარეობა მოწმდება…';if(note)note.textContent='მდებარეობის დასადგენად ბრაუზერის ნებართვაა საჭირო.';
    try{navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords?.latitude,lon=pos.coords?.longitude;
      if(!window.GeoNatureCommon?.validCoordinates(lat,lon)){gpsError('მდებარეობის ზუსტი კოორდინატები ვერ მივიღეთ. სცადე თავიდან ან მოძებნე ადგილი.');return;}
      const near=WATERS.filter(w=>window.GeoNatureCommon.validCoordinates(w[4],w[5])).map(w=>({w,d:distanceKm(lat,lon,Number(w[4]),Number(w[5]))})).sort((a,b)=>a.d-b.d);
      if(!near.length){gpsError('ცნობარში ზუსტი კოორდინატების მქონე ადგილი ჯერ არ არის. გამოიყენე ძებნა.');return;}
      gps.disabled=false;gps.textContent=gpsLabel;if(note)note.textContent=`უახლოესი ადგილი: ${near[0].w[1]} (${near[0].d.toFixed(1)} კმ)`;
      location.href=`place-details.html?id=${encodeURIComponent(near[0].w[0])}`;
    },error=>gpsError(error?.code===1?'მდებარეობის ნებართვა გამორთულია. ბრაუზერში ჩართე ან ადგილი ძებნით აირჩიე.':'მდებარეობა ვერ განისაზღვრა. სცადე თავიდან ან ადგილი ძებნით აირჩიე.'),{enableHighAccuracy:false,timeout:8000,maximumAge:60000});}
    catch(error){gpsError('მდებარეობა ვერ განისაზღვრა. ადგილი ძებნით აირჩიე.');}
  };
  render();
}
