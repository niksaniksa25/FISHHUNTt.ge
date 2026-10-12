function initTogether(){
  const form=document.getElementById('tripForm');
  const feed=document.getElementById('tripFeed');
  const status=document.getElementById('tripStatus');
  if(!form||!feed) return;
  const key='geonature_trips_v2';
  const getTrips=()=>{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(t=>t&&typeof t==='object'&&typeof t.id==='string'):[]}catch(e){return[]}};
  const setTrips=(arr)=>{try{localStorage.setItem(key,JSON.stringify(arr));return true;}catch{if(status)status.textContent='ჩანაწერი ვერ შეინახა: ბრაუზერის მეხსიერება სავსეა ან შენახვა შეზღუდულია.';return false;}};
  const esc=(v)=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  function render(){
    const trips=getTrips();
    feed.innerHTML=trips.length?trips.map(t=>`<article class="trip-card"><small>${esc(t.date)} • GeoNature</small><h3>${esc(t.title)}</h3><p><b>📍</b> ${esc(t.place)}</p><p>${esc(t.text)}</p><div class="form-actions"><button class="btn ghost" data-edit="${esc(t.id)}">შეცვლა</button><button class="btn danger" data-delete="${esc(t.id)}">წაშლა</button></div></article>`).join(''):'<div class="empty"><span>🤝</span>ჯერ გასვლის პოსტები არ არის.</div>';
  }
  form.onsubmit=(e)=>{
    e.preventDefault();
    const title=document.getElementById('tripTitle').value.trim(), place=document.getElementById('tripPlace').value.trim(), date=document.getElementById('tripDate').value, text=document.getElementById('tripText').value.trim();
    if(!title||!place||!date){status.textContent='შეავსე სათაური, ლოკაცია და თარიღი.';return}
    const trips=getTrips(); trips.unshift({id:crypto.randomUUID?.()||Date.now().toString(),title,place,date,text}); if(!setTrips(trips))return; form.reset(); status.textContent='გასვლა ამ ბრაუზერში შეინახა. სხვებს ავტომატურად არ ეგზავნება.'; render();
  };
  feed.addEventListener('click',(e)=>{
    const edit=e.target.closest('[data-edit]'), del=e.target.closest('[data-delete]');
    if(edit){const trips=getTrips(), i=trips.findIndex(x=>x.id===edit.dataset.edit); if(i<0)return; const t=trips[i]; const title=prompt('ახალი სათაური:',t.title); if(title===null)return; const text=prompt('ახალი აღწერა:',t.text); if(text===null)return; trips[i]={...t,title:title.trim()||t.title,text}; setTrips(trips); render();}
    if(del){if(!confirm('წავშალოთ ეს პოსტი?'))return; setTrips(getTrips().filter(x=>x.id!==del.dataset.delete)); render();}
  });
  render();
}
