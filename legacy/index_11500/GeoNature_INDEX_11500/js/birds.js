const BIRD_DATA = [
  {id:'quail', name:'მწყერი', scientific:'Coturnix coturnix', emoji:'🐦', type:'მწყრისებრი',
   habitat:'მაღალი ბალახი, მინდვრები და მარცვლეული კულტურების ლანდშაფტები',
   season:'გაზაფხული–შემოდგომა; სეზონურობა რეგიონზეა დამოკიდებული',
   activity:'დილა, საღამო და ზოგჯერ ღამით ხმოვანი აქტივობა',
   regions:[
    {name:'კახეთის აგროლანდშაფტების ზოგადი ზონა',lat:41.75,lon:45.95,desc:'ღია მინდვრებისა და ბალახოვანი ლანდშაფტების ფართო ტერიტორია'},
    {name:'ქვემო ქართლის ღია ლანდშაფტების ზონა',lat:41.48,lon:44.72,desc:'სასოფლო-სამეურნეო და ბალახოვანი გარემოს ფართო ზონა'},
    {name:'შიდა ქართლის ღია ლანდშაფტების ზონა',lat:41.98,lon:44.10,desc:'მინდვრებისა და ღია ტერიტორიების საინფორმაციო ზონა'},
    {name:'გურიის დაბლობის აგროლანდშაფტების ზონა',lat:41.95,lon:42.00,desc:'დაბლობის სასოფლო-სამეურნეო და ბალახოვანი გარემო'}
   ], note:'მწყერი ხშირად უფრო ადვილად ისმის, ვიდრე ჩანს. ეს გვერდი გამოიყენება ბუნებაზე დაკვირვებისთვის.'},
  {id:'chukar', name:'კაკაბი', scientific:'Alectoris chukar', emoji:'🪶', type:'კაკაბისებრი',
   habitat:'კლდოვანი, მშრალი ფერდობები და ღია მთიანი რელიეფი', season:'მთელი წელი; ადგილობრივი პირობები განსხვავდება', activity:'დილა და საღამო',
   regions:[
    {name:'ქვემო ქართლის მშრალი ლანდშაფტები',lat:41.43,lon:44.95,desc:'ღია და კლდოვანი რელიეფის ფართო ზონა'},
    {name:'კახეთის მშრალი ლანდშაფტები',lat:41.35,lon:45.65,desc:'მზიანი და არიდული ფერდობების ფართო ზონა'}
   ],note:'დაკვირვებისთვის ყურადღება მიაქციე ხმას და ღია ფერდობებს.'},
  {id:'snowcock', name:'კავკასიური შურთხი', scientific:'Tetraogallus caucasicus', emoji:'🏔️', type:'მთის ფრინველი',
   habitat:'მაღალმთიანი კლდოვანი ფერდობები', season:'მთიანი გარემოს სეზონური პირობების მიხედვით', activity:'დილა და დღის პირველი ნახევარი',
   regions:[
    {name:'დიდი კავკასიონის მაღალმთიანი ზონა',lat:42.45,lon:45.55,desc:'მაღალი მთებისა და კლდოვანი გარემოს ფართო ზონა'},
    {name:'სვანეთის მთიანი ზონა',lat:43.00,lon:42.73,desc:'მაღალი მთებისა და კლდოვანი რელიეფის საინფორმაციო ზონა'}
   ],note:'მაღალმთიან გარემოში ამინდის სწრაფი ცვლილება აუცილებლად გაითვალისწინე.'},
  {id:'eagle', name:'არწივები', scientific:'Aquila spp.', emoji:'🦅', type:'მტაცებელი ფრინველი',
   habitat:'კლდეები, მთები და ღია ლანდშაფტები', season:'სახეობის მიხედვით განსხვავდება', activity:'დილა და დღის პირველი ნახევარი',
   regions:[
    {name:'დიდი კავკასიონის მთიანი ზონა',lat:42.35,lon:44.75,desc:'ღია მთებისა და კლდოვანი რელიეფის ზოგადი ზონა'},
    {name:'ჯავახეთის ღია ლანდშაფტები',lat:41.38,lon:43.45,desc:'ღია სივრცეებისა და წყლის ობიექტების მიმდებარე გარემო'}
   ],note:'„არწივი“ რამდენიმე სახეობას შეიძლება ნიშნავდეს; ზუსტი იდენტიფიკაციისთვის ფოტო ან ხმა დაგეხმარება.'},
  {id:'pheasant', name:'ხოხობი', scientific:'Phasianus colchicus', emoji:'🪶', type:'ფრინველი',
   habitat:'მდინარისპირა ტყე, ბუჩქნარი და დაბლობის მოზაიკური ლანდშაფტები', season:'რეგიონის მიხედვით განსხვავდება', activity:'დილა და საღამო',
   regions:[
    {name:'აღმოსავლეთ საქართველოს დაბლობების ზოგადი ზონა',lat:41.72,lon:45.00,desc:'ბუჩქნარისა და სასოფლო-სამეურნეო ლანდშაფტების ფართო ზონა'},
    {name:'კოლხეთის დაბლობის ზოგადი ზონა',lat:42.18,lon:41.85,desc:'დაბლობი და წყლის ობიექტებთან დაკავშირებული ეკოსისტემები'}
   ],note:'ადგილობრივი გავრცელება სეზონურად იცვლება.'},
  {id:'heron', name:'დიდი თეთრი ყანჩა', scientific:'Ardea alba', emoji:'🪽', type:'წყალთან დაკავშირებული ფრინველი',
   habitat:'ტბები, მდინარეები, ჭაობები და სხვა წყლის ობიექტები', season:'მიგრაციისა და ადგილობრივი პოპულაციების მიხედვით', activity:'დილა და საღამო',
   regions:[
    {name:'კოლხეთის დაბლობის ჭარბტენიანი ზონა',lat:42.10,lon:41.85,desc:'ჭარბტენიანი ტერიტორიების ფართო საინფორმაციო ზონა'},
    {name:'ჯავახეთის ტბების ზონა',lat:41.35,lon:43.55,desc:'ტბებისა და წყლის ობიექტების მიმდებარე გარემო'}
   ],note:'წყლის დონე და სეზონი მნიშვნელოვან როლს თამაშობს.'}
];

const QUICK_Q=[
 ['რას ჭამს ეს ფრინველი?','diet'],
 ['სად არის მისი ჰაბიტატი?','habitat'],
 ['რომელ სეზონზეა უფრო აქტიური?','season'],
 ['დღის რომელ მონაკვეთშია აქტიური?','activity'],
 ['მაჩვენე მისი ზოგადი ზონები რუკაზე','map'],
 ['რა უნდა ვიცოდე დაკვირვებისას?','safety']
];
function birdById(id){return BIRD_DATA.find(x=>x.id===id)||BIRD_DATA[0];}
function esc(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function birdCardHtml(b){return `<div class="bird-symbol">${b.emoji}</div><span class="tag">${esc(b.type)}</span><h2>${esc(b.name)}</h2><p class="scientific">${esc(b.scientific)}</p><div class="bird-facts"><div><small>🌿 ჰაბიტატი</small><b>${esc(b.habitat)}</b></div><div><small>📅 სეზონი</small><b>${esc(b.season)}</b></div><div><small>⏰ ტიპური აქტივობა</small><b>${esc(b.activity)}</b></div></div><p class="bird-note">${esc(b.note)}</p>`}
function distanceKm(a,b){const R=6371,p=Math.PI/180,dLat=(b.lat-a.lat)*p,dLon=(b.lon-a.lon)*p,x=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}

async function nominatimSearch(q){
 const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1&countrycodes=ge&q='+encodeURIComponent(q);
 const r=await fetch(url,{headers:{'Accept':'application/json'}});if(!r.ok)throw new Error('geocode');return r.json();
}

function initBirdExplorer(){
 const select=document.getElementById('birdSelect'),card=document.getElementById('birdCard');
 const map=L.map('birdMap').setView([42.05,43.70],7);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
 const layer=L.layerGroup().addTo(map);let selected=BIRD_DATA[0],user=null;
 select.innerHTML=BIRD_DATA.map(b=>`<option value="${b.id}">${b.name} — ${b.scientific}</option>`).join('');
 function showZones(){
   layer.clearLayers();const bounds=[];
   selected.regions.forEach(r=>{const c=L.circle([r.lat,r.lon],{radius:14000,color:'#b5ee70',fillColor:'#b5ee70',fillOpacity:.12,weight:2}).addTo(layer);c.bindPopup(`<b>${esc(r.name)}</b><br><small>${esc(r.desc)}</small><br><small>ფართო საინფორმაციო ზონა; არა ზუსტი ბუდის/ლოკაციის წერტილი.</small>`);bounds.push([r.lat,r.lon]);});
   if(user){L.circleMarker([user.lat,user.lon],{radius:8,color:'#fff',fillColor:'#b5ee70',fillOpacity:1,weight:3}).addTo(layer).bindPopup('📍 შენი მდებარეობა');bounds.push([user.lat,user.lon]);}
   if(bounds.length)map.fitBounds(bounds,{padding:[28,28]});
   document.getElementById('nearestZone').innerHTML=user?(()=>{const n=[...selected.regions].sort((a,b)=>distanceKm(user,a)-distanceKm(user,b))[0];return `უახლოესი საინფორმაციო ზონა: <b>${esc(n.name)}</b> • დაახლოებით ${distanceKm(user,n).toFixed(0)} კმ. ეს არის ფართო ზონა და არა ზუსტი ბუდის/მოპოვების წერტილი.`})():'GPS ჩართე, რომ შენი მდებარეობიდან უახლოესი საინფორმაციო ზონა დაგითვალო.';
 }
 function render(){selected=birdById(select.value);card.innerHTML=birdCardHtml(selected);document.getElementById('mapLegend').textContent=selected.name+' • ზოგადი ზონები';showZones();}
 select.onchange=render;document.getElementById('showBirdMap').onclick=showZones;
 document.getElementById('locateBird').onclick=()=>navigator.geolocation?.getCurrentPosition(p=>{user={lat:p.coords.latitude,lon:p.coords.longitude};map.setView([user.lat,user.lon],10);showZones();},()=>document.getElementById('nearestZone').textContent='GPS ნებართვა ვერ მივიღე.',{enableHighAccuracy:true,timeout:10000,maximumAge:300000});
 const villageInput=document.getElementById('villageInput'),villageSearch=document.getElementById('villageSearch'),villageResults=document.getElementById('villageResults');
 async function findVillage(){const q=villageInput.value.trim();if(!q)return;villageResults.textContent='იტვირთება...';try{const data=await nominatimSearch(q+', საქართველო');villageResults.innerHTML=(data||[]).map((x,i)=>`<button class="search-chip" data-i="${i}">${esc(x.display_name.split(',')[0])} — ${esc(x.type||x.class||'place')}</button>`).join('')||'ვერ მოიძებნა';villageResults.querySelectorAll('.search-chip').forEach(b=>b.onclick=()=>{const x=data[+b.dataset.i],lat=+x.lat,lon=+x.lon;map.setView([lat,lon],14);L.popup().setLatLng([lat,lon]).setContent(`<b>${esc(x.display_name.split(',')[0])}</b><br><small>OpenStreetMap geocoding result</small>`).openOn(map);});}catch(e){villageResults.textContent='ძებნა დროებით მიუწვდომელია.';}}
 villageSearch.onclick=findVillage;villageInput.onkeydown=e=>{if(e.key==='Enter')findVillage()};
 const qa=document.getElementById('questionButtons'),answer=document.getElementById('qaAnswer');
 qa.innerHTML=QUICK_Q.map((q,i)=>`<button class="question" data-i="${i}">${q[0]}</button>`).join('');
 qa.querySelectorAll('.question').forEach(btn=>btn.onclick=()=>{const key=QUICK_Q[+btn.dataset.i][1];answer.innerHTML=quickAnswer(selected,key);if(key==='map')showZones();});
 function quickAnswer(b,key){
   if(key==='diet')return `<b>${esc(b.name)}</b>: რაციონი სახეობის მიხედვით იცვლება; დეტალური საკვები ჩვეულებრივ დაკავშირებულია მის ჰაბიტატთან და სეზონთან.`;
   if(key==='habitat')return `<b>ჰაბიტატი:</b> ${esc(b.habitat)}`;
   if(key==='season')return `<b>სეზონი:</b> ${esc(b.season)}`;
   if(key==='activity')return `<b>ტიპური აქტივობა:</b> ${esc(b.activity)}`;
   if(key==='map')return `<b>რუკა განახლდა.</b> ნაჩვენებია ${esc(b.name)}-ის ფართო საინფორმაციო ზონები.`;
   return `<b>დაკვირვების წესები:</b> დაიცავი დისტანცია, არ მიუახლოვდე ბუდეებს/ბარტყებს, არ აჭამო გარეული ფრინველი და წინასწარ შეამოწმე ამინდი და ტერიტორიის წესები.`;
 }
 const chat=document.getElementById('chat'),input=document.getElementById('aiInput'),send=document.getElementById('aiSend'),key=document.getElementById('aiKey'),save=document.getElementById('saveKey'),status=document.getElementById('aiStatus');
 key.value=sessionStorage.getItem('gn_pollinations_key')||'';status.textContent=key.value?'🟢 ონლაინ AI მზადაა':'🟢 ადგილობრივი AI მზადაა';
 save.onclick=()=>{const v=key.value.trim();if(v)sessionStorage.setItem('gn_pollinations_key',v);else sessionStorage.removeItem('gn_pollinations_key');status.textContent=v?'🟢 ონლაინ AI გასაღები ჩართულია':'🟢 მხოლოდ ადგილობრივი AI';};
 function msg(role,text){const d=document.createElement('div');d.className='chat-msg '+(role==='შენ'?'user':'ai');d.innerHTML=`<b>${esc(role)}</b><p>${text}</p>`;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;}
 function localAI(question){
   const q=question.toLowerCase();
   if(/მკვლელ|დაჭერ|მოპოვ|სროლ|სანადირ/.test(q))return 'ამ ჩატში დაგეხმარები ფრინველებზე დაკვირვებაში, ჰაბიტატზე, სეზონზე, ამინდსა და რუკაზე — არა ცხოველის/ფრინველის მოპოვების ან ნადირობის დაგეგმვაში.';
   if(/რუკ|სად|ადგილი|სოფელი|ქალაქ/.test(q)){showZones();return `რუკაზე ვაჩვენე ${selected.name}-ის ფართო საინფორმაციო ზონები. კონკრეტული სოფლის მოსაძებნად გამოიყენე მარცხენა ძებნა — ის ეძებს მთელ საქართველოს.`;}
   if(/ჰაბიტ|სად ცხოვრ/.test(q))return `${selected.name}-ის ჰაბიტატი: ${selected.habitat}.`;
   if(/სეზონ|როდის/.test(q))return `${selected.name}-ის სეზონური ინფორმაცია: ${selected.season}.`;
   if(/დილ|საღამ|ღამე|აქტიურ/.test(q))return `${selected.name}-ის ტიპური აქტივობის პერიოდი: ${selected.activity}.`;
   if(/ამინდ/.test(q))return 'Live ამინდისთვის გადადი „ამინდი“ გვერდზე; შეგიძლია მოძებნო ნებისმიერი ქალაქი ან სოფელი.';
   if(/წვიმ|ქარი|ტენიან|წნევ/.test(q))return 'ამინდის მაჩვენებლები Live რეჟიმში ჩანს ამინდის გვერდზე: ტემპერატურა, წნევა, ტენიანობა, ქარი, ნალექი, UV და ხილვადობა.';
   return `არჩეულია ${selected.name}. მკითხე ჰაბიტატზე, სეზონზე, აქტივობის დროზე, ამინდზე ან რუკაზე.`;
 }
 async function ask(){const q=input.value.trim();if(!q)return;msg('შენ',esc(q));input.value='';const k=sessionStorage.getItem('gn_pollinations_key');if(!k){msg('AI',localAI(q));return;}const waiting=document.createElement('div');waiting.className='chat-msg ai';waiting.innerHTML='<b>AI</b><p>ვფიქრობ...</p>';chat.appendChild(waiting);try{const body={model:'openai',messages:[{role:'system',content:`შენ ხარ GeoNature Georgia-ს ბუნების ასისტენტი. უპასუხე ქართულად. შენი თემა არის ფრინველებზე დაკვირვება, ჰაბიტატები, სეზონურობა, ამინდი, დაცული ტერიტორიები, რუკის გამოყენება და უსაფრთხო outdoor გეგმები. არ გასცე ნადირობის ან ცხოველის/ფრინველის მოპოვების ინსტრუქცია. აირჩეული ფრინველი: ${selected.name} (${selected.scientific}). ჰაბიტატი: ${selected.habitat}. სეზონი: ${selected.season}. აქტივობა: ${selected.activity}.`},{role:'user',content:q}]};const r=await fetch('https://gen.pollinations.ai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+k},body:JSON.stringify(body)});if(!r.ok)throw new Error('ai');const d=await r.json();const text=d?.choices?.[0]?.message?.content||'პასუხი ვერ მივიღე.';waiting.remove();msg('AI',esc(text).replace(/\n/g,'<br>'));}catch(e){waiting.remove();msg('AI',localAI(q));status.textContent='🟡 ონლაინ AI შეცდომა • ადგილობრივი რეჟიმი აქტიურია';}}
 send.onclick=ask;input.onkeydown=e=>{if(e.key==='Enter')ask()};msg('AI',`გამარჯობა! არჩეულია ${selected.name}. შეგიძლია ჰკითხო: „სად გვხვდება?“, „როდის არის აქტიური?“, „რომელი ჰაბიტატი მოსწონს?“ ან „რუკაზე მაჩვენე“.`);render();
}

document.addEventListener('DOMContentLoaded',initBirdExplorer);
