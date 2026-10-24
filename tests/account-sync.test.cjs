'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {webcrypto}=require('node:crypto');
if(!global.crypto)global.crypto=webcrypto;
const source=fs.readFileSync(require.resolve('../js/account-sync.js'),'utf8');
const origin='https://niksaniksa25.github.io',workerOrigin='https://fishhunt-fixture.example.workers.dev';
const credentials={email:'sync-private@example.test',password:'private-password-123',consent:true,remember:true};
class DOStorage{
  constructor(){this.values=new Map();}
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){this.values.set(key,structuredClone(value));}
  async delete(key){this.values.delete(key);}
  async transaction(run){const before=new Map(structuredClone([...this.values]));try{return await run(this);}catch(error){this.values=before;throw error;}}
}
function storage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
async function service({configured=true}={}){
  const module=await import(pathToFileURL(require.resolve('../worker/fishhunt-ai.mjs')).href);
  const data=new DOStorage(),object=new module.FishHuntAccountsDO({storage:data},{});
  const env=configured?{FISHHUNT_ACCOUNTS:{idFromName:name=>name,get:()=>object}}:{};
  const calls=[];
  return {data,calls,async fetch(url,options={}){const request=new Request(url,{...options,headers:{...options.headers,Origin:origin,'CF-Connecting-IP':'192.0.2.99'}});calls.push({url,method:options.method||'GET',body:options.body,headers:request.headers});return module.default.fetch(request,env);}};
}
function browser(server,{local=storage(),tab=storage()}={}){
  let offline=false;
  const context={localStorage:local,sessionStorage:tab,URL,TextEncoder,AbortController,crypto:webcrypto,setTimeout,clearTimeout,navigator:{onLine:true},location:{reload(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},document:{addEventListener(){},dispatchEvent(){},getElementById(){return null;},querySelectorAll(){return [];},querySelector(){return null;}},addEventListener(){},__GN_API_CONFIG_LOADED:true,GN_ACCOUNT_WORKER_ORIGIN:workerOrigin,fetch:async(...args)=>{if(offline)throw new TypeError('Simulated offline');return server.fetch(...args);}};
  context.window=context;vm.runInNewContext(source,context);
  return {api:context.FishHuntAccountSync,context,local,tab,setOffline(value){offline=value;context.navigator.onLine=!value;},seed(value,records=[]){local.setItem('geonature_plus_v1',JSON.stringify(value));local.setItem('gn_catches',JSON.stringify(records));}};
}
function favorites(client){return JSON.parse(client.local.getItem('geonature_plus_v1')).favorites;}

test('old Worker capability leaves local accounts and records unchanged',async()=>{
  const server=await service({configured:false}),client=browser(server);
  client.local.setItem('geonature_local_users_v5','[{"email":"local@example.test"}]');client.seed({favorites:['ჟინვალი']});
  assert.equal(await client.api.ready(),false);
  await assert.rejects(client.api.connect({...credentials,mode:'signup'}),/ხელმისაწვდომი არ არის/);
  assert.equal(client.api.sessionActive(),false);assert.deepEqual(favorites(client),['ჟინვალი']);
  assert.equal(client.local.getItem('geonature_local_users_v5'),'[{"email":"local@example.test"}]');
  assert.ok(server.calls.every(call=>call.method==='GET'));
});

test('connection locks immediately during optional profile preparation and never posts twice',async()=>{
  const server=await service(),client=browser(server);let releaseProfile;
  client.context.GeoNatureAuth={request:()=>new Promise(resolve=>{releaseProfile=resolve;})};
  const pending=client.api.connect({...credentials,mode:'signup'});
  assert.equal(client.api.view().busy,true);
  for(let attempt=0;!releaseProfile&&attempt<20;attempt++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof releaseProfile,'function');
  await assert.rejects(client.api.connect({...credentials,mode:'signup'}),/მიმდინარეობს/);
  releaseProfile({profile:{displayName:'მეგობარი',avatarId:'free-fox',backgroundId:'bg-forest'}});
  await pending;
  assert.equal(server.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/signup')).length,1);
  assert.equal(client.api.view().busy,false);
});

test('invalid local transfer data releases connection controls and allows a corrected retry',async()=>{
  const server=await service(),client=browser(server);
  client.seed({name:'მეგობარი',catches:Array.from({length:101},(_,i)=>({id:String(i),fish:'კობრი'}))});
  await assert.rejects(client.api.connect({...credentials,mode:'signup'}),/ლიმიტს/);
  assert.equal(client.api.view().busy,false);
  assert.equal(server.calls.filter(call=>call.method==='POST').length,0);
  client.seed({name:'მეგობარი'});
  await client.api.connect({...credentials,mode:'signup'});
  assert.equal(client.api.sessionActive(),true);
  assert.equal(client.api.view().busy,false);
});

test('explicit consent and transfer choice precede every first local upload, including reload',async()=>{
  const server=await service(),first=browser(server);
  first.seed({name:'გიორგი',favorites:['ჟინვალი'],xp:25});
  await assert.rejects(first.api.connect({...credentials,mode:'signup',consent:false}),/თანხმობა/);assert.equal(server.calls.length,0);
  const connected=await first.api.connect({...credentials,mode:'signup'});assert.equal(connected.pending,true);
  assert.equal(server.calls.filter(call=>call.method==='PUT').length,0);assert.equal(await first.api.sync(),false);
  const refreshed=browser(server,{local:first.local,tab:first.tab});
  await refreshed.api.request('/me');assert.equal(refreshed.api.view().pending,true);assert.equal(await refreshed.api.sync(),false);
  assert.equal(server.calls.filter(call=>call.method==='PUT').length,0);
  await refreshed.api.resolvePending('merge');assert.equal(server.calls.filter(call=>call.method==='PUT').length,1);
  assert.equal(refreshed.api.view().pending,false);assert.equal(refreshed.api.view().status,'saved');
});

test('real Worker account restores profile, favorites and records into a separate browser without photos or credentials',async()=>{
  const server=await service(),first=browser(server);
  first.seed({name:'გიორგი',favorites:['ჟინვალი','თბილისის ზღვა'],plans:[{id:'plan-1',title:'დილა',kind:'fishing',date:'2026-10-23'}],catches:[{id:'first',fish:'კობრი',place:'ჟინვალი',weight:2,date:'2026-10-23'}],xp:50,password:'do-not-transfer',plan:'pro'},[{id:'photo-record',species:'კობრი',place:'ტბა',date:'2026-10-23',photo:'data:image/jpeg;base64,AAAA'}]);
  await first.api.connect({...credentials,mode:'signup'});await first.api.resolvePending('merge');
  await first.api.request('/profile',{method:'PATCH',body:JSON.stringify({displayName:'გიორგი',avatarId:'free-fox',backgroundId:'bg-fishing-lake',nameColor:'default',avatarFrame:'first-catch'})});
  const second=browser(server);await second.api.connect({...credentials,mode:'signin'});
  const user=await second.api.request('/me'),profile=await second.api.request('/profile');
  assert.equal(user.user.displayName,'გიორგი');assert.equal(user.user.plan,'free');assert.equal(profile.profile.avatarId,'free-fox');assert.equal(profile.profile.avatarFrame,'first-catch');
  assert.deepEqual(favorites(second),['ჟინვალი','თბილისის ზღვა']);assert.equal(second.api.snapshot().catches[0].fish,'კობრი');assert.equal(second.api.snapshot().catchLog[0].species,'კობრი');
  assert.equal(JSON.parse(second.local.getItem('gn_catches'))[0].photo,undefined);
  const writes=server.calls.filter(call=>call.method==='PUT').map(call=>call.body).join('');assert.doesNotMatch(writes,/data:image|do-not-transfer|"plan":|passwordHash|passwordSalt/);
  assert.equal(JSON.parse(first.local.getItem('gn_catches'))[0].photo,'data:image/jpeg;base64,AAAA');
});

test('concurrent device updates require an explicit merge rather than overwriting acknowledged state',async()=>{
  const server=await service(),first=browser(server),second=browser(server);
  await first.api.connect({...credentials,mode:'signup'});first.seed({favorites:['A']});await first.api.sync();
  await second.api.connect({...credentials,mode:'signin'});first.seed({favorites:['A','B']});await first.api.sync();
  second.seed({favorites:['A','C']});await assert.rejects(second.api.sync(),error=>error.status===409);
  assert.equal(second.api.view().status,'conflict');assert.equal(second.api.view().conflict.kind,'state');
  assert.equal(await second.api.sync(),false);
  await second.api.resolveConflict('merge');assert.deepEqual(new Set(favorites(second)),new Set(['A','B','C']));
  await first.api.restore();assert.equal(first.api.view().pending,true);await first.api.resolvePending('cloud');assert.deepEqual(new Set(favorites(first)),new Set(['A','B','C']));
});

test('profile conflicts preserve the server name until a user chooses its version',async()=>{
  const server=await service(),first=browser(server),second=browser(server);
  await first.api.connect({...credentials,mode:'signup'});await second.api.connect({...credentials,mode:'signin'});
  await first.api.request('/profile',{method:'PATCH',body:JSON.stringify({displayName:'გიორგი'})});
  await assert.rejects(second.api.request('/profile',{method:'PATCH',body:JSON.stringify({displayName:'ნიკა'})}),error=>error.status===409);
  assert.equal(second.api.view().conflict.kind,'profile');await second.api.resolveConflict('cloud');
  assert.equal((await second.api.request('/profile')).profile.displayName,'გიორგი');const reloaded=browser(server,{local:second.local,tab:second.tab});await reloaded.api.request('/me');assert.equal(reloaded.api.view().pending,false);assert.equal(JSON.parse(second.local.getItem('fishhunt_cloud_session_v1')).syncBlocked,null);
});

test('offline failures keep local records and saved profile while signout still clears the local cloud session',async()=>{
  const server=await service(),client=browser(server);client.seed({favorites:['საწყისი']});await client.api.connect({...credentials,mode:'signup'});await client.api.resolvePending('merge');
  const saved=(await client.api.request('/profile')).profile.displayName;client.seed({favorites:['შენარჩუნებული']});client.setOffline(true);
  await assert.rejects(client.api.sync());assert.equal(client.api.view().status,'offline');assert.deepEqual(favorites(client),['შენარჩუნებული']);
  assert.equal((await client.api.request('/profile')).profile.displayName,saved);
  await assert.rejects(client.api.request('/profile',{method:'PATCH',body:JSON.stringify({displayName:'არ შეინახა'})}));
  assert.equal((await client.api.request('/profile')).profile.displayName,saved);
  await client.api.disconnect();assert.equal(client.api.sessionActive(),false);assert.deepEqual(favorites(client),['საწყისი']);assert.ok([...client.local.values.keys()].some(key=>key.startsWith('fishhunt_cloud_device_records_v1:')));
});

test('a failed restore rolls back both browser record stores and retains existing photos',async()=>{
  const server=await service(),client=browser(server);client.seed({name:'ძველი',favorites:['ძველი']},[{id:'one',species:'კობრი',photo:'data:image/jpeg;base64,AAAA'}]);
  const before=[client.local.getItem('geonature_plus_v1'),client.local.getItem('gn_catches')];const original=client.local.setItem;let fail=true;
  client.local.setItem=(key,value)=>{if(key==='gn_catches'&&fail){fail=false;throw Error('quota');}return original(key,value);};
  assert.throws(()=>client.api.applyState({name:'ახალი',favorites:['ახალი'],catchLog:[{id:'one',species:'კობრი'}]}),/საცავი/);
  assert.deepEqual([client.local.getItem('geonature_plus_v1'),client.local.getItem('gn_catches')],before);
});

test('a nonremembered cloud sign-in remains tab-scoped and logout revokes its real server token',async()=>{
  const server=await service(),client=browser(server);await client.api.connect({...credentials,remember:false,mode:'signup'});
  assert.equal(client.local.getItem('fishhunt_cloud_session_v1'),null);assert.ok(client.tab.getItem('fishhunt_cloud_session_v1'));
  assert.equal(browser(server,{local:client.local}).api.sessionActive(),false);
  const stored=JSON.parse(client.tab.getItem('fishhunt_cloud_session_v1'));await client.api.disconnect();
  const response=await server.fetch(workerOrigin+'/api/account/me',{headers:{Authorization:'Bearer '+stored.token}});assert.equal(response.status,401);
});

test('oversized local catch lists and notes never get clipped, uploaded or rewritten',async()=>{
  for(const raw of [{catches:Array.from({length:101},(_,index)=>({id:'fish-'+index,fish:'კობრი',note:'შენარჩუნებული'}))},{catches:[{id:'long',fish:'კობრი',note:'x'.repeat(700)}]}]){
    const server=await service(),client=browser(server);await client.api.connect({...credentials,mode:'signup'});client.seed(raw);
    const before=client.local.getItem('geonature_plus_v1');
    await assert.rejects(client.api.sync(),/ლიმიტს/);
    assert.equal(client.local.getItem('geonature_plus_v1'),before);assert.equal(server.calls.filter(call=>call.method==='PUT').length,0);
  }
});

test('an explicit merge above the cloud record limit preserves both original lists',async()=>{
  const server=await service(),first=browser(server),second=browser(server);
  await first.api.connect({...credentials,mode:'signup'});first.seed({catches:Array.from({length:60},(_,index)=>({id:'first-'+index,fish:'კობრი'}))});await first.api.sync();
  second.seed({catches:Array.from({length:60},(_,index)=>({id:'second-'+index,fish:'კობრი'}))});const before=second.local.getItem('geonature_plus_v1');
  await second.api.connect({...credentials,mode:'signin'});await assert.rejects(second.api.resolvePending('merge'),/ლიმიტს/);
  assert.equal(second.local.getItem('geonature_plus_v1'),before);assert.equal(first.api.snapshot().catches.length,60);assert.equal(server.calls.filter(call=>call.method==='PUT').length,1);assert.equal(second.api.view().pending,true);
});

test('free profile choices transfer with consent while paid cosmetics do not self-upgrade a cloud account',async()=>{
  const server=await service(),client=browser(server);client.seed({name:'ძველი'});
  client.context.GeoNatureAuth={request:async()=>({profile:{displayName:'გიორგი',avatarId:'free-fox',backgroundId:'bg-forest',nameColor:'gold',avatarFrame:'aurora'}})};
  await client.api.connect({...credentials,mode:'signup'});
  const profile=(await client.api.request('/profile')).profile;
  assert.equal(profile.displayName,'გიორგი');assert.equal(profile.avatarId,'free-fox');assert.equal(profile.backgroundId,'bg-forest');assert.equal(profile.nameColor,'default');assert.equal(profile.avatarFrame,'none');
});

test('expired remembered sessions restore the pre-cloud local baseline before fallback account rendering',async()=>{
  const server=await service(),client=browser(server);client.seed({favorites:['ადგილობრივი']});await client.api.connect({...credentials,mode:'signup'});await client.api.resolvePending('merge');client.seed({favorites:['პირადი cloud']});
  const record=JSON.parse(client.local.getItem('fishhunt_cloud_session_v1'));record.expiresAt=Date.now()-1;client.local.setItem('fishhunt_cloud_session_v1',JSON.stringify(record));
  const reloaded=browser(server,{local:client.local,tab:client.tab});assert.equal(reloaded.api.sessionActive(),false);assert.deepEqual(favorites(reloaded),['ადგილობრივი']);assert.equal(reloaded.local.getItem('fishhunt_cloud_local_backup_v1'),null);
});

test('slow uploads serialize changes from the same device without a false cross-device conflict',async()=>{
  const server=await service(),client=browser(server);await client.api.connect({...credentials,mode:'signup'});client.seed({favorites:['პირველი']});
  const original=server.fetch;let release,started;const startedPromise=new Promise(resolve=>{started=resolve;});let once=true;
  server.fetch=async(url,options)=>{if(options.method==='PUT'&&once){once=false;started();await new Promise(resolve=>{release=resolve;});}return original.call(server,url,options);};
  const first=client.api.sync();await startedPromise;client.seed({favorites:['პირველი','მეორე']});const second=client.api.sync();release();await Promise.all([first,second]);
  assert.equal(client.api.view().status,'saved');assert.equal(client.api.view().conflict,null);assert.equal(server.calls.filter(call=>call.method==='PUT').length,2);
  const other=browser(server);await other.api.connect({...credentials,mode:'signin'});assert.deepEqual(favorites(other),['პირველი','მეორე']);
});

test('valid long checklist labels and unknown optional measurements retain their meaning',async()=>{
  const server=await service(),client=browser(server);await client.api.connect({...credentials,mode:'signup'});const label='ა'.repeat(150);client.seed({checklists:{fishing:{[label]:true}},catches:[{id:'optional',fish:'კობრი',weight:''}]});const before=client.local.getItem('geonature_plus_v1');await client.api.sync();
  assert.equal(client.local.getItem('geonature_plus_v1'),before);const other=browser(server);await other.api.connect({...credentials,mode:'signin'});assert.equal(Object.keys(other.api.snapshot().checklists.fishing)[0],label);assert.equal(other.api.snapshot().catches[0].weight,'');
});

test('account A records are archived on disconnect and never silently appear under account B',async()=>{
  const server=await service(),client=browser(server);client.seed({favorites:['მოწყობილობის საწყისი']});await client.api.connect({...credentials,mode:'signup'});await client.api.resolvePending('merge');client.seed({favorites:['პირადი A']});await client.api.sync();await client.api.disconnect();
  assert.deepEqual(favorites(client),['მოწყობილობის საწყისი']);
  await client.api.connect({...credentials,email:'other-private@example.test',mode:'signup'});assert.equal(client.api.view().pending,true);assert.ok(!client.api.snapshot().favorites.includes('პირადი A'));await client.api.resolvePending('cloud');assert.ok(!client.api.snapshot().favorites.includes('პირადი A'));
});

test('storage failure during logout retains a blocked account identity instead of exposing cloud records as local data',async()=>{
  const server=await service(),client=browser(server);client.seed({favorites:['საწყისი']});await client.api.connect({...credentials,mode:'signup'});await client.api.resolvePending('merge');client.seed({favorites:['პირადი']});
  const original=client.local.setItem;client.local.setItem=(key,value)=>{if(key.startsWith('fishhunt_cloud_device_records_v1:'))throw Error('quota');return original(key,value);};
  await assert.rejects(client.api.disconnect(),/საცავი/);assert.equal(client.api.view().connected,true);assert.equal(client.api.handles('/me'),true);assert.deepEqual(favorites(client),['პირადი']);
  client.local.setItem=original;await client.api.disconnect();assert.equal(client.api.view().connected,false);assert.deepEqual(favorites(client),['საწყისი']);
});

test('auth signout clears both local-login sessions even when server revocation fails offline',async()=>{
  const server=await service(),client=browser(server);await client.api.connect({...credentials,mode:'signup'});
  client.local.setItem('geonature_local_session_v5','{"email":"old@example.test"}');client.tab.setItem('geonature_local_session_v5','{"email":"old@example.test"}');
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/auth.js'),'utf8'),client.context);client.setOffline(true);
  await assert.rejects(client.context.GeoNatureAuth.request('/signout',{method:'POST',body:'{}'}));
  assert.equal(client.local.getItem('geonature_local_session_v5'),null);assert.equal(client.tab.getItem('geonature_local_session_v5'),null);assert.equal(client.api.sessionActive(),false);
});

test('notes keep their full whitespace and line breaks across a different-device restore',async()=>{
  const server=await service(),client=browser(server);await client.api.connect({...credentials,mode:'signup'});const note='  პირველი ხაზი\nმეორე ხაზი\n';client.seed({catches:[{id:'note',fish:'კობრი',note}],plans:[{id:'title',title:'  ჩემი გეგმა  ',meta:'აღწერა\nშემდეგი ხაზი'}]});await client.api.sync();
  const other=browser(server);await other.api.connect({...credentials,mode:'signin'});assert.equal(other.api.snapshot().catches[0].note,note);assert.equal(other.api.snapshot().plans[0].title,'  ჩემი გეგმა  ');assert.equal(other.api.snapshot().plans[0].meta,'აღწერა\nშემდეგი ხაზი');
});
