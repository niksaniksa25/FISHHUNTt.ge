const assert=require('node:assert/strict');
const {test}=require('node:test');
const alerts=require('../js/hazard-alerts.js');
const hazards=require('../js/weather-hazards.js');
const initial=Date.parse('2026-10-25T08:05:00Z');
const waters=Array.from({length:7},(_,i)=>['water-'+i,'ადგილი '+i,'ტბა','რეგიონი',41+i/100,44+i/100]);
function storage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};}
function weather(lat=41,lon=44,{at=initial,wind=35,gust=40,code=1,precip=0}={}){
  const offset=14400,local=value=>new Date(value+offset*1000).toISOString().slice(0,16),observed=Math.floor(at/900000)*900000;
  const next=Math.floor(at/3600000)*3600000+3600000,times=Array.from({length:6},(_,i)=>local(next+i*3600000));
  return {timezone:'Asia/Tbilisi',utc_offset_seconds:offset,current:{time:local(observed),interval:900,wind_speed_10m:wind,wind_gusts_10m:gust,weather_code:code,precipitation:precip/4},hourly:{time:times,wind_speed_10m:times.map(()=>wind),wind_gusts_10m:times.map(()=>gust),weather_code:times.map(()=>code),precipitation:times.map(()=>precip)},__meta:{requestedLatitude:lat,requestedLongitude:lon,updatedAt:at,currentTime:observed,stale:false}};
}
function fixture(changes={}){
  let clock=initial,calls=0,wind=35,fail=false;const area=storage(),delivered=[];
  const options={storage:area,waters:()=>waters,now:()=>clock,evaluate:hazards.evaluate,weather:async(lat,lon)=>{calls++;if(fail)throw new Error('offline');return weather(lat,lon,{at:clock,wind});},deliver:item=>delivered.push(item),...changes};
  return {options,area,delivered,engine:alerts.create(options),get calls(){return calls;},setWind(value){wind=value;},setFail(value){fail=value;},setClock(value){clock=value;}};
}
test('hazard locations are canonical and independent of fish choices, with strict coordinates and limits',()=>{
  assert.equal(alerts.canonicalPlaces([{id:'water-0',name:'fake',lat:0,lon:0}],waters)[0].name,'ადგილი 0');
  for(const values of [[],Array(6).fill('water-0'),['water-0','water-0'],['missing'],null])assert.equal(alerts.canonicalPlaces(values,waters),null);
  for(const bad of [null,undefined,'41',NaN,Infinity])assert.equal(alerts.canonicalPlaces(['bad'],[['bad','bad','','',bad,44]]),null);
  const value=fixture();assert.equal(value.engine.snapshot().enabled,false);assert.throws(()=>value.engine.configure({places:[]}),/1–5/);
  value.engine.configure({places:['water-0']});assert.equal(value.engine.snapshot().enabled,true);assert.equal(value.engine.snapshot().places[0].lat,41);
});
test('a real current/forecast risk makes a bounded sourced in-page alert without fish or legal-score dependencies',async()=>{
  const value=fixture();assert.deepEqual(await value.engine.run(true),{enabled:false});assert.equal(value.calls,0);
  value.engine.configure({places:['water-0']});const result=await value.engine.run(true);
  assert.equal(result.checked,1);assert.equal(result.sent,1);assert.equal(value.delivered.length,1);
  const item=value.engine.snapshot().feed[0];assert.equal(item.kind,'hazard');assert.equal(item.waterId,'water-0');assert.equal(item.hazardKind,'wind');assert.equal(item.severity,'warning');assert.match(item.body,/Open-Meteo/);assert.match(item.body,/ოფიციალური საგანგებო გაფრთხილება არ არის/);assert.equal(item.sourceTime,new Date(initial-5*60000).toISOString());
  assert.equal(value.engine.snapshot().results['water-0'].status,'live');
});
test('manual checks dedupe by place/category for four hours while a severity escalation notifies immediately',async()=>{
  const value=fixture();value.engine.configure({places:['water-0']});await value.engine.run(true);await value.engine.run(true);assert.equal(value.delivered.length,1);
  value.setWind(55);await value.engine.run(true);assert.equal(value.delivered.length,2);assert.equal(value.delivered[1].severity,'danger');
  value.setWind(35);await value.engine.run(true);assert.equal(value.delivered.length,2,'lowering risk cannot bypass recent severe warning');
  value.setClock(initial+alerts.DEDUPE_INTERVAL);await value.engine.run(true);assert.equal(value.delivered.length,3);
});
test('navigation resume reuses the fifteen-minute gate and persisted hazard dedupe',async()=>{
  const value=fixture();value.engine.configure({places:['water-0']});await value.engine.run(true);const restored=alerts.create(value.options);await restored.run();assert.equal(value.calls,1);
  await restored.run(true);assert.equal(value.calls,2);assert.equal(value.delivered.length,1);
});
test('simultaneous checks share work and keep source concurrency at two',async()=>{
  let calls=0,inflight=0,peak=0;
  const value=fixture({weather:async(lat,lon)=>{calls++;inflight++;peak=Math.max(peak,inflight);await new Promise(resolve=>setTimeout(resolve,5));inflight--;return weather(lat,lon);}});
  value.engine.configure({places:waters.slice(0,5).map(w=>w[0])});await Promise.all([value.engine.run(true),value.engine.run(true),value.engine.run(true)]);
  assert.equal(calls,5);assert.equal(peak,2);assert.equal(value.engine.snapshot().checking,false);
});
test('disabling or replacing selected places cancels every older in-flight publication',async()=>{
  for(const action of ['disable','change']){
    let release;const value=fixture({weather:()=>new Promise(resolve=>{release=resolve;})});value.engine.configure({places:['water-0']});const pending=value.engine.run(true);
    if(action==='disable')value.engine.disable();else value.engine.configure({places:['water-1']});release(weather());
    assert.equal((await pending).cancelled,true);assert.equal(value.delivered.length,0);assert.equal(value.engine.snapshot().feed.length,0);assert.equal(value.engine.snapshot().checking,false);
  }
});
test('failed, stale, mismatched and partial sources never become an all-clear or fake alert',async()=>{
  const value=fixture();value.setWind(0);value.engine.configure({places:['water-0']});await value.engine.run(true);assert.equal(value.engine.snapshot().results['water-0'].status,'live');
  value.setFail(true);const unavailable=await value.engine.run(true);assert.equal(unavailable.unavailable,1);assert.equal(value.engine.snapshot().results['water-0'].status,'unavailable');assert.match(alerts.statusText(value.engine.snapshot().results['water-0']),/ვერ შესრულდა/);
  for(const mutate of [data=>data.__meta.stale=true,data=>data.__meta.requestedLatitude=42,data=>{data.hourly={};data.current.wind_speed_10m=null;data.current.wind_gusts_10m=null;data.current.precipitation=null;data.current.weather_code=null;}]){
    const bad=fixture({weather:async()=>{const data=weather();mutate(data);return data;}});bad.engine.configure({places:['water-0']});await bad.engine.run(true);assert.equal(bad.delivered.length,0);assert.notEqual(bad.engine.snapshot().results['water-0'].status,'live');
  }
  assert.match(alerts.statusText({status:'partial',hazards:[]}),/არასრულია/);assert.doesNotMatch(alerts.statusText({status:'live',hazards:[]}),/უსაფრთხოა/);
});
test('quota failures keep new temporary choices active even when old stored settings were disabled',async()=>{
  const area=storage();area.setItem(alerts.STORAGE_KEY,JSON.stringify({enabled:false,places:[{id:'water-1'}]}));area.setItem=()=>{throw new Error('quota');};
  const value=fixture({storage:area});value.engine.configure({places:['water-0']});assert.equal(value.engine.snapshot().storageUnavailable,true);await value.engine.run(true);
  assert.equal(value.delivered.length,1);assert.equal(value.engine.snapshot().enabled,true);assert.equal(value.engine.snapshot().places[0].id,'water-0');assert.equal(value.engine.snapshot().storageUnavailable,true);
});
test('blocked reads and corrupt oversized storage are explicitly temporary and never throw at page load',()=>{
  for(const raw of ['{broken','[]','null','x'.repeat(100001)]){const area=storage();area.setItem(alerts.STORAGE_KEY,raw);const value=fixture({storage:area});assert.equal(value.engine.snapshot().storageUnavailable,true);assert.equal(value.engine.snapshot().enabled,false);}
  const value=fixture({storage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}}});value.engine.configure({places:['water-0']});assert.equal(value.engine.snapshot().storageUnavailable,true);
});
test('bounded histories discard forged locations and retain only twenty-five text records',()=>{
  const area=storage(),feed=Array.from({length:40},(_,i)=>({id:'feed-'+i,at:initial-i,title:'ქარი',body:'პირადი ჩანაწერი',waterId:i===0?'forged':'water-0',kind:'hazard',hazardKind:'wind',severity:'warning'}));
  area.setItem(alerts.STORAGE_KEY,JSON.stringify({enabled:true,places:[{id:'water-0'}],feed}));const value=fixture({storage:area});assert.equal(value.engine.snapshot().feed.length,24);assert.ok(value.engine.snapshot().feed.every(item=>item.waterId==='water-0'));value.engine.clearFeed();assert.equal(value.engine.snapshot().feed.length,0);
});
test('separate open controllers re-read persisted dedupe immediately before announcing',async()=>{
  const value=fixture();value.engine.configure({places:['water-0']});const other=alerts.create(value.options);await value.engine.run(true);await other.run(true);assert.equal(value.delivered.length,1);
});
test('an older calm or unavailable request never overwrites another tab changing or disabling preferences',async()=>{
  for(const action of ['change','disable'])for(const response of ['calm','unavailable']){
    let release;const value=fixture({weather:()=>new Promise(resolve=>{release=resolve;})});value.engine.configure({places:['water-0']});const other=alerts.create(value.options),pending=value.engine.run(true);
    if(action==='change')other.configure({places:['water-1']});else other.disable();
    const expected=value.area.getItem(alerts.STORAGE_KEY);release(response==='calm'?weather(41,44,{wind:0,gust:0}):null);
    assert.equal((await pending).cancelled,true);assert.equal(value.area.getItem(alerts.STORAGE_KEY),expected);assert.equal(value.engine.snapshot().enabled,action==='change');
    if(action==='change')assert.equal(value.engine.snapshot().places[0].id,'water-1');assert.equal(value.delivered.length,0);
  }
});
test('clearing stored opt-in during a request cannot silently reactivate its old settings',async()=>{
  let release;const value=fixture({weather:()=>new Promise(resolve=>{release=resolve;})});value.engine.configure({places:['water-0']});const pending=value.engine.run(true);
  value.area.values.delete(alerts.STORAGE_KEY);release(weather(41,44,{wind:0,gust:0}));
  assert.equal((await pending).cancelled,true);assert.equal(value.area.getItem(alerts.STORAGE_KEY),null);assert.equal(value.engine.snapshot().enabled,false);assert.equal(value.delivered.length,0);
});
