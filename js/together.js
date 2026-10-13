function initTogether(){
  const form=document.getElementById('tripForm'),feed=document.getElementById('tripFeed'),status=document.getElementById('tripStatus');
  if(!form||!feed||form.dataset.tripBound==='1')return;
  form.dataset.tripBound='1';
  const key='geonature_trips_v2',ids=['tripTitle','tripPlace','tripDate','tripText'];
  const fields=ids.map(id=>document.getElementById(id)),submit=form.querySelector('button[type="submit"]');
  let editingId=null;
  const message=text=>{if(status)status.textContent=text;};
  status?.setAttribute('role','status');status?.setAttribute('aria-live','polite');
  const today=()=>window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE');
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const getTrips=()=>{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(t=>t&&typeof t==='object'&&typeof t.id==='string'):[];}catch{return[];}};
  const setTrips=arr=>{try{localStorage.setItem(key,JSON.stringify(arr));return true;}catch{message('ჩანაწერი ვერ შეინახა: ბრაუზერის მეხსიერება სავსეა ან შენახვა შეზღუდულია.');return false;}};
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const cancel=document.createElement('button');cancel.id='tripCancelEdit';cancel.type='button';cancel.className='btn ghost';cancel.textContent='შეცვლის გაუქმება';cancel.hidden=true;submit?.after(cancel);
  function reset(){form.reset();editingId=null;cancel.hidden=true;if(submit)submit.textContent='გასვლის შენახვა';fields[2].value=today();}
  function render(){
    const date=today(),trips=getTrips().sort((a,b)=>{const pastA=String(a.date||'')<date,pastB=String(b.date||'')<date;if(pastA!==pastB)return pastA?1:-1;return pastA?String(b.date||'').localeCompare(String(a.date||'')):String(a.date||'').localeCompare(String(b.date||''));});
    feed.innerHTML=trips.length?trips.map(t=>`<article class="trip-card"><small>${esc(t.date)} • ${String(t.date||'')<date?'წინა გასვლა':'დაგეგმილი გასვლა'}</small><h3>${esc(t.title)}</h3><p><b>📍</b> ${esc(t.place)}</p><p>${esc(t.text)}</p><div class="form-actions"><button type="button" class="btn ghost" data-edit="${esc(t.id)}">შეცვლა</button><button type="button" class="btn primary" data-share="${esc(t.id)}">გაზიარება</button><button type="button" class="btn danger" data-delete="${esc(t.id)}">წაშლა</button></div><div class="trip-share" hidden><label>გასაზიარებელი ტექსტი<textarea class="trip-share-text" rows="5" readonly></textarea></label><button type="button" class="btn ghost" data-copy-trip="${esc(t.id)}">ტექსტის კოპირება</button></div></article>`).join(''):'<div class="empty"><span>🤝</span>ჯერ გასვლა არ დაგიგეგმავს. შეინახე თარიღი და ადგილი, შემდეგ გაუზიარე მეგობარს.</div>';
  }
  function shareText(trip){return `${trip.title}\n📍 ${trip.place}\n📅 ${trip.date}${trip.text?'\n'+trip.text:''}\n${new URL('together.html',document.baseURI).href}`;}
  cancel.onclick=()=>{reset();message('შეცვლა გაუქმდა.');};
  form.onsubmit=event=>{
    event.preventDefault();const[title,place,date,text]=fields.map(field=>field.value.trim());
    if(!title||!place||!validDate(date)){message('შეავსე სათაური, ლოკაცია და სწორი თარიღი.');return;}
    const trips=getTrips(),index=trips.findIndex(t=>t.id===editingId);
    if(editingId&&index<0){message('ეს გასვლა სხვა ჩანართში წაიშალა. შეინახე ახალი გასვლა.');editingId=null;return;}
    const record={id:editingId||window.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2),title,place,date,text};
    if(index>=0)trips[index]={...trips[index],...record};else trips.unshift(record);
    if(!setTrips(trips))return;reset();message('გასვლა ამ ბრაუზერში შეინახა. მეგობარს გაუგზავნე „გაზიარება“ ღილაკით.');render();
  };
  feed.addEventListener('click',async event=>{
    const button=event.target.closest('[data-edit],[data-delete],[data-share],[data-copy-trip]');if(!button)return;
    const id=button.dataset.edit||button.dataset.delete||button.dataset.share||button.dataset.copyTrip,trip=getTrips().find(t=>t.id===id);if(!trip)return;
    if(button.dataset.edit){editingId=id;[trip.title,trip.place,trip.date,trip.text].forEach((value,index)=>fields[index].value=String(value||''));cancel.hidden=false;if(submit)submit.textContent='ცვლილების შენახვა';message('შეცვალე სათაური, ადგილი, თარიღი ან აღწერა და შეინახე.');form.scrollIntoView?.({behavior:'smooth',block:'start'});fields[0].focus();return;}
    if(button.dataset.delete){if(!confirm('ეს გასვლა წავშალოთ?'))return;if(setTrips(getTrips().filter(t=>t.id!==id))){if(editingId===id)reset();render();message('გასვლა წაიშალა.');}return;}
    const text=shareText(trip),box=button.closest('.trip-card')?.querySelector('.trip-share'),area=box?.querySelector('textarea');
    if(button.dataset.share&&navigator.share){try{await navigator.share({title:trip.title,text});message('გასაზიარებელი ტექსტი გაიხსნა.');return;}catch(error){if(error.name==='AbortError')return;}}
    if(box){box.hidden=false;area.value=text;}
    if(button.dataset.copyTrip){try{await navigator.clipboard.writeText(text);message('გასვლის ტექსტი დაკოპირდა.');return;}catch{message('ტექსტი მონიშნულია — გამოიყენე ტელეფონის „კოპირება“ ან Ctrl+C.');}}
    else message('გასაზიარებელი ტექსტი მზადაა. დააკოპირე და გაუგზავნე მეგობარს.');
    area?.focus();area?.select();
  });
  window.addEventListener('storage',event=>{if(event.key===key)render();});
  if(!fields[2].value)fields[2].value=today();render();
}
