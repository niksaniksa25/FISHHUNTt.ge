(function(){
  const state={data:null,lat:41.7151,lon:44.8271,city:'თბილისი',date:'',hour:'',live:true,timer:null};
  const $=id=>document.getElementById(id);
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
  const scoreBand=s=>{s=Number(s)||0; if(s>=80)return ['კარგი','good']; if(s>=50)return ['საშუალო','mid']; return ['ცუდი','bad'];};
  const rowAt=(data,iso)=>{
    const i=(data?.hourly?.time||[]).indexOf(iso); if(i<0)return null;
    const h=data.hourly;
    return {iso,time:iso.slice(11,16),temperature:Number(h.temperature_2m?.[i]),apparent_temperature:Number(h.apparent_temperature?.[i]??h.temperature_2m?.[i]),pressure:Number(h.pressure_msl?.[i]),wind:Number(h.wind_speed_10m?.[i]),gust:Number(h.wind_gusts_10m?.[i]),precip:Number(h.precipitation?.[i]),rainProb:Number(h.precipitation_probability?.[i]),humidity:Number(h.relative_humidity_2m?.[i]),cloud:Number(h.cloud_cover?.[i]),visibility:Number(h.visibility?.[i]||0),code:Number(h.weather_code?.[i]),local_hour:Number(iso.slice(11,13))};
  };
  const allRows=()=> (state.data?.hourly?.time||[]).map(x=>rowAt(state.data,x)).filter(Boolean);
  const dateRows=date=>allRows().filter(r=>r.iso.slice(0,10)===date);
  const currentDate=()=>state.data?.current?.time?.slice(0,10) || (window.GeoNatureCommon?.localDateISO?.()||new Date().toLocaleDateString('sv-SE'));
  const todayHour=()=>state.data?.current?.time?.slice(11,16) || `${String(new Date().getHours()).padStart(2,'0')}:00`;
  function outdoorRowScore(r){
    const weather={temperature_2m:r.temperature,apparent_temperature:r.apparent_temperature??r.temperature,pressure_msl:r.pressure,
      wind_speed_10m:r.wind,wind_gusts_10m:r.gust,precipitation:r.precip,precipitation_probability:r.rainProb,
      relative_humidity_2m:r.humidity,cloud_cover:r.cloud,visibility:r.visibility,weather_code:r.code,local_hour:r.local_hour};
    if(typeof window.GeoNatureCommon?.outdoorScore==='function')return clamp(window.GeoNatureCommon.outdoorScore(weather));
    if(typeof window.outdoorScore==='function')return clamp(window.outdoorScore(weather));
    return 0;
  }
  function rowsForBest(d){
    const rows=dateRows(d),currentIso=String(state.data?.current?.time||'');
    return d===currentDate()&&currentIso?rows.filter(r=>r.iso>=currentIso):rows;
  }
  function fishingScore(r){
    if(typeof window.fishingEnvironmentScore==='function') return clamp(window.fishingEnvironmentScore({temperature_2m:r.temperature,pressure_msl:r.pressure,wind_speed_10m:r.wind,precipitation:r.precip,precipitation_probability:r.rainProb,weather_code:r.code,relative_humidity_2m:r.humidity,local_hour:r.local_hour},undefined));
    return clamp(outdoorRowScore(r)*0.92);
  }
  function huntingScore(r){
    const activity=(r.local_hour>=5&&r.local_hour<=9)||(r.local_hour>=17&&r.local_hour<=20)?100:72;
    return Math.round(clamp(outdoorRowScore(r)*0.82+activity*0.18));
  }
  function setText(id,v){const e=$(id);if(e)e.textContent=v}
  function setScoreCard(prefix,score){
    const [label,key]=scoreBand(score),el=$(prefix+'ScoreCard'),value=$(prefix+'Score'),value2=$(prefix+'ScoreValue');
    if(value)value.textContent=score; if(value2)value2.textContent=score;
    if(el)el.dataset.level=key;
    const lab=$(prefix+'Band');if(lab){lab.textContent=label;lab.dataset.level=key;}
  }
  function renderDates(){
    const dates=[...new Set(allRows().map(r=>r.iso.slice(0,10)))].slice(0,window.GNPremium?.maxForecastDays?.()||1); const sel=$('homeDateSelect');if(!sel)return;
    const keep=dates.includes(state.date)?state.date:dates[0];state.date=keep;
    sel.innerHTML=dates.map((d,i)=>`<option value="${d}">${i===0?'დღეს':new Date(`${d}T12:00:00`).toLocaleDateString('ka-GE',{weekday:'short',day:'numeric',month:'short'})}</option>`).join(''); sel.value=state.date; sel.onchange=()=>{state.date=sel.value;renderHours();renderSelected();};
  }
  function renderHours(){
    const rows=dateRows(state.date),sel=$('homeHourSelect'),strip=$('homeHourlyStrip');if(!sel||!rows.length)return;
    const defaultHour=state.date===currentDate()?todayHour():rows[Math.min(12,rows.length-1)].time;
    if(!rows.some(r=>r.time===state.hour)) state.hour=defaultHour;
    sel.innerHTML=rows.map(r=>`<option value="${r.time}">${r.time}</option>`).join(''); sel.value=state.hour;
    sel.onchange=()=>{state.hour=sel.value;renderSelected();};
    strip.innerHTML=rows.map(r=>{const o=outdoorRowScore(r),f=fishingScore(r),h=huntingScore(r),[_,key]=scoreBand(o),mm=codeMeta(r.code);return `<button type="button" class="home-hour ${r.time===state.hour?'active':''}" data-time="${r.time}"><small>${r.time}</small><span>${mm[0]}</span><b>${Math.round(r.temperature)}°</b><strong class="score-pill ${key}">${o}</strong><em>F ${f} • H ${h}</em></button>`}).join('');
    strip.querySelectorAll('.home-hour').forEach(b=>b.onclick=()=>{state.hour=b.dataset.time;sel.value=state.hour;renderSelected();});
  }
  function renderSelected(){
    const r=dateRows(state.date).find(x=>x.time===state.hour) || dateRows(state.date)[0]; if(!r)return; state.hour=r.time;
    const o=outdoorRowScore(r), f=fishingScore(r), h=huntingScore(r), mm=codeMeta(r.code), [oband,okey]=scoreBand(o), [fband,fkey]=scoreBand(f), [hband,hkey]=scoreBand(h);
    setText('homeLiveTitle',state.city); setText('homeCity',state.city); setText('homeSelectedTime',`${state.date} • ${r.time}`); setText('homeMainTemp',`${r.temperature.toFixed(1)}°C`); setText('homeMainDesc',mm[1]); setText('homeMainIcon',mm[0]); setText('homeTemp',`${Math.round(r.temperature)}°`); setText('homeDesc',mm[1]); setText('homeIcon',mm[0]); setText('homePressure',`${Math.round(r.pressure)} hPa`); setText('homeWind',`${Math.round(r.wind)} კმ/სთ`); setText('homeHumidity',`${Math.round(r.humidity)}%`); setText('homeRain',`${r.precip.toFixed(1)} მმ`);
    setScoreCard('outdoor',o);setScoreCard('fishing',f);setScoreCard('hunting',h); const go=$('homeGo'); if(go)go.dataset.level=okey; const outValue=$('outdoorScore'); if(outValue)outValue.textContent=o;
    const summary=o>=80?'კარგი დროა გარეთ გასასვლელად':o>=50?'საშუალო პირობებია — გადაამოწმე საათი':'ცუდი პირობებია — ჯობს სხვა საათი აირჩიო'; setText('homeGoSummary',summary); setText('homeGoScore',o+'/100');
    setText('homeFactorTemp',`${r.temperature.toFixed(1)}°C`);setText('homeFactorPressure',`${r.pressure.toFixed(1)} hPa`);setText('homeFactorWind',`${r.wind.toFixed(1)} კმ/სთ`);setText('homeFactorRain',`${r.precip.toFixed(1)} მმ`);setText('homeFactorCloud',`${Math.round(r.cloud)}%`);setText('homeFactorHumidity',`${Math.round(r.humidity)}%`);setText('homeFactorGust',`${r.gust.toFixed(1)} კმ/სთ`);setText('homeFactorRainProb',`${Math.round(r.rainProb)}%`);
    const drows=rowsForBest(state.date); const best=drows.map(x=>({r:x,s:outdoorRowScore(x)})).sort((a,b)=>b.s-a.s||a.r.iso.localeCompare(b.r.iso))[0]; setText('homeBestHour',best?`${best.r.time} • ${best.s}/100`:'—');
    document.querySelectorAll('#homeHourlyStrip .home-hour').forEach(el=>el.classList.toggle('active',el.dataset.time===r.time));
    if(window.GNLiveFactors) window.GNLiveFactors.render({data:state.data,row:r,subject:null,type:'weather',locationName:state.city,live:state.live}); if(window.GeoNatureExtras?.renderHome) window.GeoNatureExtras.renderHome(state.data,r);
  }
  function renderMode(){
    const on=state.live;setText('homeLiveState',on?'● LIVE':'○ შეჩერებულია');const b=$('homeLiveToggle');if(b)b.textContent=on?'LIVE რეჟიმი: ჩართულია':'LIVE რეჟიმი: გამორთულია';const ab=$('assessmentLiveToggle');if(ab)ab.textContent=on?'LIVE რეჟიმი: ჩართულია':'LIVE რეჟიმი: გამორთულია';const ast=$('assessmentLiveState');if(ast)ast.textContent=on?'● LIVE':'○ PAUSED';
    document.body.dataset.live=on?'1':'0';
  }
  function renderWeek(){
    const box=$('homeWeekStrip'); if(!box)return;
    const dates=[...new Set(allRows().map(r=>r.iso.slice(0,10)))].slice(0,window.GNPremium?.maxForecastDays?.()||1);
    box.innerHTML=dates.map(d=>{const rows=rowsForBest(d);const best=rows.map(r=>({r,s:outdoorRowScore(r)})).sort((a,b)=>b.s-a.s||a.r.iso.localeCompare(b.r.iso))[0];if(!best)return '';const [label,key]=scoreBand(best.s);return `<button class="home-day ${key}" data-date="${d}"><small>${new Date(`${d}T12:00:00`).toLocaleDateString('ka-GE',{weekday:'short'})}</small><b>${new Date(`${d}T12:00:00`).getDate()}</b><span>${best.s}</span><em>${label} • ${best.r.time}</em></button>`}).join('');
    box.querySelectorAll('.home-day').forEach(b=>b.onclick=()=>{state.date=b.dataset.date;renderDates();renderHours();renderSelected();});
  }
  async function load(){
    const refresh=$('homeRefresh');if(refresh)refresh.disabled=true;
    try{state.data=await openMeteo(state.lat,state.lon);renderDates();renderWeek();renderHours();renderSelected();setText('homeUpdated',`განახლდა ${new Date().toLocaleTimeString('ka-GE',{hour:'2-digit',minute:'2-digit'})}`);}
    catch(e){console.error(e);setText('homeUpdated','Live მონაცემები დროებით მიუწვდომელია');}
    finally{if(refresh)refresh.disabled=false;}
  }
  function bind(){
    $('homeRefresh')?.addEventListener('click',load);
    $('homeLiveToggle')?.addEventListener('click',()=>{state.live=!state.live;renderMode();if(state.live)start();else stop();});
    $('assessmentRefresh')?.addEventListener('click',load);
    $('assessmentLiveToggle')?.addEventListener('click',()=>{state.live=!state.live;renderMode();if(state.live)start();else stop();});
    $('homeLocation')?.addEventListener('change',async e=>{const v=e.target.value.split(',');state.lat=Number(v[0]);state.lon=Number(v[1]);state.city=v[2];await load();});
    renderMode();
    start();
  }
  function start(){stop();if(state.live)state.timer=setInterval(load,300000)}
  function stop(){if(state.timer){clearInterval(state.timer);state.timer=null}}
  window.GeoNatureHome={load,stop,start};
  document.addEventListener('DOMContentLoaded',async()=>{bind();await load();});
})();
