/* FishHunt Live Assessment Factors
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
  const unavailable='მონაცემი არ არის';
  const fields=[
    ['Feed','აქტივობის პერიოდი'],['Pressure','წნევა ზღვის დონეზე'],['PressureChange','წნევის ცვლილება'],
    ['Wind','ქარის სიჩქარე'],['WindDirection','ქარის მიმართულება'],['Gust','ქარის მაქს. დარტყმა'],
    ['Temp','ჰაერის ტემპერატურა'],['Apparent','შეგრძნებადი ტემპერატურა'],
    ['Rain','ნალექის რაოდენობა'],['RainProb','ნალექის ალბათობა'],['Cloud','ღრუბლიანობა'],['Humidity','ფარდობითი ტენიანობა'],
    ['Visibility','ხილვადობა'],['Daylight','დღე / ღამე'],['Sunrise','მზის ამოსვლა'],['Sunset','მზის ჩასვლა'],
    ['Moon','მთვარის განათება'],['WaterTemp','წყლის ტემპერატურა'],['WaterLevel','წყლის დონე'],['Kp','გეომაგნიტური ფონი']
  ];
  function mount(){
    const host=document.getElementById('assessmentFactors'),grid=host?.querySelector?.('.factor-grid');
    if(!grid||grid.dataset.gnFactorsMounted)return;
    grid.dataset.gnFactorsMounted='true';
    grid.innerHTML=fields.map(([key,label])=>`<div class="factor-item" data-factor="${key}"><div class="factor-top"><span class="factor-label"${key==='Feed'?' id="factorFeedLabel"':''}>${label}</span><b class="factor-value" id="factor${key}">${unavailable}</b></div><div class="factor-bar" aria-hidden="true"><span id="factor${key}Bar"></span></div><div class="factor-detail" id="factor${key==='Moon'?'MoonLabel':key+'Detail'}">მონაცემები იტვირთება…</div></div>`).join('');
  }
  function display(key,value,detail,scale=0){
    set('factor'+key,value);set('factor'+(key==='Moon'?'MoonLabel':key+'Detail'),detail);setBar('factor'+key+'Bar',scale);
    const el=document.getElementById('factor'+key);if(el)el.dataset.missing=String(value===unavailable);
  }
  function localDateTime(value,timeZone='Asia/Tbilisi'){
    const date=new Date(value);
    if(value===null||value===undefined||!Number.isFinite(date.getTime()))return 'დრო უცნობია';
    try{return date.toLocaleString('ka-GE',{timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch(_){return date.toISOString().slice(11,19);}
  }
  function forecastInstant(data,iso){
    if(!iso)return NaN;
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
    const waxing=phase<.5;
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
    return {iso,date:iso.slice(0,10),time:iso.slice(11,16),temperature:numeric(h.temperature_2m?.[i]),apparent:numeric(h.apparent_temperature?.[i]),pressure:numeric(h.pressure_msl?.[i]),wind:numeric(h.wind_speed_10m?.[i]),gust:numeric(h.wind_gusts_10m?.[i]),precip:numeric(h.precipitation?.[i]),rainProb:numeric(h.precipitation_probability?.[i]),humidity:numeric(h.relative_humidity_2m?.[i]),cloud:numeric(h.cloud_cover?.[i]),visibility:numeric(h.visibility?.[i]),code:numeric(h.weather_code?.[i]),is_day:numeric(h.is_day?.[i])};
  }
  function pressureTrend(data,row){
    if(!data?.hourly?.time||!row?.iso)return null;
    // Compare the same hourly forecast series, including when the current
    // payload is timestamped at :15/:30/:45. A current and forecast pressure
    // must not be presented as an exactly one-hour observation trend.
    const times=data.hourly.time,iso=row.iso.slice(0,13)+':00',idx=times.indexOf(iso);
    if(idx<=0)return null;
    if(forecastInstant(data,times[idx])-forecastInstant(data,times[idx-1])!==3600000)return null;
    const current=numeric(data.hourly.pressure_msl?.[idx]),prev=numeric(data.hourly.pressure_msl?.[idx-1]);
    if(current===null||prev===null)return null;
    return {delta:current-prev,from:times[idx-1],to:times[idx]};
  }
  function activityScore(subject,type,hour){
    if(!subject)return null;
    if(type==='fishing'&&typeof window.activityWindowScore==='function')return numeric(window.activityWindowScore(subject,hour));
    if(type==='hunting'&&typeof window.huntActivityScore==='function')return numeric(window.huntActivityScore(subject,hour));
    return null;
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
  function sourceNumber(data,row,field){
    if(row?.current||row?.source==='current'){
      if(Object.hasOwn(data.current||{},field))return numeric(data.current[field]);
      if(!['precipitation_probability','visibility'].includes(field))return null;
    }
    const iso=row?.iso?.slice(0,13)+':00',i=data?.hourly?.time?.indexOf(iso)??-1;
    return i<0?null:numeric(data.hourly[field]?.[i]);
  }
  function conditions(row){
    const result=window.GeoNatureCommon?.conditionsFromRow?.(row)||{temperature_2m:row.temperature,apparent_temperature:row.apparent_temperature??row.apparent,pressure_msl:row.pressure,wind_speed_10m:row.wind,wind_gusts_10m:row.gust,precipitation:row.precip,precipitation_probability:row.rainProb,weather_code:row.code,relative_humidity_2m:row.humidity,cloud_cover:row.cloud,visibility:row.visibility,is_day:row.is_day,local_hour:numeric(row.local_hour??row.time?.slice(0,2))};
    result.water_temperature=numeric(row.water_temperature);return result;
  }
  function modelExplanation(snapshot,row){
    const el=document.getElementById('factorModelExplanation');if(!el)return;
    if(snapshot.type!=='fishing'){
      el.textContent=snapshot.type==='hunting'?'აქტივობის პერიოდი აჩვენებს სახეობის საათობრივ რეჟიმს. ამინდის ყველა ველი ქვემოთ ცალკე ჩანს; მთვარე და Kp საერთო აქტივობის ქულაში არ გამოიყენება.':'გარე პირობების ინდექსი /100 აერთიანებს ტემპერატურას, ქარს, ნალექს, ამინდის ტიპსა და ხელმისაწვდომ დამატებით მონაცემებს. ეს საორიენტაციო შეფასებაა. მთვარე და Kp ამ ქულაში არ გამოიყენება.';
      return;
    }
    const explain=window.GeoFishConditions?.explain;
    const detail=typeof explain==='function'?explain(snapshot.subject,conditions(row),snapshot.water||null,true):null;
    if(!detail){el.textContent='შეფასებისთვის აირჩიე თევზი და ადგილი. ინდექსი /100 საორიენტაციოა; დაჭერის ალბათობა გაზომილი არ არის.';return;}
    const score=numeric(detail.score),raw=numeric(detail.rawScore);
    const components=(detail.components||[]).map(part=>{
      const fit=numeric(part.fit),weight=numeric(part.normalizedWeight),contribution=numeric(part.contribution);
      const metrics=part.available&&fit!==null&&numeric(part.weight)===0?'ადგილის შესაბამისობა ადგენს შეზღუდვას; დამატებით ქულებს არ იძლევა':part.available&&fit!==null&&weight!==null&&contribution!==null?`${fit.toFixed(1)}/100 • წონა ${(weight*100).toFixed(1)}% • ${contribution.toFixed(1)} ქულა`:part.reason||detail.unknownReason||'შეფასებისთვის აუცილებელი მონაცემი აკლია';
      return `<li><b>${esc(part.label||part.key)}</b><span>${esc(metrics)}</span></li>`;
    }).join('');
    const caps=(detail.caps||[]).filter(cap=>cap.active).map(cap=>`${cap.label}: მაქსიმუმ ${cap.value}/100`).join(' • ');
    const calibration=detail.calibration,coverage=numeric(calibration?.coverage),weighted=numeric(calibration?.weightedScore),adjusted=numeric(calibration?.adjustedScore);
    const missing=(calibration?.missing||[]).map(key=>(detail.components||[]).find(part=>part.key===key)?.label||key).join(', ');
    const completeness=score!==null&&coverage!==null&&weighted!==null&&adjusted!==null?`<p class="factor-model-coverage"><b>ფაქტორების დაფარვა: ${(coverage*100).toFixed(1)}%</b> • ${weighted.toFixed(1)} × ${coverage.toFixed(3)} ≈ ${adjusted}/100${missing?`<br>აკლია: ${esc(missing)}`:''}<br>არასრული მონაცემები ინდექსს ამცირებს; დაფარვა დაჭერის ალბათობა არ არის.</p>`:'';
    el.innerHTML=`<h3>თევზაობის ინდექსის შემადგენლობა</h3><p>${score===null?esc(detail.unknownReason||'შეფასების მონაცემი არასაკმარისია'):`<b>${score}/100</b> • ${esc(snapshot.subject?.[1]||'არჩეული თევზი')}${raw!==null&&score<raw?` • ხელმისაწვდომი ფაქტორების საშუალო ${raw}/100`:''}`}</p><ul class="factor-model-list">${components}</ul>${completeness}${caps?`<p>${esc(caps)}</p>`:''}<p>ინდექსში მხოლოდ ამ ჩამონათვალს აქვს წონა; დანარჩენი ველები საინფორმაციოა. არმიღებული გაზომვის შესაბამისობა უცნობად რჩება და მონაცემების დაფარვა მცირდება. ჰაერის ტემპერატურა წყლის გაზომვას ვერ ცვლის. მთვარე, Kp, ხილვადობა და წყლის დონე ამ მოდელის ქულაში არ გამოიყენება. /100 საორიენტაციო ინდექსია, დაჭერის პროცენტი გაზომილი არ არის.</p>`;
  }
  let renderRevision=0;
  function render(snapshot){
    mount();
    const revision=++renderRevision,data=snapshot?.data||{},row=snapshot?.row||null;
    if(!row){
      if(snapshot){
        lastSnapshot=snapshot;
        for(const [key] of fields)display(key,unavailable,key==='WaterTemp'||key==='WaterLevel'?'ადგილზე გაზომვა საჭიროა':'არჩეული ადგილის მონაცემი ვერ ჩაიტვირთა');
        set('factorWeather',unavailable);set('factorLocation',snapshot.locationName||'არჩეული ადგილი');set('factorHour','მონაცემის დრო უცნობია');set('factorMode','მონაცემი მიუწვდომელია');set('assessmentLiveState','○ მონაცემი მიუწვდომელია');set('factorUpdated','განახლება ვერ მოხერხდა');set('factorSource','ამინდის წყარო დროებით მიუწვდომელია');
        set('factorModelExplanation','შეფასების მონაცემი არასაკმარისია. შეამოწმე ინტერნეტი და ხელით განაახლე.');
        window.dispatchEvent?.(new CustomEvent('gn:assessmentUpdated',{detail:{data:null,live:snapshot.live!==false&&live,selectedCurrent:false,isMissing:true,locationName:snapshot.locationName||''}}));
      }
      return;
    }
    const t=numeric(row.temperature),p=numeric(row.pressure),wind=numeric(row.wind),rain=numeric(row.precip);
    const rainProb=numeric(row.rainProb),cloud=numeric(row.cloud),humidity=numeric(row.humidity),gust=numeric(row.gust),visibility=numeric(row.visibility);
    const hour=numeric(row.local_hour??row.time?.slice(0,2)),instant=forecastInstant(data,row.iso);
    const moon=Number.isFinite(instant)?moonPhase(instant):null;
    const isCurrent=!!(row.current||snapshot.selectedCurrent||row.source==='current');
    const weatherOnly=snapshot.type!=='fishing'&&snapshot.type!=='hunting';
    const activityValue=weatherOnly?numeric(window.GeoNatureCommon?.outdoorScore?.(conditions(row))):activityScore(snapshot.subject,snapshot.type,hour);
    const activity=activityValue===null?null:clamp(activityValue,0,100);
    const trend=pressureTrend(data,row);
    const updateText=localDateTime(data.__meta?.updatedAt||snapshot.updatedAt,data.timezone||'Asia/Tbilisi');
    const stale=!!(data.__meta?.stale||snapshot.stale||snapshot.error);
    const missing=!!snapshot.missing||['temperature','wind','precip','code'].some(key=>numeric(row[key])===null);
    const automatic=snapshot.live===false?false:live;
    const source=isCurrent?'მიმდინარე მოდელის მონაცემი':'საათობრივი პროგნოზი';
    const noSource='ამინდის წყარო ამ ველს არ აბრუნებს';
    const showNumber=(key,value,unit,digits,detail,scale)=>display(key,value===null?unavailable:`${value.toFixed(digits)}${unit}`,value===null?noSource:detail,scale);
    set('factorLocation',snapshot.locationName||'არჩეული ადგილი');
    set('factorHour',`${row.date||row.iso?.slice(0,10)||''} • ${row.time||'დრო უცნობია'} • ${data.timezone||'Asia/Tbilisi'}`);
    showNumber('Temp',t,'°C',1,`${source} • ჰაერი, 2 მ`,t===null?0:(t+15)/60*100);
    showNumber('Pressure',p,' hPa',1,`${source} • ზღვის დონეზე დაყვანილი • შკალა 960–1040 hPa`,p===null?0:(p-960)/80*100);
    showNumber('Wind',wind,' კმ/სთ',1,`${source} • 10 მ • შკალა 0–35 კმ/სთ`,wind===null?0:wind/35*100);
    showNumber('Gust',gust,' კმ/სთ',1,`${source} • 10 მ • შკალა 0–60 კმ/სთ`,gust===null?0:gust/60*100);
    const interval=numeric(data.current?.interval),rainPeriod=isCurrent?(interval===null?'მიმდინარე ინტერვალის ჯამი':`წინა ${Math.round(interval/60)} წუთის ჯამი`):'წინა 1 საათის ჯამი';
    showNumber('Rain',rain,' მმ',1,`${source} • ${rainPeriod} • წვიმა, თოვა და სხვა ნალექი`,rain===null?0:rain/10*100);
    showNumber('RainProb',rainProb,'%',0,'საათობრივი პროგნოზი • არჩეულ საათში ნალექის ალბათობა',rainProb);
    showNumber('Cloud',cloud,'%',0,source,cloud);
    showNumber('Humidity',humidity,'%',0,`${source} • 2 მ`,humidity);
    showNumber('Visibility',visibility===null?null:visibility/1000,' კმ',1,'საათობრივი პროგნოზი • მიწის ზედაპირთან',visibility===null?0:visibility/10000*100);
    const apparent=sourceNumber(data,row,'apparent_temperature');
    showNumber('Apparent',apparent,'°C',1,`${source} • ტემპერატურის, ქარისა და ტენიანობის ეფექტი`,apparent===null?0:(apparent+15)/60*100);
    const direction=sourceNumber(data,row,'wind_direction_10m');
    display('WindDirection',direction===null?unavailable:`${Math.round(direction)}°`,direction===null?noSource:`${source} • საიდან უბერავს • 0° ჩრდილოეთი, 90° აღმოსავლეთი`,direction===null?0:direction/360*100);
    const day=sourceNumber(data,row,'is_day');
    display('Daylight',day===1?'დღე':day===0?'ღამე':unavailable,day===null?noSource:`${source} • მზის მდებარეობით`,day===1?100:0);
    const dailyIndex=data.daily?.time?.indexOf(row.date||row.iso?.slice(0,10))??-1;
    for(const [key,field] of [['Sunrise','sunrise'],['Sunset','sunset']]){
      const iso=dailyIndex<0?null:data.daily[field]?.[dailyIndex];
      display(key,typeof iso==='string'&&/T\d{2}:\d{2}/.test(iso)?iso.slice(11,16):unavailable,iso?`${iso.slice(0,10)} • ${data.timezone||'Asia/Tbilisi'} • ასტრონომიული გამოთვლა`:'ამ დღის ასტრონომიული მონაცემი არ არის');
    }
    display('Moon',moon?`${moon.illum}%`:unavailable,moon?`${moon.icon} ${moon.label} • არჩეული დროის მიახლოებითი ასტრონომიული გამოთვლა`:'არჩეული დრო არ არის',moon?.illum||0);
    set('factorFeedLabel',weatherOnly?'გარე პირობების ინდექსი':snapshot.type==='hunting'?'სახეობის აქტივობის პერიოდი':'სახეობის კვების პერიოდი');
    display('Feed',activity===null?unavailable:weatherOnly?`${Math.round(activity)}/100`:activityLabel(activity),activity===null?(weatherOnly?'შეფასების ამინდის მონაცემი არასაკმარისია':snapshot.subject?'სახეობის საათობრივი რეჟიმი არ არის':'აირჩიე სამიზნე სახეობა'):weatherOnly?'საორიენტაციო პირობების შეფასება • არა დაჭერის ალბათობა':`${Math.round(activity)}/100 • ${snapshot.subject?.[1]||snapshot.subject?.[0]||'სახეობა'} • ${row.time||'არჩეული საათი'} • მხოლოდ საათობრივი რეჟიმი`,activity);
    const delta=trend?.delta??null,arrow=delta>0.15?'↑':delta<-0.15?'↓':'→';
    display('PressureChange',delta===null?unavailable:`${arrow} ${delta>0?'+':''}${delta.toFixed(1)} hPa`,trend?`1 საათის პროგნოზული ცვლილება • ${trend.from.slice(11,16)} → ${trend.to.slice(11,16)} • ${delta>0.15?'იზრდება':delta<-0.15?'იკლებს':'სტაბილური'}`:'ერთმანეთის მომდევნო ორი საათის წნევა არ არის',delta===null?0:50+delta*8);
    const waterTemp=numeric(row.water_temperature),waterLevel=numeric(row.water_level);
    showNumber('WaterTemp',waterTemp,'°C',1,'ადგილზე გაზომილი წყლის ტემპერატურა',waterTemp===null?0:waterTemp/40*100);
    showNumber('WaterLevel',waterLevel,' მ',2,'ადგილზე გაზომილი წყლის დონე');
    if(waterTemp===null)set('factorWaterTempDetail','ამინდის API წყლის ტემპერატურას არ ზომავს • ადგილზე გაზომვა საჭიროა');
    if(waterLevel===null)set('factorWaterLevelDetail','ამინდის API წყლის დონეს არ ზომავს • ადგილზე გაზომვა საჭიროა');
    set('factorUpdated',`${stale?'ბოლო მონაცემი':'მიღებულია'} ${updateText}`);
    lastSnapshot=snapshot;
    set('assessmentLiveState',missing?'○ არასრული მონაცემი':stale?'○ ძველი მონაცემი':!automatic?'○ PAUSED':isCurrent?'● LIVE':'○ პროგნოზი');
    set('factorMode',missing?'შეფასების მონაცემი არასაკმარისია':stale?'ბოლო ხელმისაწვდომი მონაცემი':automatic?(isCurrent?'LIVE • ავტომატური განახლება':'პროგნოზი • ავტომატური განახლება'):'ავტომატური განახლება გამორთულია');
    set('factorSource',`${data.__meta?.source||'Open-Meteo'} • ${source}${stale?' • მოძველებული':missing?' • არასრული მონაცემი':''} • NOAA SWPC (Kp)`);
    set('factorWeather',numeric(row.code)===null?unavailable:typeof window.codeMeta==='function'?(window.codeMeta(row.code)[1]||'ამინდის კოდი '+row.code):'ამინდის კოდი '+row.code);
    modelExplanation(snapshot,row);
    window.dispatchEvent?.(new CustomEvent('gn:assessmentUpdated',{detail:{data,live:automatic,selectedCurrent:isCurrent,isMissing:missing||stale,stale,locationName:snapshot.locationName||''}}));
    const showKp=value=>display('Kp',Number.isFinite(value)?`Kp ${value.toFixed(1)} • ${kpLabel(value)}`:unavailable,Number.isFinite(value)?`NOAA SWPC • ბოლო 3-საათიანი გლობალური ინდექსი • ${new Date(cache.kpObservedAt).toISOString().slice(0,16).replace('T',' ')} UTC • არჩეული მომავალი საათის პროგნოზი არ არის`:'NOAA SWPC-ის ბოლო 6 საათის მონაცემი მიუწვდომელია',Number.isFinite(value)?value/9*100:0);
    const kp=cache.kpObservedAt&&Date.now()-cache.kpObservedAt<6*3600000?cache.kp:null;
    showKp(kp);
    Promise.resolve(fetchKp()).then(value=>{if(revision===renderRevision)showKp(value);});
  }
  let live=true,timer=null,refreshHandler=null,refreshPromise=null,lastSnapshot=null,visibilityHandler=null;
  function bind(opts){
    const refreshBtn=document.getElementById('assessmentRefresh'),toggle=document.getElementById('assessmentLiveToggle'),state=document.getElementById('assessmentLiveState');
    if(!document.getElementById('assessmentFactors'))return;
    mount();
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
  window.GNLiveFactors={render,bind,rowAt,moonPhase,fetchKp,pressureTrend,forecastInstant,fields};
})();
