(function(){
  'use strict';
  const KEY='geonature_plus_v1';
  const defaultState={name:'GeoNature Explorer',xp:0,catches:[],plans:[],checklists:{},favorites:[],badges:[],photoIds:[]};
  function state(){try{return Object.assign({},defaultState,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){return Object.assign({},defaultState)}}
  let xpSyncPromise=null,lastXpSync=null;
  function syncXpToServer(s){
    const xp=Math.max(0,Math.round(Number(s?.xp)||0));
    if(lastXpSync===xp||xpSyncPromise||!window.GeoNatureAuth?.request||!window.GeoNatureAuth?.me)return;
    xpSyncPromise=window.GeoNatureAuth.me().then(user=>{
      if(!user)return null;
      return window.GeoNatureAuth.request('/xp',{method:'POST',body:JSON.stringify({xp})}).then(()=>{lastXpSync=xp});
    }).catch(()=>{lastXpSync=null}).finally(()=>{xpSyncPromise=null});
  }
  function save(s){localStorage.setItem(KEY,JSON.stringify(s));document.dispatchEvent(new CustomEvent('geonature:state'));syncXpToServer(s);}
  function addXP(n,reason){const s=state();s.xp=Math.max(0,Number(s.xp||0)+Number(n||0));save(s);return reason||''}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function money(){const s=state();return Math.min(20,Math.floor(s.xp/100)+1)}
  function level(){return Math.max(1,Math.floor(state().xp/100)+1)}
  function notify(msg){let el=document.getElementById('gnToast');if(!el){el=document.createElement('div');el.id='gnToast';el.className='gn-toast';document.body.appendChild(el)}el.textContent=msg;el.classList.add('show');clearTimeout(window.__gnToast);window.__gnToast=setTimeout(()=>el.classList.remove('show'),2400)}
  function badgeCheck(){const s=state();const badges=new Set(s.badges||[]);if(s.catches.length>=1)badges.add('first-catch');if(s.catches.length>=5)badges.add('five-catches');if(s.plans.length>=1)badges.add('planner');if(s.favorites.length>=3)badges.add('collector');if(s.xp>=500)badges.add('xp500');s.badges=[...badges];save(s)}
  function recordCatch(fish,place,weight,date,note){const s=state();s.catches.push({id:Date.now(),fish,place,weight:Number(weight||0),date:date||(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE')),note:note||''});s.xp+=50;save(s);badgeCheck();notify('დაჭერა შეინახა • +50 XP')}
  function addPlan(kind,title,meta){const s=state();s.plans.unshift({id:Date.now(),kind,title,meta,date:(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'))});s.plans=s.plans.slice(0,20);s.xp+=20;save(s);badgeCheck();notify('გეგმა შეინახა • +20 XP')}
  function toggleChecklist(key,item){const s=state();s.checklists[key]=Object.assign({},s.checklists[key]);s.checklists[key][item]=!s.checklists[key][item];save(s)}
  function monthBaseline(m){return [4,6,10,15,21,25,28,28,23,17,11,6][m]}
  function parseR(v){return (String(v||'').match(/-?\d+(?:\.\d+)?/g)||[]).map(Number)}
  function fishMonthScore(f2,m){const r=parseR(f?.[7]);if(r.length!==2)return 60;const t=monthBaseline(m);const lo=Math.min(r[0],r[1]),hi=Math.max(r[0],r[1]);if(t>=lo&&t<=hi)return 100;return Math.max(15,Math.round(100-Math.min(80,Math.abs(t-(lo+hi)/2)*6)))}
  function genericBait(f){
    const id=String(f?.[0]||'');
    const map={carp:'სიმინდი • ცომი • ბოილი',crucian:'ჭია • პური • სიმინდი',grasscarp:'ბალახოვანი მცენარეები • სიმინდი',silvercarp:'პლანქტონური ნარევი • მცენარეული საკვები',bighead:'პლანქტონური ნარევი',bream:'ჭია • პური • სიმინდი',catfish:'დიდი ბუნებრივი სატყუარა',zander:'პატარა თევზის იმიტაცია • ხელოვნური სატყუარა',pike:'სპინერები • ვობლერები • რბილი სატყუარა',perch:'ჭია • პატარა ხელოვნური სატყუარა',browntrout:'პატარა ხელოვნური სატყუარა • მწერი',rainbow:'ჭია • პატარა სატყუარა',brook:'მწერი • პატარა ხელოვნური სატყუარა',chub:'პატარა ხელოვნური სატყუარა • მწერი',barbel:'ჭია • პური • მარცვლეული'};
    return map[id]||'შესაბამისი სატყუარა შეარჩიე ადგილობრივი პირობებისა და სამიზნე სახეობის მიხედვით.';
  }
  function genericDepth(f){
    const id=String(f?.[0]||'');
    const map={carp:'1–4 მ',crucian:'1–3 მ',grasscarp:'1–3 მ',silvercarp:'1–5 მ',bighead:'2–6 მ',bream:'2–6 მ',catfish:'3–10+ მ',zander:'2–8 მ',pike:'1–5 მ',perch:'1–6 მ',browntrout:'0.5–3 მ',rainbow:'0.5–4 მ',brook:'0.5–2.5 მ',chub:'0.5–3 მ',barbel:'1–4 მ'};
    return map[id]||'ადგილის რელიეფის მიხედვით';
  }
  function seasonTags(f){const txt=String(f?.[10]||'').toLowerCase();return txt.includes('ღამე')?['ღამე']:txt.includes('საღამო')?['საღამო','დილა']:['დილა','დღე'];}
  function mountFishingPlus(){
    if(!window.FISHES||document.getElementById('fishingPlus'))return;
    const host=document.createElement('section');host.id='fishingPlus';host.className='container section gn-plus';
    host.innerHTML=`<div class="section-head"><div><span class="eyebrow">SMART FIELD KIT</span><h2>თევზაობის დამატებითი ინსტრუმენტები</h2><p class="muted">სარეკომენდაციო ინსტრუმენტები არჩეული თევზისა და მიმდინარე პროგნოზის მიხედვით.</p></div></div>
    <article class="panel gn-card gn-activity-panel"><div class="row-between"><div><span class="eyebrow">LIVE ACTIVITY</span><h2>🎣 თევზის აქტიურობა სატყუარის მიხედვით</h2><p id="gnActivityContext" class="muted">აირჩიე თევზი და ლოკაცია.</p></div><span class="gn-max-badge">MAX</span></div><div id="gnFishActivity" class="gn-activity-grid"></div><small class="muted">სატყუარის აქტივობა არის სარეკომენდაციო ინდიკატორი და არა დაჭერის გარანტია.</small></article>
    <div class="gn-grid-4">
      <article class="panel gn-card"><span class="gn-icon">🎯</span><h3>სატყუარა & სიღრმე</h3><div id="gnFishTackle">აირჩიე თევზი Planner-ში.</div></article>
      <article class="panel gn-card"><span class="gn-icon">⏰</span><h3>საუკეთესო საათები</h3><div id="gnBestHours">აირჩიე თევზი და ადგილი.</div></article>
      <article class="panel gn-card"><span class="gn-icon">📅</span><h3>12-თვიანი საორიენტაციო კალენდარი</h3><div id="gnMonthCalendar" class="gn-months"></div><small class="muted">ტემპერატურული მოდელი მხოლოდ საორიენტაციოა.</small></article>
      <article class="panel gn-card"><span class="gn-icon">📋</span><h3>გასვლის ჩექლისტი</h3><div id="gnFishingCheck"></div></article>
    </div>
    <div class="gn-two">
      <article class="panel gn-card"><div class="row-between"><h3>🎣 Catch Log — ჩემი დაჭერები</h3><button id="gnAddCatch" class="btn primary">დამატება</button></div><div id="gnCatchForm" class="gn-hidden"></div><div id="gnCatchList"></div></article>
      <article class="panel gn-card"><div class="row-between"><h3>🏆 ჩემი პროგრესი</h3><a class="btn ghost" href="dashboard.html">პროფილის გახსნა</a></div><div id="gnFishingProgress"></div></article>
    </div>`;
    document.getElementById('planner')?.after(host);
    renderFishingPlus();
  }
  function selectedFishObj(){return window.selectedFish||null}
  function renderFishingPlus(){
    const f=selectedFishObj();
    const activityBox=document.getElementById('gnFishActivity');
    const activityContext=document.getElementById('gnActivityContext');
    if(activityBox){
      if(!f){ activityBox.innerHTML='<div class="empty">აირჩიე თევზი Planner-ში და აქტივობის ბარათები ავტომატურად გამოჩნდება.</div>'; if(activityContext)activityContext.textContent='აირჩიე თევზი და ლოკაცია.'; }
      else {
        const data=window.plannerWeather?.hourly?.time?{times:window.plannerWeather.hourly.time,temperature:window.plannerWeather.hourly.temperature_2m||[],pressure:window.plannerWeather.hourly.pressure_msl||[],wind:window.plannerWeather.hourly.wind_speed_10m||[],rain:window.plannerWeather.hourly.precipitation||[],rp:window.plannerWeather.hourly.precipitation_probability||[],code:window.plannerWeather.hourly.weather_code||[],humidity:window.plannerWeather.hourly.relative_humidity_2m||[]} : null;
        const selectedDate=document.getElementById('startDate')?.value||(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'));
        let row=null;
        if(data){ const rows=data.times.map((iso,i)=>({iso,hour:Number(iso.slice(11,13)),time:iso.slice(11,16),temperature:Number(data.temperature[i]??20),pressure:Number(data.pressure[i]??1013),wind:Number(data.wind[i]??0),rain:Number(data.rain[i]??0),rp:Number(data.rp[i]??0),code:Number(data.code[i]??0),humidity:Number(data.humidity[i]??60),date:iso.slice(0,10)})).filter(x=>x.date===selectedDate); const now=new Date(); row=rows.find(x=>selectedDate===(window.GeoNatureCommon?.localDateISO?.(now)||now.toLocaleDateString('sv-SE'))&&new Date(x.iso)>=now)||rows.find(x=>x.time==='12:00')||rows[Math.floor(rows.length/2)]; }
        const condition=row?{temperature_2m:row.temperature,pressure_msl:row.pressure,wind_speed_10m:row.wind,precipitation:row.rain,precipitation_probability:row.rp,weather_code:row.code,relative_humidity_2m:row.humidity,local_hour:row.hour}:{};
        const base=window.fishScore?window.fishScore(f,condition,window.selectedWater):60;
        const source=genericBait(f);
        const baits=(source||'ბუნებრივი სატყუარა').split(' • ').filter(Boolean).slice(0,4);
        const fill=baits.length?baits:['ბუნებრივი სატყუარა'];
        while(fill.length<4)fill.push('უნივერსალური სატყუარა');
        const scored=fill.map((bait,i)=>{ const n=bait.toLowerCase(); let bonus=0; if(/სიმინდი|ბოილი|ცომი|პური/.test(n)&&/carp|crucian|grasscarp|tench/.test(String(f[0])))bonus=4; if(/ჭია|მწერი/.test(n)&&/trout|chub|barbel|perch|crucian/.test(String(f[0])))bonus=5; if(/სპინერი|ვობლერი|იმიტაცია|ხელოვნური/.test(n))bonus=3; if(/პლანქტონ/.test(n))bonus=3; const score=Math.max(0,Math.min(100,Math.round(base+bonus-(i===3?2:0)))); return {bait,score}; });
        const max=Math.max(...scored.map(x=>x.score));
        if(activityContext)activityContext.textContent=`${f[1]} • ${window.selectedWater?.[1]||'ადგილი'} • ${row?.time||'დღის პირობები'}`;
        activityBox.innerHTML=scored.map((x,i)=>{const pct=Math.max(4,x.score);const isMax=x.score===max;const band=window.scoreBandLabel?window.scoreBandLabel(x.score):'საშუალო';return `<article class="gn-activity-card ${isMax?'max':''}"><div class="gn-activity-top"><div class="gn-bait-icon">${/სპინერი|ვობლერი|იმიტაცია|ხელოვნური/.test(x.bait.toLowerCase())?'🪝':'🎯'}</div><div><h3>${esc(x.bait)}</h3><small>${band}</small></div>${isMax?'<span class="gn-live-max">MAX</span>':''}</div><div class="gn-activity-score-row"><strong>${x.score}</strong><span>/100</span></div><div class="gn-activity-bar"><span style="width:${pct}%"></span></div><small class="muted">საორიენტაციო აქტივობა არჩეული პირობებით</small></article>`}).join('');
      }
    }
    const f2=selectedFishObj();const tackle=document.getElementById('gnFishTackle');if(tackle){tackle.innerHTML=f2?`<p><b>სატყუარა:</b> ${esc(genericBait(f2))}</p><p><b>საორიენტაციო სიღრმე:</b> ${esc(genericDepth(f2))}</p><p><b>აქტივობა:</b> ${esc(f2[10])}</p>`:'აირჩიე თევზი Planner-ში.'}
    const cal=document.getElementById('gnMonthCalendar');if(cal){cal.innerHTML=f2?[...Array(12)].map((_,m)=>`<span class="gn-month ${fishMonthScore(f2,m)>=80?'hot':''} ${m===new Date().getMonth()?'now':''}">${['იან','თებ','მარ','აპრ','მაი','ივნ','ივლ','აგვ','სექ','ოქტ','ნოე','დეკ'][m]}<b>${fishMonthScore(f2,m)}</b></span>`).join(''):'აირჩიე თევზი.'}
    const check=document.getElementById('gnFishingCheck');if(check)renderChecklist(check,'fishing',['თევზჭერის წესები/შეზღუდვები გადავამოწმე','წყალი და სასმელი მაქვს','ტელეფონი დამუხტულია','პირველი დახმარების პატარა ნაკრები მაქვს','ნარჩენების ჩანთა მაქვს','სინათლე/ფარანი მაქვს']);
    const list=document.getElementById('gnCatchList');if(list){const s=state();list.innerHTML=s.catches.length?s.catches.slice(-5).reverse().map(x=>`<div class="gn-list-row"><b>${esc(x.fish)}</b><span>${esc(x.place||'ადგილი არაა მითითებული')}</span><span>${x.weight?esc(x.weight)+' კგ':'—'}</span><small>${esc(x.date)}</small></div>`).join(''):'ჯერ არაფერი შეგინახავს.'}
    const pr=document.getElementById('gnFishingProgress');if(pr){const s=state();pr.innerHTML=`<div class="gn-progress-head"><strong>Level ${level()}</strong><span>${s.xp} XP</span></div><div class="gn-progress"><span style="width:${s.xp%100}%"></span></div><div class="gn-statline"><span>დაჭერები <b>${s.catches.length}</b></span><span>ბეჯები <b>${s.badges.length}</b></span><span>გეგმები <b>${s.plans.length}</b></span></div>`}
    const bh=document.getElementById('gnBestHours');if(bh){const data=window.plannerWeather;if(!f2||!data){bh.textContent='Planner-ის პროგნოზის შემდეგ საათები აქ გამოჩნდება.'}else{const hours=(data.hourly.time||[]).map((iso,i)=>({iso,h:iso.slice(11,16),date:iso.slice(0,10),temperature:data.hourly.temperature_2m?.[i],pressure:data.hourly.pressure_msl?.[i],wind:data.hourly.wind_speed_10m?.[i],rain:data.hourly.precipitation?.[i],rp:data.hourly.precipitation_probability?.[i],code:data.hourly.weather_code?.[i]})).filter(r=>r.date===(document.getElementById('startDate')?.value||(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE')))).slice(0,24);const top=hours.map(r=>Object.assign(r,{score:window.fishScore?window.fishScore(f2,{temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.rain,precipitation_probability:r.rp,weather_code:r.code},window.selectedWater):scoreWeather({temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.rain,weather_code:r.code})})).sort((a,b)=>b.score-a.score).slice(0,3);bh.innerHTML=top.map(x=>`<div class="gn-hour"><b>${x.h}</b><span>${Math.round(x.temperature)}°</span><strong>${x.score}/100</strong></div>`).join('')||'საათობრივი მონაცემი ვერ მოიძებნა.'}}
  }
  function renderChecklist(box,key,items){const s=state();const map=s.checklists[key]||{};box.innerHTML=items.map(it=>`<label class="gn-check"><input type="checkbox" data-key="${esc(key)}" data-item="${esc(it)}" ${map[it]?'checked':''}><span>${esc(it)}</span></label>`).join('');box.querySelectorAll('input').forEach(i=>i.onchange=()=>toggleChecklist(key,i.dataset.item));}
  function mountHuntingPlus(){
    if(document.getElementById('huntingPlus'))return;
    const host=document.createElement('section');host.id='huntingPlus';host.className='container section gn-plus';host.innerHTML=`<div class="section-head"><div><span class="eyebrow">SMART FIELD KIT</span><h2>ნადირობის დამატებითი ინსტრუმენტები</h2><p class="muted">საინფორმაციო Outdoor ინსტრუმენტები, ჩექლისტი და პროგრესის სისტემა.</p></div></div><div class="gn-grid-4"><article class="panel gn-card"><span class="gn-icon">🗓️</span><h3>სეზონის საინფორმაციო კალენდარი</h3><div id="gnHuntCalendar" class="gn-seasons"></div><small class="muted">ეს არ არის სამართლებრივი სეზონის დადასტურება — ადგილობრივი წესები ყოველთვის ცალკე გადაამოწმე.</small></article><article class="panel gn-card"><span class="gn-icon">⏰</span><h3>აქტიურობის საუკეთესო დრო</h3><div id="gnHuntHours">აირჩიე სახეობა.</div></article><article class="panel gn-card"><span class="gn-icon">🎒</span><h3>გასვლის ჩექლისტი</h3><div id="gnHuntCheck"></div></article><article class="panel gn-card"><span class="gn-icon">🧭</span><h3>რეგიონში რა გვხვდება</h3><div id="gnHuntRegionInfo">აირჩიე რეგიონი Planner-ში.</div></article></div>`;document.getElementById('huntPlanner')?.after(host);renderHuntingPlus();}
  function renderHuntingPlus(){const x=window.selectedHunt;const c=document.getElementById('gnHuntCalendar');if(c){if(!x)c.textContent='აირჩიე სახეობა.';else{const t=String(x[7]||'მთელი წელი').toLowerCase();c.innerHTML=[['მთელი წელი',t.includes('მთელი წელი')||t.includes('წელი')],['გაზაფხული',t.includes('გაზაფხული')||t.includes('მიგრ')],['ზაფხული',t.includes('ზაფხული')||t.includes('მთელი წელი')],['შემოდგომა',t.includes('შემოდგომა')||t.includes('მიგრ')]].map(a=>`<div class="gn-season ${a[1]?'on':''}"><span>${a[0]}</span><b>${a[1]?'აქტიური':'ინფორმაცია არ არის'}</b></div>`).join('')}}
    const h=document.getElementById('gnHuntHours');if(h){if(!x||!window.huntWeather){h.innerHTML=x?`<b>${esc(x[8])}</b><p class="muted">Planner-ის გაშვების შემდეგ საუკეთესო საათებიც გამოჩნდება.</p>`:'აირჩიე სახეობა.';}else{const iso=document.getElementById('huntStartDate')?.value||(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'));const rows=(huntWeather.hourly?.time||[]).map((t,i)=>({iso:t,h:t.slice(11,16),date:t.slice(0,10),temperature:huntWeather.hourly.temperature_2m?.[i],pressure:huntWeather.hourly.pressure_msl?.[i],wind:huntWeather.hourly.wind_speed_10m?.[i],rain:huntWeather.hourly.precipitation?.[i],rp:huntWeather.hourly.precipitation_probability?.[i],code:huntWeather.hourly.weather_code?.[i]})).filter(r=>r.date===iso);const top=rows.map(r=>Object.assign(r,{score:scoreWeather({temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.rain,precipitation_probability:r.rp,weather_code:r.code})})).sort((a,b)=>b.score-a.score).slice(0,3);h.innerHTML=top.length?top.map(r=>`<div class="gn-hour"><b>${r.h}</b><span>${Math.round(r.temperature)}°</span><strong>${r.score}/100</strong></div>`).join(''):`<b>${esc(x[8])}</b>`;}}
    const ch=document.getElementById('gnHuntCheck');if(ch)renderChecklist(ch,'hunting',['რეგიონის წესები/შეზღუდვები გადავამოწმე','ამინდი და ხილვადობა გადავამოწმე','წყალი და საჭმელი მაქვს','ტელეფონი დამუხტულია','პირველი დახმარების ნაკრები მაქვს','ნარჩენების ჩანთა მაქვს']);
    const ri=document.getElementById('gnHuntRegionInfo');if(ri){const r=document.getElementById('huntRegion')?.value||'თბილისი';const all=window.HUNTING_WILDLIFE||[];const names=all.filter(z=>String(z[6]||'').includes(r)).slice(0,8).map(z=>z[1]);ri.innerHTML=names.length?names.map(n=>`<span class="gn-chip">${esc(n)}</span>`).join(''):`<span class="muted">მონაცემში ზუსტი რეგიონის დამთხვევა არ მოიძებნა.</span>`}
  }
  function mountWeatherPrompt(){if(document.getElementById('gnGoToday'))return;const el=document.createElement('section');el.id='gnGoToday';el.className='container section';el.innerHTML='<div class="panel gn-go"><div><span class="eyebrow">GO / NO-GO</span><h2>დღეს გავიდე?</h2><p id="gnGoText">ამინდის მონაცემებს ვამოწმებ…</p></div><div class="gn-go-score"><b id="gnGoScore">--</b><span>/100</span></div><div class="actions"><a class="btn primary" href="fishing.html">🎣 თევზაობა</a><a class="btn ghost" href="hunting.html">🦌 ნადირობა</a><a class="btn ghost" href="dashboard.html">ჩემი GeoNature</a></div></div>';document.getElementById('weatherDaily')?.closest('.section')?.after(el)||document.querySelector('main')?.appendChild(el);openMeteo(41.7151,44.8271).then(d=>{const s=(window.GeoNatureCommon?.outdoorScore?window.GeoNatureCommon.outdoorScore(d.current):scoreWeather(d.current));const txt=s>=80?'✅ კარგი დღეა გარე აქტივობისთვის.':s>=60?'🟡 საშუალო დღეა — პირობები გადაამოწმე.':'🔴 რთული პირობებია — დაგეგმვა და უსაფრთხოება პრიორიტეტია.';document.getElementById('gnGoScore').textContent=s;document.getElementById('gnGoText').textContent=txt}).catch(()=>{})}
  function mountHomePrompt(){if(document.getElementById('gnHomeHub'))return;const el=document.createElement('section');el.id='gnHomeHub';el.className='container section';el.innerHTML=`<div class="section-head"><div><span class="eyebrow">MY GEONATURE</span><h2>დღეს რა ჯობია?</h2></div><a class="link" href="dashboard.html">ჩემი პროფილი →</a></div><div class="gn-home-grid"><a class="feature-card" href="fishing.html"><div class="icon">🎣</div><h3>თევზაობის Planner</h3><p>თევზი + ლოკაცია + დღე + საათები.</p></a><a class="feature-card" href="hunting.html"><div class="icon">🦌</div><h3>ნადირობის Planner</h3><p>სახეობა + რეგიონი + Outdoor პირობები.</p></a><a class="feature-card" href="dashboard.html#catchlog"><div class="icon">📒</div><h3>ჩემი Catch Log</h3><p>დაჭერები, რეკორდები და XP.</p></a><a class="feature-card" href="dashboard.html#photoid"><div class="icon">📷</div><h3>Photo ID Assistant</h3><p>ფოტოს სწრაფი დამხმარე იდენტიფიკაცია.</p></a></div>`;document.querySelector('footer')?.before(el)}
  function mountPhotoId(){const box=document.getElementById('photoIdBox');if(!box)return;box.innerHTML=`<div class="gn-photo-grid"><div><label class="gn-upload"><input id="gnPhotoFile" type="file" accept="image/*"><span>📷 ფოტოს არჩევა</span></label><img id="gnPhotoPreview" class="gn-photo-preview" alt="ფოტო"/></div><div><label>კატეგორია<select id="gnPhotoType"><option value="all">ყველა</option><option value="fish">თევზი</option><option value="bird">ფრინველი</option><option value="mammal">ცხოველი</option><option value="reptile">ქვეწარმავალი</option></select></label><label>სავარაუდო სახელის მინიშნება<input id="gnPhotoHint" placeholder="მაგ. trout, კობრი, ირემი"></label><button id="gnPhotoFind" class="btn primary full">სავარაუდო სახეობების მოძებნა</button><div id="gnPhotoResult"></div><small class="muted">ეს არის სწრაფი დამხმარე და არა პროფესიონალური სახეობის იდენტიფიკაცია.</small></div></div>`;document.getElementById('gnPhotoFile').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{document.getElementById('gnPhotoPreview').src=r.result};r.readAsDataURL(f)};document.getElementById('gnPhotoFind').onclick=()=>{const q=document.getElementById('gnPhotoHint').value.trim().toLowerCase();const type=document.getElementById('gnPhotoType').value;let arr=[];if(window.FISHES&&type==='fish'||type==='all')arr=arr.concat((window.FISHES||[]).map(x=>({type:'fish',n:x[1],s:x[2],url:'species.html?id='+encodeURIComponent(x[1])})));if(window.HUNTING_WILDLIFE&&(type==='all'||type==='bird'||type==='mammal'||type==='reptile'))arr=arr.concat((window.HUNTING_WILDLIFE||[]).filter(x=>type==='all'||x[0]===type).map(x=>({type:x[0],n:x[1],s:x[2],url:'species.html?id='+encodeURIComponent(x[1])})));const out=q?arr.filter(x=>(x.n+' '+x.s).toLowerCase().includes(q)):arr.slice(0,8);document.getElementById('gnPhotoResult').innerHTML=out.length?out.slice(0,8).map(x=>`<a class="gn-id-result" href="${x.url}"><b>${esc(x.n)}</b><span>${esc(x.s)}</span></a>`).join(''):'მინიშნებით შედეგი ვერ მოიძებნა — სცადე სხვა სიტყვა.';const s=state();s.photoIds.push({date:(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE')),hint:q});save(s);addXP(10);notify('Photo ID ჩანაწერი • +10 XP')}}
  function mountDashboard(){
    const root=document.getElementById('gnDashboard');if(!root)return;const render=()=>{const s=state();const fishCount=(window.FISHES||[]).length;const wild=(window.HUNTING_WILDLIFE||[]).filter(x=>x[0]!=='reptile').length;root.innerHTML=`<div class="dashboard-top"><div><span class="eyebrow">MY GEONATURE</span><h1>${esc(s.name)}</h1><p class="muted">Level ${level()} • ${s.xp} XP</p></div><div class="dash-score"><b>${Math.min(100,Math.round((s.xp%100)))}%</b><span>შემდეგ დონემდე</span></div></div><div class="gn-grid-4"><article class="panel gn-card"><span class="gn-icon">🎣</span><h3>დაჭერები</h3><strong class="big-number">${s.catches.length}</strong></article><article class="panel gn-card"><span class="gn-icon">🗺️</span><h3>გეგმები</h3><strong class="big-number">${s.plans.length}</strong></article><article class="panel gn-card"><span class="gn-icon">🏅</span><h3>ბეჯები</h3><strong class="big-number">${s.badges.length}</strong></article><article class="panel gn-card"><span class="gn-icon">📚</span><h3>კატალოგი</h3><strong class="big-number">${fishCount+wild}+</strong></article></div><div class="gn-dashboard-grid"><section id="catchlog" class="panel gn-card"><div class="row-between"><h2>📒 Catch Log</h2><button id="dashCatchAdd" class="btn primary">დამატება</button></div><div id="dashCatchForm"></div><div id="dashCatchRows"></div></section><section class="panel gn-card"><h2>🏆 მიღწევები</h2><div id="dashBadges" class="badge-grid"></div></section><section class="panel gn-card"><h2>🎯 ჩელენჯები</h2><div id="dashChallenges"></div></section><section class="panel gn-card"><h2>🧭 ბოლო გეგმები</h2><div id="dashPlans"></div></section><section id="photoid" class="panel gn-card"><h2>📷 Photo ID Assistant</h2><div id="photoIdBox"></div></section><section class="panel gn-card"><h2>🥇 რეალური XP Leaderboard</h2><p class="muted">ანგარიშებით სინქრონიზებული რეალური მოთამაშეები — სახელი, ავატარი და XP.</p><div id="dashBoard"><div class="muted">რეიტინგი იტვირთება…</div></div></section><section class="panel gn-card" id="gnInviteCard"><h2>🔗 მოიწვიე მეგობარი</h2><p class="muted">შექმენი პირადი ბმული. როცა ვინმე გახსნის, გახსნა ადმინისტრატორის პანელში ჩაიწერება.</p><div class="gn-form-grid"><input id="gnInviteUrl" type="text" readonly placeholder="დააჭირე ბმულის შექმნას"><button id="gnCreateInvite" class="btn ghost">ბმულის შექმნა</button><button id="gnCopyInvite" class="btn primary" disabled>კოპირება</button></div><small id="gnInviteNote" class="muted">ბმულში მოწვევის კოდი ავტომატურად ჩაიწერება.</small></section><section class="panel gn-card"><h2>⭐ ჩემი რჩეულები</h2><div id="dashFavs"></div><div class="gn-form-grid"><input id="favName" placeholder="მაგ. კობრი / ჟინვალი"><button id="favAdd" class="btn ghost">რჩეულებში დამატება</button></div></section></div>`;renderDashboardDetail()};render();document.addEventListener('geonature:state',render)}
  const LEADERBOARD_AVATARS={
    'free-fish':'assets/avatars/photo/fish.jpg','free-leaf':'assets/avatars/photo/forest.jpg',
    'free-camp':'assets/avatars/photo/sunset.jpg','free-fox':'assets/avatars/photo/fox.jpg',
    'free-wave':'assets/avatars/photo/lake.jpg','free-ranger':'assets/avatars/photo/rod-close.jpg',
    'plus-eagle':'assets/avatars/photo/eagle.jpg','plus-wolf':'assets/avatars/photo/wolf.jpg',
    'plus-bear':'assets/avatars/photo/bear.jpg','plus-deer':'assets/avatars/photo/deer.jpg',
    'plus-fishing':'assets/avatars/photo/fish-plus.jpg','plus-compass':'assets/avatars/photo/mountains.jpg',
    'plus-canyon':'assets/avatars/photo/mountain-plus.jpg','plus-svaneti':'assets/avatars/photo/adventure-plus.jpg',
    'plus-ranger':'assets/avatars/photo/ranger-plus.jpg','plus-nocturne':'assets/avatars/photo/camp.jpg',
    'plus-fish-photo':'assets/avatars/photo/trout-plus.jpg','plus-reel-photo':'assets/avatars/photo/reel-plus.jpg',
    'plus-hunt-photo':'assets/avatars/photo/adventure-plus.jpg','plus-football':'assets/profile-bg/football-star.svg'
  };
  let leaderboardCache={at:0,items:[]},leaderboardPromise=null;
  async function ensureLeaderboardApi(){
    if(!window.__GN_API_CONFIG_LOADED){
      await new Promise(resolve=>{
        const script=document.createElement('script');script.src=new URL('js/api-config.js',document.baseURI).href;
        script.onload=resolve;script.onerror=resolve;document.head.appendChild(script);
      });
    }
    let base=String(window.GN_API_BASE_URL||'').trim();while(base.endsWith('/'))base=base.slice(0,-1);
    if(!base&&String(location.hostname||'').toLowerCase().endsWith('.github.io'))
      throw new Error('რეალური leaderboard-ის სერვერი ჯერ არ არის მიბმული.');
    return base+'/api/leaderboard/xp';
  }
  async function renderXpLeaderboard(host){
    if(!host)return;
    const draw=(items)=>{host.innerHTML=items.length?items.map(x=>{
      const avatar=LEADERBOARD_AVATARS[x.avatarId]||LEADERBOARD_AVATARS['free-fish'];
      const src=new URL(avatar,document.baseURI).href;
      return '<div class="leader-row gn-real-leader"><span class="gn-leader-rank">#'+esc(x.rank)+'</span><img class="gn-leader-avatar" src="'+esc(src)+'" alt="'+esc(x.name)+'"><b>'+esc(x.name)+'</b><strong>'+esc(Number(x.xp)||0)+' XP</strong></div>';
    }).join(''):'<div class="muted">XP ქულების მქონე ანგარიშები ჯერ არ არის.</div>'};
    if(Date.now()-leaderboardCache.at<30000){draw(leaderboardCache.items);return}
    host.innerHTML='<div class="muted">რეალური მოთამაშეები იტვირთება…</div>';
    if(!leaderboardPromise){
      leaderboardPromise=(async()=>{
        const url=await ensureLeaderboardApi();
        const response=await fetch(url,{credentials:'include',cache:'no-store'});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.message||'Leaderboard ვერ ჩაიტვირთა.');
        leaderboardCache={at:Date.now(),items:Array.isArray(data.leaderboard)?data.leaderboard:[]};
        return leaderboardCache.items;
      })().finally(()=>{leaderboardPromise=null});
    }
    try{draw(await leaderboardPromise)}
    catch(e){host.innerHTML='<div class="gn-leader-error">რეალური რეიტინგი დროებით მიუწვდომელია. ნაგულისხმევი/გამოგონილი სახელები აღარ არის ნაჩვენები.<small>'+esc(e.message||'API სერვერი არ პასუხობს.')+'</small></div>'}
  }
  function renderInviteTools(){
    const input=document.getElementById('gnInviteUrl'),create=document.getElementById('gnCreateInvite'),copy=document.getElementById('gnCopyInvite'),note=document.getElementById('gnInviteNote');
    if(!input||!create||create.dataset.bound)return;create.dataset.bound='1';
    create.onclick=async()=>{
      create.disabled=true;note.textContent='პირადი მოწვევის ბმული იქმნება…';
      try{
        const account=await window.GeoNatureAuth?.me?.();
        let code=String(account?.id||'');
        if(!code){
          try{code=localStorage.getItem('gn_analytics_visitor_v1')||''}catch{}
        }
        if(!code){code='guest_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10)}
        const url=new URL('index.html',document.baseURI);url.searchParams.set('ref',code);
        input.value=url.href;copy.disabled=false;
        note.textContent=account?.id?'ბმული მზადაა. ანგარიშით გახსნილი ვიზიტებიც ჩაიწერება.':'ბმული მზადაა; სტუმრის კოდით გახსნები გამოჩნდება, მაგრამ მომხმარებლის ანგარიშთან ვერ მიებას.';
      }catch(e){note.textContent='ბმულის შექმნა ვერ მოხერხდა: '+(e.message||'შეცდომა')}
      finally{create.disabled=false}
    };
    copy.onclick=async()=>{
      if(!input.value)return;
      try{await navigator.clipboard.writeText(input.value);note.textContent='✅ მოწვევის ბმული დაკოპირდა.'}
      catch{input.focus();input.select();note.textContent='ბმული მონიშნულია — დააჭირე Ctrl+C-ს.'}
    };
  }
  function renderDashboardDetail(){const s=state();const rows=document.getElementById('dashCatchRows');if(rows)rows.innerHTML=s.catches.length?s.catches.slice().reverse().map(x=>`<div class="gn-list-row"><b>${esc(x.fish)}</b><span>${esc(x.place||'')}</span><span>${x.weight?esc(x.weight)+' კგ':'—'}</span><small>${esc(x.date)}</small></div>`).join(''):'ჯერ ჩანაწერი არ გაქვს.';const p=document.getElementById('dashPlans');if(p)p.innerHTML=s.plans.length?s.plans.slice(0,8).map(x=>`<div class="gn-list-row"><b>${esc(x.title)}</b><span>${esc(x.meta||'')}</span><small>${esc(x.date)}</small></div>`).join(''):'ჯერ გეგმა არ გაქვს.';const bd=document.getElementById('dashBadges');if(bd){const all=[['first-catch','🐟','პირველი დაჭერა'],['five-catches','🎣','5 დაჭერა'],['planner','🧭','პირველი Planner'],['collector','📚','3 რჩეული'],['xp500','🏆','500 XP']];bd.innerHTML=all.map(x=>`<div class="badge ${s.badges.includes(x[0])?'earned':''}"><span>${x[1]}</span><b>${x[2]}</b></div>`).join('')};const lead=document.getElementById('dashBoard');if(lead)renderXpLeaderboard(lead);renderInviteTools();const ch=document.getElementById('dashChallenges');if(ch){const uniq=new Set(s.catches.map(x=>String(x.fish||'').trim().toLowerCase()).filter(Boolean)).size;const challenges=[['პირველი დაჭერა',1,s.catches.length],['5 დაჭერა',5,s.catches.length],['3 განსხვავებული თევზი',3,uniq],['3 Planner',3,s.plans.length],['500 XP',500,s.xp]].map(x=>`<div class="leader-row"><span>${x[2]>=x[1]?'✅':'⬜'}</span><b>${x[0]}</b><strong>${Math.min(x[2],x[1])}/${x[1]}</strong></div>`);ch.innerHTML=challenges.join('')};const rec=document.getElementById('dashCatchRows');if(rec&&s.catches.length){const max=s.catches.slice().sort((a,b)=>Number(b.weight||0)-Number(a.weight||0))[0];rec.insertAdjacentHTML('beforebegin',`<div class="gn-record"><b>🏆 პირადი რეკორდი:</b> ${esc(max.fish)} — ${max.weight?esc(max.weight)+' კგ':'წონა არაა მითითებული'} • ${esc(max.place||'ადგილი არაა მითითებული')}</div>`)}mountPhotoId();const fav=document.getElementById('dashFavs');if(fav){fav.innerHTML=s.favorites.length?s.favorites.map((x,i)=>`<span class="gn-chip">⭐ ${esc(x)}</span>`).join(''):'ჯერ რჩეული არ გაქვს.';const fa=document.getElementById('favAdd');if(fa)fa.onclick=()=>{const v=document.getElementById('favName')?.value.trim();if(!v)return;const st=state();if(!st.favorites.includes(v)){st.favorites.push(v);st.xp+=15;save(st);badgeCheck();notify('რჩეული დაემატა • +15 XP');renderDashboardDetail()}}}
const add=document.getElementById('dashCatchAdd');if(add)add.onclick=()=>{const box=document.getElementById('dashCatchForm');box.innerHTML=`<div class="gn-form-grid"><input id="dcFish" placeholder="თევზი"><input id="dcPlace" placeholder="ადგილი"><input id="dcWeight" type="number" step="0.01" placeholder="წონა კგ"><input id="dcDate" type="date" value="${(window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'))}"><input id="dcNote" placeholder="შენიშვნა"><button id="dcSave" class="btn primary">შენახვა</button></div>`;document.getElementById('dcSave').onclick=()=>{recordCatch(document.getElementById('dcFish').value,document.getElementById('dcPlace').value,document.getElementById('dcWeight').value,document.getElementById('dcDate').value,document.getElementById('dcNote').value);renderDashboardDetail();box.innerHTML=''}}}
  function hookPlans(){document.getElementById('planBtn')?.addEventListener('click',()=>{if(window.selectedFish&&window.selectedWater)addPlan('fishing',`თევზაობა: ${window.selectedFish[1]}`,window.selectedWater[1])});document.getElementById('huntPlanBtn')?.addEventListener('click',()=>{if(window.selectedHunt)addPlan('hunting',`ნადირობა: ${window.selectedHunt[1]}`,document.getElementById('huntRegion')?.value||'')});}
  document.addEventListener('DOMContentLoaded',function(){
    if(location.pathname.endsWith('dashboard.html')){mountDashboard();setTimeout(()=>syncXpToServer(state()),400);return}
    if(location.pathname.endsWith('fishing.html')){mountFishingPlus();document.addEventListener('gn:fishingUpdated',renderFishingPlus);setTimeout(renderFishingPlus,700);setInterval(renderFishingPlus,2000)}
    if(location.pathname.endsWith('hunting.html')){mountHuntingPlus();setTimeout(renderHuntingPlus,700);setInterval(renderHuntingPlus,2000)}
    if(location.pathname.endsWith('weather.html'))mountWeatherPrompt();
    if(location.pathname.endsWith('index.html')||location.pathname==='/'||location.pathname==='')mountHomePrompt();
    hookPlans();
    window.GeoNaturePlus={state,save,addXP,recordCatch,addPlan,toggleChecklist,notify,level};
  });
})();
