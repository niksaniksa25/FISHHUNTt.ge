const WILDLIFE = window.HUNTING_WILDLIFE || [];
function initCatalog(){
  const search=document.getElementById('catalogSearch'),type=document.getElementById('catalogType'),results=document.getElementById('catalogResults'),suggest=document.getElementById('catalogSuggestions'),count=document.getElementById('catalogCount');
  const all=[...WILDLIFE,...(window.FISHES||[]).map(f=>['fish',f[1],f[2],f[11],f[3],f[4],f[5],f[7],f[10],f])];
  const esc=GeoImage.esc,imageSpecies=new WeakMap();let imageObserver=null;
  function scoreFor(x){return x[0]==='fish'?(window.GeoFishChance?.(x[9],window.__gnCatalogWeather||{})??null):(window.GeoWildlifeChance?.(x)??null);}
  function speciesURL(x,score){const n=window.GeoNatureCommon.numberOrNull(score);return 'species.html?id='+encodeURIComponent(x[1])+(n===null?'':'&chance='+encodeURIComponent(n));}
  function scoreMarkup(x,score){const label=x[0]==='fish'?'თბილისის პირობების ინდექსი':'ტიპური აქტიურობა';return window.GeoChanceUI?.markup?window.GeoChanceUI.markup(score,label):`<span class="catalog-chance">${score===null?'—':score+'/100'}</span>`;}
  function redBadge(x){return(window.RED_BOOK||[]).some(r=>r[1]===x[1])?'<span class="red-mini-badge">📕 დაცული</span>':'';}
  function loadImage(img,x){GeoImage.resolveSpeciesImage(x[1],x[3],x[2]).then(src=>{if(img.isConnected&&src)img.src=src;}).catch(()=>{});}
  if(typeof window.IntersectionObserver==='function')imageObserver=new window.IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;imageObserver.unobserve(entry.target);const x=imageSpecies.get(entry.target);if(x&&entry.target.isConnected)loadImage(entry.target,x);}},{rootMargin:'400px'});
  function render(){
    imageObserver?.disconnect();
    const q=search.value.trim().toLowerCase(),t=type.value;
    const list=all.filter(x=>(t==='all'||x[0]===t||(t==='animals'&&['mammal','reptile','amphibian'].includes(x[0])))&&(!q||x.join(' ').toLowerCase().includes(q)));
    if(count)count.textContent=`${list.length} სახეობა`;
    // Every matching entry stays available. Lazy image lookups keep the full
    // directory usable without truncating it after the first 90 species.
    results.innerHTML=list.map(x=>{const score=scoreFor(x);return `<a class="catalog-card" data-species="${esc(x[1])}" data-score="${score??''}" href="${esc(speciesURL(x,score))}"><div class="catalog-image-wrap"><img class="cat-img" loading="lazy" decoding="async" alt="${esc(x[1])}" src="${GeoImage.placeholder(x[1],x[0]==='fish'?'fish':x[0]==='bird'?'bird':x[0]==='mammal'?'animal':'nature')}"><span class="catalog-chance-slot">${scoreMarkup(x,score)}</span></div><div class="catalog-card-body"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="catalog-tag">${esc(x[4])}</span>${redBadge(x)}</div><h3>${esc(x[1])}</h3><p>${esc(x[2])} • ${esc(x[5])}</p></div></a>`}).join('')||'<div class="empty">ამ ძებნით სახეობა ვერ მოიძებნა. შეცვალე სიტყვა ან გაასუფთავე ფილტრები.</div>';
    list.forEach((x,i)=>{const img=results.children[i]?.querySelector('img');if(!img)return;if(imageObserver){imageSpecies.set(img,x);imageObserver.observe(img);}else loadImage(img,x);});
    suggest.innerHTML=q?list.slice(0,8).map(x=>`<a class="btn ghost" href="${esc(speciesURL(x,scoreFor(x)))}">${esc(x[1])}</a>`).join(''):'';
  }
  function refreshScores(){
    const species=new Map(all.map(x=>[x[1],x]));
    results.querySelectorAll('.catalog-card[data-species]').forEach(card=>{const x=species.get(card.dataset.species);if(!x)return;const score=scoreFor(x);card.dataset.score=score??'';card.href=speciesURL(x,score);const slot=card.querySelector('.catalog-chance-slot');if(slot)slot.innerHTML=scoreMarkup(x,score);});
    suggest.querySelectorAll('a').forEach(link=>{const x=species.get(link.textContent);if(x)link.href=speciesURL(x,scoreFor(x));});
  }
  async function refreshWeather(){
    try{const data=await openMeteo(41.7151,44.8271);window.__gnCatalogWeather=window.GeoNatureCommon.conditionsFromRow(window.GeoNatureCommon.currentWeatherRow(data))||{};}
    catch(error){window.__gnCatalogWeather=null;}
    refreshScores();
  }
  search.oninput=render;type.onchange=render;
  document.getElementById('catalogClear').onclick=()=>{search.value='';type.value='all';render();search.focus({preventScroll:true});};
  render();refreshWeather();setInterval(refreshWeather,300000);
}
