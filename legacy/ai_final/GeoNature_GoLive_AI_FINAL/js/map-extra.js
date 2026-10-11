(function(){
  const $=id=>document.getElementById(id);
  const places=[
    {id:'tbilisi',name:'თბილისი',region:'თბილისი',lat:41.7151,lon:44.8271,desc:'ქალაქი და შემოგარენი'},
    {id:'ozurgeti',name:'ოზურგეთი',region:'გურია',lat:41.924,lon:42.006,desc:'გურიის რეგიონი'},
    {id:'batumi',name:'ბათუმი',region:'აჭარა',lat:41.6168,lon:41.6367,desc:'აჭარის სანაპირო'},
    {id:'kutaisi',name:'ქუთაისი',region:'იმერეთი',lat:42.2679,lon:42.6946,desc:'იმერეთის რეგიონი'},
    {id:'borjomi',name:'ბორჯომი',region:'სამცხე-ჯავახეთი',lat:41.8387,lon:43.3793,desc:'ბორჯომის რეგიონი'},
    {id:'lagodekhi',name:'ლაგოდეხი',region:'კახეთი',lat:41.8268,lon:46.2767,desc:'ლაგოდეხის მიმართულება'}
  ];
  let map,routeLayer,userMarker,searchMarker,searchTimer;
  function safe(v){return String(v??'').replace(/[<>]/g,'')}
  async function nominatim(q){
    const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=ge&q='+encodeURIComponent(q);
    const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('geocode');return r.json();
  }
  function routeTo(dest){
    const status=$('routeStatus');
    if(!window.__geo_user){status.textContent='ჯერ ჩართე „ჩემი მდებარეობა“, შემდეგ აირჩიე ადგილი.';return;}
    const a=window.__geo_user,b=dest;
    const url=`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson&steps=false`;
    status.textContent='მარშრუტი ითვლება...';
    fetch(url).then(r=>r.json()).then(d=>{
      if(!d.routes?.[0])throw new Error('no-route');
      const r=d.routes[0];
      if(routeLayer)map.removeLayer(routeLayer);
      routeLayer=L.geoJSON(r.geometry,{style:{color:'#b5ee70',weight:5,opacity:.9}}).addTo(map);
      map.fitBounds(routeLayer.getBounds(),{padding:[25,25],animate:false});
      status.textContent=`მარშრუტი: ${(r.distance/1000).toFixed(1)} კმ • დაახლოებით ${Math.round(r.duration/60)} წუთი`;
    }).catch(()=>status.textContent='მარშრუტის სერვისი დროებით მიუწვდომელია.');
  }
  function boot(){
    map=L.map('map',{preferCanvas:true,zoomControl:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,closePopupOnClick:true}).setView([42.05,43.70],7);
    window.__geo_map=map;
    const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:17,updateWhenIdle:true,keepBuffer:1,attribution:'© OpenStreetMap contributors'}).addTo(map);
    tiles.on('load',()=>{$('mapStatus').textContent='Live რუკა მზადაა';setTimeout(()=>map.invalidateSize(false),100)});
    setTimeout(()=>map.invalidateSize(false),300);

    const markers={};const list=$('placeItems');
    list.innerHTML=places.map(p=>`<div class="placeItem" data-id="${p.id}"><b>${p.name}</b><small>${p.region}</small><small>${p.desc}</small></div>`).join('');
    places.forEach(p=>{
      const mk=L.circleMarker([p.lat,p.lon],{radius:7,color:'#b5ee70',fillColor:'#0d2014',fillOpacity:.95,weight:2}).addTo(map).bindPopup(`<div class="mapPopup"><b>${p.name}</b><small>${p.region}</small><small>${p.desc}</small></div>`);
      markers[p.id]=mk;
      mk.on('click',()=>{if($('routeStart')?.dataset.on==='1')routeTo([p.lat,p.lon]);});
    });
    list.querySelectorAll('.placeItem').forEach(el=>el.onclick=()=>{const p=places.find(x=>x.id===el.dataset.id);map.setView([p.lat,p.lon],10,{animate:false});markers[p.id].openPopup();if($('routeStart').dataset.on==='1')routeTo([p.lat,p.lon]);});

    $('zoomGeorgia').onclick=()=>map.setView([42.05,43.70],7,{animate:false});
    $('locateBtn').onclick=()=>navigator.geolocation?.getCurrentPosition(pos=>{
      window.__geo_user=[pos.coords.latitude,pos.coords.longitude];map.setView(window.__geo_user,13,{animate:false});
      if(userMarker)map.removeLayer(userMarker);
      userMarker=L.circleMarker(window.__geo_user,{radius:8,color:'#b5ee70',fillColor:'#b5ee70',fillOpacity:.92,weight:3}).addTo(map).bindPopup('<b>📍 ჩემი მიმდინარე მდებარეობა</b>').openPopup();
      $('mapStatus').textContent='GPS მზადაა';
    },()=>{$('mapStatus').textContent='GPS ნებართვა არ არის გაცემული.'},{enableHighAccuracy:true,timeout:8000,maximumAge:300000});

    $('routeStart').onclick=()=>{const b=$('routeStart');b.dataset.on=b.dataset.on==='1'?'0':'1';b.textContent=b.dataset.on==='1'?'● მარშრუტის რეჟიმი':'▶ მარშრუტის რეჟიმი';$('routeStatus').textContent=b.dataset.on==='1'?'აირჩიე მიმართულება ან მოძებნე სოფელი/ქალაქი.':'მარშრუტის რეჟიმი გამორთულია.'};
    $('routeClear').onclick=()=>{if(routeLayer)map.removeLayer(routeLayer);routeLayer=null;$('routeStatus').textContent='გასუფთავებულია.'};

    const q=$('mapQ'),res=$('mapResults');
    async function search(){
      const t=q.value.trim();if(!t)return;
      res.textContent='იტვირთება...';
      try{
        const data=await nominatim(t+', საქართველო');
        res.innerHTML=(data||[]).map((x,i)=>`<button class="chip" data-i="${i}">${safe(x.display_name.split(',')[0])} <small>${safe(x.type||x.class||'place')}</small></button>`).join('')||'<span>ადგილი ვერ მოიძებნა.</span>';
        res.querySelectorAll('.chip').forEach(btn=>btn.onclick=()=>{
          const x=data[+btn.dataset.i],lat=+x.lat,lon=+x.lon;map.setView([lat,lon],14,{animate:false});
          if(searchMarker)map.removeLayer(searchMarker);
          searchMarker=L.circleMarker([lat,lon],{radius:9,color:'#fff',fillColor:'#b5ee70',fillOpacity:.95,weight:3}).addTo(map).bindPopup(`<div class="mapPopup"><b>${safe(x.display_name.split(',')[0])}</b><small>${safe(x.display_name)}</small></div>`).openPopup();
          if($('routeStart').dataset.on==='1')routeTo([lat,lon]);
        });
      }catch(e){res.textContent='ძებნა დროებით მიუწვდომელია.';}
    }
    function debounced(){clearTimeout(searchTimer);searchTimer=setTimeout(search,350)}
    $('mapBtn').onclick=search;q.onkeydown=e=>{if(e.key==='Enter')search()};q.oninput=()=>{if(q.value.trim().length>2)debounced()};
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
