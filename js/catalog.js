<<<<<<< HEAD
=======
const WILDLIFE = window.HUNTING_WILDLIFE || [];
function initCatalog(){
  const search=document.getElementById('catalogSearch'),type=document.getElementById('catalogType'),results=document.getElementById('catalogResults'),suggest=document.getElementById('catalogSuggestions'),count=document.getElementById('catalogCount');
  const all=[...WILDLIFE,...(window.FISHES||[]).map(f=>['fish',f[1],f[2],f[11],f[3],f[4],f[5],f[7],f[10],f])];
  const esc=GeoImage.esc,imageSpecies=new WeakMap(),recordOrder=new Map(all.map((x,index)=>[x,index]));let imageObserver=null,weatherRequest=0,catalogueSnapshot=null;
  const recordId=x=>x[0]==='fish'?'fish:'+x[9][0]:'wildlife:'+recordOrder.get(x);
  const records=new Map(all.map(x=>[recordId(x),x]));
  function validScore(value){const number=window.GeoNatureCommon.numberOrNull(value);return number!==null&&number>=0&&number<=100?number:null;}
  function scoreFor(x){return validScore(x[0]==='fish'?window.GeoFishChance?.(x[9],window.__gnCatalogWeather||{}):window.GeoWildlifeChance?.(x));}
  function compareFish(a,b){const left=scoreFor(a),right=scoreFor(b);if(left===null&&right!==null)return 1;if(left!==null&&right===null)return-1;return(right??0)-(left??0)||recordOrder.get(a)-recordOrder.get(b);}
  function rankedList(list){return[...list.filter(x=>x[0]==='fish').sort(compareFish),...list.filter(x=>x[0]!=='fish')];}
  function speciesURL(x,score){const id=x[0]==='fish'?x[9][0]:x[1];return 'species.html?id='+encodeURIComponent(id)+(score===null?'':'&chance='+encodeURIComponent(score));}
  function scoreMarkup(x,score){const label=x[0]==='fish'?'თბილისის პირობების ინდექსი':'ტიპური აქტიურობა';return window.GeoChanceUI?.markup?window.GeoChanceUI.markup(score,label):`<span class="catalog-chance">${score===null?'—':score+'/100'}</span>`;}
  function redBadge(x){return(window.RED_BOOK||[]).some(r=>r[1]===x[1])?'<span class="red-mini-badge">📕 დაცული</span>':'';}
  function loadImage(img,x){GeoImage.resolveSpeciesImage(x[1],x[3],x[2]).then(src=>{if(img.isConnected&&src)img.src=src;}).catch(()=>{});}
  if(typeof window.IntersectionObserver==='function')imageObserver=new window.IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;imageObserver.unobserve(entry.target);const x=imageSpecies.get(entry.target);if(x&&entry.target.isConnected)loadImage(entry.target,x);}},{rootMargin:'400px'});
  function render(){
    imageObserver?.disconnect();
    const q=search.value.trim().toLowerCase(),t=type.value;
    const list=rankedList(all.filter(x=>(t==='all'||x[0]===t||(t==='animals'&&['mammal','reptile','amphibian'].includes(x[0])))&&(!q||x.join(' ').toLowerCase().includes(q))));
    if(count)count.textContent=`${list.length} სახეობა`;
    // Fish appear first, ranked within their own index. Wildlife retains its
    // directory order and is not compared against fishing conditions.
    results.innerHTML=list.map(x=>{const score=scoreFor(x);return `<a class="catalog-card" data-species="${esc(x[1])}" data-score="${score??''}" href="${esc(speciesURL(x,score))}" data-catalog-id="${esc(recordId(x))}"><div class="catalog-image-wrap"><img class="cat-img" loading="lazy" decoding="async" alt="${esc(x[1])}" src="${GeoImage.placeholder(x[1],x[0]==='fish'?'fish':x[0]==='bird'?'bird':x[0]==='mammal'?'animal':'nature')}"><span class="catalog-chance-slot">${scoreMarkup(x,score)}</span></div><div class="catalog-card-body"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="catalog-tag">${esc(x[4])}</span>${redBadge(x)}</div><h3>${esc(x[1])}</h3><p>${esc(x[2])} • ${esc(x[5])}</p></div></a>`}).join('')||'<div class="empty">ამ ძებნით სახეობა ვერ მოიძებნა. შეცვალე სიტყვა ან გაასუფთავე ფილტრები.</div>';
    list.forEach((x,i)=>{const img=results.children[i]?.querySelector('img');if(!img)return;if(imageObserver){imageSpecies.set(img,x);imageObserver.observe(img);}else loadImage(img,x);});
    updateRankingContext();
    suggest.innerHTML=q?list.slice(0,8).map(x=>`<a class="btn ghost" data-catalog-id="${esc(recordId(x))}" href="${esc(speciesURL(x,scoreFor(x)))}">${esc(x[1])}</a>`).join(''):'';
  }
  function updateRankingContext(){
    const hint=document.getElementById('catalogRankingContext');if(!hint)return;
    if(!['all','fish'].includes(type.value)){hint.textContent='ველური ბუნების ცნობარი • ტიპური აქტივობის საორიენტაციო ინდექსი';return;}
    const row=catalogueSnapshot&&window.GeoNatureCommon.currentWeatherRow(catalogueSnapshot),time=row?.iso||catalogueSnapshot?.current?.time||'';
    const status=catalogueSnapshot?(catalogueSnapshot.__meta?.stale?'ბოლო ხელმისაწვდომი მონაცემი':'მიმდინარე პირობები'):'ამინდის ინდექსი მიუწვდომელია';
    hint.textContent=`თევზები: მაღალი ინდექსიდან დაბლისკენ • უცნობი ბოლოშია • თბილისი • ${status}${time?' • '+time.replace('T',' '):''}`;
  }
  function moveRankedLinks(box,selector){
    const links=[...box.querySelectorAll(selector)],known=links.filter(link=>records.has(link.dataset.catalogId));
    const byId=new Map(known.map(link=>[link.dataset.catalogId,link]));
    const ordered=rankedList(known.map(link=>records.get(link.dataset.catalogId))).map(x=>byId.get(recordId(x)));
    if(ordered.every((link,index)=>link===known[index]))return;
    const focused=document.activeElement,restore=focused&&box.contains(focused),left=window.scrollX,top=window.scrollY;
    ordered.forEach((link,index)=>{const at=box.children[index];if(at===link)return;if(typeof box.moveBefore==='function')box.moveBefore(link,at||null);else box.insertBefore(link,at||null);});
    if(restore&&document.activeElement!==focused)focused.focus({preventScroll:true});
    if(window.scrollX!==left||window.scrollY!==top)window.scrollTo({left,top,behavior:'instant'});
  }
  function refreshScores(){
    results.querySelectorAll('.catalog-card[data-catalog-id]').forEach(card=>{const x=records.get(card.dataset.catalogId);if(!x)return;const score=scoreFor(x);card.dataset.score=score??'';card.href=speciesURL(x,score);const slot=card.querySelector('.catalog-chance-slot');if(slot)slot.innerHTML=scoreMarkup(x,score);});
    suggest.querySelectorAll('a[data-catalog-id]').forEach(link=>{const x=records.get(link.dataset.catalogId);if(x)link.href=speciesURL(x,scoreFor(x));});
    moveRankedLinks(results,'.catalog-card[data-catalog-id]');moveRankedLinks(suggest,'a[data-catalog-id]');updateRankingContext();
  }
  async function refreshWeather(options={}){
    const request=++weatherRequest;
    try{const data=await openMeteo(41.7151,44.8271,options);if(request!==weatherRequest)return;catalogueSnapshot=data;window.__gnCatalogWeather=window.GeoNatureCommon.conditionsFromRow(window.GeoNatureCommon.currentWeatherRow(data))||{};}
    catch(error){if(request!==weatherRequest)return;catalogueSnapshot=null;window.__gnCatalogWeather=null;}
    refreshScores();
  }
  search.oninput=render;type.onchange=render;
  document.getElementById('catalogClear').onclick=()=>{search.value='';type.value='all';render();search.focus({preventScroll:true});};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWeather({force:true});});
  window.GeoCatalogRanking={refresh:refreshWeather};
  render();refreshWeather();setInterval(()=>{if(!document.hidden)return refreshWeather();},300000);
}
>>>>>>> aecf3d59363952da10b96a17adebfee618d2cbd1
