(function(){
  'use strict';
  const SESSION_KEY='fishhunt_cloud_session_v1';
  const PLUS_KEY='geonature_plus_v1';
  const CATCH_KEY='gn_catches';
  const BACKUP_KEY='fishhunt_cloud_local_backup_v1';
  const ARCHIVE_PREFIX='fishhunt_cloud_device_records_v1:';
  const CLOUD_PATH='/api/account';
  const statuses={local:'მხოლოდ ამ მოწყობილობაზე',checking:'კავშირი მოწმდება…',ready:'სინქრონიზაცია ხელმისაწვდომია',connecting:'ანგარიშთან დაკავშირება…',syncing:'მონაცემები ინახება…',saved:'სინქრონიზებულია',offline:'ინტერნეტის კავშირი არ არის',pending:'გასაერთიანებელი მონაცემები გაქვს',conflict:'სხვა მოწყობილობიდან ცვლილებაა',error:'სინქრონიზაცია ვერ შესრულდა',expired:'ანგარიშში ხელახლა შედი',unavailable:'ამ მოწყობილობაზე შენახვა მუშაობს'};
  let available=null,healthPromise=null,status='local',message='',lastSaved=0,busy=false,applying=false,timer=null;
  let conflict=null,pending=null,profileRevision=null,stateRevision=null,resumed=false,resumePromise=null,configPromise=null,syncPromise=null;
  const panels=new Set();
  function read(storage,key){try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}}
  function text(value,max){return typeof value==='string'?value.trim().slice(0,max):'';}
  function origin(){
    const configured=String(window.GN_ACCOUNT_WORKER_ORIGIN||window.GN_AI_WORKER_ORIGIN||'').trim().replace(/\/+$/,'');
    if(!configured)return '';
    try{const url=new URL(configured);return url.pathname==='/'&&!url.search&&!url.hash&&(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))?url.origin:'';}catch{return '';}
  }
  function session(){
    for(const storage of [sessionStorage,localStorage]){
      const value=read(storage,SESSION_KEY);
      if(value&&/^[a-f0-9]{64}$/.test(value.token||'')&&Number(value.expiresAt)>Date.now()&&value.origin===origin())return value;
    }
    return null;
  }
  function blockedSession(){
    const owner=read(localStorage,BACKUP_KEY)?.owner;if(!owner)return null;
    for(const storage of [sessionStorage,localStorage]){const value=read(storage,SESSION_KEY);if(value?.user?.id===owner&&/^[a-f0-9]{64}$/.test(value.token||''))return value;}
    return null;
  }
  function clearSession(){for(const storage of [sessionStorage,localStorage]){try{storage.removeItem(SESSION_KEY);}catch{}}profileRevision=null;stateRevision=null;}
  function rawRecords(){return {plus:localStorage.getItem(PLUS_KEY),catches:localStorage.getItem(CATCH_KEY)};}
  function writeRecords(records){for(const [key,value]of [[PLUS_KEY,records.plus],[CATCH_KEY,records.catches]])value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}
  function prepareBackup(){
    if(read(localStorage,BACKUP_KEY)?.owner)return;
    try{localStorage.setItem(BACKUP_KEY,JSON.stringify({owner:null,base:rawRecords()}));}
    catch{throw new Error('უსაფრთხო გადატანისთვის ბრაუზერის საცავში ადგილი არ არის. ადგილობრივი ჩანაწერები შენარჩუნებულია.');}
  }
  function restoreLocalBaseline(){
    const backup=read(localStorage,BACKUP_KEY);if(!backup?.base)return;
    const cloud=rawRecords(),oldBackup=localStorage.getItem(BACKUP_KEY),archiveKey=backup.owner?ARCHIVE_PREFIX+backup.owner:null;
    const oldArchive=archiveKey?localStorage.getItem(archiveKey):null;
    applying=true;
    try{
      localStorage.removeItem(BACKUP_KEY);writeRecords(backup.base);
      if(archiveKey)localStorage.setItem(archiveKey,JSON.stringify({records:cloud,savedAt:Date.now()}));
      document.dispatchEvent(new CustomEvent('geonature:state'));
    }catch{
      try{writeRecords(cloud);if(oldBackup!==null)localStorage.setItem(BACKUP_KEY,oldBackup);if(archiveKey){oldArchive===null?localStorage.removeItem(archiveKey):localStorage.setItem(archiveKey,oldArchive);}}catch{}
      throw new Error('ლოკალური ჩანაწერების აღდგენა ვერ მოხერხდა. გაათავისუფლე ბრაუზერის საცავი და სცადე ხელახლა.');
    }finally{applying=false;}
  }
  function storeSession(value,remember){
    clearSession();const record={...value,origin:origin(),remember:Boolean(remember)};
    (remember?localStorage:sessionStorage).setItem(SESSION_KEY,JSON.stringify(record));
    profileRevision=value.profileRevision||null;stateRevision=value.stateRevision||null;
  }
  function updateSession(patch){const current=session();if(current)storeSession({...current,...patch},current.remember);}
  function view(){return {available,status,message:message||statuses[status]||'',connected:Boolean(session()||blockedSession()),lastSaved,busy,conflict:conflict?{kind:conflict.kind,count:conflict.revisions.length}:null,pending:Boolean(pending)};}
  function emit(next,detail=''){status=next;message=detail;renderPanels();try{document.dispatchEvent(new CustomEvent('fishhunt:sync',{detail:view()}));}catch{}}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function list(value,max){return Array.isArray(value)?value.slice(0,max):[];}
  function validateState(input){
    const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    const failure=()=>{throw new Error('სინქრონიზაციის ლიმიტს მონაცემები სცდება. ჩანაწერები არ შეცვლილა. შეამცირე სიის რაოდენობა ან გრძელი ტექსტი და ხელახლა სცადე.');};
    const string=(item,max)=>{if(item!==undefined&&item!==null&&(typeof item!=='string'||item.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item)))failure();};
    string(value.name,20);
    if(value.xp!==undefined&&(!Number.isFinite(Number(value.xp))||Number(value.xp)<0||Number(value.xp)>1e7))failure();
    for(const [key,max]of [['favorites',100],['favoriteXpNames',100],['plans',50],['catches',100],['catchLog',100]]){
      if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>max))failure();
    }
    for(const key of ['favorites','favoriteXpNames'])for(const item of value[key]||[])string(item,100);
    for(const [key,widths]of [['plans',{id:80,kind:40,title:120,meta:300,date:10}],['catches',{id:80,fish:100,place:120,date:10,note:500}],['catchLog',{id:80,species:100,place:120,date:10,time:5,bait:100,notes:500}]]){
      for(const record of value[key]||[]){
        if(!record||typeof record!=='object'||Array.isArray(record))failure();
        for(const [field,max]of Object.entries(widths)){
          const item=field==='id'&&record[field]!==undefined?String(record[field]):record[field];string(item,max);
        }
        if(!String(record.id||'').trim())failure();if(record.createdAt!==undefined&&record.createdAt!==null&&record.createdAt!==''&&(!Number.isSafeInteger(Number(record.createdAt))||Number(record.createdAt)<0))failure();
        for(const field of ['weight','length'])if(record[field]!==undefined&&record[field]!==null&&record[field]!==''&&(!Number.isFinite(Number(record[field]))||Number(record[field])<0||Number(record[field])>10000))failure();
      }
    }
    if(value.checklists!==undefined&&(!value.checklists||typeof value.checklists!=='object'||Array.isArray(value.checklists)))failure();
    const checks=Object.entries(value.checklists||{});if(checks.length>16)failure();
    for(const [key,items]of checks){if(!/^[\w:-]{1,80}$/.test(key)||!items||typeof items!=='object'||Array.isArray(items)||Object.keys(items).length>30)failure();for(const [label,checked]of Object.entries(items)){string(label,160);if(typeof checked!=='boolean')failure();}}
    return value;
  }
  function normalizeState(input,{strict=false}={}){
    const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    if(strict)validateState(value);
    const number=(n,max=1e7)=>Number.isFinite(Number(n))?Math.max(0,Math.min(max,Number(n))):0;
    const stateText=(value,max)=>typeof value==='string'?value.slice(0,max):'';
    const optionalNumber=n=>n===undefined||n===null||n===''?'':number(n,10000);
    const favorite=value=>[...new Set(list(value,100).map(item=>text(item,100)).filter(Boolean))];
    const checklists={};
    for(const [key,entries]of Object.entries(value.checklists||{}).slice(0,16)){
      const name=text(key,80);
      if(!entries||typeof entries!=='object'||Array.isArray(entries)||!/^[\w:-]{1,80}$/.test(name)||['__proto__','constructor','prototype'].includes(name))continue;
      checklists[name]={};
      for(const [label,checked]of Object.entries(entries).slice(0,30)){const clean=stateText(label,160);if(clean&&!['__proto__','constructor','prototype'].includes(clean))checklists[name][clean]=Boolean(checked);}
    }
    return {name:stateText(value.name,20),xp:number(value.xp),favorites:favorite(value.favorites),favoriteXpNames:favorite(value.favoriteXpNames),plans:list(value.plans,50).filter(item=>item&&typeof item==='object').map(item=>({id:stateText(String(item.id||''),100),kind:stateText(item.kind,40),title:stateText(item.title,160),meta:stateText(item.meta,400),date:stateText(item.date,10),createdAt:number(item.createdAt,Number.MAX_SAFE_INTEGER)})),catches:list(value.catches,100).filter(item=>item&&typeof item==='object'&&stateText(item.fish,100)).map(item=>({id:stateText(String(item.id||''),100),fish:stateText(item.fish,100),place:stateText(item.place,160),weight:optionalNumber(item.weight),date:stateText(item.date,10),note:stateText(item.note,1000),createdAt:number(item.createdAt,Number.MAX_SAFE_INTEGER)})),catchLog:list(value.catchLog,100).filter(item=>item&&typeof item==='object'&&stateText(item.species,100)).map(item=>({id:stateText(String(item.id||''),100),species:stateText(item.species,100),place:stateText(item.place,160),date:stateText(item.date,10),time:stateText(item.time,5),weight:optionalNumber(item.weight),length:optionalNumber(item.length),bait:stateText(item.bait,200),notes:stateText(item.notes,1000),createdAt:number(item.createdAt,Number.MAX_SAFE_INTEGER)})),checklists};
  }
  function snapshot(){const progress=read(localStorage,PLUS_KEY)||{};return normalizeState({...progress,catchLog:read(localStorage,CATCH_KEY)||[]},{strict:true});}
  function hasData(value){const s=normalizeState(value);return Boolean(s.favorites.length||s.plans.length||s.catches.length||s.catchLog.length||Object.keys(s.checklists).length||s.xp);}
  function mergeStates(left,right){
    const a=normalizeState(left,{strict:true}),b=normalizeState(right,{strict:true});
    const merge=(x,y)=>{const records=new Map();for(const item of [...x,...y])records.set(item.id||JSON.stringify(item),item);return [...records.values()];};
    const checklists={...a.checklists};for(const [key,values]of Object.entries(b.checklists))checklists[key]={...checklists[key],...values};
    return normalizeState({...b,name:b.name||a.name,xp:Math.max(a.xp,b.xp),favorites:[...new Set([...a.favorites,...b.favorites])],favoriteXpNames:[...new Set([...a.favoriteXpNames,...b.favoriteXpNames])],plans:merge(a.plans,b.plans),catches:merge(a.catches,b.catches),catchLog:merge(a.catchLog,b.catchLog),checklists},{strict:true});
  }
  function applyState(value){
    const clean=normalizeState(value),oldPlus=localStorage.getItem(PLUS_KEY),oldCatch=localStorage.getItem(CATCH_KEY);
    const archived=read(localStorage,ARCHIVE_PREFIX+(session()?.user?.id||''));let oldPhotos=[];try{oldPhotos=JSON.parse(archived?.records?.catches||'[]');}catch{}
    const current=read(localStorage,PLUS_KEY)||{},photos=new Map([...list(read(localStorage,CATCH_KEY),200),...list(oldPhotos,200)].filter(item=>item&&typeof item==='object').map(item=>[String(item.id),item.photo]));
    const badges=[];if(clean.catches.length+clean.catchLog.length)badges.push('first-catch');if(clean.catches.length+clean.catchLog.length>=5)badges.push('five-catches');if(clean.plans.length)badges.push('planner');if(clean.favorites.length>=3)badges.push('collector');if(clean.xp>=500)badges.push('xp500');
    applying=true;
    try{
      const {catchLog,...progress}=clean;
      localStorage.setItem(PLUS_KEY,JSON.stringify({...current,...progress,badges,photoIds:current.photoIds||[]}));
      localStorage.setItem(CATCH_KEY,JSON.stringify(clean.catchLog.map(item=>({...item,...(photos.get(item.id)?{photo:photos.get(item.id)}:{})}))));
      document.dispatchEvent(new CustomEvent('geonature:state'));
      document.dispatchEvent(new CustomEvent('fishhunt:cloud-restored'));
    }catch(error){
      try{oldPlus===null?localStorage.removeItem(PLUS_KEY):localStorage.setItem(PLUS_KEY,oldPlus);oldCatch===null?localStorage.removeItem(CATCH_KEY):localStorage.setItem(CATCH_KEY,oldCatch);}catch{}
      throw new Error('მონაცემების ჩატვირთვა ვერ შეინახა — ბრაუზერის საცავი მიუწვდომელია.');
    }finally{applying=false;}
    return clean;
  }
  async function call(path,{method='GET',body,token,skipSession=false}={}){
    const base=origin();if(!base)throw new Error('სინქრონიზაცია ჯერ ხელმისაწვდომი არ არის. შენი მონაცემები ამ მოწყობილობაზე ინახება.');
    const current=skipSession?null:session();const bearer=token||current?.token;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(base+CLOUD_PATH+path,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store',credentials:'omit'});
      let value={};try{value=await response.json();}catch{}
      if(!response.ok){const error=new Error(value.message||'ანგარიშის სერვერთან კავშირი ვერ მოხერხდა.');error.status=response.status;error.data=value;if(response.status===401&&!skipSession){restoreLocalBaseline();clearSession();emit('expired');}if(response.status===409&&value.conflict){conflict={kind:path==='/profile'?'profile':'state',revisions:list(value.revisions,20)};updateSession({syncBlocked:'conflict'});emit('conflict',error.message);}throw error;}
      return value;
    }catch(error){if(!error.status)emit(navigator.onLine===false?'offline':'error','კავშირი ვერ შედგა. მოწყობილობაზე შენახული ჩანაწერები შენარჩუნებულია.');throw error;}finally{clearTimeout(timeout);}
  }
  async function configuration(){
    if(window.__GN_API_CONFIG_LOADED||origin())return;
    if(!configPromise)configPromise=new Promise(resolve=>{
      const existing=document.querySelector('script[src*="js/api-config.js"]');
      if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',resolve,{once:true});return;}
      const script=document.createElement('script');script.src=new URL('js/api-config.js',document.baseURI).href;script.onload=resolve;script.onerror=resolve;document.head.appendChild(script);
    });
    await configPromise;
  }
  async function ready({force=false}={}){
    if(available!==null&&!force)return available;
    if(healthPromise)return healthPromise;
    healthPromise=(async()=>{
      await configuration();
      if(!session()&&read(localStorage,BACKUP_KEY)?.owner){restoreLocalBaseline();clearSession();}
      if(!origin()){available=false;emit('unavailable');return false;}
      if(!session())emit('checking');
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
      try{const response=await fetch(origin()+'/api/health',{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store',credentials:'omit'});const health=await response.json();available=Boolean(response.ok&&health.accountConfigured===true);emit(available?(session()?'saved':'ready'):'unavailable',available?'':'სინქრონიზაცია ჯერ ხელმისაწვდომი არ არის. შენი მონაცემები ამ მოწყობილობაზე ინახება.');return available;}catch{available=false;emit(navigator.onLine===false?'offline':'unavailable');return false;}finally{clearTimeout(timeout);healthPromise=null;}
    })();return healthPromise;
  }
  async function request(path,options={}){
    const current=session()||blockedSession();if(!current)throw new Error('სინქრონიზაციის ანგარიშში შესვლა საჭიროა.');
    if(!session()){
      if(path==='/me')return {ok:true,user:current.user,profile:current.profile,cloudMode:true,offline:true,readOnly:true,localMode:false};
      if(path==='/profile'&&(options.method||'GET')==='GET')return {ok:true,profile:current.profile,cloudMode:true,offline:true,readOnly:true,localMode:false};
      if(path==='/signout'){restoreLocalBaseline();clearSession();emit('local');return {ok:true};}
      throw new Error('ჩანაწერების უსაფრთხოდ აღსადგენად გაათავისუფლე ბრაუზერის საცავი და სცადე ხელახლა.');
    }
    if(path==='/signout'){try{return await call('/signout',{method:'POST',body:{}});}finally{restoreLocalBaseline();clearSession();emit('local');}}
    if(path==='/me'){
      try{const value=await call('/me');profileRevision=value.revision||null;updateSession({user:value.user,profile:value.profile,profileRevision});await resume();return {...value,cloudMode:true,localMode:false};}
      catch(error){if((!error.status||error.status>=500)&&current.user)return {ok:true,user:current.user,profile:current.profile,cloudMode:true,offline:true,localMode:false};throw error;}
    }
    if(path==='/profile'){
      const patch=(options.method||'GET')==='PATCH';
      const payload=patch?JSON.parse(options.body||'{}'):null;
      if(patch&&['first-catch','explorer','champion'].includes(payload.avatarFrame)&&session()?.lastSyncedFingerprint!==JSON.stringify(snapshot())){
        if(pending||conflict||session()?.syncBlocked)throw new Error('ჩარჩოს შენახვამდე აირჩიე ჩანაწერების გაერთიანება ან სერვერიდან ჩატვირთვა.');
        await sync();
      }
      try{const value=await call('/profile',patch?{method:'PATCH',body:{...payload,baseRevision:profileRevision||current.profileRevision||null}}:{});profileRevision=value.revision||null;updateSession({profile:value.profile,user:{...current.user,...value.profile},profileRevision});if(patch){lastSaved=Date.now();emit('saved');}return {...value,cloudMode:true,localMode:false};}
      catch(error){if(!patch&&(!error.status||error.status>=500)&&current.profile)return {ok:true,profile:current.profile,cloudMode:true,offline:true,localMode:false};throw error;}
    }
    throw new Error('ანგარიშის ეს მოქმედება არ არის მხარდაჭერილი.');
  }
  async function connect({mode='signin',email,password,remember=false,consent=false}={}){
    if(!consent)throw new Error('მონაცემების სინქრონიზაციისთვის მონიშნე თანხმობა.');
    if(session())throw new Error('სხვა ანგარიშში შესვლამდე გათიშე მიმდინარე ანგარიშის სინქრონიზაცია.');
    if(!await ready())throw new Error('სინქრონიზაცია ჯერ ხელმისაწვდომი არ არის. შენი მონაცემები ამ მოწყობილობაზე ინახება.');
    let local=snapshot(),localProfile=null;
    if(mode==='signup'&&window.GeoNatureAuth?.request){try{localProfile=(await window.GeoNatureAuth.request('/profile'))?.profile||null;}catch{}}
    prepareBackup();busy=true;emit('connecting');
    try{
      const freeAvatars=['free-fish','free-leaf','free-camp','free-fox','free-wave','free-ranger'];
      const freeBackgrounds=['bg-fishing-lake','bg-fishing-rod','bg-fish','bg-forest','bg-mountains','bg-lake'];
      const profile={displayName:text(localProfile?.displayName,20)||(local.name&&local.name!=='GeoNature Explorer'&&local.name!=='FishHunt Explorer'?local.name:'მკვლევარი'),avatarId:freeAvatars.includes(localProfile?.avatarId)?localProfile.avatarId:'free-fish',backgroundId:freeBackgrounds.includes(localProfile?.backgroundId)?localProfile.backgroundId:'bg-fishing-lake',nameColor:'default',avatarFrame:'none'};
      const result=await call(mode==='signup'?'/signup':'/signin',{method:'POST',body:{email,password,remember,...(mode==='signup'?{profile}:{})},skipSession:true});
      if(!/^[a-f0-9]{64}$/.test(result.token||'')||!result.user)throw new Error('ანგარიშში შესვლა ვერ დადასტურდა.');
      const backup=read(localStorage,BACKUP_KEY);localStorage.setItem(BACKUP_KEY,JSON.stringify({...backup,owner:result.user.id}));
      storeSession({token:result.token,expiresAt:result.expiresAt,user:result.user,profile:result.profile,profileRevision:result.revision||null},remember);
      localStorage.setItem('gn_plan',result.user.plan||'free');
      const archived=read(localStorage,ARCHIVE_PREFIX+result.user.id);
      if(mode==='signin'&&archived?.records){const oldPlus=(()=>{try{return JSON.parse(archived.records.plus||'{}');}catch{return {};}})(),oldCatches=(()=>{try{return JSON.parse(archived.records.catches||'[]');}catch{return [];}})();local=mergeStates(local,{...oldPlus,catchLog:oldCatches});}
      const remote=await call('/state');stateRevision=remote.revision||null;updateSession({stateRevision});
      if(hasData(local)){
        pending={local,remote:remote.state||null,revision:stateRevision};
        updateSession({syncBlocked:'pending'});
        emit('pending','აირჩიე, როგორ შეინახოს ამ მოწყობილობის ჩანაწერები. ფოტოები მხოლოდ მოწყობილობაზე რჩება.');
      }else if(remote.state){applyState(remote.state);updateSession({syncBlocked:null,lastSyncedFingerprint:JSON.stringify(snapshot())});lastSaved=remote.savedAt||Date.now();emit('saved');}
      else {updateSession({lastSyncedFingerprint:JSON.stringify(snapshot())});emit('saved');}
      resumed=true;
      document.dispatchEvent(new CustomEvent('fishhunt:account-connected',{detail:{pending:Boolean(pending)}}));
      return {user:result.user,pending:Boolean(pending)};
    }finally{busy=false;renderPanels();}
  }
  function sync(options={}){
    if(syncPromise)return syncPromise.then(result=>{
      if(Object.keys(options).length)return sync(options);
      return session()&&!pending&&!conflict&&session().lastUploadedFingerprint!==JSON.stringify(snapshot())?sync():result;
    });
    syncPromise=performSync(options).finally(()=>{syncPromise=null;});return syncPromise;
  }
  async function performSync({state,baseRevision,resolveRevisions}={}){
    if(!session())return false;
    if(session()?.syncBlocked&&!state&&!resolveRevisions){await resume();emit(pending?'pending':'conflict');return false;}
    if(pending&&!state){emit('pending');return false;}
    if(conflict&&!resolveRevisions){emit('conflict');return false;}
    busy=true;emit('syncing');
    try{const sent=normalizeState(state||snapshot(),{strict:true});const fingerprint=JSON.stringify(sent),size=new TextEncoder().encode(fingerprint).length;if(size>95000)throw new Error('სინქრონიზაციის მონაცემები დიდია. შეამცირე გრძელი ჩანაწერები და ხელახლა სცადე.');const result=await call('/state',{method:'PUT',body:{state:sent,baseRevision:baseRevision===undefined?(stateRevision||session()?.stateRevision||null):baseRevision,...(resolveRevisions?{resolveRevisions}:{})}});const canonical=normalizeState(result.state||sent);stateRevision=result.revision||null;updateSession({stateRevision,syncBlocked:null,lastSyncedFingerprint:JSON.stringify(canonical),lastUploadedFingerprint:fingerprint});lastSaved=result.savedAt||Date.now();pending=null;conflict=null;emit('saved');return result;}catch(error){if(error.status!==409)emit(navigator.onLine===false?'offline':'error',error.message);throw error;}finally{busy=false;renderPanels();}
  }
  async function resolvePending(choice){
    if(!pending)return false;const value=pending;
    if(choice==='cloud'){if(value.remote)applyState(value.remote);else applyState({});pending=null;updateSession({syncBlocked:null,lastSyncedFingerprint:JSON.stringify(snapshot())});lastSaved=Date.now();emit('saved');return true;}
    const merged=choice==='merge'?mergeStates(value.local,value.remote):value.local;
    const result=await sync({state:merged,baseRevision:value.revision});applyState(result.state||merged);return true;
  }
  async function resolveConflict(choice,index=0){
    if(!conflict)return false;const value=conflict;
    if(value.kind==='profile'){
      const selected=value.revisions[index];if(!selected?.profile)throw new Error('სერვერის პროფილი ხელახლა ჩატვირთე.');
      const result=await call('/profile',{method:'PATCH',body:{...selected.profile,baseRevision:null,resolveRevisions:value.revisions.map(item=>item.revision)}});
      updateSession({profile:result.profile,user:{...session()?.user,...result.profile},profileRevision:result.revision,syncBlocked:pending?'pending':null});profileRevision=result.revision;conflict=null;emit('saved');return true;
    }
    const remote=value.revisions.map(item=>item.state).filter(Boolean);
    const selected=choice==='cloud'?remote[index]||normalizeState({}):remote.reduce((combined,item)=>mergeStates(combined,item),snapshot());
    const result=await sync({state:selected,baseRevision:null,resolveRevisions:value.revisions.map(item=>item.revision)});applyState(result.state||selected);return true;
  }
  async function restore(){
    if(!session())return false;const result=await call('/state');stateRevision=result.revision||null;updateSession({stateRevision});
    if(hasData(snapshot())&&result.state){pending={local:snapshot(),remote:result.state,revision:stateRevision};updateSession({syncBlocked:'pending'});emit('pending');return false;}
    if(result.state)applyState(result.state);updateSession({lastSyncedFingerprint:JSON.stringify(snapshot())});lastSaved=result.savedAt||Date.now();emit('saved');return true;
  }
  async function resume(){
    if(resumed||!session())return;
    if(resumePromise)return resumePromise;
    resumePromise=(async()=>{
      const saved=session(),remote=await call('/state');stateRevision=remote.revision||null;updateSession({stateRevision});
      if(saved.syncBlocked||remote.revision!==saved.stateRevision&&saved.lastSyncedFingerprint!==JSON.stringify(snapshot())&&hasData(snapshot())){pending={local:snapshot(),remote:remote.state||null,revision:stateRevision};updateSession({syncBlocked:'pending'});emit('pending');}
      else if(remote.state&&remote.revision!==saved.stateRevision){applyState(remote.state);updateSession({lastSyncedFingerprint:JSON.stringify(snapshot())});lastSaved=remote.savedAt||Date.now();emit('saved');}
      resumed=true;
    })().finally(()=>{resumePromise=null;});return resumePromise;
  }
  async function disconnect(){
    clearTimeout(timer);
    try{if(session()||blockedSession())await request('/signout');}
    catch(error){if(read(localStorage,BACKUP_KEY)?.owner){emit('error',error.message);throw error;}}
    clearSession();pending=null;conflict=null;resumed=false;emit('local');
  }
  function schedule(){if(applying||!session()||session().syncBlocked||pending||conflict)return;clearTimeout(timer);emit(navigator.onLine===false?'offline':'syncing');timer=setTimeout(()=>sync().catch(()=>{}),1400);}
  function escape(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function renderPanels(){
    for(const panel of panels){
      if(!panel.isConnected){panels.delete(panel);continue;}
      const open=panel.open,values={};panel.querySelectorAll('input,select').forEach(field=>{values[field.name]=field.type==='checkbox'?field.checked:field.value;});
      const connected=Boolean(session()||blockedSession());
      const last=lastSaved?new Date(lastSaved).toLocaleString('ka-GE',{timeZone:'Asia/Tbilisi'}):'';
      panel.innerHTML=`<summary><span>☁ ანგარიშის სინქრონიზაცია</span><small>${escape(statuses[status]||statuses.local)}</small></summary><div class="fh-sync-body"><p class="fh-sync-message" role="status" aria-live="polite">${escape(message||statuses[status]||'')}${last?' · '+escape(last):''}</p>${!available&&!connected?'<button type="button" class="btn ghost" data-sync-action="check">კავშირის შემოწმება</button>':connected?`<p class="fh-sync-note">რჩეულები, გეგმები და დაჭერის ჩანაწერები ინახება შენს ანგარიშში. ფოტოები ამ მოწყობილობაზე რჩება. სინქრონიზაციის ლიმიტია 100 რჩეული, 50 გეგმა და თითოეულ დღიურში 100 დაჭერა; ლიმიტს მიღმა მონაცემები ავტომატურად არ იჭრება.</p>${pending?'<div class="fh-sync-choice"><b>ამ მოწყობილობაზეც გაქვს ჩანაწერები</b><p>გაერთიანება ორივე მხარის ჩანაწერებს შეინარჩუნებს. სერვერიდან ჩატვირთვა ამ მოწყობილობის სიებს შეცვლის.</p><button type="button" class="btn primary" data-sync-action="merge-pending">გაერთიანება და შენახვა</button><button type="button" class="btn ghost" data-sync-action="cloud-pending">სერვერიდან ჩატვირთვა</button><button type="button" class="btn ghost" data-sync-action="local-pending">ამ მოწყობილობის ატვირთვა</button></div>':''}${conflict?`<div class="fh-sync-choice"><b>სხვა მოწყობილობიდან ცვლილებაა</b><p>აირჩიე, რომ შენახული ცვლილებები შემთხვევით არ დაიკარგოს.</p>${conflict.kind==='state'?'<button type="button" class="btn primary" data-sync-action="merge-conflict">ყველა ჩანაწერის გაერთიანება</button>':''}<button type="button" class="btn ghost" data-sync-action="cloud-conflict">სერვერის ვერსიის გამოყენება</button></div>`:''}<div class="fh-sync-actions"><button type="button" class="btn primary" data-sync-action="save">ახლა სინქრონიზაცია</button><button type="button" class="btn ghost" data-sync-action="restore">სერვერიდან ჩატვირთვა</button><button type="button" class="btn ghost" data-sync-action="disconnect">სინქრონიზაციის გათიშვა</button></div>`:`<form class="fh-sync-form"><p class="fh-sync-note">შექმენი სინქრონიზაციის ანგარიში ან შედი სხვა ტელეფონზე უკვე შექმნილი ანგარიშით. არსებული ლოკალური ანგარიში შენარჩუნდება. Plus-ის შეძენა აქ არ ხდება; ახალი ანგარიში უფასოა.</p><label>მოქმედება<select name="mode"><option value="signin">არსებულ ანგარიშში შესვლა</option><option value="signup">სინქრონიზაციის ანგარიშის შექმნა</option></select></label><label>ელფოსტა<input name="email" type="email" autocomplete="username" maxlength="160" required></label><label>პაროლი<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><label class="fh-sync-checkbox"><input name="remember" type="checkbox">დამიმახსოვრე ამ მოწყობილობაზე</label><label class="fh-sync-checkbox"><input name="consent" type="checkbox" required>მსურს პროფილისა და ჩანაწერების სინქრონიზაცია</label><p class="fh-sync-note">უფასო ავატარი და ფონი ახალ ანგარიშშიც გადაგყვება. Plus-ის ფერები და სტილები ახალ უფასო ანგარიშში ავტომატურად არ გადაიტანება. პაროლის აღდგენის ელფოსტა ჯერ არ იგზავნება — შეინახე პაროლი.</p><button class="btn primary" type="submit">ანგარიშთან დაკავშირება</button></form>`}</div>`;
      panel.open=open;
      panel.querySelectorAll('input,select').forEach(field=>{if(values[field.name]!==undefined){if(field.type==='checkbox')field.checked=values[field.name];else field.value=values[field.name];}});
      panel.querySelectorAll('button').forEach(button=>{button.disabled=busy;});
      panel.querySelector('form')?.addEventListener('submit',async event=>{
        event.preventDefault();const form=event.currentTarget,fields=new FormData(form);
        try{await connect({mode:fields.get('mode'),email:fields.get('email'),password:fields.get('password'),remember:fields.has('remember'),consent:fields.has('consent')});if(!pending)location.reload();else emit('pending');}catch(error){emit(error.status===409?'conflict':'error',error.message);}
      });
      panel.querySelectorAll('[data-sync-action]').forEach(button=>button.addEventListener('click',async()=>{
        try{const action=button.dataset.syncAction;
          if(action==='check'){await ready({force:true});return;}
          if(action==='save')await sync();
          else if(action==='restore')await restore();
          else if(action==='disconnect'){await disconnect();location.reload();}
          else if(action.endsWith('-pending')){await resolvePending(action.split('-')[0]);location.reload();}
          else if(action.endsWith('-conflict')){await resolveConflict(action.split('-')[0]);location.reload();}
        }catch(error){emit(error.status===409?'conflict':'error',error.message);}
      }));
    }
    configureAuthScope();
  }
  function configureAuthScope(){
    const form=document.getElementById('authForm');if(!form)return;
    const profile=document.querySelector('#gnProfilePanel .gn-profile-content'),panel=form.parentElement.querySelector('.fh-account-sync');
    let scope=document.getElementById('fhAuthScope');
    const localNodes=[form,document.getElementById('modeSignin'),document.getElementById('modeSignup'),document.getElementById('switchHint')].filter(Boolean);
    if(!available||profile||!panel){if(scope){localNodes.forEach(node=>{node.hidden=false;});scope.remove();}return;}
    if(!scope){
      scope=document.createElement('div');scope.id='fhAuthScope';scope.className='fh-auth-scope';scope.setAttribute('role','group');scope.setAttribute('aria-label','ანგარიშის ტიპი');
      scope.innerHTML='<button type="button" data-auth-scope="cloud">სინქრონიზებული ანგარიში</button><button type="button" data-auth-scope="local">ამ მოწყობილობის ანგარიში</button>';
      form.before(scope);
      scope.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{try{sessionStorage.setItem('fishhunt_auth_scope_v1',button.dataset.authScope);}catch{}configureAuthScope();}));
    }
    let choice='cloud';try{choice=sessionStorage.getItem('fishhunt_auth_scope_v1')||'cloud';}catch{}
    const local=choice==='local';localNodes.forEach(node=>{node.hidden=!local;});panel.hidden=local;if(!local)panel.open=true;
    scope.querySelectorAll('button').forEach(button=>{const selected=button.dataset.authScope===(local?'local':'cloud');button.setAttribute('aria-pressed',String(selected));button.classList.toggle('selected',selected);});
  }
  function mount(host){if(!host||host.querySelector('.fh-account-sync'))return;const panel=document.createElement('details');panel.className='fh-account-sync';panels.add(panel);const gallery=host.closest('#gnProfilePanel')?host.querySelector('.gn-profile-avatar-title'):null;if(gallery)gallery.before(panel);else host.appendChild(panel);renderPanels();}
  function mountAll(){const profile=document.querySelector('#gnProfilePanel .gn-profile-content'),form=document.getElementById('authForm');if(profile){const old=form?.parentElement?.querySelector('.fh-account-sync');if(old){panels.delete(old);old.remove();}mount(profile);}else if(form)mount(form.parentElement);const dashboard=document.getElementById('gnDashboard');if(dashboard)mount(dashboard);configureAuthScope();}
  function init(){
    mountAll();if(typeof MutationObserver==='function')new MutationObserver(mountAll).observe(document.body,{childList:true,subtree:true});
    ready().catch(()=>{});document.addEventListener('geonature:state',schedule);document.addEventListener('fishhunt:local-records',schedule);
    window.addEventListener('storage',event=>{if([PLUS_KEY,CATCH_KEY].includes(event.key))schedule();});
    window.addEventListener('online',()=>{ready({force:true}).then(()=>{if(session())sync().catch(()=>{});});});
    window.addEventListener('offline',()=>{if(session())emit('offline');});
  }
  window.FishHuntAccountSync={ready,request,handles:path=>Boolean(session()||blockedSession())&&['/me','/profile','/signout'].includes(path),connect,disconnect,sync,restore,resolvePending,resolveConflict,snapshot,normalizeState,mergeStates,applyState,view,sessionActive:()=>Boolean(session())};
  if(read(localStorage,BACKUP_KEY)?.owner){
    const active=[sessionStorage,localStorage].some(storage=>{const value=read(storage,SESSION_KEY);return value&&/^[a-f0-9]{64}$/.test(value.token||'')&&Number(value.expiresAt)>Date.now();});
    if(!active){try{restoreLocalBaseline();clearSession();}catch(error){message=error.message;status='error';}}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
