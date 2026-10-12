/* GeoNature Live Assessment Factors
 * Exact display values come from the same hourly/current weather payload used by the page.
 * Kp is read live from NOAA SWPC when available; moon illumination is calculated astronomically.
 */
(function(){
  const cache={kp:null,kpAt:0,kpObservedAt:0,kpPromise:null};
  const numeric=value=>value===null||value===undefined||(typeof value==='string'&&!value.trim())||typeof value==='boolean'?null:(Number.isFinite(Number(value))?Number(value):null);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val};
  const setBar=(id,p)=>{const el=document.getElementById(id);if(el)el.style.width=`${clamp(Number(p)||0,0,100)}%`};
  function localDateTime(value,timeZone='Asia/Tbilisi'){
    const date=new Date(value||Date.now());
    try{return date.toLocaleString('ka-GE',{timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch(_){return date.toISOString().slice(11,19);}
  }
  function forecastInstant(data,iso){
    if(!iso)return Date.now();
    if(/(?:Z|[+-]\d\d:\d\d)$/.test(iso))return Date.parse(iso);
    const offset=numeric(data?.utc_offset_seconds);
    return Date.parse(iso+'Z')-(offset===null?14400:offset)*1000;
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
    const helper=window.GeoNatureCommon?.hourlyRows;
    if(helper)return helper(data).find(row=>row.iso===iso)||null;
    const i=(data?.hourly?.time||[]).indexOf(iso);if(i<0)return null;
    const h=data.hourly;
    return {iso,date:iso.slice(0,10),time:iso.slice(11,16),temperature:numeric(h.temperature_2m?.[i]),apparent:numeric(h.apparent_temperature?.[i]),pressure:numeric(h.pressure_msl?.[i]),wind:numeric(h.wind_speed_10m?.[i]),gust:numeric(h.wind_gusts_10m?.[i]),precip:numeric(h.precipitation?.[i]),rainProb:numeric(h.precipitation_probability?.[i]),humidity:numeric(h.relative_humidity_2m?.[i]),cloud:numeric(h.cloud_cover?.[i]),visibility:numeric(h.visibility?.[i]),code:numeric(h.weather_code?.[i])};
  }
  function pressureDelta(data,row){
    if(!data?.hourly?.time||!row?.iso)return null;
    const times=data.hourly.time,idx=times.indexOf(row.iso);
    if(idx<=0)return null;
    const current=numeric(row.pressure),prev=numeric(data.hourly.pressure_msl?.[idx-1]);
    if(current===null||prev===null)return null;
    return current-prev;
  }
  function activityScore(subject,type,hour){
    if(type==='fishing'&&typeof window.activityWindowScore==='function')return numeric(window.activityWindowScore(subject,hour));
    if(type==='hunting'&&typeof window.huntActivityScore==='function')return numeric(window.huntActivityScore(subject,hour));
    if(type!=='hunting'&&type!=='fishing')return null;
    const h=numeric(hour);if(h===null)return null;
    if(h>=5&&h<=9||h>=17&&h<=20)return 82;
    return 66;
  }
  function activityLabel(score){return score>=90?'პიკური პერიოდი':score>=75?'ძალიან კარგი':score>=55?'ჩვეულებრივი':'სუსტი';}
  async function fetchKp(){
    if(cache.kpAt&&Date.now()-cache.kpAt<300000&&(cache.kp===null||Date.now()-cache.kpObservedAt<6*3600000))return cache.kp;
    if(cache.kpPromise)return cache.kpPromise;
    cache.kpPromise=(async()=>{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
      try{
        const r=await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',{cache:'no-store',signal:controller.signal});
        if(!r.ok)throw new Error('Kp unavailable');
        const j=await r.json(),rows=Array.isArray(j)?j:[];
        for(let i=rows.length-1;i>=0;i--){
          const record=rows[i];
          const value=numeric(Array.isArray(record)?record[1]:record?.Kp);
          const stamp=String((Array.isArray(record)?record[0]:record?.time_tag)||'').trim().replace(' ','T');
          const observed=Date.parse(stamp+(stamp&&!/(?:Z|[+-]\d\d:\d\d)$/.test(stamp)?'Z':''));
          if(value!==null&&value>=0&&value<=9&&Number.isFinite(observed)&&Date.now()-observed<6*3600000&&observed-Date.now()<300000){
            cache.kp=value;cache.kpObservedAt=observed;return value;
          }
        }
        throw new Error('Kp observation is missing or old');
      }catch(e){cache.kp=null;cache.kpObservedAt=0;return null;}
      finally{clearTimeout(timeout);cache.kpAt=Date.now();}
    })().finally(()=>{cache.kpPromise=null;});
    return cache.kpPromise;
  }
  function kpLabel(k){if(!Number.isFinite(k))return 'მონაცემი მიუწვდომელია';if(k<2)return 'მშვიდი';if(k<4)return 'ცვალებადი';if(k<5)return 'აქტიური';if(k<7)return 'ქარიშხლის დონე';return 'ძლიერი შტორმი';}
  function render(snapshot){
    const data=snapshot?.data||{},row=snapshot?.row||null;
    if(!row){
      if(snapshot){
        lastSnapshot=snapshot;
        for(const id of ['factorTemp','factorPressure','factorWind','factorRain','factorCloud','factorHumidity','factorGust','factorVisibility','factorFeed','factorFeedDetail','factorPressureChange','factorPressureChangeDetail','factorWeather'])set(id,'—');
        for(const id of ['factorFeedBar','factorPressureBar','factorPressureChangeBar','factorWindBar','factorTempBar','factorRainBar','factorCloudBar','factorHumidityBar','factorGustBar','factorVisibilityBar'])setBar(id,0);
        set('factorLocation',snapshot.locationName||'არჩეული ადგილი');set('factorHour','—');set('factorMode','მონაცემი მიუწვდომელია');set('assessmentLiveState','○ მონაცემი მიუწვდომელია');set('factorUpdated','განახლება ვერ მოხერხდა');set('factorSource','ამინდის წყარო დროებით მიუწვდომელია');
        window.dispatchEvent?.(new CustomEvent('gn:assessmentUpdated',{detail:{data:null,live:snapshot.live!==false&&live,selectedCurrent:false,isMissing:true,locationName:snapshot.locationName||''}}));
      }
      return;
    }
    const t=numeric(row.temperature),p=numeric(row.pressure),wind=numeric(row.wind);
    const rainProb=numeric(row.rainProb),cloud=numeric(row.cloud);
    const hour=Number(String(row.time||'12:00').slice(0,2));
    const moon=moonPhase(forecastInstant(data,row.iso));
    const activityValue=activityScore(snapshot.subject,snapshot.type,hour);
    const activity=activityValue===null?null:clamp(activityValue,0,100);
    const delta=pressureDelta(data,row);
    const updateText=localDateTime(data.__meta?.updatedAt||snapshot.updatedAt,data.timezone||'Asia/Tbilisi');
    const stale=!!(data.__meta?.stale||snapshot.stale||snapshot.error);
    const isCurrent=!!(row.current||snapshot.selectedCurrent||row.source==='current');
    const missing=!!snapshot.missing||['temperature','wind','precip','code'].some(key=>numeric(row[key])===null);
    const automatic=snapshot.live===false?false:live;
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
    set('factorFeed',activity===null?'—':activityLabel(activity));
    set('factorFeedLabel',snapshot.type==='hunting'?'აქტიურობის პერიოდი':snapshot.type==='fishing'?'კვების პერიოდი':'აქტივობის პერიოდი');
    set('factorFeedDetail',activity===null?'აირჩიე სამიზნე სახეობა':`${Math.round(activity)}/100 • ${row.time||'ახლა'}`);
    if(delta===null){set('factorPressureChange','—');set('factorPressureChangeDetail','წინა საათი არ არის');}
    else {const abs=Math.abs(delta);const arrow=delta>0.15?'↑':delta<-0.15?'↓':'→';set('factorPressureChange',`${arrow} ${delta>0?'+':''}${delta.toFixed(1)} hPa`);set('factorPressureChangeDetail',delta>0.15?'იზრდება':delta<-0.15?'იკლებს':'სტაბილური');}
    set('factorUpdated',`${stale?'ბოლო მონაცემი':'მიღებულია'} ${updateText}`);
    lastSnapshot=snapshot;
    set('assessmentLiveState',missing?'○ არასრული მონაცემი':stale?'○ ძველი მონაცემი':!automatic?'○ PAUSED':isCurrent?'● LIVE':'○ პროგნოზი');
    set('factorMode',missing?'შეფასების მონაცემი არასაკმარისია':stale?'ბოლო ხელმისაწვდომი მონაცემი':automatic?(isCurrent?'LIVE • ავტომატური განახლება':'პროგნოზი • ავტომატური განახლება'):'ავტომატური განახლება გამორთულია');
    setBar('factorFeedBar',activity);
    setBar('factorPressureBar',p===null?0:(p-960)/80*100);
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
    set('factorSource',`${data.__meta?.source||'Open-Meteo'} • ${isCurrent?'მიმდინარე პირობები':'საათობრივი პროგნოზი'}${stale?' • მოძველებული':missing?' • არასრული მონაცემი':''}`);
    window.dispatchEvent?.(new CustomEvent('gn:assessmentUpdated',{detail:{data,live:automatic,selectedCurrent:isCurrent,isMissing:missing||stale,stale,locationName:snapshot.locationName||''}}));
    set('factorWeather',numeric(row.code)===null?'მონაცემი მიუწვდომელია':typeof window.codeMeta==='function'?(window.codeMeta(row.code)[1]||''):'' );
    const kp=cache.kpObservedAt&&Date.now()-cache.kpObservedAt<6*3600000?cache.kp:null;
    if(kpValueEl){kpValueEl.textContent=Number.isFinite(kp)?`Kp ${kp.toFixed(1)} • ${kpLabel(kp)}`:'Kp — • მონაცემი იტვირთება';}
    if(kpBar)setBar('factorKpBar',Number.isFinite(kp)?kp/9*100:0);
    Promise.resolve(fetchKp()).then(v=>{if(document.getElementById('factorKp')){set('factorKp',Number.isFinite(v)?`Kp ${v.toFixed(1)} • ${kpLabel(v)}`:'Kp — • მონაცემი მიუწვდომელია');setBar('factorKpBar',Number.isFinite(v)?v/9*100:0);}});
  }
  let live=true,timer=null,refreshHandler=null,refreshPromise=null,lastSnapshot=null,visibilityHandler=null;
  function bind(opts){
    const refreshBtn=document.getElementById('assessmentRefresh'),toggle=document.getElementById('assessmentLiveToggle'),state=document.getElementById('assessmentLiveState');
    if(!document.getElementById('assessmentFactors'))return;
    live=opts?.liveDefault!==false;refreshHandler=opts?.refresh||null;
    const sync=()=>{
      if(state)state.textContent=live?'● AUTO':'○ PAUSED';
      if(toggle){toggle.textContent=live?'ავტომატური განახლება: ჩართულია':'ავტომატური განახლება: გამორთულია';toggle.setAttribute('aria-pressed',String(live));}
      if(lastSnapshot)render({...lastSnapshot,live});
    };
    const refresh=()=>{
      if(refreshPromise||!refreshHandler)return refreshPromise;
      if(refreshBtn)refreshBtn.disabled=true;
      refreshPromise=Promise.resolve().then(()=>refreshHandler({force:true})).catch(e=>{
        if(lastSnapshot)render({...lastSnapshot,error:true,live});
        else{set('factorMode','მონაცემი ვერ განახლდა');set('factorUpdated','შეამოწმე ინტერნეტი და სცადე განახლება.');}
        console.warn('Weather refresh failed',e);
      }).finally(()=>{refreshPromise=null;if(refreshBtn)refreshBtn.disabled=false;});
      return refreshPromise;
    };
    const start=()=>{
      if(timer)clearInterval(timer);timer=null;
      if(live)timer=setInterval(()=>{if(!document.hidden)refresh();},300000);
    };
    if(toggle)toggle.onclick=()=>{live=!live;sync();start();if(live)refresh();};
    if(refreshBtn)refreshBtn.onclick=refresh;
    if(visibilityHandler)document.removeEventListener?.('visibilitychange',visibilityHandler);
    visibilityHandler=()=>{if(!document.hidden&&live)refresh();};
    document.addEventListener('visibilitychange',visibilityHandler);
    sync();start();
    return {get live(){return live},refresh,setLive(value){live=!!value;sync();start();}};
  }
  window.GNLiveFactors={render,bind,rowAt,moonPhase,fetchKp};
})();
