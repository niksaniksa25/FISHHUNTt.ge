(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>window.GeoNatureCommon?.numberOrNull?.(value)??null;
  const value=(v,unit='',digits=1)=>number(v)===null?'მონაცემი არ არის':Number(v).toFixed(digits)+unit;
  const band=score=>score>=80?'good':score>=50?'mid':'bad';
  function mount(id,title,kind){
    if(document.getElementById(id))return;
    const anchor=document.getElementById(kind==='fish'?'fishingPlus':'huntingPlus');if(!anchor)return;
    const article=document.createElement('article');article.id=id;article.className='panel gn-card gn-smart-page-guide';
    article.innerHTML=`<div class="row-between"><div><span class="eyebrow">SMART MOMENT</span><h2>${title}</h2><p class="muted">საუკეთესო საათი იყენებს Planner-ის იმავე მოდელს და არჩეულ ${kind==='fish'?'თევზს, ადგილსა':'სახეობას, რეგიონსა'} და თარიღს.</p></div><a class="btn primary" href="ai.html">კითხვების ცენტრი →</a></div><div id="${id}Body" class="gn-smart-guide-body">Planner-ის მონაცემებს ველოდებით…</div>`;
    anchor.appendChild(article);
  }
  function recommendations(kind){
    const common=window.GeoNatureCommon,data=kind==='fish'?window.plannerWeather:window.huntWeather;
    const subject=kind==='fish'?window.selectedFish:window.selectedHunt;
    const start=document.getElementById(kind==='fish'?'startDate':'huntStartDate')?.value;
    if(!common||!data?.hourly?.time||!subject||!start)return[];
    const now=common.zonedDateTime(data),premiumLimit=Math.max(1,Math.min(7,Math.trunc(Number(window.GNPremium?.maxForecastDays?.())||1)));
    const daysControl=document.getElementById(kind==='fish'?'daysCount':'huntDays');
    const limit=Math.min(premiumLimit,daysControl?Math.max(1,Math.trunc(Number(daysControl.value)||1)):premiumLimit);
    const end=new Date(start+'T12:00:00Z');if(!Number.isFinite(end.getTime()))return[];
    end.setUTCDate(end.getUTCDate()+limit-1);
    const endDate=end.toISOString().slice(0,10);
    const dates=[...new Set(data.hourly.time.map(iso=>iso.slice(0,10)))].filter(date=>date>=start&&date<=endDate).slice(0,limit);
    const region=(window.HUNT_REGIONS||[]).find(item=>item[0]===document.getElementById('huntRegion')?.value);
    return dates.map(date=>{
      const ranked=kind==='fish'?(window.GeoFishingPlanner?.scoredHours?.(data,date)||[]).map(item=>({row:item.r,score:item.score})):
        common.hourlyRows(data,date).filter(row=>date!==now?.date||row.local_hour>=now.hour).map(row=>({row,score:window.GeoHuntingPlanner?.scoreForRow?.(row,region)??null})).filter(item=>Number.isFinite(item.score)).sort((a,b)=>b.score-a.score||a.row.iso.localeCompare(b.row.iso));
      return ranked[0]?{date,...ranked[0]}:null;
    }).filter(Boolean);
  }
  function render(kind){
    const id=kind==='fish'?'gnFishingSmartMoment':'gnHuntingSmartMoment';mount(id,kind==='fish'?'🎣 საუკეთესო სათევზაო დრო':'🦌 სახეობის აქტიურობის საუკეთესო დრო',kind);
    const box=document.getElementById(id+'Body');if(!box)return;
    const data=kind==='fish'?window.plannerWeather:window.huntWeather,subject=kind==='fish'?window.selectedFish:window.selectedHunt;
    const days=recommendations(kind),best=days.slice().sort((a,b)=>b.score-a.score||a.row.iso.localeCompare(b.row.iso))[0];
    if(!best){box.textContent='არჩეული თარიღის, სახეობისა და ადგილის საკმარისი საათობრივი მონაცემი არ არის.';return;}
    const location=kind==='fish'?window.selectedWater?.[1]:document.getElementById('huntRegion')?.value;
    box.innerHTML=`<div class="gn-smart-main"><div><small>${esc(best.date)} • ${data.__meta?.stale?'ბოლო ხელმისაწვდომი პროგნოზი':'საუკეთესო საათი'}</small><b class="${band(best.score)}">${best.score}/100</b><span>${esc(best.row.time)} • ${value(best.row.temperature,'°C')} • ქარი ${value(best.row.wind,' კმ/სთ')} • წვიმის ალბათობა ${value(best.row.rainProb,'%',0)}</span></div><div><strong>${esc(subject[1])}</strong><small>📍 ${esc(location||'ადგილი დაუზუსტებელია')}</small><p class="muted">ქულა პირობების საორიენტაციო ინდექსია. მოქმედი შეზღუდვები Planner-ის სახეობის პროფილში გადაამოწმე.</p></div></div><div class="gn-smart-days">${days.map(item=>`<div class="${band(item.score)}"><small>${esc(item.date)}</small><b>${esc(item.row.time)}</b><span>${item.score}/100</span></div>`).join('')}</div>`;
  }
  window.GeoNaturePageExtras={recommendations,renderFishing:()=>render('fish'),renderHunt:()=>render('hunt')};
  document.addEventListener('DOMContentLoaded',()=>{
    if(location.pathname.endsWith('fishing.html')){document.addEventListener('gn:fishingUpdated',()=>render('fish'));render('fish');}
    if(location.pathname.endsWith('hunting.html')){document.addEventListener('gn:huntingUpdated',()=>render('hunt'));render('hunt');}
    window.addEventListener?.('gn:premium-ready',()=>{if(location.pathname.endsWith('fishing.html'))render('fish');if(location.pathname.endsWith('hunting.html'))render('hunt');});
  });
})();
