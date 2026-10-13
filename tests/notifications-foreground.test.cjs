const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const alerts=require('../js/foreground-alerts.js');
const model={};
const sandbox={window:model,Intl,Date,console};
for(const file of ['fishing-data.js','wildlife-rules.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),sandbox,{filename:file});
const fish=model.FISHES.find(item=>item[0]==='carp');
const water=model.WATERS.find(item=>item[0]==='tbilisi-sea');
const now=Date.parse('2026-10-13T08:05:00Z');
const preferences={fish:[{id:fish[0],name:'forged'}],places:[{id:water[0],lat:0,lon:0}],hour:'any',threshold:40};
const dependencies={score:model.GeoFishChance,explain:model.GeoFishConditions.explain,rules:model.GeoWildlifeRules};
function fresh(){return {timezone:'Asia/Tbilisi',utc_offset_seconds:14400,current:{time:'2026-10-13T12:00',temperature_2m:20,pressure_msl:1015,wind_speed_10m:5,precipitation:0,weather_code:1,relative_humidity_2m:60},__meta:{stale:false,updatedAt:now,currentTime:now-5*60000}};}
function fixture(overrides={}){
  const saved=new Map();let clock=now,calls=0,delivered=[];
  const options={storage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},fish:()=>model.FISHES,waters:()=>model.WATERS,dependencies:()=>dependencies,now:()=>clock,weather:async()=>{calls++;return fresh();},deliver:item=>delivered.push(item),...overrides};
  return {options,engine:alerts.create(options),saved,get calls(){return calls;},delivered,setClock(value){clock=value;}};
}
test('foreground preferences canonicalize identities and reject duplicates, bad coordinates, limits and hours',()=>{
  const result=alerts.canonicalPreferences(preferences,model.FISHES,model.WATERS);
  assert.equal(result.fish[0].name,'კობრი');assert.equal(result.places[0].lat,water[4]);
  for(const change of [{fish:[]},{places:[]},{fish:Array(6).fill({id:'carp'})},{places:[{id:water[0]},{id:water[0]}]},{hour:'99'},{threshold:NaN},{fish:[{id:'unknown'}]},{places:[{id:'unknown'}]}])assert.equal(alerts.canonicalPreferences({...preferences,...change},model.FISHES,model.WATERS),null);
});
test('foreground live index exactly matches the shared fishing model and threshold',()=>{
  const result=alerts.evaluate(fresh(),fish,water,preferences,dependencies,now);
  assert.equal(result.reason,'matched');assert.equal(result.score,model.GeoFishChance(fish,{...fresh().current,local_hour:12},water,true));
  const storm=fresh();storm.current.weather_code=95;assert.equal(alerts.evaluate(storm,fish,water,preferences,dependencies,now).reason,'threshold');
});
test('preferred hour uses current place-local time across an observation hour boundary',()=>{
  const boundary=Date.parse('2026-10-13T08:05:00Z'),data=fresh();data.current.time='2026-10-13T11:45';data.__meta.currentTime=boundary-20*60000;
  assert.equal(alerts.evaluate(data,fish,water,{...preferences,hour:'11'},dependencies,boundary).reason,'hour');
  assert.equal(alerts.evaluate(data,fish,water,{...preferences,hour:'12'},dependencies,boundary).reason,'matched');
});
test('stale, future, incomplete, wrong-place and prohibited fish never generate alerts',()=>{
  for(const mutate of [d=>d.__meta.stale=true,d=>d.__meta.updatedAt=now-16*60000,d=>d.__meta.updatedAt=now+2*60000,d=>d.__meta.currentTime-=10000,d=>{d.current.time='2020-01-01T12:00';},d=>d.utc_offset_seconds=null,d=>{d.current.temperature_2m=null;},d=>{d.current.pressure_msl=null;},d=>{d.__meta.requestedLatitude=0;d.__meta.requestedLongitude=0;}]){const data=fresh();mutate(data);assert.notEqual(alerts.evaluate(data,fish,water,preferences,dependencies,now).reason,'matched');}
  for(const id of ['browntrout','sturgeon'])assert.equal(alerts.evaluate(fresh(),model.FISHES.find(item=>item[0]===id),water,preferences,dependencies,now).reason,'prohibited');
  assert.equal(alerts.evaluate(fresh(),fish,water,preferences,{},now).reason,'unavailable');
});
test('enable, manual check, visible feed, persisted choices and four-hour dedupe work without browser notifications',async()=>{
  const value=fixture();value.engine.configure(preferences);
  assert.equal(value.engine.snapshot().enabled,true);
  const result=await value.engine.run(true);assert.equal(result.sent,1);assert.equal(value.engine.snapshot().feed.length,1);assert.equal(value.delivered.length,1);
  assert.match(value.delivered[0].body,/დაჭერის ალბათობას არ წარმოადგენს/);
  assert.equal((await value.engine.run(true)).deduped,1);assert.equal(value.delivered.length,1);
  const restored=alerts.create(value.options);assert.equal(restored.snapshot().enabled,true);assert.equal(restored.snapshot().fish[0].name,'კობრი');assert.equal((await restored.run(true)).deduped,1);
  value.engine.disable();assert.equal((await value.engine.run()).enabled,false);
});
test('navigation resume skips unnecessary provider requests within the fifteen-minute check interval',async()=>{
  const value=fixture();value.engine.configure(preferences);await value.engine.run(true);assert.equal(value.calls,1);
  await value.engine.run();assert.equal(value.calls,1);
  const restored=alerts.create(value.options);await restored.run();assert.equal(value.calls,1);
  await restored.run(true);assert.equal(value.calls,2);
});
test('concurrent manual checks share one run and weather concurrency is limited to three places',async()=>{
  let inFlight=0,max=0,calls=0;
  const value=fixture({weather:async()=>{calls++;inFlight++;max=Math.max(max,inFlight);await new Promise(resolve=>setTimeout(resolve,5));inFlight--;return fresh();}});
  const places=model.WATERS.filter(item=>typeof item[4]==='number'&&typeof item[5]==='number').slice(0,5).map(item=>({id:item[0]}));
  value.engine.configure({...preferences,places});await Promise.all([value.engine.run(true),value.engine.run(true),value.engine.run(true)]);
  assert.equal(calls,5);assert.equal(max,3);
});
test('disabling during a weather request cancels publication and cannot reactivate alerts',async()=>{
  let resolve;
  const value=fixture({weather:()=>new Promise(done=>{resolve=done;})});value.engine.configure(preferences);const running=value.engine.run(true);value.engine.disable();resolve(fresh());
  assert.equal((await running).cancelled,true);assert.equal(value.engine.snapshot().enabled,false);assert.equal(value.engine.snapshot().feed.length,0);assert.equal(value.delivered.length,0);
});
test('changing preferences invalidates an older in-flight request',async()=>{
  let resolve;
  const value=fixture({weather:()=>new Promise(done=>{resolve=done;})});value.engine.configure(preferences);const running=value.engine.run(true);value.engine.configure({...preferences,hour:'00'});resolve(fresh());
  assert.equal((await running).cancelled,true);assert.equal(value.engine.snapshot().hour,'00');assert.equal(value.engine.snapshot().feed.length,0);
});
test('offline provider errors are visible and a manual retry recovers without fabricated values',async()=>{
  let fail=true;
  const value=fixture({weather:async()=>{if(fail)throw new Error('offline');return fresh();}});value.engine.configure(preferences);
  const failed=await value.engine.run(true);assert.equal(failed.errors,1);assert.equal(failed.checked,0);assert.equal(failed.sent,0);assert.equal(value.engine.snapshot().feed.length,0);
  fail=false;assert.equal((await value.engine.run(true)).sent,1);
});
test('local simulation works while disabled, does not fetch weather or change enabled state, and can be cleared',()=>{
  const value=fixture();const item=value.engine.test();assert.equal(item.test,true);assert.equal(value.engine.snapshot().enabled,false);assert.equal(value.calls,0);assert.equal(value.engine.snapshot().feed.length,1);value.engine.clearFeed();assert.equal(value.engine.snapshot().feed.length,0);
});
test('blocked browser storage keeps foreground checking usable and honestly marks temporary settings',async()=>{
  const value=fixture({storage:{getItem(){throw new Error('private storage');},setItem(){throw new Error('private storage');}}});value.engine.configure(preferences);assert.equal(value.engine.snapshot().storageUnavailable,true);assert.equal((await value.engine.run(true)).sent,1);assert.equal(value.engine.snapshot().feed.length,1);
});
test('two already-open pages share persisted dedupe before posting a condition alert',async()=>{
  const value=fixture();value.engine.configure(preferences);const second=alerts.create(value.options);await value.engine.run(true);assert.equal((await second.run(true)).deduped,1);assert.equal(value.delivered.length,1);
});

function workerFixture(list){
  const listeners={},calls=[];let waiting;
  const scope='https://example.invalid/FISHHUNTt.ge/';
  const context={URL,console,self:{registration:{scope,showNotification:async(title,options)=>calls.push({title,options})},addEventListener:(name,callback)=>listeners[name]=callback},clients:{matchAll:async()=>list,openWindow:async url=>{calls.push({opened:url});}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../push-sw.js'),'utf8'),context);
  return {scope,calls,async click(url){listeners.notificationclick({notification:{data:{url},close:()=>calls.push({closed:true})},waitUntil:promise=>{waiting=promise;}});await waiting;}};
}
test('notification click awaits navigation before focusing the correct site window',async()=>{
  const order=[],client={url:'https://example.invalid/FISHHUNTt.ge/index.html',navigate:async url=>{await new Promise(resolve=>setTimeout(resolve,2));order.push('navigate:'+url);},focus:async()=>order.push('focus')};
  const value=workerFixture([client]);await value.click(value.scope+'fishing.html?fish=carp');assert.deepEqual(order,['navigate:'+value.scope+'fishing.html?fish=carp','focus']);assert.equal(value.calls.filter(item=>item.opened).length,0);
});
test('notification click does not navigate unrelated same-origin sites or external URLs',async()=>{
  let focused=false;
  const value=workerFixture([{url:'https://example.invalid/another-repository/index.html',focus:async()=>{focused=true;}}]);await value.click('https://external.invalid/unsafe');assert.equal(focused,false);assert.equal(value.calls.find(item=>item.opened).opened,value.scope+'index.html');
});
test('failed existing-window notification navigation opens a fresh site window',async()=>{
  const value=workerFixture([{url:'https://example.invalid/FISHHUNTt.ge/index.html',navigate:async()=>{throw new Error('window closed');},focus:async()=>{throw new Error('window closed');}}]);await value.click(value.scope+'dashboard.html');assert.equal(value.calls.find(item=>item.opened).opened,value.scope+'dashboard.html');
});


test('unconfirmed fish-place associations cannot trigger a low-threshold alert',async()=>{
  const unknown=model.WATERS.find(item=>model.GeoFishConditions.explain(fish,{...fresh().current,local_hour:12},item,true).components.find(component=>component.key==='habitat').fit===25);
  assert.ok(unknown,'fixture requires an unconfirmed freshwater association');
  assert.equal(model.GeoFishChance(fish,{...fresh().current,local_hour:12},unknown,true),40,'the shared model caps this unconfirmed pairing at40');
  assert.equal(alerts.evaluate(fresh(),fish,unknown,preferences,dependencies,now).reason,'habitat');
  const value=fixture();value.engine.configure({...preferences,places:[{id:unknown[0]}]});const result=await value.engine.run(true);assert.equal(result.habitat,1);assert.equal(result.sent,0);assert.equal(value.engine.snapshot().feed.length,0);
});
test('forecast links retain species and place identity and open the selected profile',()=>{
  const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/push-notifications.js'),'utf8'),{window,document:{addEventListener(){}}});
  const link=new URL(window.GeoNaturePush.forecastPath('carp','tbilisi-sea'),'https://example.invalid/FISHHUNTt.ge/');assert.equal(link.pathname,'/FISHHUNTt.ge/fishing.html');assert.equal(link.searchParams.get('fish'),'carp');assert.equal(link.searchParams.get('place'),'tbilisi-sea');assert.equal(link.hash,'#fishProfile');
});
