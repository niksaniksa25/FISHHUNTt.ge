(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const FALLBACK_FOREST_IMAGE='assets/avatars/photo/forest.jpg';
  const BIRDS=new Set(['ტყის ბუ','შაშვი','მწყერი','ქორი','ოქროს არწივი','მეჭვავია','არწივი','კაკაბი']);
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Math.round(Number(n)||0)));

  function scoreZone(z){
    const names=z[4]||[];
    const birdCount=names.filter(n=>BIRDS.has(n)).length;
    const mammalCount=names.length-birdCount;
    const habitat=String(z[5]||'').toLowerCase();
    let variety=0;
    if(/მთის|მთიანი|სუბალპურ/.test(habitat))variety+=6;
    if(/ნოტიო|ტენიანი|წვიმიანი|კოლხურ|ხავსიან/.test(habitat))variety+=7;
    if(/შერეულ/.test(habitat))variety+=5;
    if(/წიწვოვან/.test(habitat))variety+=5;
    if(/ფართოფოთლოვან|მუხნარ/.test(habitat))variety+=5;
    if(/ხეობ|ფერდობ|ტყისპირ|მდინარისპირა/.test(habitat))variety+=4;
    if(/დაბლობ/.test(habitat))variety+=2;
    // Habitat diversity index, not a wildlife-sighting probability.
    return clamp(16+Math.min(8,names.length)*5+Math.min(3,birdCount)*4+
      (mammalCount>=3?8:mammalCount*2)+variety,25,95);
  }

  function loadForestImage(z,img){
    if(!img)return;
    img.dataset.zoneId=z[0];
    img.src=FALLBACK_FOREST_IMAGE;
    const resolve=window.GeoImage&&window.GeoImage.resolveNatureImage;
    if(typeof resolve!=='function')return;
    resolve(z[1],z[2]).then(src=>{
      if(!img.isConnected||img.dataset.zoneId!==z[0]||!src)return;
      // Ignore unrelated generated placeholder images; retain a correct generic forest photo instead.
      if(!String(src).startsWith('data:image/svg+xml'))img.src=src;
    }).catch(()=>{});
  }

  function card(z,i){
    const score=scoreZone(z);
    return '<article class="forest-card" data-id="'+esc(z[0])+'" tabindex="0" role="button" aria-label="'+esc(z[1])+' — დეტალური პროფილი">'+
      '<div class="forest-card-image"><img loading="lazy" src="'+FALLBACK_FOREST_IMAGE+'" alt="'+esc(z[1])+' — ტყის ლანდშაფტი" data-zone-id="'+esc(z[0])+'">'+
      '<span class="forest-rank">ზონა '+String(i+1).padStart(2,'0')+'</span><span class="forest-score">ჰაბიტატი '+score+'/100</span></div>'+
      '<div class="forest-card-body"><div class="forest-kicker">🌲 '+esc(z[3])+'</div><h3>'+esc(z[1])+'</h3><p>'+esc(z[5])+'</p>'+
      '<div class="forest-tags">'+z[4].slice(0,4).map(x=>'<span>🌿 '+esc(x)+'</span>').join('')+'</div>'+
      '<span class="btn ghost forest-open">დეტალური ინფორმაცია <span aria-hidden="true">→</span></span></div></article>';
  }

  function renderList(){
    const q=(document.getElementById('forestSearch')?.value||'').trim().toLocaleLowerCase('ka');
    const region=document.getElementById('forestRegion')?.value||'all';
    const list=(window.FOREST_ZONES||[]).filter(z=>(region==='all'||z[3]===region)&&(!q||z.join(' ').toLocaleLowerCase('ka').includes(q)));
    const box=document.getElementById('forestGrid');
    box.innerHTML=list.map(card).join('')||'<div class="empty">ტყის ზონა ვერ მოიძებნა.</div>';
    box.querySelectorAll('.forest-card').forEach(c=>{
      const z=(window.FOREST_ZONES||[]).find(x=>x[0]===c.dataset.id);
      if(!z)return;
      loadForestImage(z,c.querySelector('img'));
      c.addEventListener('click',()=>openZone(z,true));
      c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openZone(z,true)}});
    });
    document.getElementById('forestCount').textContent=list.length+' ზონა';
  }

  function profileMarkup(z){
    const animals=z[4].map(n=>(window.HUNTING_WILDLIFE||[]).find(x=>x[1]===n)).filter(Boolean);
    const score=scoreZone(z);
    const birds=z[4].filter(n=>BIRDS.has(n)).length;
    const forestBlurb=z[1]+'-ის ჰაბიტატის აღწერა: '+z[5]+'. პროფილში ჩამოთვლილი სახეობები საინფორმაციო ცნობარია; მათი არსებობა კონკრეტულ დღეს ან ზუსტ წერტილში ავტომატურად არ დასტურდება.';
    const animalCards=animals.map(x=>'<a class="forest-wild" href="species.html?id='+encodeURIComponent(x[1])+'"><span class="forest-wild-icon">'+(BIRDS.has(x[1])?'🦉':'🦌')+'</span><span><strong>'+esc(x[1])+'</strong><small>'+esc(x[4]||x[5]||'საქართველოს ველური ბუნება')+'</small></span><b aria-hidden="true">↗</b></a>').join('');
    return '<div class="forest-detail-top"><button class="btn ghost forest-back" id="forestBack" type="button">← ყველა ტყის ზონა</button><span class="forest-detail-label">GEONATURE • FOREST PROFILE</span></div>'+
      '<div class="forest-profile-hero"><img id="forestProfileImg" src="'+FALLBACK_FOREST_IMAGE+'" alt="'+esc(z[1])+' — ტყის ლანდშაფტი" data-zone-id="'+esc(z[0])+'">'+
      '<div class="forest-profile-overlay"><span class="forest-region-pill">🌲 '+esc(z[3])+'</span><h2>'+esc(z[1])+'</h2><p>'+esc(z[2])+'</p></div>'+
      '<div class="forest-profile-score"><strong>'+score+'</strong><span>/100</span><small>ჰაბიტატის<br>მრავალფეროვნება</small></div></div>'+
      '<div class="forest-profile-intro"><p>'+esc(forestBlurb)+'</p></div>'+
      '<div class="forest-fact-grid">'+
      '<div class="forest-fact"><span>📍</span><small>უახლოესი დასახლება</small><b>'+esc(z[6]||'მონაცემი არ არის')+'</b></div>'+
      '<div class="forest-fact"><span>🧭</span><small>რეგიონი</small><b>'+esc(z[3])+'</b></div>'+
      '<div class="forest-fact"><span>🌿</span><small>ჰაბიტატის ტიპი</small><b>'+esc(z[5])+'</b></div>'+
      '<div class="forest-fact"><span>🦉</span><small>ჩამონათვალში სახეობები</small><b>'+animals.length+' სახეობა'+(birds?' • '+birds+' ფრინველი':'')+'</b></div></div>'+
      '<div class="forest-profile-section-head"><div><span class="eyebrow">WILDLIFE DIRECTORY</span><h3>ამ ჰაბიტატთან დაკავშირებული სახეობები</h3><p>დააჭირე სახეობას დამატებითი ცნობარის გასახსნელად.</p></div><span class="forest-species-count">'+animals.length+' სახეობა</span></div>'+
      '<div class="forest-wild-grid">'+animalCards+'</div>'+
      '<div class="forest-disclaimer"><strong>ℹ️ საინფორმაციო ინდექსი</strong><p>ჰაბიტატის ქულა აერთიანებს ჩამონათვალის მრავალფეროვნებასა და აღწერილ გარემოს ტიპებს. ეს არ არის ცხოველის ნახვის, ნადირობის ან სახეობის გავრცელების მეცნიერულად დადასტურებული პროცენტული ალბათობა. დაცული სახეობების წესები ყოველთვის დაიცავი.</p></div>';
  }

  function syncUrl(zoneId,replace=false){
    const url=new URL(location.href);
    if(zoneId){url.searchParams.set('zone',zoneId);url.searchParams.delete('name')}
    else{url.searchParams.delete('zone');url.searchParams.delete('name')}
    if(replace)history.replaceState({forestZone:zoneId||null},'',url);
    else history.pushState({forestZone:zoneId||null},'',url);
  }

  function showList(){
    const section=document.getElementById('forestExplorerSection');
    const heading=document.getElementById('forestListHeading');
    const toolbar=document.getElementById('forestToolbar');
    const grid=document.getElementById('forestGrid');
    const profile=document.getElementById('forestProfile');
    section?.classList.remove('forest-detail-mode');
    if(heading)heading.hidden=false;
    if(toolbar)toolbar.hidden=false;
    if(grid)grid.hidden=false;
    if(profile){profile.hidden=true;profile.innerHTML='';}
  }

  function openZone(z,updateUrl){
    if(!z)return;
    const section=document.getElementById('forestExplorerSection');
    const heading=document.getElementById('forestListHeading');
    const toolbar=document.getElementById('forestToolbar');
    const grid=document.getElementById('forestGrid');
    const profile=document.getElementById('forestProfile');
    if(!profile)return;
    if(updateUrl)syncUrl(z[0]);
    section?.classList.add('forest-detail-mode');
    if(heading)heading.hidden=true;
    if(toolbar)toolbar.hidden=true;
    if(grid)grid.hidden=true;
    profile.hidden=false;
    profile.innerHTML=profileMarkup(z);
    loadForestImage(z,profile.querySelector('#forestProfileImg'));
    profile.querySelector('#forestBack')?.addEventListener('click',()=>{
      syncUrl(null);
      showList();
      document.getElementById('forestExplorerSection')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    profile.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function openFromUrl(replace=false){
    const params=new URLSearchParams(location.search);
    const requested=params.get('zone');
    const legacy=params.get('name');
    const zones=window.FOREST_ZONES||[];
    let z=requested?zones.find(x=>x[0]===requested):null;
    if(!z&&legacy)z=zones.find(x=>x[1]===legacy);
    if(z){if(replace&&legacy)syncUrl(z[0],true);openZone(z,false)}
    else showList();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    if(!document.getElementById('forestGrid'))return;
    const select=document.getElementById('forestRegion');
    const regions=[...new Set((window.FOREST_ZONES||[]).map(x=>x[3]))].sort((a,b)=>a.localeCompare(b,'ka'));
    select.innerHTML='<option value="all">ყველა რეგიონი</option>'+regions.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
    document.getElementById('forestSearch').addEventListener('input',renderList);
    select.addEventListener('change',renderList);
    renderList();
    openFromUrl(true);
    window.addEventListener('popstate',()=>openFromUrl(false));
  });
})();