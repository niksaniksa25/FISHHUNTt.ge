const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const trip=require('../js/trip-tools.js');
const now=Date.parse('2026-10-23T10:00:00Z');
const snapshot={placeId:'lisi',placeName:'ლისის ტბა',lat:41.772,lon:44.695,fishName:'კობრი',status:'live',sourceTime:'2026-10-23T09:55:00Z',index:53,bestHour:'15:00',weather:{temperature:19,wind:8,precip:0,pressure:1013,humidity:55},legalSummary:'ტერიტორიის რეჟიმი გადაამოწმე.'};
function storage(){const map=new Map();return {map,getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}

test('share snapshot never calls a stale or future observation a current conditions index',()=>{
  const fresh=trip.cleanSnapshot(snapshot,now);assert.equal(fresh.index,53);assert.equal(fresh.status,'live');
  for(const change of [{status:'stale'},{status:'saved'},{sourceTime:null},{sourceTime:'2020-01-01T12:00:00Z'},{sourceTime:'2026-10-24T10:00:00Z'}]){
    const value=trip.cleanSnapshot({...snapshot,...change},now);assert.equal(value.index,null);assert.equal(value.bestHour,'');assert.notEqual(value.status,'live');
  }
  assert.equal(trip.stamp('2026-10-23T13:55'),Date.parse('2026-10-23T09:55:00Z'));
  assert.equal(trip.cleanSnapshot({...snapshot,sourceTime:null},now).weather.temperature,null,'unattributed numbers are not presented as weather');
});
test('missing, impossible and injected snapshot values become explicit unknowns',()=>{
  const value=trip.cleanSnapshot({...snapshot,index:500,lat:100,lon:-999,weather:{temperature:999,wind:-1,humidity:200},placeName:'\u0000 ადგილი'},now);
  assert.equal(value.index,null);assert.equal(value.lat,null);assert.equal(value.lon,null);assert.equal(value.weather.temperature,null);assert.equal(value.weather.wind,null);assert.equal(value.placeName,'ადგილი');
});
test('saved places are bounded, deduplicated and never preserve live indices',()=>{
  const area=storage();const saved=trip.savePlace(snapshot,area,now);assert.equal(saved.status,'saved');assert.equal(saved.index,null);assert.equal(saved.bestHour,'');assert.equal(saved.sourceTime,snapshot.sourceTime.replace('Z','.000Z'));
  trip.savePlace({...snapshot,placeName:'განახლებული ლისი'},area,now+1000);assert.equal(trip.list(area).length,1);assert.equal(trip.list(area)[0].placeName,'განახლებული ლისი');
  for(let i=0;i<23;i++)trip.savePlace({...snapshot,placeId:'place-'+i},area,now+i);
  assert.equal(trip.list(area).length,24);assert.throws(()=>trip.savePlace({...snapshot,placeId:'extra'},area,now),/24/);
  trip.remove('place-1',area);assert.equal(trip.list(area).length,23);trip.clearPlaces(area);assert.equal(trip.list(area).length,0);
});
test('storage failures are reported without overwriting old data or unrelated account keys',()=>{
  const area=storage();area.setItem('account-data','preserve');trip.savePlace(snapshot,area,now);
  const original=area.getItem(trip.storageKey),write=area.setItem;area.setItem=()=>{throw new Error('quota');};
  assert.throws(()=>trip.savePlace({...snapshot,placeId:'other'},area,now),/quota/);assert.equal(area.getItem(trip.storageKey),original);
  area.setItem=write;trip.clearPlaces(area);assert.equal(area.getItem('account-data'),'preserve');
  for(const bad of ['{}','null','[null]','{broken','x'.repeat(360001)]){area.setItem(trip.storageKey,bad);assert.deepEqual(trip.list(area),[]);}
});
test('saved sharing text exposes its observation time and omits a misleading live index',()=>{
  const text=trip.snapshotText({...snapshot,status:'saved',index:99});assert.match(text,/ბოლო შენახული ამინდი/);assert.match(text,/2026-10-23 13:55/);assert.doesNotMatch(text,/99\/100|AM|PM/);assert.match(text,/place-details\.html\?id=lisi/);assert.match(text,/ტერიტორიის რეჟიმი/);
});
test('Georgian wrapping bounds every line, splits unbroken labels and ellipsizes overflow',()=>{
  const context={measureText:value=>({width:Array.from(value).length*9})};
  for(const text of ['საქართველოს ულამაზესი სათევზაო ადგილი მთის ფერდობზე','ძალიანგრძელიუწყვეტისაქართველოსსათევზაოლოკაცია'.repeat(8)]){
    const lines=trip.wrapLines(context,text,100,3);assert.ok(lines.length<=3);assert.ok(lines.every(line=>context.measureText(line).width<=100));assert.ok(lines.at(-1).endsWith('…'));
  }
});
test('cancelled native share is not reported as success and never downloads a second copy',async()=>{
  let downloads=0;const file=new Blob(['PNG'],{type:'image/png'}),navigation={canShare:()=>true,share:async()=>{const error=new Error('cancel');error.name='AbortError';throw error;}};
  assert.equal(await trip.shareFile(file,snapshot,navigation,async()=>{downloads++;}),'cancelled');assert.equal(downloads,0);
  assert.equal(await trip.shareFile(file,snapshot,{canShare:()=>false},async file=>{downloads++;assert.equal(file.type,'image/png');}),'downloaded');assert.equal(downloads,1);
  await assert.rejects(trip.shareFile(file,snapshot,{canShare:()=>true,share:async()=>{throw new Error('denied');}},async()=>{downloads++;}),/denied/);assert.equal(downloads,1);
});
test('PNG rendering waits for Georgian fonts and draws only bounded text',async()=>{
  const calls=[];let fontsReady=false;
  const context={font:'',createLinearGradient:()=>({addColorStop(){}}),measureText:value=>({width:Array.from(value).length*20}),fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},strokeRect(){},fillText(value,x,y){assert.equal(fontsReady,true);assert.ok(x>=0&&y<1350);calls.push(value);}};
  const canvas={getContext:()=>context,toBlob:callback=>callback(new Blob(['pngfixture'],{type:'image/png'}))};
  const document={fonts:{ready:Promise.resolve().then(()=>{fontsReady=true;})},createElement:()=>canvas};
  const result=await trip.renderCard({...snapshot,status:'saved',placeName:'დიდიგრძელიადგილი'.repeat(100),legalSummary:'ვრცელი სამართლებრივი შეზღუდვა '.repeat(100)},document);
  assert.equal(canvas.width,1080);assert.equal(canvas.height,1350);assert.equal(result.blob.type,'image/png');assert.ok(calls.includes('FISHHUNT'));assert.ok(calls.some(value=>value.includes('ბოლო შენახული')));assert.ok(calls.some(value=>value.endsWith('…')));
});

test('offline preparation waits for the replacement worker instead of messaging an old push-only worker',async()=>{
  const {MessageChannel}=require('node:worker_threads');let oldMessages=0,newMessages=0,updates=0;const events=new Map(),states=new Map();
  const oldWorker={state:'activated',postMessage(){oldMessages++;},addEventListener(){},removeEventListener(){}};
  const replacement={state:'installing',addEventListener:(type,callback)=>states.set(type,callback),removeEventListener:type=>states.delete(type),postMessage(message,ports){newMessages++;assert.equal(message.type,'FISHHUNT_PREPARE_OFFLINE');ports[0].postMessage({ok:true});ports[0].close();}};
  const registration={active:oldWorker,installing:null,waiting:null,addEventListener:(type,callback)=>events.set(type,callback),removeEventListener:type=>events.delete(type),async update(){updates++;await Promise.resolve();this.installing=replacement;events.get('updatefound')?.();await Promise.resolve();replacement.state='activated';this.active=replacement;this.installing=null;states.get('statechange')?.();}};
  const window={document:{baseURI:'https://example.test/FISHHUNTt.ge/index.html',readyState:'loading',addEventListener(){}},isSecureContext:true,navigator:{serviceWorker:{async register(url,options){assert.equal(url,'/FISHHUNTt.ge/push-sw.js');assert.equal(options.scope,'/FISHHUNTt.ge/');assert.equal(options.updateViaCache,'none');return registration;}}},setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/trip-tools.js'),'utf8'),{window,URL,MessageChannel,Date,Intl,TextEncoder});
  assert.equal(await window.FishHuntTripTools.prepareOffline(),true);assert.equal(oldMessages,0);assert.equal(newMessages,1);assert.equal(updates,1);assert.equal(events.size,0);assert.equal(states.size,0);
  registration.update=async()=>{throw new Error('offline');};
  assert.equal(await window.FishHuntTripTools.prepareOffline(),true,'an already prepared modern worker still responds while offline');assert.equal(oldMessages,0);assert.equal(newMessages,2);
});

function worker(){
  const listeners={},cacheMap=new Map(),requests=[];let offline=false,badStatus=false,oversized=false;
  const cacheFor=name=>{if(!cacheMap.has(name))cacheMap.set(name,new Map());const entries=cacheMap.get(name);return {async put(key,value){entries.set(String(key),value.clone());},async match(key){return entries.get(String(key))?.clone();}};};
  const caches={open:async name=>cacheFor(name),keys:async()=>[...cacheMap.keys()],delete:async name=>cacheMap.delete(name),async match(key,options){return cacheFor(options.cacheName).match(key);}};
  const scope='https://example.test/FISHHUNTt.ge/';
  const context={URL,Request,Response,Promise,caches,console,self:{registration:{scope},addEventListener:(type,listener)=>{listeners[type]=listener;},skipWaiting:async()=>{},clients:{claim:async()=>{}}},fetch:async request=>{
    requests.push(request.url);if(offline)throw new Error('offline');return new Response(oversized?'x'.repeat(1200001):'<main>'+request.url+'</main>',{status:badStatus?503:200,headers:{'Content-Type':'text/html'}});
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../push-sw.js'),'utf8'),context);
  return {listeners,cacheMap,requests,scope,setOffline:value=>{offline=value;},setBad:value=>{badStatus=value;},setOversized:value=>{oversized=value;},async install(){let pending;listeners.install({waitUntil:value=>{pending=value;}});await pending;},async activate(){let pending;listeners.activate({waitUntil:value=>{pending=value;}});await pending;},async get(path,mode='cors',method='GET'){let response;listeners.fetch({request:{url:new URL(path,scope).href,method,mode},respondWith:value=>{response=value;}});return response?await response:undefined;},async message(){let pending,reply;listeners.message({data:{type:'FISHHUNT_PREPARE_OFFLINE'},ports:[{postMessage:value=>{reply=value;}}],waitUntil:value=>{pending=value;}});await pending;return reply;}};
}
test('offline installation caches only four explicit public assets and keeps push handlers',async()=>{
  const value=worker();await value.install();assert.equal(value.requests.length,4);assert.equal(value.cacheMap.size,1);assert.ok(value.listeners.push);assert.ok(value.listeners.notificationclick);
  assert.equal((await value.message()).ok,true);assert.equal(value.requests.length,4,'already prepared shell needs no repeated fetch');
  for(const url of value.requests)assert.doesNotMatch(url,/api\/|auth\.html|admin\.html|open-meteo|tiles/);
});
test('offline saved-place and dashboard navigation use the prepared shell, but APIs never intercept',async()=>{
  const value=worker();await value.install();value.setOffline(true);
  for(const path of ['place-details.html?id=lisi','dashboard.html','index.html']){const result=await value.get(path,'navigate');assert.equal(result.status,200);assert.match(await result.text(),/offline\.html/);}
  const css=await value.get('css/trip-tools.css?v=anything');assert.ok(css);assert.match(await css.text(),/trip-tools\.css/);
  for(const url of ['api/auth/me','api/admin/users','api/ai/chat','auth.html','admin.html','https://api.open-meteo.com/v1/forecast','https://tile.openstreetmap.org/8/1/1.png'])assert.equal(await value.get(url,'navigate'),undefined);
  assert.equal(await value.get('offline.html','cors','POST'),undefined);
});
test('activation removes only superseded FishHunt offline caches',async()=>{
  const value=worker();await value.install();value.cacheMap.set('fishhunt-offline-old',new Map());value.cacheMap.set('other-app-account-cache',new Map());await value.activate();assert.equal(value.cacheMap.has('fishhunt-offline-old'),false);assert.equal(value.cacheMap.has('other-app-account-cache'),true);assert.equal(value.cacheMap.has('fishhunt-offline-20261023b-v1'),true);
});
test('bad or oversized responses cannot acknowledge a fully prepared offline shell',async()=>{
  for(const mode of ['bad','oversized']){const value=worker();if(mode==='bad')value.setBad(true);else value.setOversized(true);await value.install();assert.ok(value.listeners.push,'offline preparation failure never disables push install');assert.equal((await value.message()).ok,false);}
});
