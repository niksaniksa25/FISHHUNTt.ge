(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
  const band=s=>s>=80?'good':s>=50?'mid':'bad';
  function limit(){return window.GNPremium?.maxForecastDays?.()||1}
  function mount(id,title,kind){
    if(document.getElementById(id))return;
    const anchor=kind==='fish'?document.getElementById('fishingPlus'):document.getElementById('huntingPlus');
    if(!anchor)return;
    const article=document.createElement('article');article.id=id;article.className='panel gn-card gn-smart-page-guide';
    article.innerHTML=`<div class="row-between"><div><span class="eyebrow">SMART MOMENT</span><h2>${title}</h2><p class="muted">საუკეთესო საათი ითვლება არჩეული ${kind==='fish'?'თევზისა და ადგილის':'სახეობისა და რეგიონის'} პირობების მიხედვით.</p></div><a class="btn primary" href="ai.html">🤖 AI Guide</a></div><div id="${id}Body" class="gn-smart-guide-body">Planner-ის მონაცემებს ველოდები…</div>`;
    anchor.appendChild(article);
  }
  function renderFishing(){
    mount('gnFishingSmartMoment','🎣 Fishing Best Moment','fish');
    const box=document.getElementById('gnFishingSmartMomentBody');if(!box)return;
    const f=window.selectedFish,w=window.selectedWater,d=window.plannerWeather;if(!f||!d?.hourly?.time){box.innerHTML='<span class="muted">აირჩიე თევზი, ადგილი და გაუშვი Planner.</span>';return;}
    const rows=(d.hourly.time||[]).map((t,i)=>({date:t.slice(0,10),time:t.slice(11,16),hour:Number(t.slice(11,13)),temperature:Number(d.hourly.temperature_2m?.[i]??20),pressure:Number(d.hourly.pressure_msl?.[i]??1013),wind:Number(d.hourly.wind_speed_10m?.[i]??0),rain:Number(d.hourly.precipitation?.[i]??0),rp:Number(d.hourly.precipitation_probability?.[i]??0),code:Number(d.hourly.weather_code?.[i]??0),humidity:Number(d.hourly.relative_humidity_2m?.[i]??60)}));
    const dates=[...new Set(rows.map(r=>r.date))].slice(0,limit());
    const days=dates.map(date=>{const rr=rows.filter(r=>r.date===date);const rank=rr.map(r=>({r,s:window.fishScore?clamp(window.fishScore(f,{temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.rain,precipitation_probability:r.rp,weather_code:r.code,relative_humidity_2m:r.humidity,local_hour:r.hour},w)):clamp(70)})).sort((a,b)=>b.s-a.s)[0];return rank?{date,...rank}:null}).filter(Boolean);const top=days[0];
    box.innerHTML=top?`<div class="gn-smart-main"><div><small>${top.date} • საუკეთესო საათი</small><b class="${band(top.s)}">${top.s}/100</b><span>${top.r.time} • ${top.r.temperature.toFixed(1)}°C • ქარი ${top.r.wind.toFixed(0)} კმ/სთ • წვიმა ${Math.round(top.r.rp)}%</span></div><div><strong>${esc(f[1])}</strong><small>📍 ${esc(w?.[1]||'ადგილი')}</small><p class="muted">${top.s>=80?'ძალიან კარგი ფანჯარაა.':top.s>=50?'საშუალო ფანჯარაა — უკეთესი საათიც შეამოწმე.':'დღე სუსტია — სხვა დღე/საათი სცადე.'}</p></div></div><div class="gn-smart-days">${days.map(x=>`<div class="${band(x.s)}"><small>${x.date}</small><b>${x.r.time}</b><span>${x.s}</span></div>`).join('')}</div>`:'მონაცემი ვერ მოიძებნა.';
  }
  function renderHunt(){
    mount('gnHuntingSmartMoment','🦌 Hunting Best Moment','hunt');
    const box=document.getElementById('gnHuntingSmartMomentBody');if(!box)return;
    const x=window.selectedHunt,d=window.huntWeather;if(!x||!d?.hourly?.time){box.innerHTML='<span class="muted">აირჩიე სახეობა, რეგიონი და გაუშვი Planner.</span>';return;}
    const rows=(d.hourly.time||[]).map((t,i)=>({date:t.slice(0,10),time:t.slice(11,16),hour:Number(t.slice(11,13)),temperature:Number(d.hourly.temperature_2m?.[i]??20),pressure:Number(d.hourly.pressure_msl?.[i]??1013),wind:Number(d.hourly.wind_speed_10m?.[i]??0),rain:Number(d.hourly.precipitation?.[i]??0),rp:Number(d.hourly.precipitation_probability?.[i]??0),code:Number(d.hourly.weather_code?.[i]??0)}));
    const dates=[...new Set(rows.map(r=>r.date))].slice(0,limit());
    const days=dates.map(date=>{const rr=rows.filter(r=>r.date===date);const rank=rr.map(r=>({r,s:typeof window.scoreWeather==='function'?clamp(window.scoreWeather({temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.rain,precipitation_probability:r.rp,weather_code:r.code})):clamp(70)})).sort((a,b)=>b.s-a.s)[0];return rank?{date,...rank}:null}).filter(Boolean);const top=days[0];
    box.innerHTML=top?`<div class="gn-smart-main"><div><small>${top.date} • საუკეთესო საათი</small><b class="${band(top.s)}">${top.s}/100</b><span>${top.r.time} • ${top.r.temperature.toFixed(1)}°C • ქარი ${top.r.wind.toFixed(0)} კმ/სთ • წვიმა ${Math.round(top.r.rp)}%</span></div><div><strong>${esc(x[1])}</strong><small>📍 ${esc(document.getElementById('huntRegion')?.value||'რეგიონი')}</small><p class="muted">${top.s>=80?'ძალიან კარგი ფანჯარაა.':top.s>=50?'საშუალო ფანჯარაა — გადაამოწმე ხილვადობაც.':'რთული პირობებია — სხვა დრო/დღე სჯობს.'}</p></div></div><div class="gn-smart-days">${days.map(v=>`<div class="${band(v.s)}"><small>${v.date}</small><b>${v.r.time}</b><span>${v.s}</span></div>`).join('')}</div>`:'მონაცემი ვერ მოიძებნა.';
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(location.pathname.endsWith('fishing.html')){setInterval(renderFishing,1500);renderFishing()}
    if(location.pathname.endsWith('hunting.html')){setInterval(renderHunt,1500);renderHunt()}
  });
})();
