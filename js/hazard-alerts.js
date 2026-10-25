(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document){root.FishHuntHazardAlerts=api;if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',api.init);else api.init();}
})(typeof window==='object'?window:globalThis,function(root){
  'use strict';
  const STORAGE_KEY='fishhunt_hazard_alerts_v1',CHECK_INTERVAL=15*60000,DEDUPE_INTERVAL=4*3600000,MAX_FEED=25;
  const kinds=new Set(['wind','thunderstorm','rain']),rank=value=>value==='danger'?2:value==='warning'?1:0;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const stamp=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
  function validCoordinates(lat,lon){return typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&!(lat===0&&lon===0);}
  function canonicalPlaces(values,waters){
    if(!Array.isArray(values)||values.length<1||values.length>5)return null;
    const ids=values.map(value=>typeof value==='string'?value:value?.id);
    if(new Set(ids).size!==ids.length)return null;
    const result=ids.map(id=>(waters||[]).find(water=>water?.[0]===id));
    if(result.some(water=>!water||!validCoordinates(water[4],water[5])))return null;
    return result.map(water=>({id:water[0],name:String(water[1]||'ადგილი').slice(0,120),lat:water[4],lon:water[5]}));
  }
  function create(options){
    const now=options.now||Date.now,listeners=new Set();
    let revision=0,pending=null,timer=null,results={},readFailed=false;
    const defaults=()=>({enabled:false,places:[],feed:[],lastSent:{},lastCheck:null,storageUnavailable:false,checking:false});
    function read(){readFailed=false;try{if(!options.storage)throw new Error('unavailable');const raw=options.storage.getItem(STORAGE_KEY);if(!raw)return null;if(raw.length>100000)throw new Error('oversized');const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid');return value;}catch{readFailed=true;return null;}}
    function clean(value){
      const selected=canonicalPlaces(value?.places,options.waters()),lastSent={};
      for(const [key,item]of Object.entries(value?.lastSent&&typeof value.lastSent==='object'&&!Array.isArray(value.lastSent)?value.lastSent:{}).slice(-100)){
        if(/^[a-z0-9_-]{1,80}\|(wind|rain|thunderstorm)$/i.test(key)&&stamp(item?.at)&&item.at<=now()&&now()-item.at<DEDUPE_INTERVAL&&rank(item.severity))lastSent[key]={at:item.at,severity:item.severity};
      }
      const feed=Array.isArray(value?.feed)?value.feed.slice(0,MAX_FEED).filter(item=>item&&typeof item.id==='string'&&item.id.length<250&&stamp(item.at)&&item.at<=now()+60000&&kinds.has(item.hazardKind)&&rank(item.severity)&&typeof item.waterId==='string'&&(options.waters()||[]).some(w=>w[0]===item.waterId)&&typeof item.title==='string'&&typeof item.body==='string').map(item=>({id:item.id,at:item.at,title:item.title.slice(0,180),body:item.body.slice(0,900),waterId:item.waterId,kind:'hazard',hazardKind:item.hazardKind,severity:item.severity,sourceTime:typeof item.sourceTime==='string'?item.sourceTime.slice(0,40):null,forecastAt:typeof item.forecastAt==='string'?item.forecastAt.slice(0,40):null})):[];
      const check=value?.lastCheck,lastCheck=stamp(check?.at)&&check.at<=now()?{at:check.at,checked:Math.min(5,Math.max(0,Number(check.checked)||0)),partial:Math.min(5,Math.max(0,Number(check.partial)||0)),unavailable:Math.min(5,Math.max(0,Number(check.unavailable)||0)),sent:Math.min(15,Math.max(0,Number(check.sent)||0))}:null;
      return {...defaults(),enabled:Boolean(selected&&value?.enabled),places:selected||[],feed,lastSent,lastCheck};
    }
    let state=clean(read());state.storageUnavailable=readFailed;
    function snapshot(){return copy({...state,results});}
    function emit(){const value=snapshot();for(const listener of listeners){try{listener(value);}catch{}}}
    function persist(){state.lastSent=Object.fromEntries(Object.entries(state.lastSent).filter(([,item])=>stamp(item?.at)&&item.at<=now()&&now()-item.at<DEDUPE_INTERVAL).sort((a,b)=>b[1].at-a[1].at).slice(0,100));try{if(!options.storage)throw new Error('unavailable');const {checking,storageUnavailable,...stored}=state;options.storage.setItem(STORAGE_KEY,JSON.stringify(stored));state.storageUnavailable=false;}catch{state.storageUnavailable=true;}emit();}
    function configure(input){const places=canonicalPlaces(input?.places,options.waters());if(!places)throw new Error('აირჩიე 1–5 ადგილი დადასტურებული კოორდინატებით.');revision++;results={};state={...state,enabled:true,places,lastCheck:null,checking:false};persist();return snapshot();}
    function disable(){revision++;state.enabled=false;state.checking=false;persist();}
    function refresh(){revision++;results={};state=clean(read());state.storageUnavailable=readFailed;emit();}
    function clearFeed(){state.feed=[];persist();}
    function mergeExternal(){
      if(state.storageUnavailable)return true;
      const raw=read();if(!raw){if(readFailed){state.storageUnavailable=true;return true;}refresh();return false;}
      const other=clean(raw);
      if(!other.enabled||JSON.stringify(other.places.map(p=>p.id))!==JSON.stringify(state.places.map(p=>p.id))){refresh();return false;}
      for(const [key,item]of Object.entries(other.lastSent))if(!state.lastSent[key]||item.at>state.lastSent[key].at||item.at===state.lastSent[key].at&&rank(item.severity)>rank(state.lastSent[key].severity))state.lastSent[key]=item;
      state.feed=[...new Map([...state.feed,...other.feed].map(item=>[item.id,item])).values()].sort((a,b)=>b.at-a.at).slice(0,MAX_FEED);return true;
    }
    function itemFor(place,hazard,assessment){
      const at=now(),when=hazard.scope==='forecast'?'უახლოესი 6 საათობრივი პერიოდის პროგნოზი':'მიმდინარე მოდელის მონაცემი';
      const local=String(hazard.localTime||'').replace('T',' '),body=[hazard.message,when+(local?' · '+local:''),'Open-Meteo · საორიენტაციო შეფასება; ოფიციალური საგანგებო გაფრთხილება არ არის.'].filter(Boolean).join(' ');
      const icon=hazard.severity==='danger'?'⚠️ ':hazard.kind==='rain'?'🌧️ ':hazard.kind==='thunderstorm'?'⛈️ ':'💨 ';
      return {id:place.id+'|'+hazard.kind+'|'+hazard.severity+'|'+String(hazard.at||at),at,title:icon+place.name+' · '+hazard.title,body,waterId:place.id,kind:'hazard',hazardKind:hazard.kind,severity:hazard.severity,sourceTime:assessment.sourceTime||null,forecastAt:hazard.at||null};
    }
    async function run(force=false){
      if(!state.enabled)return {enabled:false};
      if(pending&&pending.revision===revision)return pending.promise;
      if(!force&&state.lastCheck&&now()-state.lastCheck.at>=0&&now()-state.lastCheck.at<CHECK_INTERVAL)return state.lastCheck;
      const token=revision,places=copy(state.places),counts={at:now(),checked:0,partial:0,unavailable:0,sent:0};
      state.checking=true;emit();
      const work=(async()=>{
        const queue=places.slice();
        async function check(place){
          let data,timeout,assessment;
          try{data=await Promise.race([options.weather(place.lat,place.lon,{force}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('timeout')),28000);})]);assessment=options.evaluate(data,{lat:place.lat,lon:place.lon,now:now()});}
          catch{assessment={status:'unavailable',reason:'source_unavailable',hazards:[],sourceTime:null};}finally{clearTimeout(timeout);}
          if(token!==revision||!state.enabled||!mergeExternal()||token!==revision)return;
          counts.checked++;results[place.id]={...assessment,placeName:place.name};
          if(assessment.status==='partial')counts.partial++;
          if(!['live','partial'].includes(assessment.status)){counts.unavailable++;return;}
          for(const hazard of (assessment.hazards||[]).slice(0,3)){
            if(!kinds.has(hazard.kind)||!rank(hazard.severity))continue;
            if(!mergeExternal()||token!==revision||!state.enabled)return;
            const key=place.id+'|'+hazard.kind,last=state.lastSent[key];
            if(last&&now()>=last.at&&now()-last.at<DEDUPE_INTERVAL&&rank(hazard.severity)<=rank(last.severity))continue;
            const item=itemFor(place,hazard,assessment);state.lastSent[key]={at:now(),severity:hazard.severity};state.feed=[item,...state.feed.filter(old=>old.id!==item.id)].slice(0,MAX_FEED);counts.sent++;persist();
            try{options.deliver?.(copy(item));}catch{}
          }
        }
        await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{while(queue.length&&token===revision&&state.enabled)await check(queue.shift());}));
        if(token===revision&&state.enabled&&mergeExternal()&&token===revision){state.checking=false;state.lastCheck=counts;persist();return copy(counts);}return {cancelled:true};
      })();
      pending={revision:token,promise:work};
      try{return await work;}finally{if(pending?.promise===work)pending=null;if(token===revision){state.checking=false;emit();}}
    }
    function start(){if(timer!==null)return;timer=setInterval(()=>{if(options.visible?.()!==false&&options.online?.()!==false)run().catch(()=>{});},CHECK_INTERVAL);}
    function stop(){if(timer!==null)clearInterval(timer);timer=null;revision++;state.checking=false;}
    function subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}
    return {snapshot,configure,disable,refresh,clearFeed,run,start,stop,subscribe};
  }
  let engine=null,started=false,context=null,contextHost=null;
  const recent=new Map();
  function getEngine(){
    if(engine)return engine;
    let storage;try{storage=root.localStorage;}catch{}
    engine=create({storage,waters:()=>root.WATERS||[],visible:()=>root.document.visibilityState!=='hidden',online:()=>root.navigator.onLine!==false,
      evaluate:(...args)=>root.FishHuntWeatherHazards?.evaluate(...args)||{status:'unavailable',hazards:[],sourceTime:null},
      weather:(lat,lon,options)=>{
        const key=lat+','+lon,cached=recent.get(key);
        if(!options.force&&cached){const assessment=root.FishHuntWeatherHazards?.evaluate(cached,{lat,lon});if(['live','partial'].includes(assessment?.status))return Promise.resolve(cached);}
        const provider=root.GeoNatureCommon?.openMeteo||root.openMeteo;if(typeof provider!=='function')return Promise.reject(new Error('weather unavailable'));
        return provider(lat,lon,options).then(data=>{remember(data);return data;});
      },deliver:item=>{root.GeoNaturePush?.showHazard?.(item);root.document.dispatchEvent(new root.CustomEvent('fishhunt:hazard-alert',{detail:item}));}
    });
    engine.subscribe(value=>{root.document.dispatchEvent(new root.CustomEvent('fishhunt:hazard-alerts',{detail:value}));});return engine;
  }
  function remember(data){
    const lat=data?.__meta?.requestedLatitude,lon=data?.__meta?.requestedLongitude;if(!validCoordinates(lat,lon))return;
    const key=lat+','+lon;recent.delete(key);recent.set(key,data);while(recent.size>15)recent.delete(recent.keys().next().value);
  }
  function node(tag,className,text){const value=root.document.createElement(tag);if(className)value.className=className;if(text)value.textContent=text;return value;}
  function dateText(value){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ka-GE',{timeZone:'Asia/Tbilisi',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date):'დრო უცნობია';}
  function statusText(assessment){
    if(!assessment||assessment.status==='unavailable')return 'ამინდის მონაცემი არასაკმარისია — საფრთხის შეფასება ვერ შესრულდა.';
    if(assessment.status==='stale')return 'მონაცემი მოძველებულია — მიმდინარე საფრთხე ხელახლა გადაამოწმე.';
    if(assessment.hazards?.length)return assessment.status==='partial'?'გამოკვეთილი რისკი ჩანს; მონაცემების ნაწილი მიუწვდომელია.':'ამინდის მოდელში რისკი გამოიკვეთა.';
    return assessment.status==='partial'?'მონაცემები არასრულია — ყველა რისკი ვერ შემოწმდა.':'შემოწმებული ქარის, ჭექა-ქუხილისა და ნალექის ზღვარი არ გადაჭარბებულა.';
  }
  function mountContext(){
    const explicit=root.document.querySelector('[data-fh-hazard-context]');
    if(explicit)contextHost=explicit;
    else if(root.document.getElementById('weatherCity')){contextHost=root.document.getElementById('fhWeatherHazards');if(!contextHost){const target=root.document.querySelector('.weather-dashboard');if(target){contextHost=node('div','fh-hazard-context');contextHost.id='fhWeatherHazards';target.after(contextHost);}}}
    if(!contextHost)return;
    contextHost.classList.add('fh-hazard-context');contextHost.setAttribute('aria-live','polite');renderContext();
  }
  function renderContext(){
    if(!contextHost)return;
    const assessment=context?.assessment;
    contextHost.replaceChildren();const heading=node('div','fh-hazard-context-head'),title=node('strong','','ამინდის რისკები · ახლო პროგნოზი'),link=node('a','','გაფრთხილებების არჩევა →');link.href='dashboard.html#fhHazardSettings';heading.append(title,link);contextHost.append(heading);
    if(context?.name)contextHost.append(node('p','fh-hazard-location',context.name));
    const status=node('p','fh-hazard-current-status',statusText(assessment));status.setAttribute('role','status');contextHost.append(status);
    const hazards=assessment?.hazards||[];
    contextHost.dataset.state=hazards.length?'risk':assessment?.status||'unavailable';
    if(hazards.length){const list=node('ul','fh-hazard-list');for(const hazard of hazards){const item=node('li','fh-hazard-item');item.dataset.severity=hazard.severity;item.append(node('strong','',hazard.title),node('p','',hazard.message),node('small','',hazard.scope==='forecast'?'პროგნოზი · '+dateText(hazard.at):'მიმდინარე მოდელი · '+dateText(hazard.at)));list.append(item);}contextHost.append(list);}
    if(assessment?.sourceTime)contextHost.append(node('small','fh-hazard-source','Open-Meteo · მონაცემი '+dateText(assessment.sourceTime)));
    contextHost.append(node('p','fh-hazard-help','საორიენტაციო მოდელური შეფასებაა; ოფიციალური საგანგებო გაფრთხილება არ არის. პირობები გასვლამდე გადაამოწმე.'));
  }
  function contextUpdate(event){
    const detail=event.detail||{},data=detail.weatherData||detail.data;
    const lat=Object.hasOwn(detail,'lat')?detail.lat:data?.__meta?.requestedLatitude,lon=Object.hasOwn(detail,'lon')?detail.lon:data?.__meta?.requestedLongitude;
    const forcedStatus=detail.stale?'stale':null;
    if(data&&!forcedStatus)remember(data);
    context={name:detail.locationName||detail.name||'',data:data||null,lat,lon,forcedStatus,assessment:forcedStatus?{status:forcedStatus,hazards:[]}:root.FishHuntWeatherHazards?.evaluate(data,{lat,lon})||null};
    mountContext();
  }
  function mountSettings(){
    const center=root.document.getElementById('gnNotificationCenter');if(!center||root.document.getElementById('fhHazardSettings'))return;
    const host=node('details','fh-hazard-settings panel');host.id='fhHazardSettings';const summary=node('summary','','ამინდის საფრთხის გაფრთხილებები'),body=node('div','fh-hazard-settings-body');host.append(summary,body);center.after(host);
    body.append(node('p','fh-hazard-help','აირჩიე მაქსიმუმ 5 ადგილი. მოწმდება მიმდინარე ამინდი და უახლოესი 6 საათობრივი პერიოდი: ქარი, ჭექა-ქუხილი და უხვი ნალექი, თევზის არჩევისგან დამოუკიდებლად. შემოწმება ხდება ყოველ 15 წუთში, სანამ საიტი ღიაა. საიტის დახურვისას შემოწმება წყდება.'));
    const form=node('form','fh-hazard-form'),fieldset=node('fieldset','fh-hazard-picker'),legend=node('legend','','ადგილები '),count=node('span','fh-hazard-count','0/5'),search=node('input'),choices=node('div','fh-hazard-choices');search.type='search';search.placeholder='ადგილის ძებნა…';search.setAttribute('aria-label','საფრთხის გაფრთხილების ადგილის ძებნა');legend.append(count);fieldset.append(legend,search,choices);form.append(fieldset);
    const places=(root.WATERS||[]).filter(w=>validCoordinates(w[4],w[5]));
    for(const place of places){const label=node('label','fh-hazard-choice'),input=node('input'),text=node('span','',place[1]);input.type='checkbox';input.name='hazardPlace';input.value=place[0];text.append(node('small','',[place[2],place[3]].filter(Boolean).join(' · ')));label.append(input,text);choices.append(label);}
    const actions=node('div','fh-hazard-actions'),save=node('button','btn primary','შენახვა და ჩართვა'),check=node('button','btn ghost','ახლავე შემოწმება'),off=node('button','btn ghost','გამორთვა');save.type='submit';check.type=off.type='button';actions.append(save,check,off);form.append(actions);
    const feedback=node('p','fh-hazard-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');form.append(feedback);body.append(form);
    const stateNote=node('p','fh-hazard-state'),results=node('div','fh-hazard-results'),feedLink=node('a','fh-hazard-feed-link','ბოლო გაფრთხილებები შეტყობინებების სიაში ↑');stateNote.setAttribute('role','status');feedLink.href='#gnNotificationCenter';body.append(stateNote,results,feedLink);
    const explanation=node('details','fh-hazard-explanation'),explanationTitle=node('summary','','რა ითვლება რისკად?');explanation.append(explanationTitle,node('p','fh-hazard-help','ქარი: 35 კმ/სთ-დან, ძლიერი რისკი 50-დან; დარტყმა: 50 კმ/სთ-დან, ძლიერი რისკი 70-დან. საათობრივი ნალექი: 5 მმ-დან, ძლიერი რისკი 10-დან. ჭექა-ქუხილი მოწმდება ამინდის კოდით. ნალექის ალბათობა ცალკე ძლიერ წვიმას არ ნიშნავს. არასრული მონაცემი უსაფრთხო პირობებს არ ადასტურებს.'));body.append(explanation);
    const controller=getEngine();
    function selection(){const selected=[...choices.querySelectorAll('input:checked')];count.textContent=selected.length+'/5';for(const input of choices.querySelectorAll('input'))input.disabled=!input.checked&&selected.length>=5;}
    function load(){const current=controller.snapshot();for(const input of choices.querySelectorAll('input'))input.checked=current.places.some(place=>place.id===input.value);selection();}
    load();choices.addEventListener('change',()=>{host.dataset.dirty='1';selection();});search.addEventListener('input',()=>{const query=search.value.trim().toLocaleLowerCase();for(const label of choices.querySelectorAll('label'))label.hidden=!label.textContent.toLocaleLowerCase().includes(query);});
    function feedbackText(text,error=false){feedback.textContent=text;feedback.dataset.error=String(error);if(text)feedback.scrollIntoView({block:'nearest',inline:'nearest'});}
    form.addEventListener('submit',async event=>{event.preventDefault();try{const value=controller.configure({places:[...choices.querySelectorAll('input:checked')].map(input=>input.value)});host.dataset.dirty='';feedbackText(value.storageUnavailable?'ჩართულია მხოლოდ ამ გვერდის გახსნისას: ბრაუზერმა არჩევანი ვერ შეინახა.':'არჩევანი შენახულია. ამინდი მოწმდება…');await controller.run(true);}catch(error){feedbackText(error.message||'შემოწმება ვერ დასრულდა.',true);}});
    check.onclick=async()=>{feedbackText('ამინდი მოწმდება…');try{await controller.run(true);feedbackText('შემოწმება დასრულდა. შედეგები ქვემოთაა.');}catch{feedbackText('ამინდის შემოწმება ვერ დასრულდა. სცადე ხელახლა.',true);}};
    off.onclick=()=>{controller.disable();feedbackText('საფრთხის გაფრთხილებები გამორთულია.');};
    controller.subscribe(value=>{
      save.disabled=check.disabled=value.checking;off.disabled=!value.enabled;check.disabled=value.checking||!value.enabled;
      stateNote.textContent=(value.enabled?'ჩართულია · მხოლოდ ღია საიტზე.':'გამორთულია.')+(value.lastCheck?' ბოლო შემოწმება: '+dateText(value.lastCheck.at)+'.':'')+(value.storageUnavailable?' არჩევანი და ისტორია დროებითია: ბრაუზერის საცავი მიუწვდომელია.':' არჩევანი და ისტორია მხოლოდ ამ ბრაუზერში ინახება.');
      results.replaceChildren();for(const place of value.places){const result=value.results[place.id],row=node('div','fh-hazard-result');row.append(node('strong','',place.name),node('p','',value.checking?'მოწმდება…':result?statusText(result):'ახალი მონაცემი ჯერ არ შემოწმებულა.'));results.append(row);}
    });
    root.addEventListener('storage',event=>{if(event.key===STORAGE_KEY&&!host.dataset.dirty)load();});
    if(root.location.hash==='#fhHazardSettings')host.open=true;
  }
  function init(){
    if(started)return;started=true;const controller=getEngine();mountSettings();mountContext();controller.start();
    if(root.document.visibilityState!=='hidden'&&root.navigator.onLine!==false)controller.run().catch(()=>{});
    root.addEventListener('gn:weatherUpdated',contextUpdate);root.addEventListener('gn:assessmentUpdated',contextUpdate);
    root.document.addEventListener('visibilitychange',()=>{if(root.document.visibilityState==='visible'){if(context){context.assessment=context.forcedStatus?{status:context.forcedStatus,hazards:[]}:root.FishHuntWeatherHazards?.evaluate(context.data,{lat:context.lat,lon:context.lon})||null;renderContext();}controller.run().catch(()=>{});}});
    root.addEventListener('online',()=>controller.run().catch(()=>{}));root.addEventListener('offline',()=>{if(contextHost){context={assessment:{status:'unavailable',hazards:[]},name:context?.name||''};renderContext();}});
    root.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null)controller.refresh();});
    setInterval(()=>{if(context&&contextHost&&root.document.visibilityState!=='hidden'){context.assessment=context.forcedStatus?{status:context.forcedStatus,hazards:[]}:root.FishHuntWeatherHazards?.evaluate(context.data,{lat:context.lat,lon:context.lon})||null;renderContext();}},60000);
  }
  return Object.freeze({STORAGE_KEY,CHECK_INTERVAL,DEDUPE_INTERVAL,canonicalPlaces,create,init,controller:getEngine,snapshot:()=>getEngine().snapshot(),statusText,contextUpdate});
});
