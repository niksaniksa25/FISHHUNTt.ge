(function(){
const esc=v=>GeoImage.esc(v);
const icons={fish:'🐟',bird:'🐦',mammal:'🦌',reptile:'🦎'};
function findSpecies(){const key=(new URLSearchParams(location.search).get('id')||'').trim().toLowerCase();const all=[...WILDLIFE.map(x=>({id:x[1],kind:x[0],name:x[1],english:x[2],scientific:x[3],type:x[4],habitat:x[5],range:x[6],season:x[7],activity:x[8]})),...(window.FISHES||[]).map(f=>({id:f[0],kind:'fish',name:f[1],english:f[2],type:f[3],habitat:f[4],range:f[5],weight:f[6],temp:f[7],pressure:f[8],wind:f[9],activity:f[10],scientific:f[11],season:'მონაცემი დამოკიდებულია სეზონზე'}))];return all.find(x=>[x.id,x.name,x.english,x.scientific].some(v=>String(v||'').toLowerCase()===key))||null}
function infoCard(i,label,value){return `<article class="info-card"><div class="info-icon">${i}</div><small>${esc(label)}</small><b>${esc(value||'—')}</b></article>`}
function speciesRules(x){
  const rules=window.GeoWildlifeRules,info=document.getElementById('infoGrid');
  if(!rules||!info)return;
  const section=document.createElement('section');section.className='species-legal-rules';
  const context=x.kind==='fish'?'<label for="speciesRuleMethod">ჭერის მეთოდი<select id="speciesRuleMethod"><option value="rod">სამოყვარულო ჭერა</option><option value="release">გაშვებით რეკრეაციული ჭერა</option><option value="other">სხვა მეთოდი</option></select></label>':'<label for="speciesRuleArea">მუნიციპალიტეტის ჯგუფი<select id="speciesRuleArea"><option value="unknown">ჯერ არ არის დაზუსტებული</option><option value="standard">სხვა მუნიციპალიტეტები</option><option value="highland">ახალქალაქი / ნინოწმინდა / წალკა / დმანისი</option></select></label>';
  section.innerHTML='<h2>მოპოვების შეზღუდვები</h2><div class="season-rules-date"><label for="speciesRuleDate">გასვლის თარიღი<input id="speciesRuleDate" type="date" value="'+rules.today()+'"></label>'+context+'</div><div id="speciesLegalStatus" aria-live="polite"></div>';
  info.parentElement.appendChild(section);
  const render=()=>rules.mount(document.getElementById('speciesLegalStatus'),x,{date:document.getElementById('speciesRuleDate').value,method:document.getElementById('speciesRuleMethod')?.value||'rod',area:document.getElementById('speciesRuleArea')?.value||'unknown'});
  section.querySelectorAll('input,select').forEach(control=>control.addEventListener('change',render));render();
}
let weatherRequest=0,geoPromise=null;
function currentLocation(){
  if(!geoPromise)geoPromise=new Promise(resolve=>{
    const fallback={lat:41.7151,lon:44.8271,name:'თბილისი (ნაგულისხმევი)'};
    if(!navigator.geolocation)return resolve(fallback);
    navigator.geolocation.getCurrentPosition(position=>{
      const lat=position.coords.latitude,lon=position.coords.longitude;
      resolve(window.GeoNatureCommon.validCoordinates(lat,lon)?{lat,lon,name:'GPS-ით არჩეული მდებარეობა'}:fallback);
    },()=>resolve(fallback),{enableHighAccuracy:false,timeout:3500,maximumAge:60000});
  });
  return geoPromise;
}
async function weather(species,options={}){
  const token=++weatherRequest,box=document.getElementById('environment'),button=document.getElementById('weatherRefresh');
  if(button)button.disabled=true;
  try{
    const location=await currentLocation(),data=await window.GeoNatureCommon.openMeteo(location.lat,location.lon,options);
    if(token!==weatherRequest)return;
    const common=window.GeoNatureCommon,row=common.currentWeatherRow(data),conditions=common.conditionsFromRow(row);
    const fmt=(value,suffix='',digits=1)=>common.numberOrNull(value)===null?'—':Number(value).toFixed(digits)+suffix;
    const items=[['🌡️','ტემპერატურა',fmt(row?.temperature,' °C')],['💧','ტენიანობა',fmt(row?.humidity,' %',0)],['💨','ქარი',fmt(row?.wind,' კმ/სთ')],['🧭','წნევა',fmt(row?.pressure,' hPa')],['🌧️','ნალექი',fmt(row?.precip,' მმ')],['📍','მდებარეობა',location.name],['🕐','დროის ზონა',data.timezone||'—'],['🔄','მონაცემის დრო',data.current.time.replace('T',' ')]];
    const fish=(window.FISHES||[]).find(f=>f[0]===species?.id);
    const score=species?.kind==='fish'&&window.GeoFishChance?window.GeoFishChance(fish,conditions):common.outdoorScore(conditions);
    const scoreLabel=species?.kind==='fish'?'სათევზაო პირობების ინდექსი':'გარემოს პირობების ინდექსი';
    box.innerHTML=`<div class="weather-status">${data.__meta?.stale?'ბოლო ხელმისაწვდომი მონაცემი':'მიმდინარე მოდელის მონაცემი'} • ${esc(location.name)} • ${esc(data.current.time.replace('T',' '))}</div><div class="environment-grid">${items.map(item=>`<div class="environment-item"><span>${item[0]} ${esc(item[1])}</span><b>${esc(item[2])}</b></div>`).join('')}</div>${window.GeoChanceUI?.markup?window.GeoChanceUI.markup(score,scoreLabel):''}<p class="muted">ინდექსი ამ მდებარეობის ამინდს აფასებს; რეალური დაჭერის ან სახეობის დანახვის ალბათობა არ არის.</p>`;
    window.dispatchEvent(new CustomEvent('gn:weatherUpdated',{detail:{data,locationName:location.name,selectedCurrent:true}}));
  }catch(error){
    if(token!==weatherRequest)return;
    box.innerHTML='<div class="loading-box">მიმდინარე ამინდის მონაცემები დროებით ვერ ჩაიტვირთა. სცადე განახლება.</div>';
    window.dispatchEvent(new CustomEvent('gn:weatherUpdated',{detail:{data:null}}));
  }finally{if(token===weatherRequest&&button)button.disabled=false;}
}
async function init(){const x=findSpecies();if(!x){document.getElementById('speciesName').textContent='სახეობა ვერ მოიძებნა';return}document.title=`GeoNature • ${x.name}`;document.getElementById('speciesType').textContent=`${icons[x.kind]||'🌿'} ${x.type}`;document.getElementById('speciesName').textContent=x.name;document.getElementById('speciesScientific').textContent=`${x.english} • ${x.scientific}`;const params=new URLSearchParams(location.search);const passedChance=window.GeoNatureCommon.numberOrNull(params.get('chance'));const hasPassedChance=passedChance!==null&&passedChance>=0&&passedChance<=100;const zone=window.GeoNatureCommon.zonedDateTime();const chance=hasPassedChance?Math.round(passedChance):(x.kind==='fish'?null:window.GeoWildlifeChance?window.GeoWildlifeChance([x.kind,x.name,x.english,x.scientific,x.type,x.habitat,x.range,x.season,x.activity],{date:zone?.date,local_hour:zone?.hour}):null);const redHit=(window.RED_BOOK||[]).find(r=>r[1]===x.name);const redHtml=redHit?`<span style="display:inline-flex;margin-top:8px;padding:6px 9px;border-radius:999px;background:#4f1818;color:#ffd5d5;border:1px solid rgba(255,150,150,.16);font-size:9px;font-weight:900">📕 ${GeoImage.esc(redHit[7])}</span>`:'';document.getElementById('speciesLead').innerHTML=`${GeoImage.esc(x.type)}: ${GeoImage.esc(x.habitat)}. გავრცელება — ${GeoImage.esc(x.range)}.<br>${window.GeoChanceUI?.markup?window.GeoChanceUI.markup(chance,hasPassedChance?'წინა გვერდის ინდექსი':x.kind==='fish'?'სათევზაო პირობების ინდექსი':'აქტივობის საორიენტაციო ინდექსი'):''}${redHtml}<small class="muted">${hasPassedChance?'ბმულიდან მიღებული საორიენტაციო შეფასება. ':''}ინდექსი რეალური დაჭერის ან დანახვის ალბათობა არ არის.</small>`;
let history=`${x.name} (${x.english}) საქართველოს ბუნებრივ გარემოში დაკავშირებულია ${x.habitat.toLowerCase()} ჰაბიტატებთან. მისი გავრცელება და აქტიურობა იცვლება სეზონის, ტემპერატურის, წყლის/ჰაბიტატის მდგომარეობისა და ადგილობრივი პირობების მიხედვით.`;if(x.kind==='fish')history=`${x.name} (${x.english}) საქართველოს წყლებში საინტერესო სახეობაა. მისი აქტიურობა განსაკუთრებით დამოკიდებულია წყლის ტემპერატურაზე, სეზონზე, დინებასა და ამინდის ცვლილებაზე. კონკრეტულ წყალსატევში პირობები შეიძლება მნიშვნელოვნად განსხვავდებოდეს.`;document.getElementById('history').textContent=history;
const facts=x.kind==='fish'?[`სასურველი წყლის ტემპერატურის დიაპაზონი: ${x.temp}.`,`სავარაუდო წონა: ${x.weight}.`,`აქტიურობის დრო: ${x.activity}.`,`ქარის საინფორმაციო დიაპაზონი: ${x.wind}.`,`ძირითადი გარემო: ${x.habitat}.`]:[`ძირითადი ჰაბიტატი: ${x.habitat}.`,`საქართველოში გავრცელება: ${x.range}.`,`სეზონი: ${x.season}.`,`აქტიურობის დრო: ${x.activity}.`,`სამეცნიერო სახელი: ${x.scientific}.`];document.getElementById('facts').innerHTML=facts.map(f=>`<li>${esc(f)}</li>`).join('');
const quick=[['🏠','ჰაბიტატი',x.habitat],['📍','გავრცელება',x.range],['🗓️','სეზონი',x.season],['🕐','აქტიურობა',x.activity],['⚖️','წონა',x.weight||'ბუნებრივად განსხვავდება'],['🌡️','ტემპერატურა',x.temp||'გარემოზეა დამოკიდებული']];document.getElementById('quickStats').innerHTML=quick.map(s=>`<div class="quick-stat"><small>${s[0]} ${esc(s[1])}</small><b>${esc(s[2])}</b></div>`).join('');
let info=[['🏠','საცხოვრებელი გარემო',x.habitat],['📍','გავრცელების არეალი',x.range],['🗓️','სეზონი',x.season],['🕐','აქტიურობის დრო',x.activity],['🔬','სამეცნიერო სახელი',x.scientific],['🌐','ინგლისური სახელი',x.english]];if(x.kind==='fish')info=[...info,['⚖️','სავარაუდო წონა',x.weight],['🌡️','სასურველი წყლის ტემპერატურა',x.temp],['💨','ქარის საინფორმაციო დიაპაზონი',x.wind],['🧭','ატმოსფერული წნევის დიაპაზონი',x.pressure]];document.getElementById('infoGrid').innerHTML=info.map(s=>infoCard(s[0],s[1],s[2])).join('');
if(x.kind==='fish'){const links=(window.WATERS||[]).filter(w=>String(w[6]||'').split(',').includes(x.id)).slice(0,12);const host=document.getElementById('infoGrid');if(links.length){const wrap=document.createElement('div');wrap.className='species-water-links';wrap.innerHTML=`<div class="species-water-title">📍 სახეობის ცნობარში დაკავშირებული წყალსატევები</div><div class="species-water-grid">${links.map(w=>`<a href="place-details.html?id=${encodeURIComponent(w[0])}">${GeoImage.esc(w[1])}<small>${GeoImage.esc(w[3])}</small></a>`).join('')}</div>`;host.parentElement.appendChild(wrap)}}

const ph=GeoImage.placeholder(x.name,x.kind==='fish'?'fish':x.kind==='bird'?'bird':x.kind==='mammal'?'animal':'nature');document.getElementById('heroImg').src=ph;GeoImage.resolveSpeciesImage(x.name,x.scientific,x.english).then(src=>document.getElementById('heroImg').src=src).catch(()=>{});
const gallery=document.getElementById('gallery');gallery.innerHTML=Array.from({length:4},(_,i)=>`<figure><img src="${ph}" alt="${esc(x.name)}"><figcaption>${esc(x.name)} • ფოტო ${i+1}</figcaption></figure>`).join('');if(GeoImage.resolveSpeciesGallery){GeoImage.resolveSpeciesGallery(x.name,x.scientific,x.english).then(imgs=>imgs.forEach((src,i)=>{const im=gallery.querySelectorAll('img')[i];if(im)im.src=src})).catch(()=>{})}if(x.kind!=='fish'){const forestNames=window.FOREST_HABITATS?.[x.name]||[];const host=document.getElementById('infoGrid');if(forestNames.length){const wrap=document.createElement('div');wrap.className='species-water-links';wrap.innerHTML=`<div class="species-water-title">🌲 დაკავშირებული ტყის ზონები</div><div class="species-water-grid">${forestNames.map(n=>`<a href="forests.html?name=${encodeURIComponent(n)}">${GeoImage.esc(n)}<small>ტყის ჰაბიტატი</small></a>`).join('')}</div>`;host.parentElement.appendChild(wrap)}}
speciesRules(x);weather(x);document.getElementById('weatherRefresh').onclick=()=>weather(x,{force:true});setInterval(()=>weather(x),300000)}
document.addEventListener('DOMContentLoaded',init);})();
