(function(global){
  'use strict';
  const STORAGE_KEY='geonature_foreground_alerts_v1';
  const CHECK_INTERVAL=15*60*1000,ALERT_INTERVAL=4*60*60*1000;
  const defaults=()=>({enabled:false,fish:[],places:[],hour:'any',threshold:72,system:false,lastSent:{},feed:[],lastCheck:null});
  function number(value){if(value===null||value===undefined||typeof value==='boolean'||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
  function canonicalPreferences(value,fishList,waterList){
    if(!value||!Array.isArray(value.fish)||!Array.isArray(value.places)||value.fish.length<1||value.fish.length>5||value.places.length<1||value.places.length>5)return null;
    const fishIds=value.fish.map(item=>item?.id),placeIds=value.places.map(item=>item?.id);
    if(new Set(fishIds).size!==fishIds.length||new Set(placeIds).size!==placeIds.length)return null;
    const fish=fishIds.map(id=>fishList.find(item=>item[0]===id)),places=placeIds.map(id=>waterList.find(item=>item[0]===id));
    if(fish.some(item=>!item)||places.some(item=>!item||number(item[4])===null||number(item[5])===null||Math.abs(item[4])>90||Math.abs(item[5])>180))return null;
    const hour=String(value.hour??'any'),threshold=number(value.threshold);
    if(hour!=='any'&&!/^(?:[01]\d|2[0-3])$/.test(hour)||threshold===null||threshold<40||threshold>95)return null;
    return {fish:fish.map(item=>({id:item[0],name:item[1]})),places:places.map(item=>({id:item[0],name:item[1],lat:item[4],lon:item[5]})),hour,threshold:Math.round(threshold)};
  }
  function evaluate(weather,fish,water,preferences,dependencies,now=Date.now()){
    const meta=weather?.__meta,current=weather?.current,updated=number(meta?.updatedAt??meta?.fetchedAt),offset=number(weather?.utc_offset_seconds);
    const observed=offset===null?null:Date.parse(String(current?.time||'')+'Z')-offset*1000;
    if(!meta||meta.stale!==false||updated===null||!Number.isFinite(observed)||now-updated>CHECK_INTERVAL||updated>now+60000||now-observed>30*60000||observed>now+30*60000)return {reason:'stale'};
    if(number(meta.currentTime)!==null&&Math.abs(meta.currentTime-observed)>1000)return {reason:'stale'};
    if(Object.hasOwn(meta,'requestedLatitude')&&(number(meta.requestedLatitude)!==number(water[4])||number(meta.requestedLongitude)!==number(water[5])))return {reason:'location'};
    // Match the selected hour to the place's current local clock, including
    // the first minutes after an hourly or midnight boundary.
    const localNow=new Date(now+offset*1000).toISOString(),hour=localNow.slice(11,13),date=localNow.slice(0,10);
    if(!/^(?:[01]\d|2[0-3])$/.test(hour))return {reason:'stale'};
    if(preferences.hour!=='any'&&preferences.hour!==hour)return {reason:'hour'};
    if(typeof dependencies.rules?.evaluate!=='function'||typeof dependencies.score!=='function'||typeof dependencies.explain!=='function')return {reason:'unavailable'};
    const legal=dependencies.rules.evaluate(fish,{kind:'fish',date,method:'rod',waterId:water[0]});
    if(!legal?.dateValid||legal.status==='prohibited')return {reason:'prohibited'};
    const conditions={...current,local_hour:Number(hour)},assessment=dependencies.explain(fish,conditions,water,true);
    const habitat=assessment?.components?.find(item=>item.key==='habitat');
    if(!habitat||habitat.available!==true||habitat.fit!==100)return {reason:'habitat'};
    const score=dependencies.score(fish,conditions,water,true);
    if(number(score)===null)return {reason:'missing'};
    if(score<preferences.threshold)return {reason:'threshold',score};
    return {reason:'matched',score,date,time:String(current.time).slice(11,16),legal:legal.title};
  }
  function create(options){
    const storage=options.storage,now=options.now||Date.now;
    let state=defaults(),revision=0,pending=null,timer=null;
    const listeners=new Set();
    function read(){try{const value=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}
    function clean(value){
      const selected=canonicalPreferences(value,options.fish(),options.waters());
      const lastSent={};for(const [key,time] of Object.entries(value?.lastSent&&typeof value.lastSent==='object'?value.lastSent:{}))if(Number.isFinite(time)&&time<=now()&&now()-time<ALERT_INTERVAL)lastSent[key]=time;
      return {...defaults(),...(selected||{}),enabled:!!(selected&&value?.enabled),system:!!value?.system,lastSent,feed:Array.isArray(value?.feed)?value.feed.filter(item=>item&&typeof item.title==='string'&&typeof item.body==='string'&&Number.isFinite(item.at)).slice(0,25):[],lastCheck:Number.isFinite(value?.lastCheck?.at)&&value.lastCheck.at<=now()?value.lastCheck:null};
    }
    state=clean(read());
    function snapshot(){return JSON.parse(JSON.stringify(state));}
    function emit(){const result=snapshot();for(const listener of listeners)listener(result);}
    function persist(){try{if(!storage)throw new Error('storage unavailable');storage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{state.storageUnavailable=true;}emit();}
    function refresh(){revision++;state=clean(read());emit();}
    function configure(value){
      const selected=canonicalPreferences(value,options.fish(),options.waters());
      if(!selected)throw new Error('აირჩიე 1–5 თევზი და 1–5 ადგილი; საათი და ზღვარი გადაამოწმე.');
      revision++;state={...state,...selected,enabled:true,lastCheck:null};persist();return snapshot();
    }
    function disable(){revision++;state.enabled=false;persist();}
    function setSystem(value){state.system=!!value;persist();}
    function addAlert(item){
      state.feed=[item,...state.feed].slice(0,25);persist();
      try{options.deliver?.(item,state.system);}catch{}return item;
    }
    function test(){return addAlert({id:'test-'+now(),at:now(),title:'🔔 FishHunt • სატესტო შეტყობინება',body:'გვერდზე შეტყობინებები მუშაობს. ეს სატესტო ჩანაწერია; ამინდის შეფასებას არ წარმოადგენს.',test:true});}
    async function run(force=false){
      if(!state.enabled)return {enabled:false};
      if(!force&&Number.isFinite(state.lastCheck?.at)&&now()>=state.lastCheck.at&&now()-state.lastCheck.at<CHECK_INTERVAL)return state.lastCheck;
      const token=revision;
      if(pending&&pending.revision===token)return pending.promise;
      const preferences=snapshot(),dependencies=options.dependencies();
      const counts={checked:0,matched:0,sent:0,errors:0,prohibited:0,stale:0,missing:0,threshold:0,hour:0,habitat:0,deduped:0};
      const work=(async()=>{
        const queue=preferences.places.slice();
        async function checkPlace(place){
          let weather,timeout;
          try{weather=await Promise.race([options.weather(place.lat,place.lon,{force}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('weather timeout')),28000);})]);}
          catch{counts.errors++;return;}finally{clearTimeout(timeout);}
          if(token!==revision||!state.enabled)return;
          const water=options.waters().find(item=>item[0]===place.id);
          for(const selected of preferences.fish){
            const fish=options.fish().find(item=>item[0]===selected.id);
            if(!fish||!water){counts.errors++;continue;}
            counts.checked++;
            const result=evaluate(weather,fish,water,preferences,dependencies,now());
            if(result.reason!=='matched'){counts[result.reason]=(counts[result.reason]||0)+1;continue;}
            counts.matched++;
            const key=selected.id+'|'+place.id,last=number(state.lastSent[key]);
            if(last!==null&&now()>=last&&now()-last<ALERT_INTERVAL){counts.deduped++;continue;}
            // Re-read dedupe data immediately before publishing: another open
            // tab may have announced the same conditions during this fetch.
            const stored=read(),otherLast=number(stored?.lastSent?.[key]);
            if(stored&&stored.enabled===false){refresh();return;}
            if(otherLast!==null&&now()>=otherLast&&now()-otherLast<ALERT_INTERVAL){state.lastSent[key]=otherLast;counts.deduped++;continue;}
            const external=clean(stored);state.lastSent={...external.lastSent,...state.lastSent};
            state.feed=[...new Map([...state.feed,...external.feed].map(item=>[item.id,item])).values()].sort((a,b)=>b.at-a.at).slice(0,25);
            state.lastSent[key]=now();counts.sent++;
            addAlert({id:key+'|'+now(),at:now(),fishId:selected.id,waterId:place.id,score:result.score,title:selected.name+' • '+place.name,body:'პირობების ინდექსი '+result.score+'/100 • ადგილობრივი დრო '+result.time+'. საორიენტაციო შეფასებაა; დაჭერის ალბათობას არ წარმოადგენს. მოპოვების წესები გასვლამდე გადაამოწმე.'});
          }
        }
        await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{while(queue.length&&token===revision&&state.enabled)await checkPlace(queue.shift());}));
        if(token===revision&&state.enabled){state.lastCheck={at:now(),...counts};persist();return state.lastCheck;}
        return {cancelled:true};
      })();
      pending={revision:token,promise:work};
      try{return await work;}finally{if(pending?.promise===work)pending=null;}
    }
    function start(){if(timer!==null)return;timer=setInterval(()=>{if(options.visible?.()!==false)run().catch(()=>{});},CHECK_INTERVAL);}
    function stop(){if(timer!==null)clearInterval(timer);timer=null;revision++;}
    function subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}
    function clearFeed(){state.feed=[];persist();}
    return {snapshot,configure,disable,setSystem,test,run,start,stop,subscribe,refresh,clearFeed};
  }
  const api=Object.freeze({STORAGE_KEY,CHECK_INTERVAL,ALERT_INTERVAL,canonicalPreferences,evaluate,create});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else global.GeoNatureForegroundAlerts=api;
})(typeof window==='object'?window:globalThis);
