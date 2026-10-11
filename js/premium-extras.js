(function(){
'use strict';
const $=id=>document.getElementById(id);
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Math.round(n)));
function scoreClass(n){return n>=80?'good':n>=50?'mid':'bad'}
function getPlan(){return window.GNPremium?.currentPlan?.()||'free'}
function has(p){return window.GNPremium?.has?.(p)||false}
function needPro(el){if(!has('pro')){window.GNPremium?.showToast?.('ეს ფუნქცია AI Pro-შია.', 'pro');return false}return true}
function nowHour(){return new Date().getHours()}
function pseudo(hour,seed=0){let x=Math.sin((hour+1)*12.9898+seed*78.233)*43758.5453; x=x-Math.floor(x);return clamp(42+x*55)}
function renderBest(){
  if(!has('plus')) return;
  let best={score:-1,h:nowHour()};for(let h=0;h<24;h++){const s=pseudo(h,7);if(s>best.score)best={score:s,h}}
  if($('bestTime'))$('bestTime').textContent=String(best.h).padStart(2,'0')+':00–'+String((best.h+2)%24).padStart(2,'0')+':00';
  if($('bestScore'))$('bestScore').textContent=best.score+'/100';
  if($('bestPlace'))$('bestPlace').textContent=['ჟინვალი','თბილისი','მცხეთა','ბათუმი'][best.h%4];
  if($('bestActivity'))$('bestActivity').textContent=best.h%3===0?'🦌 ნადირობა':'🎣 თევზაობა';
  if($('updatedAt'))$('updatedAt').textContent='განახლებულია '+new Date().toLocaleTimeString('ka-GE',{hour:'2-digit',minute:'2-digit'});
}
function renderBite(){
 if(!has('plus')||!$('biteNow'))return; const fishes=['ქარიყლაპია','კობრი','კალმახი','ქორჭილა','ლოქო']; const out=fishes.map((f,i)=>({f,s:pseudo(nowHour(),i+2)})).sort((a,b)=>b.s-a.s).slice(0,4);
 $('biteNow').innerHTML=out.map(x=>`<div class="mini-row"><b>🎣 ${x.f}</b><span>${x.s>=80?'მაღალი':x.s>=50?'საშუალო':'დაბალი'} აქტივობა</span><span class="score-pill score-${scoreClass(x.s)}">${x.s}</span></div>`).join('');
}
function reports(){
 if(!$('reports'))return; let data=[];try{data=JSON.parse(localStorage.getItem('gn_reports')||'[]')}catch(_){data=[]}
 if(!data.length){data=[{place:'ჟინვალის წყალსაცავი',fish:'ქარიყლაპია',a:'fishing',t:'45 წთ წინ',s:86},{place:'მცხეთის მიდამოები',fish:'კალმახი',a:'fishing',t:'2 სთ წინ',s:71}]}
 $('reports').innerHTML=data.slice(-6).reverse().map(x=>`<div class="mini-row"><b>${x.place}</b><span>${x.fish||x.a}</span><span>${x.t||'ახლახანს'}</span></div>`).join('');
}
function personal(){
 if(!$('personalInsight'))return;let s={catches:[],favorites:[],plans:[],name:'მომხმარებელი'};try{s=JSON.parse(localStorage.getItem('gn_plus_state')||JSON.stringify(s))}catch(_){}
 const fish={};(s.catches||[]).forEach(x=>{const k=x.fish||'უცნობი';fish[k]=(fish[k]||0)+1}); const fav=Object.entries(fish).sort((a,b)=>b[1]-a[1])[0];
 $('personalInsight').innerHTML=fav?`<b>შენი ყველაზე ხშირი სამიზნე:</b> ${fav[0]}<br><span class="muted">ჩანაწერები: ${s.catches.length} • რჩეულები: ${(s.favorites||[]).length} • გეგმები: ${(s.plans||[]).length}</span><br><b>რჩევა:</b> ყველაზე აქტიური საათები გადაამოწმე Best Moment-ში.`:'ჯერ საკმარისი პირადი მონაცემი არ არის. დაამატე რამდენიმე Catch Log ჩანაწერი და GeoNature უფრო ზუსტ პირად რჩევებს მოგცემს.';
}
function predictor(){
 if(!$('predictor'))return; if(!has('pro')){$('predictor').innerHTML='<b>🔒 AI Pro</b><br>დააგროვე რამდენიმე ჩანაწერი და გახსენი Personal Record Predictor.';return}
 let data=[];try{data=JSON.parse(localStorage.getItem('gn_plus_state')||'{}').catches||[]}catch(_){}
 if(!data.length){$('predictor').innerHTML='<b>ჯერ მონაცემები არ არის.</b><br>დაამატე Catch Log ჩანაწერები, რომ პირადი პატერნები დავინახოთ.';return}
 const weights=data.map(x=>Number(x.weight||0)).filter(Boolean); const avg=weights.length?(weights.reduce((a,b)=>a+b,0)/weights.length).toFixed(2):'—';
 $('predictor').innerHTML=`<b>შენი საშუალო წონა:</b> ${avg} კგ<br><span class="muted">პირადი პროგნოზი გაუმჯობესდება მეტი ჩანაწერის დამატებისას.</span>`;
}
function trip(){
 if(!has('pro'))return;const q=$('tripPrompt')?.value.trim()||'შაბათს დილით თევზაობა'; if($('tripResult'))$('tripResult').innerHTML=`<b>🤖 GeoNature გეგმა</b><br>📍 ჟინვალის წყალსაცავი<br>🎣 სამიზნე: ქარიყლაპია<br>🕖 საუკეთესო დრო: 07:00–09:00<br>⭐ სავარაუდო Score: ${clamp(pseudo(7,11))}/100<br>🎒 წაიღე: სპინინგი, ლიდერი, 2–3 სატყუარა და საწვიმარი.<br><span class="muted">შენი მოთხოვნა: ${q}</span>`;
}
function safety(){if(!$('safetyPanel'))return;$('safetyPanel').innerHTML=`<b>🛟 უსაფრთხოების ჩექი</b><br>✓ GPS: ხელმისაწვდომია ბრაუზერში<br>✓ მზე: გასვლამდე გადაამოწმე ჩასვლა<br>✓ ამინდი: LIVE რეჟიმი ჩართულია<br>✓ ბატარეა: დატოვე მინიმუმ 30%<br>📞 საგანგებო: 112`;$('safetyPanel').classList.remove('hidden')}

function fishTimeline(){
 if(!has('plus')||!$('fishTimeline'))return; const labels=['00','02','04','06','08','10','12','14','16','18','20','22']; const vals=labels.map((_,i)=>pseudo((i*2)%24,31)); $('fishTimeline').innerHTML=vals.map((v,i)=>`<div class="time-bar"><span>${labels[i]}:00</span><i class="${scoreClass(v)}" style="height:${Math.max(18,v)}%"></i><b>${v}</b></div>`).join('');
}
function hotspots(){
 if(!has('pro')||!$('hotspots'))return; const places=['ჟინვალის წყალსაცავი','ბაზალეთის ტბა','არაგვის ხეობა','ფარავნის ტბა']; const list=places.map((p,i)=>({p,s:clamp(pseudo(nowHour(),40+i))})).sort((a,b)=>b.s-a.s); $('hotspots').innerHTML=list.map((x,i)=>`<div class="mini-row"><b>${i+1}. ${x.p}</b><span>Hotspot</span><span class="score-pill score-${scoreClass(x.s)}">${x.s}</span></div>`).join('');
}
function stargazing(){
 if(!has('plus')||!$('stargazing'))return; const h=nowHour(); const moon=[6,13,20,27][Math.floor((new Date().getDate()/7))%4]||12; const cloud=clamp(18+Math.abs(Math.sin(h))*28); const visibility=clamp(82-cloud/2); const moonPenalty=Math.round(moon*0.28); const score=clamp(visibility-moonPenalty+18); $('stargazing').innerHTML=`<b>🌌 ${score}/100</b><br><span class="muted">ღრუბლიანობა: ${cloud}% • ხილვადობა: ${visibility}% • მთვარის განათების სავარაუდო გავლენა: -${moonPenalty}</span><br><b>საუკეთესო ფანჯარა:</b> 22:00–02:00`;
}
function smartAlert(){
 if(!has('plus')||!$('alertState'))return; const threshold=Number(localStorage.getItem('gn_alert_threshold')||80); if($('alertThreshold'))$('alertThreshold').value=String(threshold); const current=clamp(pseudo(nowHour(),52)); $('alertState').innerHTML=current>=threshold?`<b>🔔 პირობა შესრულდა</b><br>ამჟამინდელი Score: ${current}/100 ≥ ${threshold}`:`<b>⏳ ჯერ ველოდებით</b><br>ამჟამინდელი Score: ${current}/100 • ზღვარი: ${threshold}`;
}
function saveAlert(){ if(!has('plus'))return; const v=Number($('alertThreshold')?.value||80); localStorage.setItem('gn_alert_threshold',v); smartAlert(); }

function addReport(){const p=$('reportPlace')?.value.trim(),f=$('reportFish')?.value.trim(),a=$('reportActivity')?.value||'fishing';if(!p||!f)return;let arr=[];try{arr=JSON.parse(localStorage.getItem('gn_reports')||'[]')}catch(_){}arr.push({place:p,fish:f,a,t:'ახლახანს',s:pseudo(nowHour(),f.length)});localStorage.setItem('gn_reports',JSON.stringify(arr));$('reportPlace').value='';$('reportFish').value='';reports()}
document.addEventListener('DOMContentLoaded',()=>{if(getPlan()==='free')return;renderBest();renderBite();reports();personal();predictor();fishTimeline();hotspots();stargazing();smartAlert();setInterval(()=>{renderBest();renderBite()},5*60*1000);$('refreshBest')?.addEventListener('click',renderBest);$('saveAlert')?.addEventListener('click',saveAlert);$('addReport')?.addEventListener('click',addReport);$('buildTrip')?.addEventListener('click',trip);$('safetyMode')?.addEventListener('click',safety);});
})();
