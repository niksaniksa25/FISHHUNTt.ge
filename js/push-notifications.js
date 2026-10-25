(function(){
  'use strict';
  const CLIENT_KEY='geonature_push_client_v1';
  const PREF_KEY='geonature_push_prefs_v1';
  let apiConfigPromise=null;
  let memoryClientId=null;

  function apiBase(){
    let base=String(window.GN_API_BASE_URL||'').trim();
    while(base.endsWith('/'))base=base.slice(0,-1);
    return base;
  }
  async function ensureApiConfig(){
    if(window.__GN_API_CONFIG_LOADED)return;
    if(!apiConfigPromise){
      apiConfigPromise=new Promise(resolve=>{
        const script=document.createElement('script');
        script.src=new URL('js/api-config.js',document.baseURI).href;
        const timer=setTimeout(resolve,7000);
        script.onload=()=>{clearTimeout(timer);resolve()};script.onerror=()=>{clearTimeout(timer);resolve()};
        document.head.appendChild(script);
      });
    }
    await apiConfigPromise;
  }
  async function endpoint(path){
    await ensureApiConfig();
    const base=apiBase();
    if(base)return base+'/api/push'+path;
    const host=String(location.hostname||'').toLowerCase();
    if(host.endsWith('.github.io'))throw new Error('შეტყობინებების სერვერი ჯერ დაკავშირებული არ არის. ამ საიტზე Push ახლა მიუწვდომელია.');
    return '/api/push'+path;
  }
  function clientId(){
    try{const stored=localStorage.getItem(CLIENT_KEY);if(stored)return stored;}catch{}
    if(!memoryClientId)memoryClientId=(crypto.randomUUID?crypto.randomUUID():'gn_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
    try{localStorage.setItem(CLIENT_KEY,memoryClientId);}catch{}
    return memoryClientId;
  }
  function prefs(){
    try{return {...{fish:[],places:[],hour:'any',threshold:72,enabled:false},...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}
    catch{return {fish:[],places:[],hour:'any',threshold:72,enabled:false}}
  }
  function savePrefs(p){try{localStorage.setItem(PREF_KEY,JSON.stringify(p))}catch(error){console.warn('Push preference storage:',error.message)}}
  function b64uToBytes(b64){
    const pad='='.repeat((4-b64.length%4)%4),s=(b64+pad).replace(/-/g,'+').replace(/_/g,'/');
    return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  }
  async function request(path,method='GET',payload){
    const url=await endpoint(path),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const options={method,headers:{'Content-Type':'application/json'},signal:controller.signal,cache:'no-store'};
      if(payload)options.body=JSON.stringify(payload);
      const response=await fetch(url,options),result=await response.json().catch(()=>({}));
      if(!response.ok||result.ok!==true)throw new Error(result.message||('შეტყობინებების სერვერმა პასუხი ვერ დაადასტურა ('+response.status+').'));
      return result;
    }catch(error){if(error.name==='AbortError')throw new Error('შეტყობინებების სერვერმა დროულად ვერ უპასუხა. სცადე ხელახლა.');throw error}
    finally{clearTimeout(timer)}
  }
  function normalizedPreferences(fish,places,hour,threshold){
    const old=prefs();
    return {
      fish:Array.isArray(fish)?fish:old.fish||[],
      places:Array.isArray(places)?places:old.places||[],
      hour:hour===undefined?old.hour:String(hour),
      threshold:Math.max(40,Math.min(95,Math.round(Number(threshold===undefined?old.threshold:threshold)||72))),
      enabled:old.enabled
    };
  }
  async function subscribe(preferences){
    if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))
      throw new Error('ამ ბრაუზერს Web Push არ აქვს მხარდაჭერილი.');
    if(!window.isSecureContext)throw new Error('Push შეტყობინებისთვის HTTPS ან localhost საჭიროა.');
    // Safari Home-screen apps require this call to originate from the click,
    // before awaiting network or service-worker work. A missing Pages API
    // never reaches the browser permission prompt.
    const configured=window.__GN_API_CONFIG_LOADED&&(apiBase()||!String(location.hostname||'').toLowerCase().endsWith('.github.io'));
    const permissionPromise=configured?Notification.requestPermission().catch(error=>({error})):null;
    const config=await request('/config');
    if(!config.publicKey)throw new Error('შეტყობინებების სერვერის გასაღები ვერ ჩაიტვირთა.');
    const workerUrl=new URL('push-sw.js',document.baseURI);
    const scopeUrl=new URL('./',document.baseURI);
    const registration=await navigator.serviceWorker.register(workerUrl.pathname,{scope:scopeUrl.pathname});
    const permission=await(permissionPromise||Notification.requestPermission());
    if(permission?.error)throw permission.error;
    if(permission!=='granted')throw new Error('ბრაუზერის შეტყობინებების ნებართვა არ არის დაშვებული.');
    let existing=await registration.pushManager.getSubscription();
    const applicationServerKey=b64uToBytes(config.publicKey),previousKey=existing?.options?.applicationServerKey;
    if(previousKey){
      const bytes=new Uint8Array(previousKey);
      if(bytes.length!==applicationServerKey.length||bytes.some((value,index)=>value!==applicationServerKey[index])){
        if(!(await existing.unsubscribe()))throw new Error('ძველი შეტყობინებების გასაღები ვერ განახლდა. სცადე ხელახლა.');
        existing=null;savePrefs({...prefs(),enabled:false});
      }
    }
    const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
    const p={...(preferences||prefs())};
    const payload={clientId:clientId(),subscription:subscription.toJSON(),preferences:{fish:p.fish||[],places:p.places||[],hour:p.hour||'any',threshold:p.threshold||72}};
    try{
      const result=await request('/subscribe','POST',payload);
      savePrefs({...p,enabled:true});
      return result;
    }catch(error){if(!existing)await subscription.unsubscribe().catch(()=>{});throw error}
  }
  async function savePreferences(fish,places,hour,threshold){
    const p=normalizedPreferences(fish,places,hour,threshold);
    const result=await request('/preferences','POST',{clientId:clientId(),preferences:{fish:p.fish,places:p.places,hour:p.hour,threshold:p.threshold}});
    savePrefs({...p,enabled:true});
    return result;
  }
  async function testPush(){return request('/test','POST',{clientId:clientId()})}
  async function checkNow(){return request('/check-now','POST',{clientId:clientId()})}
  async function unsubscribe(){
    const registration=await navigator.serviceWorker?.getRegistration(new URL('./',document.baseURI).pathname);
    const subscription=await registration?.pushManager.getSubscription();
    if(subscription&&!(await subscription.unsubscribe()))throw new Error('მოწყობილობაზე შეტყობინებები ვერ გამოირთო. სცადე ხელახლა.');
    // Once the browser subscription is removed this device cannot receive
    // notifications, even when the server cannot acknowledge the cleanup.
    await request('/unsubscribe','POST',{clientId:clientId()}).catch(error=>console.warn('Push server cleanup:',error.message));
    const p=prefs();savePrefs({...p,enabled:false});
  }
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function parseFishTemp(v){const nums=(String(v||'').replace(/(\d)\s*-\s*(?=\d)/g,'$1–').match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);return nums.length>=2?{min:Math.min(nums[0],nums[1]),max:Math.max(nums[0],nums[1])}:{min:null,max:null}}
  function normalHourTags(v){const s=String(v||'').toLowerCase(),tags=[];if(s.includes('გამთენ')||s.includes('დილ'))tags.push('morning');if(s.includes('დღე'))tags.push('day');if(s.includes('საღ'))tags.push('evening');if(s.includes('ღამე')||s.includes('ბინდი'))tags.push('night');return tags}
  function available(){return {fish:(window.FISHES||[]).slice(),places:(window.WATERS||[]).filter(w=>typeof w[4]==='number'&&typeof w[5]==='number'&&Number.isFinite(w[4])&&Number.isFinite(w[5])&&Math.abs(w[4])<=90&&Math.abs(w[5])<=180)}}
  let foregroundController=null,compactMounted=false,initialised=false;
  const MODE_KEY='geonature_notification_mode_v1';
  function storedMode(){try{return localStorage.getItem(MODE_KEY)==='push'?'push':'foreground'}catch{return 'foreground'}}
  function storeMode(value){try{localStorage.setItem(MODE_KEY,value)}catch{}}
  function systemSupport(){
    const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(/Macintosh/i.test(navigator.userAgent||'')&&navigator.maxTouchPoints>1);
    const standalone=navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
    return {supported:!!(window.isSecureContext&&'Notification'in window&&(!ios||standalone)),ios,standalone};
  }
  function showSiteAlert(item){
    if(document.getElementById('gnNotificationCenter'))return;
    let toast=document.getElementById('gnSiteAlert');
    if(!toast){toast=document.createElement('aside');toast.id='gnSiteAlert';toast.className='gn-site-alert';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.appendChild(toast);}
    toast.innerHTML='<button type="button" aria-label="შეტყობინების დახურვა">×</button><strong>'+esc(item.title)+'</strong><p>'+esc(item.body)+'</p><a href="dashboard.html#gnNotificationCenter">შეტყობინებების ნახვა →</a>';
    toast.hidden=false;toast.querySelector('button').onclick=()=>{toast.hidden=true;};
  }
  function forecastPath(fishId,waterId){return 'fishing.html?fish='+encodeURIComponent(fishId)+'&place='+encodeURIComponent(waterId)+'#fishProfile';}
  function hazardFeed(){
    const feed=window.FishHuntHazardAlerts?.snapshot?.()?.feed;
    return Array.isArray(feed)?feed:[];
  }
  function combinedFeed(fishFeed){
    return [...(Array.isArray(fishFeed)?fishFeed:[]),...hazardFeed()].sort((a,b)=>b.at-a.at).slice(0,50);
  }
  function alertPath(item){return item.kind==='hazard'&&item.waterId?'place-details.html?id='+encodeURIComponent(item.waterId)+'#fhWeatherHazards':item.fishId?forecastPath(item.fishId,item.waterId):'dashboard.html#gnNotificationCenter';}
  async function deliverSystem(item,enabled){
    if(!enabled||!systemSupport().supported||Notification.permission!=='granted')return;
    const url=new URL(alertPath(item),document.baseURI).href;
    const options={body:item.body,tag:item.kind==='hazard'?'fh-hazard-'+item.hazardKind+'-'+(item.waterId||''):'gn-foreground-'+(item.fishId||'test')+'-'+(item.waterId||''),icon:new URL('assets/icons/icon-192.png',document.baseURI).href,data:{url}};
    try{
      if('serviceWorker'in navigator){
        const scope=new URL('./',document.baseURI),worker=new URL('push-sw.js',document.baseURI),registration=await navigator.serviceWorker.register(worker.pathname,{scope:scope.pathname});
        if(registration.active?.state!=='activated')await new Promise((resolve,reject)=>{
          const installing=registration.installing||registration.waiting;if(!installing){reject(new Error('შეტყობინებების worker ჯერ არ არის აქტიური.'));return;}
          const finish=error=>{clearTimeout(timer);installing.removeEventListener('statechange',changed);error?reject(error):resolve();};
          const changed=()=>{if(installing.state==='activated')finish();else if(installing.state==='redundant')finish(new Error('შეტყობინებების worker ვერ გააქტიურდა.'));};
          const timer=setTimeout(()=>finish(new Error('შეტყობინებების worker-ის ჩართვას დრო ამოეწურა.')),10000);installing.addEventListener('statechange',changed);changed();
        });
        await registration.showNotification(item.title,options);
      }
      else{const notification=new Notification(item.title,options);notification.onclick=()=>{window.focus();window.location.href=url;notification.close();};}
    }catch(error){const note=document.getElementById('gnPushSystemNote');if(note)note.textContent='ბრაუზერის შეტყობინება ვერ გამოჩნდა. ჩანაწერი გვერდზე შენარჩუნებულია. '+error.message;console.warn('Foreground system notification:',error.message);}
  }
  function foreground(){
    if(foregroundController)return foregroundController;
    if(!window.GeoNatureForegroundAlerts)return null;
    let storage;try{storage=localStorage;}catch{}
    foregroundController=window.GeoNatureForegroundAlerts.create({
      storage,fish:()=>window.FISHES||[],waters:()=>window.WATERS||[],
      dependencies:()=>({score:window.GeoFishChance,explain:window.GeoFishConditions?.explain,rules:window.GeoWildlifeRules}),
      weather:(lat,lon,options)=>{const provider=window.GeoNatureCommon?.openMeteo||window.openMeteo;if(typeof provider!=='function')return Promise.reject(new Error('ამინდის წყარო მიუწვდომელია'));return provider(lat,lon,options);},
      visible:()=>document.visibilityState!=='hidden',
      deliver:(item,system)=>{deliverSystem(item,system);showSiteAlert(item);document.dispatchEvent(new CustomEvent('geonature:alert',{detail:item}));}
    });
    return foregroundController;
  }
  function showHazard(item){
    if(!item||item.kind!=='hazard')return;
    deliverSystem(item,foreground()?.snapshot()?.system===true);showSiteAlert(item);
    document.dispatchEvent(new CustomEvent('geonature:alert',{detail:item}));
  }
  function selectedItems(container,data,type){return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(input=>{const item=data.find(value=>value[0]===input.value);return type==='fish'?{id:item[0],name:item[1]}:{id:item[0],name:item[1],lat:item[4],lon:item[5]};});}
  function populateChoices(container,items,selected,type){
    container.innerHTML=items.map(item=>'<label class="gn-push-choice"><input type="checkbox" value="'+esc(item[0])+'" '+(selected.some(value=>value.id===item[0])?'checked':'')+'><span>'+esc(item[1])+'<small>'+esc(type==='fish'?item[3]:item[2])+'</small></span></label>').join('');
    const update=()=>{const count=container.querySelectorAll('input:checked').length;container.closest('fieldset').querySelector('.gn-push-count').textContent=count+'/5';for(const input of container.querySelectorAll('input'))input.disabled=!input.checked&&count>=5;};
    container.addEventListener('change',update);update();
    const field=container.closest('fieldset');
    field.querySelector('input[type="search"]').addEventListener('input',event=>{const query=event.target.value.trim().toLocaleLowerCase();for(const label of container.querySelectorAll('label'))label.hidden=!label.textContent.toLocaleLowerCase().includes(query);});
    field.querySelector('.gn-push-clear').onclick=()=>{for(const input of container.querySelectorAll('input'))input.checked=false;update();};
  }
  function choiceField(id,title){return '<fieldset class="gn-push-picker"><legend>'+title+' <span class="gn-push-count">0/5</span></legend><div class="gn-push-search-row"><input type="search" aria-label="'+title+' — ძებნა" placeholder="ძებნა…"><button type="button" class="gn-push-clear">გასუფთავება</button></div><div id="'+id+'" class="gn-push-choices"></div></fieldset>';}
  function mount(){
    const host=document.getElementById('gnNotificationCenter');if(!host||host.dataset.mounted)return;host.dataset.mounted='1';
    const engine=foreground(),data=available(),local=engine?.snapshot(),remote=prefs();
    let mode=storedMode(),active=mode==='push'?remote:local||remote;
    host.innerHTML='<div class="gn-push-head"><div><span class="eyebrow">შეტყობინებები</span><h2>🔔 შენი თევზი და ადგილი</h2><p>საიტის გახსნისას არჩეული ადგილის ამინდი ყოველ 15 წუთში მოწმდება. კარგ პირობებზე აქ შეტყობინება გამოჩნდება. ერთსა და იმავე თევზსა და ადგილზე გამეორებას შორის 4 საათია. ინდექსი დაჭერის ზუსტ შანსს არ ზომავს. საიტის დახურვის შემდეგ ამ რეჟიმში შემოწმება წყდება.</p></div><span class="gn-push-status" id="gnPushStatus" role="status"></span></div>'+
      '<div class="gn-push-mode"><label for="gnPushMode">რეჟიმი</label><select id="gnPushMode"><option value="foreground">საიტი ღიაა — შეტყობინება გვერდზე</option><option value="push" hidden>სერვერის Push — დახურულ საიტზეც</option></select></div>'+
      '<div class="gn-push-grid">'+choiceField('gnPushFish','🐟 თევზი')+choiceField('gnPushPlaces','📍 ადგილი')+'</div>'+
      '<div class="gn-push-controls"><div><label for="gnPushHour">🕒 ადგილის ადგილობრივი საათი</label><select id="gnPushHour"><option value="any">ნებისმიერი საათი</option>'+Array.from({length:24},(_,i)=>'<option value="'+String(i).padStart(2,'0')+'">'+String(i).padStart(2,'0')+':00</option>').join('')+'</select></div><div><label for="gnPushThreshold">📈 ინდექსის მინიმალური ქულა</label><select id="gnPushThreshold">'+[40,50,60,70,72,80,90,95].map(value=>'<option value="'+value+'">'+value+'+/100</option>').join('')+'</select></div></div>'+
      '<div class="gn-push-actions"><button type="button" class="btn primary" id="gnPushEnable">შენახვა და ჩართვა</button><button type="button" class="btn ghost" id="gnPushCheck">ახლავე შემოწმება</button><button type="button" class="btn ghost" id="gnPushTest">სატესტო შეტყობინება</button><button type="button" class="btn ghost" id="gnPushOff">გამორთვა</button></div>'+
      '<div class="gn-push-note" id="gnPushNote" role="status" aria-live="polite">აირჩიე 1–5 თევზი და 1–5 ადგილი, შემდეგ ჩართე.</div>'+
      '<div class="gn-push-system"><button type="button" class="btn ghost" id="gnPushSystem">ბრაუზერის შეტყობინებების დაშვება</button><p id="gnPushSystemNote"></p></div>'+
      '<div class="gn-push-feed-head"><h3>ბოლო შეტყობინებები <span id="gnPushTotal">0</span></h3><button type="button" class="btn ghost" id="gnPushClearFeed">ისტორიის გასუფთავება</button></div><div id="gnPushFeed" class="gn-push-feed" aria-live="polite"></div>';
    const status=host.querySelector('#gnPushStatus'),note=host.querySelector('#gnPushNote'),modeField=host.querySelector('#gnPushMode');
    const load=value=>{
      populateChoices(host.querySelector('#gnPushFish'),data.fish,value?.fish||[],'fish');
      populateChoices(host.querySelector('#gnPushPlaces'),data.places,value?.places||[],'place');
      host.querySelector('#gnPushHour').value=value?.hour||'any';host.querySelector('#gnPushThreshold').value=String(value?.threshold||72);
    };
    load(active);modeField.value=mode;
    const read=()=>({fish:selectedItems(host.querySelector('#gnPushFish'),data.fish,'fish'),places:selectedItems(host.querySelector('#gnPushPlaces'),data.places,'place'),hour:host.querySelector('#gnPushHour').value,threshold:Number(host.querySelector('#gnPushThreshold').value)});
    const updateStatus=()=>{const enabled=mode==='push'?prefs().enabled:engine?.snapshot().enabled;status.textContent=enabled?(mode==='push'?'Push ჩართულია':'ჩართულია • საიტი ღიაა'):'გამორთულია';host.querySelector('#gnPushCheck').disabled=!enabled;};
    const render=value=>{
      if(mode==='foreground')updateStatus();
      if(mode==='foreground'&&value.enabled&&value.lastCheck)note.textContent=checkMessage(value.lastCheck);
      const feed=combinedFeed(value.feed);
      host.querySelector('#gnPushTotal').textContent=feed.length;
      host.querySelector('#gnPushFeed').innerHTML=feed.length?feed.map(item=>'<article class="gn-push-entry'+(item.test?' is-test':'')+(item.kind==='hazard'?' is-hazard':'')+'"><strong>'+esc(item.title)+'</strong><time>'+esc(new Date(item.at).toLocaleString('ka-GE',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}))+'</time><p>'+esc(item.body)+'</p>'+((item.fishId||item.kind==='hazard'&&item.waterId)?'<a href="'+esc(alertPath(item))+'">'+(item.kind==='hazard'?'ადგილის ამინდის ნახვა →':'პროგნოზის გახსნა →')+'</a>':'')+'</article>').join(''):'<p class="muted">ჯერ შეტყობინება არ არის. სატესტო ღილაკი მუშაობას ამინდისგან დამოუკიდებლად ამოწმებს.</p>';
    };
    document.addEventListener('fishhunt:hazard-alerts',()=>render(engine?.snapshot()||{feed:[]}));
    engine?.subscribe(render);updateStatus();
    function checkMessage(result){
      if(result.cancelled)return 'არჩევანი შეიცვალა; წინა შემოწმება გაუქმდა.';
      if(result.enabled===false)return 'ჯერ ჩართე შეტყობინებები.';
      const text=['შემოწმდა '+result.checked+' თევზისა და ადგილის კომბინაცია.'];
      if(result.sent)text.push('ახალი შეტყობინება: '+result.sent+'.');
      if(result.threshold)text.push('ზღვარზე დაბალი ინდექსი: '+result.threshold+'.');
      if(result.hour)text.push('არჩეულ საათს გარეთ: '+result.hour+'.');
      if(result.prohibited)text.push('აკრძალული სახეობები გამოტოვებულია: '+result.prohibited+'.');
      if(result.habitat)text.push('სახეობის არსებობა არჩეულ ადგილას დაუდასტურებელია: '+result.habitat+' კომბინაცია გამოტოვებულია. აირჩიე სხვა ადგილი.');
      if(result.stale||result.missing)text.push('მოძველებული ან არასრული მონაცემი: '+((result.stale||0)+(result.missing||0))+'.');
      if(result.unavailable)text.push('შეფასების მოდული ვერ ჩაიტვირთა. განაახლე გვერდი.');
      if(result.location)text.push('სხვა ადგილის ამინდი გამოტოვებულია: '+result.location+'. სცადე ხელახალი შემოწმება.');
      if(result.deduped)text.push('ბოლო 4 საათში უკვე გამოჩნდა: '+result.deduped+'.');
      if(result.errors)text.push('ამინდი ვერ ჩაიტვირთა '+result.errors+' ადგილისთვის; კავშირი შეამოწმე და სცადე ხელახლა.');
      if(engine?.snapshot().storageUnavailable)text.push('ბრაუზერის საცავი მიუწვდომელია; არჩევანი მხოლოდ ამ გვერდზე შეინახება.');
      return text.join(' ');
    }
    async function action(button,work){button.disabled=true;try{await work();}catch(error){note.textContent='⚠️ '+error.message;}finally{button.disabled=false;updateStatus();}}
    host.querySelector('#gnPushEnable').onclick=()=>action(host.querySelector('#gnPushEnable'),async()=>{
      const value=read();if(!value.fish.length||value.fish.length>5||!value.places.length||value.places.length>5)throw new Error('აირჩიე 1–5 თევზი და 1–5 ადგილი.');
      if(mode==='push'){note.textContent='Push სერვერს ვუკავშირდებით…';await subscribe(value);engine?.disable();note.textContent='Push სერვერმა შენახვა დაადასტურა. პირობები ყოველ 15 წუთში მოწმდება.';await checkNow();}
      else{if(!engine)throw new Error('შეტყობინებების მოდული ვერ ჩაიტვირთა. განაახლე გვერდი.');engine.configure(value);note.textContent='ჩართულია. ახალი ამინდი მოწმდება…';note.textContent=checkMessage(await engine.run(true));}
    });
    host.querySelector('#gnPushCheck').onclick=()=>action(host.querySelector('#gnPushCheck'),async()=>{note.textContent='ამინდი მოწმდება…';if(mode==='push'){const result=await checkNow();note.textContent=result.message||'სერვერის შემოწმება დაიწყო.';}else note.textContent=checkMessage(await engine.run(true));});
    host.querySelector('#gnPushTest').onclick=()=>action(host.querySelector('#gnPushTest'),async()=>{if(mode==='push'){const result=await testPush();note.textContent=result.message||'სერვერმა სატესტო გაგზავნა დაადასტურა.';}else{if(!engine)throw new Error('შეტყობინებების მოდული ვერ ჩაიტვირთა.');engine.test();note.textContent='სატესტო შეტყობინება ქვემოთ გამოჩნდა. ამინდის მონაცემის გარეშე სატესტო ჩანაწერია.';}});
    host.querySelector('#gnPushOff').onclick=()=>action(host.querySelector('#gnPushOff'),async()=>{if(mode==='push')await unsubscribe();else engine?.disable();note.textContent='არჩეული რეჟიმის შეტყობინებები გამორთულია.';});
    host.querySelector('#gnPushClearFeed').onclick=()=>{engine?.clearFeed();window.FishHuntHazardAlerts?.controller?.()?.clearFeed?.();};
    modeField.onchange=()=>{mode=modeField.value;storeMode(mode);load(mode==='push'?prefs():engine?.snapshot());updateStatus();note.textContent=mode==='push'?'სერვერის Push-ს HTTPS, ბრაუზერის ნებართვა და დაკავშირებული სერვერი სჭირდება.':'გვერდზე შეტყობინებები მუშაობს, სანამ საიტი ღიაა.';};
    const support=systemSupport(),systemButton=host.querySelector('#gnPushSystem'),systemNote=host.querySelector('#gnPushSystemNote');
    systemNote.textContent=support.ios&&!support.standalone?'iPhone-ზე შეტყობინება ამ გვერდზე გამოჩნდება. სისტემური Web Push-ისთვის საჭიროა iOS 16.4+, მთავარ ეკრანზე დამატება და Push სერვერი.':support.supported?'ბრაუზერის ნებართვა სურვილისამებრ შეგიძლია დაუშვა. გვერდზე შეტყობინებები მის გარეშეც მუშაობს; საიტის დახურვისას ამ რეჟიმის შემოწმება წყდება.':'ამ ბრაუზერში სისტემური შეტყობინება მიუწვდომელია. გვერდზე შეტყობინებები ჩვეულებრივ მუშაობს.';
    systemButton.disabled=!support.supported;
    systemButton.onclick=()=>{const permission=Notification.requestPermission();action(systemButton,async()=>{const value=await permission;engine?.setSystem(value==='granted');systemNote.textContent=value==='granted'?'ნებართვა დაშვებულია. სანამ საიტი ღიაა, ახალი შეტყობინება ბრაუზერშიც გამოჩნდება.':'ნებართვა არ დაშვებულა. შეტყობინებები ამ გვერდზე გამოჩნდება.';});};
    ensureApiConfig().then(()=>{const configured=!!apiBase()||!String(location.hostname||'').toLowerCase().endsWith('.github.io');const option=modeField.querySelector('option[value="push"]');option.hidden=!configured;if(!configured&&mode==='push'){mode='foreground';modeField.value=mode;storeMode(mode);load(engine?.snapshot());updateStatus();}if(!configured)option.disabled=true;});
  }
  function mountCompact(){
    if(compactMounted||document.getElementById('gnNotificationCenter'))return;
    const engine=foreground();if(!engine)return;compactMounted=true;
    const nav=document.getElementById('nav');if(!nav)return;
    const anchor=nav.querySelector('a[href*="gnNotificationCenter"]')||document.createElement('a');
    if(!anchor.parentNode){anchor.href='dashboard.html#gnNotificationCenter';anchor.className='gn-alert-nav';anchor.innerHTML='🔔 <span>შეტყობინებები</span> <b class="gn-alert-count" hidden></b>';nav.appendChild(anchor);}
    let count=anchor.querySelector('.gn-alert-count');if(!count){count=document.createElement('b');count.className='gn-alert-count';anchor.appendChild(count);}
    const update=value=>{const total=combinedFeed(value.feed).length;count.textContent=total;count.hidden=!total;anchor.setAttribute('aria-label','შეტყობინებები: '+total);};
    engine.subscribe(update);document.addEventListener('fishhunt:hazard-alerts',()=>update(engine.snapshot()));
  }
  function initialise(){
    if(initialised)return;initialised=true;
    const engine=foreground();if(engine){engine.start();engine.run().catch(()=>{});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')engine.run().catch(()=>{});});window.addEventListener('storage',event=>{if(event.key===window.GeoNatureForegroundAlerts.STORAGE_KEY){engine.refresh();}});window.addEventListener('online',()=>engine.run().catch(()=>{}));}
    mount();mountCompact();
  }
  document.addEventListener('DOMContentLoaded',initialise);
  window.GeoNaturePush={clientId,prefs,subscribe,savePreferences,testPush,checkNow,unsubscribe,mount,foreground,initialise,forecastPath,showHazard,parseFishTemp,normalHourTags};
})();
