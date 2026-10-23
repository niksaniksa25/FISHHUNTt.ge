const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

function forecast(time='2026-10-23T12:15'){
  const dates=['2026-10-23','2026-10-24'];
  const times=dates.flatMap(date=>Array.from({length:24},(_,hour)=>date+'T'+String(hour).padStart(2,'0')+':00'));
  const values=value=>times.map(()=>value);
  return {timezone:'Asia/Tbilisi',utc_offset_seconds:14400,current:{time,temperature_2m:18,pressure_msl:1013,wind_speed_10m:5,wind_gusts_10m:7,precipitation:0,relative_humidity_2m:60,weather_code:0,is_day:1},hourly:{time:times,temperature_2m:values(18),pressure_msl:values(1013),wind_speed_10m:values(5),wind_gusts_10m:values(7),precipitation:values(0),precipitation_probability:values(10),relative_humidity_2m:values(60),weather_code:values(0),is_day:values(1)},__meta:{stale:false,updatedAt:Date.parse('2026-10-23T08:15:00Z')}};
}
function app(){
  let clock=Date.parse('2026-10-23T08:15:00Z'),response=forecast();
  const events=[],requests=[];
  class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  const context=vm.createContext({Date:Clock,Intl,URLSearchParams,AbortController,Map,console,setTimeout,clearTimeout,document:{getElementById(){return null;},dispatchEvent(event){events.push(event);}},location:{hostname:'localhost'},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},fetch(){throw new Error('Unexpected external request');}});
  context.window=context;
  for(const file of ['common.js','fishing-data.js','wildlife-rules.js','daily-plan.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context,{filename:file});
  context.GeoNatureCommon.openMeteo=async(lat,lon,options)=>{requests.push({lat,lon,options});return typeof response==='function'?response(lat,lon):response;};
  const home={data:forecast(),lat:41.7151,lon:44.8271,city:'თბილისი',loading:false,error:false,live:true};
  return {context,home,events,requests,plan:context.FishHuntDayPlan,setResponse(value){response=value;},setClock(value){clock=Date.parse(value);}};
}

test('a daily plan uses actual nearby-water weather and canonical indices for remaining hours today',async()=>{
  const page=app(),data=forecast();
  // All past/tomorrow observations are better than today, but cannot win.
  data.hourly.wind_speed_10m=data.hourly.time.map(iso=>iso<'2026-10-23T13:00'||iso.startsWith('2026-10-24')?3:5);
  page.setResponse(data);const result=await page.plan.updateFromHome(page.home);
  assert.equal(result.status,'live');assert.equal(result.placeId,'mtaqvari');
  assert.deepEqual(page.requests.map(({lat,lon})=>[lat,lon]),[[41.69,44.805]]);
  assert.ok(result.bestHourAt>='2026-10-23T13:00');assert.ok(result.bestHourAt.startsWith('2026-10-23'));
  const fish=page.context.FISHES.find(fish=>fish[0]===result.fishId),water=page.context.WATERS.find(water=>water[0]===result.placeId),row=page.context.GeoNatureCommon.weatherRowAt(data,result.bestHourAt);
  assert.equal(result.index,page.context.GeoFishChance(fish,page.context.GeoNatureCommon.conditionsFromRow(row),water,true));
  assert.equal(result.sourceTime,'2026-10-23T08:15:00.000Z');assert.equal(result.weather.temperature,18);
  assert.equal(result.legalStatus,'conditional');assert.ok(result.legalSummary.includes('მეთოდი და ადგილი'));
  assert.equal(page.events.at(-1).type,'fishhunt:day-plan');
});

test('prohibited species and unlocated catalogue entries never become a recommended fishing target',async()=>{
  const page=app();
  page.context.WATERS=[['invalid','ყალბი','მდინარე','თბილისი',null,null,'carp',''],['protected','დაცული','მდინარე','თბილისი',41.7151,44.8271,'browntrout,sturgeon,salmon',''],['safe','ახლომდებარე','ტბა','თბილისი',41.72,44.83,'carp','']];
  const result=await page.plan.updateFromHome(page.home);
  assert.equal(result.placeId,'safe');assert.equal(result.fishId,'carp');assert.equal(page.requests.length,1);
  assert.ok(result.index!==null);
});

test('unknown and stale weather cannot produce an index or a recommended hour',async()=>{
  const page=app(),missing=forecast();missing.current.temperature_2m=null;page.setResponse(missing);
  const unknown=await page.plan.updateFromHome(page.home);assert.equal(unknown.status,'unavailable');assert.equal(unknown.index,null);assert.equal(unknown.bestHour,null);
  const stale=forecast();stale.__meta.stale=true;page.setResponse(stale);
  const old=await page.plan.refresh();assert.equal(old.status,'stale');assert.equal(old.index,null);assert.equal(old.bestHour,null);assert.equal(old.weather.temperature,18);
  page.setResponse(()=>Promise.reject(new Error('offline')));
  const failed=await page.plan.refresh();assert.equal(failed.status,'unavailable');assert.equal(failed.index,null);assert.equal(failed.weather,null);
});

test('a slower previous city cannot overwrite the latest nearby direction and error resets old results',async()=>{
  const page=app(),pending=[];page.setResponse((lat,lon)=>new Promise(resolve=>pending.push({lat,lon,resolve})));
  const first=page.plan.updateFromHome(page.home);
  const second=page.plan.updateFromHome({...page.home,lat:41.6168,lon:41.6367,city:'ბათუმი'});
  pending[1].resolve(forecast());await second;assert.equal(page.plan.current().placeId,'batumi');
  pending[0].resolve(forecast());await first;assert.equal(page.plan.current().placeId,'batumi');
  const unavailable=await page.plan.updateFromHome({...page.home,error:true});assert.equal(unavailable.index,null);assert.equal(unavailable.status,'unavailable');
});

test('expired snapshot reads clear the old recommendation without mutating callers or inventing tomorrow',async()=>{
  const page=app();await page.plan.updateFromHome(page.home);
  const first=page.plan.current();first.placeName='changed';assert.notEqual(page.plan.current().placeName,'changed');
  page.setClock('2026-10-23T10:00:00Z');assert.equal(page.plan.current().status,'stale');assert.equal(page.plan.current().index,null);
  const late=app();late.setClock('2026-10-23T19:15:00Z');late.setResponse(forecast('2026-10-23T23:15'));
  const result=await late.plan.updateFromHome(late.home);assert.equal(result.status,'live');assert.equal(result.bestHour,null);assert.equal(result.index,null);
});

test('forecast selection does not alter the daily plan and repeat reads share one water request',async()=>{
  const page=app();await page.plan.updateFromHome(page.home);const result=page.plan.current();
  await page.plan.updateFromHome({...page.home,date:'2026-10-24',hour:'15:00',followNow:false});
  assert.equal(page.requests.length,1);assert.equal(page.plan.current().bestHourAt,result.bestHourAt);
  await page.plan.refresh();assert.equal(page.requests.length,2);assert.equal(page.requests.at(-1).options.force,true);
  let force=null;page.context.GeoNatureHome={load:async options=>{force=options.force;}};
  await page.plan.updateFromHome({...page.home,data:null,error:true});await page.plan.refresh();assert.equal(force,true);
});

test('weather direction links accept complete numeric coordinates and reject incomplete or invalid queries',()=>{
  const page=app(),select=page.context.GeoNatureCommon.weatherLocationFromURL,defaults={lat:41,lon:44,city:'თბილისი'};
  const chosen=select('?lat=41.69&lon=44.805&name=%E1%83%9B%E1%83%A2%E1%83%99%E1%83%95%E1%83%90%E1%83%A0%E1%83%98',defaults);
  assert.equal(chosen.lat,41.69);assert.equal(chosen.lon,44.805);assert.equal(chosen.city,'მტკვარი');
  for(const query of ['', '?lat=42', '?lat=&lon=44', '?lat=91&lon=44', '?lat=41&lon=181', '?lat=NaN&lon=44', '?lat=__proto__&lon=44'])assert.equal(JSON.stringify(select(query,defaults)),JSON.stringify(defaults),query);
  assert.equal(select('?lat=0&lon=0&name=%00%20Sea',defaults).city,'Sea');assert.equal(defaults.city,'თბილისი');
});
