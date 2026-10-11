/* GeoNature Live Assessment Factors
 * Exact display values come from the same hourly/current weather payload used by the page.
 * Kp is read live from NOAA SWPC when available; moon illumination is calculated astronomically.
 */
(function(){
  const cache={kp:null,kpAt:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val};
  const setBar=(id,p)=>{const el=document.getElementById(id);if(el)el.style.width=`${clamp(Number(p)||0,0,100)}%`};
  function localDateTime(iso){
    try{return new Date().toLocaleString('ka-GE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch(_){return new Date().toLocaleTimeString();}
  }
  function moonPhase(dateLike){
    const d=new Date(dateLike||Date.now());
    const synodic=29.53058867, epoch=Date.parse('2000-01-06T18:14:00Z');
    const elapsed=(d.getTime()-epoch)/86400000;
    const age=((elapsed%synodic)+synodic)%synodic;
    const phase=age/synodic;
    const angle=phase*360;
    const illum=(1-Math.cos(angle*Math.PI/180))/2*100;
    let label='ახალი მთვარე',icon='🌑',phaseIndex=0;
    if(age<1.8456618){label='ახალი მთვარე';icon='🌑';phaseIndex=0;}
    else if(age<5.5369854){label='მზარდი ნამგალა';icon='🌒';phaseIndex=1;}
    else if(age<9.2283090){label='პირველი მეოთხედი';icon='🌓';phaseIndex=2;}
    else if(age<12.9196326){label='მზარდი გიბუსი';icon='🌔';phaseIndex=3;}
    else if(age<16.6109562){label='სავსე მთვარე';icon='🌕';phaseIndex=4;}
    else if(age<20.3022798){label='კლებადი გიბუსი';icon='🌖';phaseIndex=5;}
    else if(age<23.9936034){label='ბოლო მეოთხედი';icon='🌗';phaseIndex=6;}
    else {label='კლებადი ნამგალა';icon='🌘';phaseIndex=7;}
    const waxing=phaseIndex>0&&phaseIndex<4;
    const quarter=synodic/4;
    const majors=[{age:0,label:'ახალი მთვარე',icon:'🌑'},{age:quarter,label:'პირველი მეოთხედი',icon:'🌓'},{age:2*quarter,label:'სავსე მთვარე',icon:'🌕'},{age:3*quarter,label:'ბოლო მეოთხედი',icon:'🌗'}];
    let next=majors.find(x=>x.age>age+1e-6),daysTo;
    if(next) daysTo=next.age-age; else {next=majors[0];daysTo=synodic-age;}
    const nextDate=new Date(d.getTime()+daysTo*86400000);
    return {age,illum:Math.round(illum),illumExact:illum,angle,label,icon,phaseIndex,waxing,nextLabel:next.label,nextIcon:next.icon,nextDate,daysToNext:daysTo};
  }
  function rowAt(data,iso){
    const h=data?.hourly?.time||[];const i=h.indexOf(iso);if(i<0)return null;
    const cloud=Number(data.hourly.cloud_cover?.[i]);const visibility=Number(data.hourly.visibility?.[i]);
    return {iso,time:iso.slice(11,16),temperature:Number(data.hourly.temperature_2m?.[i]),pressure:Number(data.hourly.pressure_msl?.[i]),wind:Number(data.hourly.wind_speed_10m?.[i]),gust:Number(data.hourly.wind_gusts_10m?.[i]),precip:Number(data.hourly.precipitation?.[i]),rainProb:Number(data.hourly.precipitation_probability?.[i]),humidity:Number(data.hourly.relative_humidity_2m?.[i]),cloud:Number.isFinite(cloud)?cloud:Number(data.current?.cloud_cover||0),visibility:Number.isFinite(visibility)?visibility:Number(data.hourly.visibility?.[i]||0),code:Number(data.hourly.weather_code?.[i])};
  }
  function pressureDelta(data,row){
    if(!data?.hourly?.time||!row?.iso)return null;
    const times=data.hourly.time,idx=times.indexOf(row.iso);
    if(idx<=0)return null;
    const current=Number(data.hourly.pressure_msl?.[idx]),prev=Number(data.hourly.pressure_msl?.[idx-1]);
    if(!Number.isFinite(current)||!Number.isFinite(prev))return null;
    return current-prev;
  }
  function activityScore(subject,type,hour){
    if(type==='fishing'&&typeof window.activityWindowScore==='function')return Number(window.activityWindowScore(subject,hour));
    if(type==='hunting'&&typeof window.huntActivityScore==='function')return Number(window.huntActivityScore(subject,hour));
    const h=Number(hour);
    if(h>=5&&h<=9||h>=17&&h<=20)return 82;
    return 66;
  }
  function activityLabel(score){return score>=90?'პიკური პერიოდი':score>=75?'ძალიან კარგი':score>=55?'ჩვეულებრივი':'სუსტი';}
  async function fetchKp(){
    if(cache.kp!==null && Date.now()-cache.kpAt<300000)return cache.kp;
    try{
      const r=await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',{cache:'no-store'});
      if(!r.ok)throw new Error('Kp unavailable');
      const j=await r.json();
      const rows=Array.isArray(j)?j.slice(1):[];
      for(let i=rows.length-1;i>=0;i--){
        const v=Number(rows[i]?.[1]);
        if(Number.isFinite(v)){cache.kp=v;cache.kpAt=Date.now();return v;}
      }
    }catch(e){console.warn('Kp live data unavailable',e)}
    cache.kp=null;cache.kpAt=Date.now();return null;
  }
  function kpLabel(k){if(!Number.isFinite(k))return 'მონაცემი მიუწვდომელია';if(k<2)return 'მშვიდი';if(k<4)return 'ცვალებადი';if(k<5)return 'აქტიური';if(k<7)return 'ქარიშხლის დონე';return 'ძლიერი შტორმი';}
  function render(snapshot){
    const data=snapshot?.data||{},row=snapshot?.row||null;
    if(!row)return;
    const t=Number.isFinite(row.temperature)?row.temperature:Number(data.current?.temperature_2m);
    const p=Number.isFinite(row.pressure)?row.pressure:Number(data.current?.pressure_msl);
    const wind=Number.isFinite(row.wind)?row.wind:Number(data.current?.wind_speed_10m);
    const rainProb=Number.isFinite(row.rainProb)?row.rainProb:Number(data.current?.precipitation_probability||0);
    const cloud=Number.isFinite(row.cloud)?row.cloud:Number(data.current?.cloud_cover||0);
    const hour=Number(String(row.time||'12:00').slice(0,2));
    const moon=moonPhase(row.iso||Date.now());
    const activity=clamp(activityScore(snapshot.subject,snapshot.type,hour),0,100);
    const delta=pressureDelta(data,row);
    const updateText=localDateTime();
    set('factorLocation',snapshot.locationName||'არჩეული ადგილი');
    set('factorHour',row.time||'ახლა');
    set('factorTemp',Number.isFinite(t)?`${t.toFixed(1)}°C`:'—');
    set('factorPressure',Number.isFinite(p)?`${p.toFixed(1)} hPa`:'—');
    set('factorWind',Number.isFinite(wind)?`${wind.toFixed(1)} კმ/სთ`:'—');
    set('factorRain',Number.isFinite(rainProb)?`${Math.round(rainProb)}%`:'—');
    set('factorCloud',Number.isFinite(cloud)?`${Math.round(cloud)}%`:'—');
    set('factorHumidity',Number.isFinite(row.humidity)?`${Math.round(row.humidity)}%`:'—');
    set('factorGust',Number.isFinite(row.gust)?`${row.gust.toFixed(1)} კმ/სთ`:'—');
    set('factorVisibility',Number.isFinite(row.visibility)?`${(row.visibility/1000).toFixed(1)} კმ`:'—');
    set('factorMoon',`${moon.illum}%`);
    set('factorMoonLabel',`${moon.icon} ${moon.label}`);
    set('factorFeed',activityLabel(activity));
    set('factorFeedLabel',snapshot.type==='hunting'?'აქტიურობის პერიოდი':snapshot.type==='fishing'?'კვების პერიოდი':'აქტივობის პერიოდი');
    set('factorFeedDetail',`${Math.round(activity)}/100 • ${row.time||'ახლა'}`);
    if(delta===null){set('factorPressureChange','უცვლელი →');set('factorPressureChangeDetail','წინა საათი არ არის');}
    else {const abs=Math.abs(delta);const arrow=delta>0.15?'↑':delta<-0.15?'↓':'→';set('factorPressureChange',`${arrow} ${delta>0?'+':''}${delta.toFixed(1)} hPa`);set('factorPressureChangeDetail',delta>0.15?'იზრდება':delta<-0.15?'იკლებს':'სტაბილური');}
    set('factorUpdated',`განახლდა ${updateText}`);
    set('factorMode',snapshot.live===false?'LIVE გამორთულია':'LIVE • ავტომატური განახლება');
    setBar('factorFeedBar',activity);
    setBar('factorPressureBar',(p-960)/80*100);
    setBar('factorPressureChangeBar',50+(Number.isFinite(delta)?delta*8:0));
    setBar('factorWindBar',wind/35*100);
    setBar('factorTempBar',t/40*100);
    setBar('factorRainBar',rainProb);
    setBar('factorCloudBar',cloud);
    setBar('factorHumidityBar',row.humidity);
    setBar('factorGustBar',row.gust/60*100);
    setBar('factorVisibilityBar',row.visibility/10000*100);
    setBar('factorMoonBar',moon.illum);
    const kpValueEl=document.getElementById('factorKp'),kpBar=document.getElementById('factorKpBar');
    set('factorSource','Open-Meteo • საათობრივი მონაცემი');
    set('factorWeather',typeof window.codeMeta==='function'?(window.codeMeta(row.code)[1]||''):'' );
    const kp=cache.kp;
    if(kpValueEl){kpValueEl.textContent=Number.isFinite(kp)?`Kp ${kp.toFixed(1)} • ${kpLabel(kp)}`:'Kp — • მონაცემი იტვირთება';}
    if(kpBar)setBar('factorKpBar',Number.isFinite(kp)?kp/9*100:0);
    Promise.resolve(fetchKp()).then(v=>{if(document.getElementById('factorKp')){set('factorKp',Number.isFinite(v)?`Kp ${v.toFixed(1)} • ${kpLabel(v)}`:'Kp — • მონაცემი მიუწვდომელია');setBar('factorKpBar',Number.isFinite(v)?v/9*100:0);}});
  }
  let live=true,timer=null,refreshHandler=null;
  function bind(opts){
    const refreshBtn=document.getElementById('assessmentRefresh'),toggle=document.getElementById('assessmentLiveToggle'),state=document.getElementById('assessmentLiveState');
    if(!document.getElementById('assessmentFactors'))return;
    live=opts?.liveDefault!==false;refreshHandler=opts?.refresh||null;
    const sync=()=>{if(state)state.textContent=live?'● LIVE':'○ PAUSED';if(toggle)toggle.textContent=live?'LIVE რეჟიმი: ჩართულია':'LIVE რეჟიმი: გამორთულია';};
    sync();
    if(timer)clearInterval(timer);
    const start=()=>{if(timer)clearInterval(timer);timer=setInterval(async()=>{if(live&&refreshHandler){try{await refreshHandler()}catch(e){console.error(e)}}},300000)};
    if(toggle)toggle.onclick=()=>{live=!live;sync();if(live)start()};
    if(refreshBtn)refreshBtn.onclick=async()=>{if(refreshHandler){refreshBtn.disabled=true;try{await refreshHandler()}finally{refreshBtn.disabled=false}}};
    start();
    return {get live(){return live},setLive(v){live=!!v;sync();start()}};
  }
  window.GNLiveFactors={render,bind,rowAt,moonPhase,fetchKp};
})();
