const WILDLIFE = window.HUNTING_WILDLIFE || [];
function initCatalog(){
  const search=document.getElementById('catalogSearch'),type=document.getElementById('catalogType'),results=document.getElementById('catalogResults'),suggest=document.getElementById('catalogSuggestions'),profile=document.getElementById('catalogProfile');
  const all=[...WILDLIFE,...(window.FISHES||[]).map(f=>['fish',f[1],f[2],f[11],f[3],f[4],f[5],f[7],f[10],f])];
  function scoreFor(x){return x[0]==='fish'?(window.GeoFishChance?.(x[9],window.__gnCatalogWeather||{})??null):(window.GeoWildlifeChance?.(x)??null);}
  function speciesURL(x,score){const n=window.GeoNatureCommon.numberOrNull(score);return 'species.html?id='+encodeURIComponent(x[1])+(n===null?'':'&chance='+encodeURIComponent(n));}
  function redBadge(x){const hit=(window.RED_BOOK||[]).find(r=>r[1]===x[1]);return hit?'<span class=\"red-mini-badge\">📕 დაცული</span>':'';}
  let imageObserver=null;const imageSpecies=new WeakMap();
  if('IntersectionObserver'in window)imageObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;imageObserver.unobserve(entry.target);const species=imageSpecies.get(entry.target);if(species&&entry.target.isConnected)loadImg(entry.target,species);}},{rootMargin:'400px'});
  function queueImage(target,x){if(!target)return;target.loading='lazy';target.decoding='async';if(imageObserver){imageSpecies.set(target,x);imageObserver.observe(target);}else loadImg(target,x);}
  function loadImg(target,x){
    if(x[0]==='fish')return GeoImage.resolveSpeciesImage(x[1],x[3],x[2]).then(src=>{if(target?.isConnected)target.src=src;});
    return GeoImage.resolveSpeciesImage(x[1],x[3],x[2]).then(src=>{if(target?.isConnected)target.src=src;});
  }
  function render(){
    imageObserver?.disconnect();
    const q=search.value.trim().toLowerCase(),t=type.value;const list=all.filter(x=>((t==='all'||x[0]===t||(t==='animals'&&(x[0]==='mammal'||x[0]==='reptile'||x[0]==='amphibian')))&&(!q||x.join(' ').toLowerCase().includes(q))));
    results.innerHTML=list.slice(0,90).map((x,i)=>{const chance=scoreFor(x);return `<article class="catalog-card" data-i="${i}" data-score="${chance??''}"><div class="catalog-image-wrap"><img class="cat-img" alt="${GeoImage.esc(x[1])}" src="${GeoImage.placeholder(x[1],x[0]==='fish'?'fish':x[0]==='bird'?'bird':x[0]==='mammal'?'animal':'nature')}"><span class="catalog-chance-slot">${window.GeoChanceUI?.markup?window.GeoChanceUI.markup(chance,x[0]==='fish'?'თბილისის პირობების ინდექსი':'ტიპური აქტიურობა'):`<span class="catalog-chance">${chance===null?'—':chance+'/100'}</span>`}</span></div><div class="catalog-card-body"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="catalog-tag">${GeoImage.esc(x[4])}</span>${redBadge(x)}</div><h3>${GeoImage.esc(x[1])}</h3><p>${GeoImage.esc(x[2])} • ${GeoImage.esc(x[5])}</p></div></article>`}).join('')||'<div class="empty">შედეგი ვერ მოიძებნა.</div>';
    list.slice(0,90).forEach((x,i)=>{const card=results.children[i];if(!card)return;queueImage(card.querySelector('img'),x);card.onclick=()=>{location.href=speciesURL(x,card.dataset.score);};});
    suggest.innerHTML=list.slice(0,8).map((x,i)=>`<button data-i="${i}">${GeoImage.esc(x[1])}</button>`).join('');suggest.querySelectorAll('button').forEach(b=>b.onclick=()=>{const x=list[Number(b.dataset.i)];const chance=scoreFor(x);location.href=speciesURL(x,chance)});
  }
  function show(x){
    const chance=scoreFor(x);const chanceHtml=window.GeoChanceUI?.markup?window.GeoChanceUI.markup(chance,x[0]==='fish'?'თბილისის პირობების ინდექსი':'ტიპური აქტიურობა'):'';profile.innerHTML=`<div class="catalog-profile-top"><img id="catProfileImg" alt="${GeoImage.esc(x[1])}" src="${GeoImage.placeholder(x[1],x[0]==='fish'?'fish':x[0]==='bird'?'bird':x[0]==='mammal'?'animal':'nature')}"><div class="catalog-profile-chance">${chanceHtml}</div></div><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="catalog-tag">${GeoImage.esc(x[4])}</span>${redBadge(x)}</div><h2>${GeoImage.esc(x[1])}</h2><p class="muted">${GeoImage.esc(x[2])} • ${GeoImage.esc(x[3])}</p><div class="catalog-stats"><div><small>ჰაბიტატი</small><b>${GeoImage.esc(x[5])}</b></div><div><small>გავრცელება</small><b>${GeoImage.esc(x[6])}</b></div><div><small>სეზონი</small><b>${GeoImage.esc(x[7])}</b></div><div><small>აქტივობა</small><b>${GeoImage.esc(x[8])}</b></div></div><p style="margin-top:12px">ბუნებაზე დაკვირვების საინფორმაციო პროფილი. კონკრეტულ ტერიტორიაზე მოქმედი წესები წინასწარ გადაამოწმე.</p>`;
    loadImg(document.getElementById('catProfileImg'),x);
    profile.scrollIntoView({behavior:'smooth',block:'start'});
  }
  search.oninput=render;type.onchange=render;document.getElementById('catalogClear').onclick=()=>{search.value='';type.value='all';render()};render();(async()=>{try{const data=await openMeteo(41.7151,44.8271);window.__gnCatalogWeather=window.GeoNatureCommon.conditionsFromRow(window.GeoNatureCommon.currentWeatherRow(data))||{};render();}catch(e){}})();
}
