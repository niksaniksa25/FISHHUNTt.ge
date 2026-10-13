(function(){
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function imgFor(x){
    if(x[3]&&x[3]!=='—')return window.GeoImage?.placeholder?GeoImage.placeholder(x[1],x[4]==='ფრინველი'?'bird':'animal'):'';
    return window.GeoImage?.placeholder?GeoImage.placeholder(x[1],'nature'):'';
  }
  function render(){
    const q=(document.getElementById('redSearch')?.value||'').trim().toLowerCase();const type=document.getElementById('redType')?.value||'all';
    const list=(window.RED_BOOK||[]).filter(x=>(type==='all'||x[4]===type)&&(!q||x.join(' ').toLowerCase().includes(q)));
    const box=document.getElementById('redGrid');
    box.innerHTML=list.map((x,i)=>`<article class="red-card" data-id="${esc(x[0])}"><div class="red-image"><img loading="lazy" src="${imgFor(x)}" alt="${esc(x[1])}"><span>📕 ყურადღება</span></div><div class="red-body"><div class="red-kicker">${esc(x[4])} • ${esc(x[6])}</div><h3>${esc(x[1])}</h3><p>${esc(x[5])}</p><strong>${esc(x[7])}</strong><small>${esc(x[8])}</small><button class="btn ghost red-open" type="button" aria-label="${esc(x[1])} — ვრცლად">ვრცლად →</button></div></article>`).join('')||'<div class="empty">ჩანაწერი ვერ მოიძებნა.</div>';
    document.getElementById('redCount').textContent=`${list.length} ჩანაწერი`;
    box.querySelectorAll('.red-open').forEach(b=>b.onclick=()=>openRed((window.RED_BOOK||[]).find(x=>x[0]===b.closest('.red-card')?.dataset.id),b));
    box.querySelectorAll('.red-card img').forEach(img=>{const x=(window.RED_BOOK||[]).find(v=>v[0]===img.closest('.red-card')?.dataset.id);if(!x)return;if(x[3]&&x[3]!=='—')window.GeoImage?.resolveSpeciesImage?.(x[1],x[3],x[2]).then(src=>{if(src)img.src=src}).catch(()=>{})});
  }
  function openRed(x,trigger){
    if(!x)return;const p=document.getElementById('redProfile');p.innerHTML=`<button type="button" class="btn ghost" id="redBack">← ცნობართან დაბრუნება</button><div class="red-profile-head"><div><span class="eyebrow">RED BOOK • INFORMATION</span><h2>${esc(x[1])}</h2><p class="muted">${esc(x[2])} • ${esc(x[3])}</p></div><span class="red-badge">${esc(x[7])}</span></div><div class="red-profile-grid"><div><small>ტიპი</small><b>${esc(x[4])}</b></div><div><small>ჰაბიტატი</small><b>${esc(x[5])}</b></div><div><small>გავრცელება</small><b>${esc(x[6])}</b></div><div><small>მნიშვნელოვანი შენიშვნა</small><b>${esc(x[8])}</b></div></div><div class="red-note">📌 ეს გვერდი არის GeoNature-ის საინფორმაციო ცნობარი. სამართლებრივი სტატუსი, ნებართვა, სეზონი და დაცული სახეობების წესები გადაამოწმე მოქმედ ოფიციალურ წყაროში.</div>`;p.tabIndex=-1;p.focus({preventScroll:true});p.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('redBack').onclick=()=>{if(trigger?.isConnected){trigger.focus({preventScroll:true});trigger.scrollIntoView({behavior:'smooth',block:'center'});}else document.getElementById('redSearch').focus();};
  }
  document.addEventListener('DOMContentLoaded',()=>{if(!document.getElementById('redGrid'))return;document.getElementById('redSearch').oninput=render;document.getElementById('redType').onchange=render;render();});
})();
