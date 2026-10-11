(function(){
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const placeholder=(name)=>window.GeoImage?.placeholder?window.GeoImage.placeholder(name,'nature'):'';
  let selected=null;
  function scoreZone(z){
    const wildlife=(z[4]||[]).map(n=>(window.HUNTING_WILDLIFE||[]).find(x=>x[1]===n)).filter(Boolean);
    const avg=wildlife.length?wildlife.reduce((a,x)=>a+(window.GeoWildlifeChance?window.GeoWildlifeChance(x):60),0)/wildlife.length:60;
    return Math.max(0,Math.min(100,Math.round(avg)));
  }
  function zoneCard(z,i){
    const score=scoreZone(z), img=placeholder(z[1]);
    return `<article class="forest-card" data-id="${esc(z[0])}"><div class="forest-card-image"><img loading="lazy" src="${img}" alt="${esc(z[1])}"><span class="forest-rank">TOP ${i+1}</span><span class="forest-score">ბუნების აქტივობა ${score}%</span></div><div class="forest-card-body"><div class="forest-kicker">🌲 ${esc(z[3])}</div><h3>${esc(z[1])}</h3><p>${esc(z[5])}</p><div class="forest-tags">${z[4].slice(0,6).map(x=>`<span>🦌 ${esc(x)}</span>`).join('')}</div><button class="btn ghost forest-open" type="button">ტყის პროფილი →</button></div></article>`;
  }
  function bindImages(){
    document.querySelectorAll('.forest-card img').forEach(img=>{const c=img.closest('.forest-card'),z=(window.FOREST_ZONES||[]).find(x=>x[0]===c?.dataset.id);if(!z)return;window.GeoImage?.resolveNatureImage?.(z[1],z[2]).then(src=>{if(src)img.src=src}).catch(()=>{});});
  }
  function renderList(){
    const q=(document.getElementById('forestSearch')?.value||'').trim().toLowerCase();
    const region=document.getElementById('forestRegion')?.value||'all';
    const list=(window.FOREST_ZONES||[]).filter(z=>(region==='all'||z[3]===region)&&(!q||(z.join(' ').toLowerCase().includes(q))));
    const box=document.getElementById('forestGrid');box.innerHTML=list.map(zoneCard).join('')||'<div class="empty">ტყის ზონა ვერ მოიძებნა.</div>';
    box.querySelectorAll('.forest-open').forEach(b=>b.onclick=()=>select((window.FOREST_ZONES||[]).find(z=>z[0]===b.closest('.forest-card')?.dataset.id)));
    box.querySelectorAll('.forest-card').forEach(c=>c.onclick=e=>{if(e.target.closest('button'))return;select((window.FOREST_ZONES||[]).find(z=>z[0]===c.dataset.id))});
    bindImages();
    document.getElementById('forestCount').textContent=`${list.length} ზონა`;
  }
  function select(z){
    if(!z)return; selected=z;
    const animals=z[4].map(n=>(window.HUNTING_WILDLIFE||[]).find(x=>x[1]===n)).filter(Boolean);
    const p=document.getElementById('forestProfile');
    p.innerHTML=`<div class="forest-profile-head"><div><span class="eyebrow">FOREST HABITAT</span><h2>${esc(z[1])}</h2><p class="muted">${esc(z[2])} • ${esc(z[3])}</p></div><div class="forest-profile-score">${scoreZone(z)}<small>აქტივობის ინდექსი</small></div></div><div class="forest-profile-photo"><img id="forestProfileImg" src="${placeholder(z[1])}" alt="${esc(z[1])}"></div><div class="forest-detail-grid"><div><small>გარემო</small><b>${esc(z[5])}</b></div><div><small>რეგიონი</small><b>${esc(z[3])}</b></div></div><h3 style="margin-top:20px">🦌 რა ცხოველები/ფრინველები გვხვდება</h3><div class="forest-wild-grid">${animals.map(x=>`<button class="forest-wild" data-species="${esc(x[1])}"><strong>${esc(x[1])}</strong><small>${esc(x[4])}</small></button>`).join('')}</div><div class="forest-disclaimer">ეს არის საინფორმაციო ჰაბიტატის რუკა და არა ნადირობის ნებართვის/ოფიციალური კვოტების რუკა. დაცულ სახეობებზე მოქმედი წესები ყოველთვის დაიცავი.</div>`;
    window.GeoImage?.resolveNatureImage?.(z[1],z[2]).then(src=>{if(src)document.getElementById('forestProfileImg').src=src}).catch(()=>{});
    p.querySelectorAll('.forest-wild').forEach(b=>b.onclick=()=>location.href=`species.html?id=${encodeURIComponent(b.dataset.species)}`);
    p.scrollIntoView({behavior:'smooth',block:'start'});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(!document.getElementById('forestGrid'))return;
    const r=document.getElementById('forestRegion');const regions=[...new Set((window.FOREST_ZONES||[]).map(x=>x[3]))].sort();r.innerHTML='<option value="all">ყველა რეგიონი</option>'+regions.map(x=>`<option>${esc(x)}</option>`).join('');
    document.getElementById('forestSearch').oninput=renderList;r.onchange=renderList;renderList();
    const requested=new URLSearchParams(location.search).get('name');
    if(requested){const z=(window.FOREST_ZONES||[]).find(x=>x[1]===requested);if(z)setTimeout(()=>select(z),50);}
  });
})();
