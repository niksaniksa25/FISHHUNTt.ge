const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function element(id=''){
  return {id,value:'',textContent:'',innerHTML:'',disabled:false,style:{},dataset:{},attributes:{},options:[],classList:{toggle(){},add(){},remove(){},contains(){return false;}},setAttribute(key,value){this.attributes[key]=value;},querySelector(){return null;},querySelectorAll(){return [];},appendChild(){},prepend(){},addEventListener(){},blur(){}};
}
function browser(ids=[]){
  const elements=new Map(ids.map(id=>[id,element(id)])),intervals=new Map();let nextTimer=0;
  const listeners=new Map();
  const document={hidden:false,readyState:'loading',getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],createElement:()=>element(),addEventListener(name,fn){listeners.set(name,fn);},dispatchEvent(){}};
  const context=vm.createContext({document,console:{warn(){},error(){},log(){}},Date,Intl,URL,URLSearchParams,AbortController,location:{search:'',hostname:'localhost',pathname:'/test'},navigator:{},setTimeout:()=>++nextTimer,clearTimeout(){},setInterval(fn){const id=++nextTimer;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),CustomEvent:class{constructor(type){this.type=type;}},fetch:async()=>{throw new Error('offline');}});
  context.window=context;context.addEventListener=()=>{};
  const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  return {context,elements,intervals,listeners,load};
}
function weather(date='2026-10-13',hours=[8,9]){
  const time=hours.map(hour=>`${date}T${String(hour).padStart(2,'0')}:00`),fill=value=>time.map(()=>value);
  return {timezone:'Asia/Tbilisi',utc_offset_seconds:14400,current:{time:date+'T08:15',temperature_2m:20,apparent_temperature:20,wind_speed_10m:2,precipitation:0,weather_code:0,pressure_msl:1013,relative_humidity_2m:60,cloud_cover:10,wind_gusts_10m:4},hourly:{time,temperature_2m:fill(20),apparent_temperature:fill(20),pressure_msl:fill(1013),wind_speed_10m:fill(2),precipitation:fill(0),weather_code:fill(0),precipitation_probability:fill(0),relative_humidity_2m:fill(60),cloud_cover:fill(10),wind_gusts_10m:fill(4),visibility:fill(10000)},__meta:{updatedAt:Date.now(),source:'Open-Meteo',stale:false}};
}
const factorIds=['assessmentFactors','assessmentRefresh','assessmentLiveToggle','assessmentLiveState','factorLocation','factorHour','factorTemp','factorPressure','factorWind','factorRain','factorCloud','factorHumidity','factorGust','factorVisibility','factorFeed','factorFeedDetail','factorPressureChange','factorPressureChangeDetail','factorWeather','factorMode','factorUpdated','factorSource','factorKp'];
test('live factors keep missing weather unknown and distinguish current, forecast, stale and failed location',()=>{
  const env=browser(factorIds);env.load('js/common.js');env.load('js/live-factors.js');
  const data=weather(),row=env.context.GeoNatureCommon.weatherRowAt(data,data.hourly.time[1]);row.cloud=null;row.rainProb=null;data.hourly.pressure_msl[0]=null;
  env.context.GNLiveFactors.render({data,row,type:'weather',locationName:'A'});
  assert.equal(env.elements.get('factorCloud').textContent,'მონაცემი არ არის');assert.equal(env.elements.get('factorRain').textContent,'0.0 მმ');assert.equal(env.elements.get('factorPressureChange').textContent,'მონაცემი არ არის');
  assert.match(env.elements.get('factorMode').textContent,/პროგნოზი/);assert.match(env.elements.get('assessmentLiveState').textContent,/პროგნოზი/);assert.match(env.elements.get('factorFeed').textContent,/^\d+\/100$/);
  env.context.GNLiveFactors.render({data,row:{...row,current:true},type:'weather',locationName:'A'});
  assert.match(env.elements.get('factorMode').textContent,/LIVE/);assert.match(env.elements.get('assessmentLiveState').textContent,/LIVE/);
  env.context.GNLiveFactors.render({data,row:{...row,current:true,temperature:null},type:'weather',locationName:'A'});assert.doesNotMatch(env.elements.get('assessmentLiveState').textContent,/LIVE/);
  env.context.GNLiveFactors.render({data:{...data,__meta:{...data.__meta,stale:true}},row:{...row,current:true},type:'weather'});
  assert.doesNotMatch(env.elements.get('factorMode').textContent,/LIVE/);
  env.context.GNLiveFactors.render({data:null,row:null,error:true,locationName:'B'});
  assert.equal(env.elements.get('factorTemp').textContent,'მონაცემი არ არის');assert.equal(env.elements.get('factorLocation').textContent,'B');
});
test('live refresh pauses its timer and coalesces repeated manual refreshes',async()=>{
  const env=browser(factorIds);env.load('js/live-factors.js');const pending=deferred();let calls=0;
  env.context.GNLiveFactors.bind({refresh:()=>{calls++;return pending.promise;}});
  assert.equal(env.intervals.size,1);
  env.elements.get('assessmentLiveToggle').onclick();assert.equal(env.intervals.size,0);assert.match(env.elements.get('assessmentLiveState').textContent,/PAUSED/);
  const a=env.elements.get('assessmentRefresh').onclick(),b=env.elements.get('assessmentRefresh').onclick();await flush();
  assert.equal(calls,1);assert.equal(a,b);assert.equal(env.elements.get('assessmentRefresh').disabled,true);
  pending.resolve();await a;assert.equal(env.elements.get('assessmentRefresh').disabled,false);
});
test('Kp uses recent NOAA observations, shares an in-flight request and rejects old values',async()=>{
  const env=browser();const pending=deferred();let requests=0;env.context.fetch=()=>{requests++;return pending.promise;};env.load('js/live-factors.js');
  const a=env.context.GNLiveFactors.fetchKp(),b=env.context.GNLiveFactors.fetchKp();assert.equal(requests,1);
  pending.resolve({ok:true,json:async()=>[['time_tag','Kp'],[new Date(Date.now()-3600000).toISOString(),0]]});assert.equal(await a,0);assert.equal(await b,0);
  const other=browser();other.context.fetch=async()=>({ok:true,json:async()=>[['time_tag','Kp'],['2000-01-01 00:00:00','9']]});other.load('js/live-factors.js');assert.equal(await other.context.GNLiveFactors.fetchKp(),null);
});
test('Kp accepts the NOAA object schema including its first record and rejects stale observations',async()=>{
  const env=browser();env.context.fetch=async()=>({ok:true,json:async()=>[{time_tag:new Date(Date.now()-3600000).toISOString(),Kp:1.33,a_running:5,station_count:8}]});env.load('js/live-factors.js');
  assert.equal(await env.context.GNLiveFactors.fetchKp(),1.33);
  const old=browser();old.context.fetch=async()=>({ok:true,json:async()=>[{time_tag:'2000-01-01T00:00:00',Kp:4,a_running:27,station_count:8}]});old.load('js/live-factors.js');
  assert.equal(await old.context.GNLiveFactors.fetchKp(),null);
});
test('hunting honors midnight and cannot score missing core weather or promising thunderstorms',()=>{
  const env=browser();env.load('js/common.js');env.load('js/hunting.js');const nocturnal=['mammal','Fox','','','','','','','ღამე'];
  assert.equal(env.context.huntActivityScore(nocturnal,0),100);assert.equal(env.context.huntActivityScore(nocturnal,12),26);assert.equal(env.context.huntActivityScore(nocturnal,null),null);
  const data=weather(),row=env.context.huntRowsForDate(data,'2026-10-13')[0],conditions=env.context.GeoHuntingPlanner.conditionFromRow(row),region=['თბილისი',41.7,44.8];
  assert.equal(env.context.huntScoreForHour(nocturnal,{...conditions,precipitation:null},region,8),null);
  assert.ok(env.context.huntScoreForHour(nocturnal,{...conditions,weather_code:95},region,8)<=20);
  data.hourly.wind_speed_10m[0]=null;assert.equal(env.context.huntRowsForDate(data,'2026-10-13')[0].wind,null);
});
function mapEnvironment(){
  const env=browser(['mapDate','mapHour','mapLiveLabel','mapInfo','mapRefresh','mapLiveToggle','routeInfo','clearRoute']),markers=[];
  const map={setView(){return this;},on(){return this;},removeLayer(){},invalidateSize(){},fitBounds(){},getCenter(){return {lat:42,lng:43};}};
  env.context.L={map:()=>map,tileLayer:()=>({addTo(){}}),divIcon:options=>options,marker:(coords,options)=>{const marker={coords,options,icon:options?.icon,addTo(){markers.push(this);return this;},on(){return this;},setLatLng(){},setIcon(icon){this.icon=icon;},bindPopup(html){this.popup=html;return this;},openPopup(){return this;}};return marker;}};
  const cache=new Map();env.context.sessionStorage={getItem:key=>cache.get(key)||null,setItem:(key,value)=>cache.set(key,value)};
  env.context.WATERS=[['one','Lake','lake','region',42,43],['two','River','river','region',41,44]];
  env.load('js/common.js');env.context.GeoNatureCommon.zonedDateTime=()=>({date:'2026-10-13',hour:8});env.context.GeoNatureCommon.weatherObservationTime=()=>Date.now();env.load('js/map.js');
  return {...env,markers};
}
test('map never invents scores or reuses another hour after a failed request',async()=>{
  const env=mapEnvironment();let requests=0;const first=deferred();env.context.fetch=()=>{requests++;return first.promise;};
  env.context.initGeoMap();assert.equal(env.markers.length,2);assert.match(env.markers[0].icon.html,/score-unavailable.*—/);
  first.resolve({ok:true,json:async()=>[weather(),weather()]});await flush();await flush();assert.doesNotMatch(env.markers[0].icon.html,/—/);
  const firstScore=env.markers[0].icon.html;
  env.context.fetch=async()=>{requests++;throw new Error('offline');};env.elements.get('mapHour').value='9';await env.elements.get('mapHour').onchange();await flush();await flush();
  assert.match(env.markers[0].icon.html,/score-unavailable.*—/);assert.notEqual(env.markers[0].icon.html,firstScore);assert.doesNotMatch(env.elements.get('mapInfo').textContent,/შენახული/);
  assert.equal(requests,2);
});
test('map discards late responses after the selected hour changes and manual refresh bypasses cache',async()=>{
  const env=mapEnvironment(),first=deferred(),second=deferred();let requests=0;env.context.fetch=()=>++requests===1?first.promise:second.promise;
  env.context.initGeoMap();env.elements.get('mapHour').value='9';env.elements.get('mapHour').onchange();
  const next=weather();next.hourly.temperature_2m[1]=5;second.resolve({ok:true,json:async()=>[next,next]});await flush();await flush();const selectedIcon=env.markers[0].icon.html;
  first.resolve({ok:true,json:async()=>[weather(),weather()]});await flush();await flush();assert.equal(env.markers[0].icon.html,selectedIcon);assert.match(env.elements.get('mapInfo').textContent,/09:00/);
  env.context.fetch=async()=>{requests++;return {ok:true,json:async()=>[next,next]};};await env.elements.get('mapRefresh').onclick();assert.equal(requests,3);
});
test('hunting planner ignores a late forecast from the previously selected region',async()=>{
  const env=browser(['huntRegion','huntStartDate','huntDays','huntDayCards','huntHourlyStrip','huntHourlySelected','huntBestCallout']);env.load('js/common.js');env.load('js/hunting.js');
  env.elements.get('huntRegion').value='თბილისი';env.elements.get('huntStartDate').value='2026-10-13';env.elements.get('huntDays').value='1';
  vm.runInContext("selectedHunt=['mammal','Fox','','','','','','','ღამე'];renderHuntDays=()=>{};renderHuntHourly=()=>{};",env.context);
  const first=deferred(),second=deferred();let requests=0;env.context.openMeteo=()=>++requests===1?first.promise:second.promise;
  const a=env.context.runHuntPlanner();env.elements.get('huntRegion').value='თელავი';const b=env.context.runHuntPlanner();
  const current=weather();current.location='Telavi';second.resolve(current);await b;
  const previous=weather();previous.location='Tbilisi';first.resolve(previous);await a;assert.equal(env.context.huntWeather.location,'Telavi');
});
test('premium daily fishing average uses the same complete hourly conditions and rejects missing scores',()=>{
  const env=browser(['hourlyFishingSection','startDate','gnFishingAccess']);env.load('js/common.js');
  env.context.GeoNatureCommon.zonedDateTime=()=>({date:'2026-10-13',hour:8});env.elements.get('startDate').value='2026-10-13';
  const average=element(),host=env.elements.get('hourlyFishingSection');host.querySelector=selector=>selector==='.gn-hourly-average'?average:null;
  env.context.selectedFish=['carp'];env.context.selectedWater=['lake'];env.context.plannerWeather=weather();
  const scored=[];env.context.fishScore=(fish,conditions)=>{scored.push(conditions);return conditions.temperature_2m===null?null:conditions.local_hour===8?80:90;};
  env.load('js/premium-hourly.js');env.context.GNHourlyAccess.refresh();assert.match(average.innerHTML,/85\/100/);assert.equal(scored[0].apparent_temperature,20);assert.equal(scored[1].local_hour,9);assert.equal(scored[0].visibility,10000);
  env.context.plannerWeather.hourly.temperature_2m[0]=null;env.context.GNHourlyAccess.refresh();assert.match(average.innerHTML,/მიუწვდომელია/);assert.doesNotMatch(average.innerHTML,/\/100/);
});
