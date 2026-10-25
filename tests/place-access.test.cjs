const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const access=require('../js/place-access.js');
const now=Date.parse('2026-10-24T10:00:00Z');
const input={road:'gravel',parking:'limited',walkingMinutes:'12',notes:'ჩემი დაკვირვება\nმარცხენა ნაპირი'};
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}

test('driving and walking links use numeric known coordinates and distinct routing modes',()=>{
  const routes=access.routeLinks(41.772,44.695);
  for(const [mode,key] of [['driving','driving'],['walking','walking']]){
    const url=new URL(routes[key]);assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('destination'),'41.772,44.695');assert.equal(url.searchParams.get('travelmode'),mode);assert.equal(url.searchParams.has('origin'),false);
  }
  const osm=new URL(routes.map);assert.equal(osm.origin,'https://www.openstreetmap.org');assert.equal(osm.searchParams.get('mlat'),'41.772');
  assert.deepEqual(access.routeLinks('41.772','44.695'),routes);
});
test('missing and impossible coordinates never create a plausible route',()=>{
  for(const [lat,lon] of [[null,null],['',''],[' ',44],[true,45],[0,0],[91,40],[40,-181],['41.77<script>',44],[NaN,44],[Infinity,44],[undefined,44]])assert.equal(access.routeLinks(lat,lon),null);
});
test('notes persist and can be read after fresh module use without changing another place',()=>{
  const area=storage();const first=access.save('lisi',input,area,now);
  assert.equal(first.personal,true);assert.equal(first.walkingMinutes,12);assert.equal(first.updatedAt,new Date(now).toISOString());assert.equal(first.notes,input.notes);
  access.save('shaori',{...input,road:'rough'},area,now+1000);
  assert.equal(access.snapshot('lisi',area).road,'gravel');assert.equal(access.snapshot('shaori',area).road,'rough');
  access.save('lisi',{...input,walkingMinutes:0,notes:'განახლებული'},area,now+2000);
  assert.equal(access.snapshot('lisi',area).walkingMinutes,0);assert.equal(access.snapshot('lisi',area).notes,'განახლებული');assert.equal(Object.keys(JSON.parse(area.getItem(access.storageKey))).length,2);
  access.remove('lisi',area);assert.equal(access.snapshot('lisi',area),null);assert.equal(access.snapshot('shaori',area).road,'rough');
});
test('unknown access facts stay unknown and private source cannot become verified metadata',()=>{
  const clean=access.cleanSnapshot({road:'invented',parking:'invented',walkingMinutes:null,notes:'მხოლოდ ჩემი შენიშვნა',updatedAt:new Date(now).toISOString(),verified:true,source:'fake',personal:false});
  assert.equal(clean.road,'unknown');assert.equal(clean.parking,'unknown');assert.equal(clean.personal,true);assert.equal(clean.verified,undefined);assert.equal(clean.source,undefined);
  assert.equal(access.cleanSnapshot({...clean,notes:''}),null);
  assert.equal(access.roadLabel('constructor'),'არ არის მითითებული');assert.equal(access.parkingLabel('constructor'),'არ არის მითითებული');
});
test('invalid form payloads reject before changing existing saved notes',()=>{
  const area=storage();access.save('lisi',input,area,now);const original=area.getItem(access.storageKey);
  const bad=[{road:'imaginary'},{parking:'free'},{walkingMinutes:-1},{walkingMinutes:721},{walkingMinutes:'1.5'},{walkingMinutes:true},{walkingMinutes:'  '},{walkingMinutes:'1e2'},{notes:'x'.repeat(601)},{notes:undefined}];
  for(const delta of bad){assert.throws(()=>access.save('lisi',{...input,...delta},area,now));assert.equal(area.getItem(access.storageKey),original);}
  for(const id of ['','__proto__','constructor','prototype','<script>','a'.repeat(81)])assert.throws(()=>access.save(id,input,area,now));
  assert.throws(()=>access.save('lisi',{road:'unknown',parking:'unknown',walkingMinutes:'',notes:' '},area,now),/ინფორმაცია/);assert.equal(area.getItem(access.storageKey),original);
});
test('malformed or future-dated snapshot values are not accepted as personal observations',()=>{
  const good={...input,updatedAt:new Date(now).toISOString()};
  for(const value of [null,[],{}, {...good,updatedAt:'yesterday'},{...good,updatedAt:'2026-01-01T00:00:00'},{...good,updatedAt:new Date(Date.now()+3600000).toISOString()},{...good,walkingMinutes:2.2},{...good,notes:'x'.repeat(601)}])assert.equal(access.cleanSnapshot(value),null);
  assert.equal(access.cleanSnapshot({...good,notes:'\u0000 გზაზე \u0001'}).notes,'გზაზე');
});
test('bounded storage retains one hundred records and rejects the next without truncating earlier notes',()=>{
  const area=storage();for(let index=0;index<100;index++)access.save('place-'+index,{...input,notes:'place-'+index},area,now+index);
  const old=area.getItem(access.storageKey);assert.throws(()=>access.save('extra',input,area,now+1000),/100/);assert.equal(area.getItem(access.storageKey),old);assert.equal(access.snapshot('place-0',area).notes,'place-0');
  access.save('place-0',{...input,notes:'updated'},area,now+2000);assert.equal(access.snapshot('place-0',area).notes,'updated');
});
test('one hundred maximum-length Georgian notes fit the independent UTF8 storage budget',()=>{
  const area=storage(),long='გ'.repeat(600);
  for(let index=0;index<100;index++)access.save('place-'+index,{...input,notes:long},area,now+index);
  assert.equal(access.snapshot('place-0',area).notes,long);assert.equal(access.snapshot('place-99',area).notes,long);
  assert.ok(new TextEncoder().encode(area.getItem(access.storageKey)).byteLength<=access.maxBytes);
});
test('blocked reads, blocked writes and corrupt storage never silently replace old records',()=>{
  const area=storage();access.save('lisi',input,area,now);const old=area.getItem(access.storageKey),originalGet=area.getItem,originalSet=area.setItem;
  area.getItem=()=>{throw new Error('blocked');};assert.equal(access.snapshot('lisi',area),null);assert.throws(()=>access.save('shaori',input,area,now),/არ შეცვლილა/);area.getItem=originalGet;assert.equal(area.getItem(access.storageKey),old);
  area.setItem=()=>{throw new Error('quota');};assert.throws(()=>access.save('lisi',{...input,notes:'new'},area,now),/შენახვა ვერ მოხერხდა/);assert.throws(()=>access.remove('lisi',area),/შენახვა ვერ მოხერხდა/);area.setItem=originalSet;assert.equal(area.getItem(access.storageKey),old);
  for(const raw of ['null','[]','{broken','{"lisi":null}', 'x'.repeat(200001)]){area.setItem(access.storageKey,raw);assert.equal(access.snapshot('lisi',area),null);assert.throws(()=>access.save('other',input,area,now),/არ შეცვლილა/);assert.equal(area.getItem(access.storageKey),raw);}
});
test('writes announce current access only after successful persistence',()=>{
  const area=storage(),events=[];
  const window={document:{dispatchEvent:event=>events.push(event)},localStorage:area,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/place-access.js'),'utf8'),{window,TextEncoder,Date,Intl});
  window.FishHuntPlaceAccess.save('lisi',input,undefined,now);assert.equal(events.length,1);assert.equal(events[0].type,'fishhunt:place-access');assert.equal(events[0].detail.placeId,'lisi');assert.equal(events[0].detail.access.road,'gravel');
  area.setItem=()=>{throw new Error('quota');};assert.throws(()=>window.FishHuntPlaceAccess.save('lisi',input,undefined,now));assert.equal(events.length,1);
  area.setItem=(key,value)=>area.data.set(key,value);window.FishHuntPlaceAccess.remove('lisi');assert.equal(events.length,2);assert.equal(events[1].detail.access,null);
});
