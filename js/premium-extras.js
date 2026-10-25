(function(){
'use strict';
const $=id=>document.getElementById(id);
const common=()=>window.GeoNatureCommon||{};
const has=plan=>Boolean(window.GNPremium?.has?.(plan));
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const num=value=>{if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;};
const clamp=value=>Math.max(0,Math.min(100,Math.round(value)));
const scoreClass=value=>value>=80?'good':value>=50?'mid':'bad';
const msg='მონაცემები მიუწვდომელია. სცადე განახლება.';
let weather=null,water=null,fish=null,requestToken=0,started=false,timer=null,loadedAt=0;
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
function conditions(row){return common().conditionsFromRow?.(row)||null;}
function score(row,target=fish,destination=water){const c=conditions(row);return c&&typeof window.GeoFishChance==='function'?window.GeoFishChance(target,c,destination,true):null;}
function locationClock(data,now=new Date()){return common().zonedDateTime?.(data,now)||null;}
function fresh(data,now=new Date()){
  if(!data?.current?.time||data.__meta?.stale)return false;
  const clock=locationClock(data,now);if(!clock)return false;
  // Both values are in the forecast location's timezone, including on phones abroad.
  const age=Date.parse(clock.iso+'Z')-Date.parse(data.current.time+'Z');
  return Number.isFinite(age)&&age>=-30*60000&&age<=90*60000;
}
function rows(data){return common().hourlyRows?.(data)||[];}
function futureRows(data,now=new Date()){
  const clock=locationClock(data,now);if(!clock)return [];
  const first=clock.iso.slice(0,13)+':00',days=Math.max(1,Math.min(7,window.GNPremium?.maxForecastDays?.()||3));
  const dates=(data?.daily?.time||[]).filter(day=>day>=clock.date).slice(0,days);
  return rows(data).filter(row=>row.iso>=first&&dates.includes(row.date));
}
function rankedHours(data,target=fish,destination=water,now=new Date()){
  return futureRows(data,now).map(row=>({row,score:score(row,target,destination)})).filter(x=>x.score!==null).sort((a,b)=>b.score-a.score||a.row.iso.localeCompare(b.row.iso));
}
function currentRow(){return weather&&common().currentWeatherRow?.(weather)||null;}
function legal(target,date,destination=water){return window.GeoWildlifeRules?.evaluate?.(target,{kind:'fish',date,method:'rod',waterId:destination?.[0],location:destination?.[1]})||null;}
function legalCopy(rule){return rule?esc(rule.title):'მოპოვების წესი წინასწარ გადაამოწმე.';}
function setText(id,value){const el=$(id);if(el)el.textContent=value;}
function setHTML(id,value){const el=$(id);if(el)el.innerHTML=value;}
function stamp(){
  const active=Boolean(weather&&fresh(weather));
  setText('liveStatus',active?'პროგნოზი განახლებულია':'ამინდი მიუწვდომელია');
  $('toolsStatus')?.classList.toggle('is-unavailable',!active);
  const source=weather?.__meta?.source||'Open-Meteo';
  setText('updatedAt',active?`${water?.[1]||''} • ${weather.current.time.replace('T',' ')} • ${source}`:'რეალურ მონაცემებს ველოდებით');
}
function clearWeather(message=msg){
  weather=null;stamp();setText('bestTime','—');setText('bestScore','—');setText('bestPlace',water?.[1]||'—');
  for(const id of ['biteNow','fishTimeline','stargazing','alertState'])setText(id,message);
  setText('bestNote',message);setText('tripResult','ჯერ განაახლე არჩეული ადგილის ამინდი.');
  setText('hotspots','ადგილების შედარება ჯერ არ ჩატარებულა.');
  if($('safetyPanel')&&!$('safetyPanel').classList.contains('hidden'))safety();
}
function renderBest(){
  if(!has('plus'))return;
  const best=weather&&rankedHours(weather)[0];
  setText('bestActivity',`🎣 ${fish?.[1]||'თევზაობა'}`);setText('bestPlace',water?.[1]||'—');
  if(!best){setText('bestTime','—');setText('bestScore','—');setText('bestNote',msg);return;}
  setText('bestTime',best.row.iso.replace('T',' '));setText('bestScore',best.score+'/100');
  const rule=legal(fish,best.row.date);
  setHTML('bestNote',`საორიენტაციო პირობების ინდექსი, არა დაჭერის ალბათობა. ${legalCopy(rule)}`);
}
function renderBite(){
  if(!has('plus')||!$('biteNow'))return;
  const row=currentRow();if(!row){setText('biteNow',msg);return;}
  const ids=String(water?.[6]||'').split(',');
  const list=(window.FISHES||[]).filter(f=>ids.includes(f[0])).map(f=>({fish:f,score:score(row,f),rule:legal(f,row.date)})).filter(x=>x.score!==null).sort((a,b)=>b.score-a.score).slice(0,4);
  setHTML('biteNow',list.length?list.map(x=>`<div class="mini-row"><b>🎣 ${esc(x.fish[1])}</b><span>${legalCopy(x.rule)}</span><span class="score-pill score-${scoreClass(x.score)}">${x.score}/100</span></div>`).join(''):'ამ ადგილას სახეობების შეფასებისთვის მონაცემები არასაკმარისია.');
}
function fishTimeline(){
  if(!has('plus')||!$('fishTimeline'))return;
  const clock=weather&&locationClock(weather);const today=clock?futureRows(weather).filter(row=>row.date===clock.date):[];
  const list=today.map(row=>({row,score:score(row)})).filter(x=>x.score!==null);
  setHTML('fishTimeline',list.length?list.map(x=>`<div class="time-bar"><span>${esc(x.row.time)}</span><i class="${scoreClass(x.score)}" style="height:${Math.max(4,x.score)}%"></i><b>${x.score}</b></div>`).join(''):'დღევანდელი საათობრივი პროგნოზი მიუწვდომელია.');
}
function nightAt(data,row){
  const index=data?.daily?.time?.indexOf(row.date)??-1;if(index<0)return null;
  const sunrise=data.daily.sunrise?.[index],sunset=data.daily.sunset?.[index];
  if(!sunrise||!sunset)return null;
  return row.iso<sunrise||row.iso>=sunset;
}
function skyAssessment(data,row){
  if(!row||nightAt(data,row)!==true)return null;
  const cloud=num(row.cloud),visibility=num(row.visibility);if(cloud===null||cloud<0||cloud>100||visibility===null||visibility<0)return null;
  // This describes forecast cloud/visibility only; no fabricated moon or light-pollution data.
  return {score:clamp((100-cloud)*Math.min(1,visibility/10000)),cloud,visibility};
}
function stargazing(){
  if(!has('plus')||!$('stargazing'))return;
  const list=weather?futureRows(weather).map(row=>({row,sky:skyAssessment(weather,row)})).filter(x=>x.sky).sort((a,b)=>b.sky.score-a.sky.score||a.row.iso.localeCompare(b.row.iso)):[];
  const best=list[0];if(!best){setText('stargazing','ღამის ღრუბლიანობისა და ხილვადობის მონაცემები მიუწვდომელია.');return;}
  setHTML('stargazing',`<b>ღამის ამინდის ინდექსი: ${best.sky.score}/100</b><br>${esc(best.row.iso.replace('T',' '))}<br>ღრუბლიანობა: ${best.sky.cloud}% • ხილვადობა: ${(best.sky.visibility/1000).toFixed(1)} კმ<br><span class="muted">მთვარის განათება, სინათლის დაბინძურება და ასტრონომიული ბინდი აქ არ იზომება.</span>`);
}
function threshold(){const value=num(read('gn_alert_threshold',80));return [70,80,90].includes(value)?value:80;}
function smartAlert(){
  if(!has('plus')||!$('alertState'))return;const limit=threshold();if($('alertThreshold'))$('alertThreshold').value=String(limit);
  const current=score(currentRow()),next=weather&&futureRows(weather).map(row=>({row,score:score(row)})).find(x=>x.score!==null&&x.score>=limit);
  if(current===null){setText('alertState',msg+' შეტყობინება ვერ შემოწმდა.');return;}
  setHTML('alertState',`<b>${current>=limit?'🔔 ზღვარი შესრულდა':'⏳ ზღვარი ჯერ არ შესრულდა'}</b><br>ამჟამინდელი პირობები: ${current}/100 • ზღვარი: ${limit}${next?`<br>პროგნოზში პირველი შესაბამისი საათი: ${esc(next.row.iso.replace('T',' '))}`:'<br>ხელმისაწვდომ პროგნოზში შესაბამისი საათი არ არის.'}<br><span class="muted">შემოწმება მუშაობს გახსნილ გვერდზე. ეს სერვერის push შეტყობინება არ არის.</span>`);
}
function saveAlert(){if(!has('plus'))return;if(!write('gn_alert_threshold',num($('alertThreshold')?.value)||80)){setText('alertState','შენახვა ვერ მოხერხდა. ბრაუზერის მეხსიერება შეამოწმე.');return;}smartAlert();}
function catchHistory(){
  let state;try{state=window.GeoNaturePlus?.state?.()||read('geonature_plus_v1',{});}catch{state={};}
  const catches=Array.isArray(state?.catches)?state.catches:[],log=read('gn_catches',[]);
  const records=[...catches,...(Array.isArray(log)?log:[])].filter(x=>x&&typeof x==='object').map(x=>({...x,fish:String(x.fish||x.species||'უცნობი')}));
  return {records,favorites:Array.isArray(state?.favorites)?state.favorites:[],plans:Array.isArray(state?.plans)?state.plans:[]};
}
function recordSummary(records){
  const counts=new Map();for(const record of records)counts.set(record.fish,(counts.get(record.fish)||0)+1);
  const favorite=[...counts].sort((a,b)=>b[1]-a[1])[0]||null;
  const weights=records.map(x=>({fish:x.fish,weight:num(x.weight)})).filter(x=>x.weight!==null&&x.weight>0);
  const max=weights.slice().sort((a,b)=>b.weight-a.weight)[0]||null;
  return {favorite,total:records.length,weighed:weights.length,average:weights.length?weights.reduce((sum,x)=>sum+x.weight,0)/weights.length:null,max};
}
function personal(){
  if(!$('personalInsight'))return;const data=catchHistory(),summary=recordSummary(data.records);
  setHTML('personalInsight',summary.favorite?`<b>ყველაზე ხშირად ჩაწერილი სახეობა:</b> ${esc(summary.favorite[0])}<br>ჩანაწერები: ${summary.total} • რჩეულები: ${data.favorites.length} • გეგმები: ${data.plans.length}<br><span class="muted">პირადი ჩანაწერებია ამ ბრაუზერში. დაჭერის დროისა და პირობების კავშირი ამ მონაცემებით დადასტურებული არ არის.</span>`:'ჯერ პირადი ჩანაწერი არ არის. დაამატე Catch Log-ში ან პირად დაფაზე.');
}
function predictor(){
  if(!$('predictor'))return;if(!has('pro')){setText('predictor','პირადი სტატისტიკა AI Pro-შია.');return;}
  const summary=recordSummary(catchHistory().records);
  setHTML('predictor',summary.weighed?`<b>ჩაწერილი საშუალო წონა:</b> ${summary.average.toFixed(2)} კგ (${summary.weighed} ჩანაწერი)<br><b>მაქსიმალური წონა:</b> ${summary.max.weight.toFixed(2)} კგ • ${esc(summary.max.fish)}<br><span class="muted">ეს რეალური ჩანაწერების სტატისტიკაა; მომავალი რეკორდის პროგნოზი არ არის.</span>`:'წონიანი ჩანაწერი ჯერ არ არის. დაამატე წონა პირად Catch Log-ში.');
}
function reports(){
  if(!$('reports'))return;const saved=read('gn_reports',[]),data=Array.isArray(saved)?saved.filter(x=>x&&typeof x==='object'):[];
  setHTML('reports',data.length?data.slice(-6).reverse().map(x=>{const date=num(x.createdAt),when=date!==null?new Date(date).toLocaleString('ka-GE',{timeZone:'Asia/Tbilisi'}):'დრო არ არის მითითებული';return `<div class="mini-row"><b>${esc(x.place)}</b><span>${esc(x.fish||x.a)}</span><span>${esc(when)}</span></div>`;}).join(''):'შენახული ცნობა ჯერ არ არის. ჩანაწერები რჩება მხოლოდ ამ ბრაუზერში.');
}
function addReport(){
  if(!has('plus'))return;const place=$('reportPlace')?.value.trim().slice(0,160),name=$('reportFish')?.value.trim().slice(0,160),activity=$('reportActivity')?.value==='hunting'?'hunting':'fishing';
  if(!place||!name){setText('reportStatus','შეავსე ადგილი და სახეობა.');return;}
  const saved=read('gn_reports',[]),data=Array.isArray(saved)?saved:[];data.push({place,fish:name,a:activity,createdAt:Date.now()});
  if(!write('gn_reports',data.slice(-200))){setText('reportStatus','შენახვა ვერ მოხერხდა. ბრაუზერის მეხსიერება შეამოწმე.');return;}
  $('reportPlace').value='';$('reportFish').value='';setText('reportStatus','შენახულია მხოლოდ ამ ბრაუზერში.');reports();
}
function trip(){
  if(!has('pro'))return;const best=weather&&rankedHours(weather)[0];if(!best){setText('tripResult',msg);return;}
  const q=$('tripPrompt')?.value.trim().slice(0,400)||'',rule=legal(fish,best.row.date);
  if(rule?.status==='prohibited'){setHTML('tripResult',`<b>${legalCopy(rule)}</b><br>ამ სახეობის მოპოვების გეგმა ვერ შედგება. აირჩიე სხვა სახეობა და გადაამოწმე კონკრეტული ადგილის წესი.`);return;}
  setHTML('tripResult',`<b>გასვლის მონახაზი არჩეული ადგილისთვის</b><br>📍 ${esc(water[1])}<br>🎣 ${esc(fish[1])}<br>🕖 ${esc(best.row.iso.replace('T',' '))}<br>პირობების ინდექსი: ${best.score}/100<br>${legalCopy(rule)}<br><span class="muted">ადგილი და სახეობა აირჩევა ზედა კონტროლებით. ეს ამინდის მიხედვით შედგენილი მონახაზია.</span>${q?`<br>შენი შენიშვნა: ${esc(q)}`:''}`);
}
async function safety(){
  if(!$('safetyPanel'))return;
  let gps= navigator.geolocation?'ადგილმდებარეობა არ არის გაზიარებული':'ბრაუზერი GPS-ს არ უჭერს მხარს';
  try{if(navigator.geolocation&&navigator.permissions){const permission=await navigator.permissions.query({name:'geolocation'});gps=permission.state==='granted'?'მდებარეობის ნებართვა მიღებულია; ზუსტი მდებარეობისთვის დააჭირე GPS-ს':permission.state==='denied'?'მდებარეობის ნებართვა უარყოფილია':'მდებარეობის ნებართვა ჯერ არ არის მიღებული';}}catch{}
  const clock=weather&&locationClock(weather),index=weather?.daily?.time?.indexOf(clock?.date)??-1;
  const sunset=index>=0?weather.daily.sunset?.[index]:null;
  const assessment=window.FishHuntWeatherHazards?.evaluate?.(weather,{lat:water?.[4],lon:water?.[5]});
  const assessed=assessment&&['live','partial'].includes(assessment.status),risks=assessed?assessment.hazards:[];
  const riskText=!assessed?'მონაცემი მოძველებულია ან არასაკმარისია — რისკი ვერ შეფასდა':risks.length?'⚠️ '+risks.map(item=>item.title).join(' • ')+(assessment.status==='partial'?' • მონაცემები ნაწილობრივია':''):assessment.status==='partial'?'მონაცემები არასრულია — ყველა რისკი ვერ შემოწმდა':'შემოწმებული ქარის, ჭექა-ქუხილისა და ნალექის ზღვარი არ გადაჭარბებულა';
  setHTML('safetyPanel',`<b>🛟 გასვლამდე გადაამოწმე</b><br>GPS: ${esc(gps)}<br>მზის ჩასვლა: ${sunset?esc(sunset.slice(11,16))+' (არჩეული ადგილის დრო)':'მონაცემი მიუწვდომელია'}<br>ამინდი: ${esc(riskText)}<br>ბატარეა: დატენე მოწყობილობა; დონე აქ არ იზომება.<br>📞 საგანგებო: <a href="tel:112">112</a><br><span class="muted">ამინდის მოდელი აფასებს მიმდინარე და უახლოეს ექვს საათობრივ პერიოდს. ადგილობრივი საფრთხე, წყლის დონე და ტალღა აქ არ იზომება. გადაამოწმე ოფიციალური გაფრთხილებები.</span>`);
  $('safetyPanel').classList.remove('hidden');
}
function renderWeather(){stamp();renderBest();renderBite();fishTimeline();stargazing();smartAlert();if($('safetyPanel')&&!$('safetyPanel').classList.contains('hidden'))safety();}
async function refresh(){
  if(!has('plus')||!water||typeof common().openMeteo!=='function')return;
  const token=++requestToken,destination=water;
  clearWeather('არჩეული ადგილის პროგნოზი იტვირთება…');setText('liveStatus','იტვირთება…');
  try{
    const data=await common().openMeteo(destination[4],destination[5]);
    if(token!==requestToken)return;
    if(!fresh(data)||!common().currentWeatherRow?.(data)){clearWeather('მიმდინარე ამინდის ახალი მონაცემები მიუწვდომელია.');return;}
    weather=data;loadedAt=Date.now();renderWeather();
  }catch{if(token===requestToken)clearWeather();}
}
async function hotspots(){
  if(!has('pro')||!fish||!$('hotspots'))return;
  const target=fish,token=requestToken,button=$('compareHotspots');if(button)button.disabled=true;
  const destinations=(window.WATERS||[]).filter(x=>num(x[4])!==null&&num(x[5])!==null&&String(x[6]).split(',').includes(target[0])).slice(0,4);
  setText('hotspots','ადგილების პროგნოზების შედარება…');
  try{
    const result=await Promise.all(destinations.map(async destination=>{try{const data=await common().openMeteo(destination[4],destination[5]);if(!fresh(data))return null;const row=common().currentWeatherRow?.(data),value=score(row,target,destination);return value===null?null:{destination,score:value,time:row.time,rule:legal(target,row.date,destination)};}catch{return null;}}));
    if(token!==requestToken||target!==fish){setText('hotspots','არჩევანი შეიცვალა. შედარება თავიდან გაუშვი.');return;}
    const valid=result.filter(Boolean).sort((a,b)=>b.score-a.score);
    setHTML('hotspots',valid.length?valid.map(x=>`<div class="mini-row"><b>${esc(x.destination[1])}</b><span>${esc(x.time)} • ${legalCopy(x.rule)}</span><span class="score-pill score-${scoreClass(x.score)}">${x.score}/100</span></div>`).join(''):'ადგილების ახალი პროგნოზები მიუწვდომელია.');
  }finally{if(button)button.disabled=false;}
}
function chooseWater(){water=(window.WATERS||[]).find(x=>x[0]===$('toolsLocation')?.value)||null;refresh();}
function chooseFish(){fish=(window.FISHES||[]).find(x=>x[0]===$('toolsFish')?.value)||null;setText('hotspots','არჩევანი შეიცვალა. ადგილები თავიდან შეადარე.');renderWeather();}
function gps(){
  if(!navigator.geolocation){setText('locationStatus','ბრაუზერი GPS-ს არ უჭერს მხარს. აირჩიე ადგილი სიიდან.');return;}
  setText('locationStatus','მდებარეობის ნებართვას ველოდებით…');
  navigator.geolocation.getCurrentPosition(position=>{
    const a=position.coords.latitude,b=position.coords.longitude;
    const candidates=(window.WATERS||[]).filter(x=>num(x[4])!==null&&num(x[5])!==null);
    const nearest=candidates.map(x=>({water:x,d:(Number(x[4])-a)**2+(Number(x[5])-b)**2*Math.cos(a*Math.PI/180)**2})).sort((x,y)=>x.d-y.d)[0]?.water;
    if(!nearest){setText('locationStatus','ახლომდებარე წყალსატევი ვერ მოიძებნა.');return;}
    $('toolsLocation').value=nearest[0];setText('locationStatus',`შერჩეულია სიაში უახლოესი წყალსატევი: ${nearest[1]}. პროგნოზი მის კოორდინატებზეა.`);chooseWater();
  },()=>setText('locationStatus','მდებარეობა ვერ მივიღეთ. აირჩიე წყალსატევი სიიდან.'),{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
function init(){
  if(started||!has('plus'))return;started=true;
  const waters=(window.WATERS||[]).filter(x=>num(x[4])!==null&&num(x[5])!==null),fishes=window.FISHES||[];
  setHTML('toolsLocation',waters.map(x=>`<option value="${esc(x[0])}">${esc(x[1])}</option>`).join(''));
  setHTML('toolsFish',fishes.map(x=>`<option value="${esc(x[0])}">${esc(x[1])}</option>`).join(''));
  water=waters[0]||null;fish=fishes[0]||null;
  $('toolsLocation')?.addEventListener('change',chooseWater);$('toolsFish')?.addEventListener('change',chooseFish);$('toolsGps')?.addEventListener('click',gps);
  $('refreshBest')?.addEventListener('click',refresh);$('saveAlert')?.addEventListener('click',saveAlert);$('addReport')?.addEventListener('click',addReport);$('buildTrip')?.addEventListener('click',trip);$('safetyMode')?.addEventListener('click',safety);$('compareHotspots')?.addEventListener('click',hotspots);
  reports();personal();predictor();refresh();
  timer=setInterval(()=>{if(!document.hidden)refresh();},5*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!weather||!fresh(weather)||Date.now()-loadedAt>=5*60*1000))refresh();});
  document.addEventListener('geonature:state',()=>{personal();predictor();});
  window.addEventListener('storage',event=>{if(['geonature_plus_v1','gn_catches'].includes(event.key)){personal();predictor();}if(event.key==='gn_reports')reports();});
  window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;});
  window.addEventListener('pageshow',event=>{if(event.persisted){refresh();if(!timer)timer=setInterval(()=>{if(!document.hidden)refresh();},5*60*1000);}});
}
window.GeoNaturePremiumTools={futureRows,rankedHours,skyAssessment,catchHistory,recordSummary,fresh,refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.addEventListener('gn:premium-ready',init);
})();
