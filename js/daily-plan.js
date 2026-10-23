(function(global){
  'use strict';
  const number=value=>value===null||value===undefined||typeof value==='boolean'||(typeof value==='string'&&!value.trim())?null:Number.isFinite(Number(value))?Number(value):null;
  let ticket=0,lastKey='',pending=null,homeContext=null;
  let snapshot={status:'loading',placeId:null,placeName:null,lat:null,lon:null,fishId:null,fishName:null,weather:null,index:null,bestHour:null,bestHourAt:null,sourceTime:null,at:new Date().toISOString(),timezone:'Asia/Tbilisi',legalSummary:'სახეობა, ჭერის მეთოდი და ტერიტორიის მოქმედი რეჟიმი გასვლამდე გადაამოწმე.'};
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function distance(a,b,c,d){const rad=Math.PI/180,q=Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(q)));}
  function validCoordinates(lat,lon){return number(lat)!==null&&number(lon)!==null&&Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180;}
  function legalFor(fish,water,date){return global.GeoWildlifeRules?.evaluate?.(fish,{kind:'fish',date,waterId:water[0],location:water[1],method:'rod'})||null;}
  function selectNearby(lat,lon,date){
    if(!validCoordinates(lat,lon)||!global.GeoWildlifeRules?.validDate?.(date))return null;
    const fishes=new Map((global.FISHES||[]).map(fish=>[fish[0],fish]));
    return (global.WATERS||[]).filter(water=>validCoordinates(water?.[4],water?.[5])).map(water=>{
      const candidates=[...new Set(String(water[6]||'').split(',').map(id=>id.trim()))].map(id=>fishes.get(id)).filter(Boolean).map(fish=>({fish,rule:legalFor(fish,water,date)})).filter(item=>item.rule?.status==='conditional');
      return {water,candidates,distanceKm:distance(Number(lat),Number(lon),Number(water[4]),Number(water[5]))};
    }).filter(item=>item.candidates.length).sort((a,b)=>a.distanceKm-b.distanceKm||String(a.water[0]).localeCompare(String(b.water[0])))[0]||null;
  }
  function observedTime(data){
    const value=global.GeoNatureCommon?.weatherObservationTime?.(data);
    return number(value)===null?null:Number(value);
  }
  function isStale(data){const stamp=observedTime(data);return !!data?.__meta?.stale||stamp===null||Date.now()-stamp>90*60000||stamp-Date.now()>15*60000;}
  function coreWeather(row){return row&&['temperature','wind','precip','code'].every(key=>number(row[key])!==null)&&row.wind>=0&&row.precip>=0;}
  function baseFor(candidate,context,date){
    const first=candidate?.candidates[0],water=candidate?.water,rule=first?.rule;
    return {status:'loading',placeId:water?.[0]||null,placeName:water?.[1]||null,lat:number(water?.[4]),lon:number(water?.[5]),fishId:first?.fish?.[0]||null,fishName:first?.fish?.[1]||null,locationName:context?.city||'არჩეული მდებარეობა',distanceKm:candidate?Math.round(candidate.distanceKm*10)/10:null,date,timezone:'Asia/Tbilisi',weather:null,index:null,bestHour:null,bestHourAt:null,sourceTime:null,observedAt:null,at:new Date().toISOString(),autoRefresh:context?.live!==false,legalSummary:rule?rule.title+' — '+rule.message:'სახეობა, ჭერის მეთოდი და ტერიტორიის მოქმედი რეჟიმი გასვლამდე გადაამოწმე.',legalTitle:rule?.title||'მოქმედი წესები გადაამოწმე',legalStatus:rule?.status||'unverified',legalSourceURL:rule?.sources?.[0]?.url||'https://matsne.gov.ge/ka',legalChecked:rule?.checked||null,legalDetails:rule?.details||[],message:''};
  }
  function derive(data,candidate,context){
    const now=global.GeoNatureCommon?.zonedDateTime?.(data),value=baseFor(candidate,context,now?.date||global.GeoWildlifeRules?.today?.());
    const stamp=observedTime(data),current=global.GeoNatureCommon?.currentWeatherRow?.(data);
    value.timezone=now?.timezone||data?.timezone||'Asia/Tbilisi';value.sourceTime=stamp===null?null:new Date(stamp).toISOString();value.observedAt=stamp;
    if(!now||!coreWeather(current)){value.status='unavailable';value.message='ამინდის ძირითადი მონაცემები არასაკმარისია; საათი და ინდექსი არ ფასდება.';return value;}
    value.weather={temperature:number(current.temperature),wind:number(current.wind),precip:number(current.precip),pressure:number(current.pressure),humidity:number(current.humidity),gust:number(current.gust),rainProb:number(current.rainProb),code:number(current.code)};
    if(isStale(data)){value.status='stale';value.message='ბოლო მონაცემი მოძველებულია; ახალი რეკომენდაცია განახლებამდე არ გამოითვლება.';return value;}
    value.status='live';
    const nowMinute=now.iso.slice(0,16),rows=global.GeoNatureCommon?.hourlyRows?.(data,now.date)||[],scores=[];
    for(const row of rows){
      // Only whole hours which have not begun are recommendations. This also
      // keeps Free's daily plan within today, regardless of paid forecast days.
      if(row.iso<nowMinute)continue;
      const condition=global.GeoNatureCommon?.conditionsFromRow?.(row);
      if(!condition)continue;
      for(const item of candidate.candidates){
        const rule=legalFor(item.fish,candidate.water,now.date);
        if(rule?.status!=='conditional')continue;
        const score=number(global.GeoFishChance?.(item.fish,condition,candidate.water,true));
        if(score===null)continue;
        scores.push({row,score:Math.max(0,Math.min(100,Math.round(score))),fish:item.fish,rule});
      }
    }
    scores.sort((a,b)=>b.score-a.score||a.row.iso.localeCompare(b.row.iso)||String(a.fish[0]).localeCompare(String(b.fish[0])));
    const best=scores[0];
    if(!best){value.message='დღევანდელი დარჩენილი საათებისთვის სრული პროგნოზი არ არის. გადაამოწმე ამინდი ან მოგვიანებით განაახლე.';return value;}
    Object.assign(value,{fishId:best.fish[0],fishName:best.fish[1],index:best.score,bestHour:best.row.time,bestHourAt:best.row.iso,legalTitle:best.rule.title,legalStatus:best.rule.status,legalSummary:best.rule.title+' — '+best.rule.message,legalDetails:best.rule.details||[],legalChecked:best.rule.checked||null,legalSourceURL:best.rule.sources?.[0]?.url||value.legalSourceURL});
    return value;
  }
  function mount(){
    if(!global.document?.createElement)return null;
    let host=document.getElementById('fhDayPlan');if(host)return host;
    const box=document.querySelector('#homeLive .home-live-hero');if(!box)return null;
    host=document.createElement('details');host.id='fhDayPlan';host.className='fh-day-plan';host.setAttribute('data-fh-day-plan','');
    host.innerHTML='<summary><span class="fh-day-plan-heading">დღის მოკლე გეგმა</span><span id="fhDayPlanSummary">მიმართულება იტვირთება…</span><span class="fh-day-plan-chevron" aria-hidden="true">⌄</span></summary><div class="fh-day-plan-content"><div class="fh-day-plan-meta" id="fhDayPlanMeta"></div><dl class="fh-day-plan-facts"><div><dt>დღევანდელი საათი</dt><dd id="fhDayPlanHour">—</dd></div><div><dt>პირობების ინდექსი</dt><dd id="fhDayPlanIndex">—</dd></div><div><dt>სახეობა</dt><dd id="fhDayPlanFish">—</dd></div><div><dt>ამინდი ახლა</dt><dd id="fhDayPlanWeather">—</dd></div></dl><div class="fh-day-plan-message" id="fhDayPlanMessage" role="status"></div><div class="fh-day-plan-legal"><strong>გასვლამდე გადაამოწმე</strong><div id="fhDayPlanLegalTitle"></div><details class="fh-day-plan-legal-details"><summary>წესის განმარტება და წყარო</summary><div id="fhDayPlanLegal"></div><a id="fhDayPlanLegalSource" href="https://matsne.gov.ge/ka" target="_blank" rel="noopener noreferrer">ოფიციალური წყარო ↗</a></details></div><small class="fh-day-plan-note">ინდექსი აღწერს პირობებს; დაჭერის ალბათობა გაზომილი არ არის და ჭერის ნებართვას არ ადგენს.</small><div class="fh-day-plan-links"><a id="fhDayPlanWeatherLink" href="weather.html">ამინდი</a><a id="fhDayPlanMapLink" href="map.html">რუკა</a><a id="fhDayPlanFishingLink" href="fishing.html">დაგეგმვა</a><button type="button" id="fhDayPlanRetry">↻ განახლება</button></div></div>';
    const before=box.querySelector('.home-hour-head');if(before)box.insertBefore(host,before);else box.appendChild(host);
    host.querySelector('#fhDayPlanRetry').addEventListener('click',()=>refresh());
    return host;
  }
  function text(id,value){const element=global.document?.getElementById?.(id);if(element)element.textContent=value;}
  function render(value){
    const host=mount();if(!host)return;
    host.dataset.status=value.status;
    const status=value.status==='loading'?'იტვირთება…':value.status==='stale'?'მოძველებული მონაცემი':value.status==='unavailable'?'ამინდი მიუწვდომელია':value.autoRefresh?'ახლანდელი მონაცემი':'განახლება შეჩერებულია';
    text('fhDayPlanSummary',value.placeName?value.placeName+(value.bestHour?' • '+value.bestHour:' • '+status):status);
    let source='Open-Meteo';
    if(value.sourceTime){const local=global.GeoNatureCommon?.zonedDateTime?.(value.timezone,new Date(value.sourceTime));source+=' • '+(local?local.date+' '+local.time:value.sourceTime);}
    text('fhDayPlanMeta',[value.locationName,value.distanceKm===null?'':value.distanceKm+' კმ პირდაპირი მანძილით',status,source].filter(Boolean).join(' • '));
    text('fhDayPlanHour',value.bestHour||'მონაცემი არ არის');text('fhDayPlanIndex',value.index===null?'—':value.index+'/100');text('fhDayPlanFish',value.fishName||'სახეობა დასაზუსტებელია');
    const weather=value.weather,units=(number,suffix)=>number===null?'—':number+suffix;
    text('fhDayPlanWeather',weather?units(weather.temperature,'°C')+' • ქარი '+units(weather.wind,' კმ/სთ')+' • ნალექი '+units(weather.precip,' მმ'):'მონაცემი არ არის');
    text('fhDayPlanMessage',value.message||'უახლოესი კატალოგირებული მიმართულება; კონკრეტულ მონაკვეთზე დაშვება და უსაფრთხოება ადგილზე გადაამოწმე.');
    text('fhDayPlanLegalTitle',value.legalTitle||'მოქმედი წესები გადაამოწმე');text('fhDayPlanLegal',value.legalSummary);
    const sourceLink=document.getElementById('fhDayPlanLegalSource');if(sourceLink)sourceLink.href=value.legalSourceURL;
    const coordinateQuery=value.lat!==null&&value.lon!==null?'?lat='+encodeURIComponent(value.lat)+'&lon='+encodeURIComponent(value.lon)+'&name='+encodeURIComponent(value.placeName||'არჩეული ადგილი'):'';
    document.getElementById('fhDayPlanWeatherLink').href='weather.html'+coordinateQuery;document.getElementById('fhDayPlanMapLink').href='map.html'+coordinateQuery;
    document.getElementById('fhDayPlanFishingLink').href=value.placeId&&value.fishId?'fishing.html?fish='+encodeURIComponent(value.fishId)+'&place='+encodeURIComponent(value.placeId)+'#planner':'fishing-places.html';
    document.getElementById('fhDayPlanRetry').disabled=value.status==='loading';
  }
  function publish(value){snapshot=value;render(value);if(typeof global.CustomEvent==='function')global.document?.dispatchEvent?.(new CustomEvent('fishhunt:day-plan',{detail:clone(value),bubbles:true}));return current();}
  function current(){const value=clone(snapshot);if(value.status==='live'&&number(value.observedAt)!==null&&Date.now()-value.observedAt>90*60000){value.status='stale';value.index=null;value.bestHour=null;value.bestHourAt=null;value.message='შენახული ამინდი მოძველებულია; ახალი შეფასებისთვის განაახლე.';}return value;}
  function updateFromHome(context,options={}){
    homeContext=context;
    const now=global.GeoNatureCommon?.zonedDateTime?.(context?.data||'Asia/Tbilisi'),date=now?.date||global.GeoWildlifeRules?.today?.(),candidate=selectNearby(context?.lat,context?.lon,date),base=baseFor(candidate,context,date);
    if(context?.loading){ticket++;lastKey='';return Promise.resolve(publish(base));}
    if(context?.error||!context?.data||!candidate){ticket++;lastKey='';base.status='unavailable';base.message=!candidate?'ახლომდებარე მიმართულებისა და სახეობის მონაცემები ვერ მოიძებნა.':'კავშირი ან ამინდის მონაცემი მიუწვდომელია; საათი და ინდექსი არ გამოითვლება.';return Promise.resolve(publish(base));}
    const key=[context.lat,context.lon,context.data.__meta?.updatedAt||context.data.current?.time||'',now?.iso?.slice(0,13),context.live].join('|');
    if(!options.force&&key===lastKey&&pending)return pending;
    lastKey=key;const request=++ticket;publish(base);
    pending=(async()=>{
      try{
        const fetchWeather=global.GeoNatureCommon?.openMeteo||global.openMeteo;
        if(typeof fetchWeather!=='function')throw new Error('Weather unavailable');
        const data=await fetchWeather(Number(candidate.water[4]),Number(candidate.water[5]),{force:options.force===true});
        if(request!==ticket)return current();
        return publish(derive(data,candidate,context));
      }catch{
        if(request!==ticket)return current();
        base.status='unavailable';base.message='მიმართულების ამინდი ვერ ჩაიტვირთა. განაახლე ან გახსენი ადგილებისა და შეზღუდვების გზამკვლევი.';return publish(base);
      }
    })();
    return pending;
  }
  function refresh(){
    if(!homeContext)return Promise.resolve(current());
    if((!homeContext.data||homeContext.error)&&typeof global.GeoNatureHome?.load==='function')return global.GeoNatureHome.load({force:true});
    return updateFromHome({...homeContext,loading:false,error:false},{force:true});
  }
  global.FishHuntDayPlan=Object.freeze({current,updateFromHome,refresh,mount});
})(window);
