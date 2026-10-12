(function(){
  'use strict';
  const CLIENT_KEY='geonature_push_client_v1';
  const PREF_KEY='geonature_push_prefs_v1';
  let apiConfigPromise=null;

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
    let x=localStorage.getItem(CLIENT_KEY);
    if(!x){x=(crypto.randomUUID?crypto.randomUUID():'gn_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));localStorage.setItem(CLIENT_KEY,x)}
    return x;
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
  function selectedItems(select){return [...select.selectedOptions].map(o=>{try{return JSON.parse(o.value)}catch{return null}}).filter(Boolean)}
  function populate(host,data,p){
    const fish=host.querySelector('#gnPushFish'),places=host.querySelector('#gnPushPlaces'),hour=host.querySelector('#gnPushHour'),threshold=host.querySelector('#gnPushThreshold');
    fish.innerHTML=data.fish.map(f=>{
      const value={id:f[0],name:f[1]};
      return '<option value="'+esc(JSON.stringify(value))+'" '+(p.fish?.some(x=>x.id===f[0])?'selected':'')+'>'+esc(f[1])+' • '+esc(f[4])+'</option>';
    }).join('');
    places.innerHTML=data.places.map(w=>{
      const value={id:w[0],name:w[1],type:w[2],region:w[3],lat:Number(w[4]),lon:Number(w[5])};
      return '<option value="'+esc(JSON.stringify(value))+'" '+(p.places?.some(x=>x.id===w[0])?'selected':'')+'>'+esc(w[1])+' • '+esc(w[2])+'</option>';
    }).join('');
    hour.value=String(p.hour||'any');threshold.value=String(p.threshold||72);
  }
  function mount(){
    const host=document.getElementById('gnNotificationCenter');if(!host||host.dataset.mounted)return;host.dataset.mounted='1';
    const data=available(),p=prefs();
    host.innerHTML='<div class="gn-push-head"><div><span class="eyebrow">SMART NOTIFICATIONS</span><h2>🔔 შენთვის მორგებული შეტყობინებები</h2><p>აირჩიე თევზი და ადგილი. საათი სურვილისამებრ მიუთითე. სერვერი არჩეულ პირობებს ყოველ 15 წუთში ამოწმებს, საიტი დახურულიც რომ იყოს — როცა შეტყობინებების სერვერი დაკავშირებულია. ქულა პირობების ინდექსია და დაჭერის ალბათობას არ წარმოადგენს. აკრძალულ სახეობებზე და მოძველებულ მონაცემზე შეტყობინება არ გაიგზავნება.</p></div><span class="gn-push-status" id="gnPushStatus">'+(p.enabled?'ჩართულია':'გამორთულია')+'</span></div>'+
    '<div class="gn-push-grid"><div><label for="gnPushFish">🐟 თევზი <small>რამდენიმეს არჩევაც შეგიძლია</small></label><select id="gnPushFish" multiple size="7"></select></div><div><label for="gnPushPlaces">📍 ადგილი <small>კოორდინატიანი ლოკაციები</small></label><select id="gnPushPlaces" multiple size="7"></select></div></div>'+
    '<div class="gn-push-controls"><div><label for="gnPushHour">🕒 სასურველი საათი</label><select id="gnPushHour"><option value="any">ნებისმიერი საათი</option>'+Array.from({length:24},(_,i)=>'<option value="'+String(i).padStart(2,'0')+'">'+String(i).padStart(2,'0')+':00</option>').join('')+'</select></div><div><label for="gnPushThreshold">📈 რა ქულიდან მოგწეროს?</label><select id="gnPushThreshold"><option value="50">50+ • შედარებით სუსტი პირობებიც</option><option value="60">60+ • მისაღები</option><option value="70">70+ • კარგი</option><option value="72">72+ • ძალიან კარგი</option><option value="80">80+ • საუკეთესო პირობები</option><option value="90">90+ • მხოლოდ მაღალი შეფასება</option></select></div></div>'+
    '<div class="gn-push-actions"><button class="btn primary" id="gnPushEnable">🔔 შენახვა და ჩართვა</button><button class="btn ghost" id="gnPushTest">📨 სატესტო შეტყობინება</button><button class="btn ghost" id="gnPushOff">გამორთვა</button></div>'+
    '<div class="gn-push-note" id="gnPushNote">აირჩიე 1–5 თევზი და 1–5 ადგილი. შემდეგ დააჭირე „შენახვა და ჩართვა“.</div>';
    populate(host,data,p);
    const status=host.querySelector('#gnPushStatus'),note=host.querySelector('#gnPushNote');
    const read=()=>({fish:selectedItems(host.querySelector('#gnPushFish')),places:selectedItems(host.querySelector('#gnPushPlaces')),hour:host.querySelector('#gnPushHour').value,threshold:Number(host.querySelector('#gnPushThreshold').value)});
    host.querySelector('#gnPushEnable').onclick=async()=>{
      const v=read();
      if(!v.fish.length||v.fish.length>5||!v.places.length||v.places.length>5){note.textContent='⚠️ აირჩიე 1–5 თევზი და 1–5 ადგილი.';return}
      const btn=host.querySelector('#gnPushEnable');btn.disabled=true;note.textContent='სერვერთან კავშირი და შეტყობინებების ნებართვა მოწმდება…';
      try{
        const next={...prefs(),...v};
        await subscribe(next);
        status.textContent='ჩართულია';note.textContent='✅ შენახულია. ქულა '+v.threshold+' ან მეტი რომ გახდება'+(v.hour==='any'?' — ნებისმიერ საათზე.':' '+v.hour+':00 საათის ფანჯარაში.')+' შეტყობინება გაიგზავნება ამ მოწყობილობაზე, თუ ახალი მონაცემი ხელმისაწვდომია.';
        await checkNow().catch(()=>{});
      }catch(e){status.textContent='ვერ ჩაირთო';note.textContent='⚠️ '+e.message}
      finally{btn.disabled=false}
    };
    host.querySelector('#gnPushTest').onclick=async()=>{
      const v=read();
      if(v.fish.length&&v.places.length){
        try{await savePreferences(v.fish,v.places,v.hour,v.threshold)}catch(e){note.textContent='⚠️ ჯერ ჩართე Push: '+e.message;return}
      }
      try{const d=await testPush();note.textContent=d.message||'📨 სატესტო შეტყობინება გაიგზავნა.'}
      catch(e){note.textContent='⚠️ სატესტო შეტყობინება ვერ გაიგზავნა: '+e.message}
    };
    host.querySelector('#gnPushOff').onclick=async()=>{
      try{await unsubscribe();status.textContent='გამორთულია';note.textContent='მოწყობილობაზე შეტყობინებები გამორთულია.'}
      catch(error){note.textContent='⚠️ '+error.message}
    };
    ensureApiConfig().then(()=>{
      if(String(location.hostname||'').toLowerCase().endsWith('.github.io')&&!apiBase()){
        status.textContent='ამჟამად მიუწვდომელია';
        note.textContent='შეტყობინებების სერვერი ჯერ დაკავშირებული არ არის. ამ საიტზე Push ახლა ვერ ჩაირთვება.';
        host.querySelector('#gnPushEnable').disabled=true;
        host.querySelector('#gnPushTest').disabled=true;
      }
    });
  }
  document.addEventListener('DOMContentLoaded',mount);
  window.GeoNaturePush={clientId,prefs,subscribe,savePreferences,testPush,checkNow,unsubscribe,mount,parseFishTemp,normalHourTags};
})();