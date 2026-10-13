const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function client(fetch=async()=>{throw Error('Unexpected request');}){
  const context=vm.createContext({window:{location:{hostname:'localhost'}},document:{getElementById:()=>null},Intl,Date,Number,Object,Map,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/common.js'),'utf8'),context);
  return context;
}
function forecast(){
  const time='2026-10-13T12:15';
  return {timezone:'Asia/Tbilisi',utc_offset_seconds:14400,current:{time,temperature_2m:18,wind_speed_10m:4,precipitation:0,weather_code:0},current_units:{temperature_2m:'°C',wind_speed_10m:'km/h',precipitation:'mm'},hourly:{time:['2026-10-13T12:00'],temperature_2m:[20],wind_speed_10m:[7],precipitation:[0],weather_code:[1],pressure_msl:[null],precipitation_probability:[35],visibility:[9000]},daily:{time:['2026-10-13'],weather_code:[1],temperature_2m_max:[22],temperature_2m_min:[12]}};
}
const calm={temperature_2m:21,wind_speed_10m:3,precipitation:0,weather_code:0,local_hour:12};
test('missing core weather is unknown and measured zero remains a valid observation',()=>{
  const c=client();
  for(const key of ['temperature_2m','wind_speed_10m','precipitation','weather_code'])for(const missing of [null,undefined,'',false]){
    assert.equal(c.outdoorScore({...calm,[key]:missing}),null,key);
    assert.equal(c.scoreWeather({...calm,[key]:missing}),null,key);
  }
  assert.ok(Number.isFinite(c.outdoorScore({...calm,temperature_2m:0})));
  assert.equal(c.numberOrNull(' '),null);assert.equal(c.numberOrNull('0'),0);
});
test('a thunderstorm or dangerous wind cannot be presented as good outdoor conditions',()=>{
  const c=client();assert.ok(c.outdoorScore(calm)>70);
  for(const weather_code of [95,96,99])assert.ok(c.outdoorScore({...calm,weather_code})<=25);
  for(const weather_code of [56,57,66,67,86]){assert.ok(c.outdoorScore({...calm,weather_code})<=35);assert.ok(c.scoreWeather({...calm,weather_code})<=35);}
  assert.ok(c.outdoorScore({...calm,wind_gusts_10m:70})<=25);
  assert.ok(c.outdoorScore({...calm,precipitation:15})<=25);
});
test('Georgia date and hour remain correct across the UTC midnight boundary',()=>{
  const c=client(),date=new Date('2026-10-12T21:05:00Z');
  assert.equal(c.localDateISO(date),'2026-10-13');
  assert.equal(c.zonedDateTime('Asia/Tbilisi',date).hour,1);
  assert.equal(c.zonedDateTime('America/Los_Angeles',date).date,'2026-10-12');
  assert.equal(c.weatherObservationTime(forecast()),Date.parse('2026-10-13T08:15:00Z'));
  const previous=process.env.TZ;
  try{process.env.TZ='America/Los_Angeles';assert.ok(c.fmtDate('2026-10-13').includes('13'));assert.equal(c.fmtTime('2026-10-13T00:15'),'00:15');}
  finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('current observations and hourly forecasts use their own measurements and preserve nulls',()=>{
  const c=client(),data=forecast(),row=c.weatherRowAt(data,'2026-10-13T12:00'),current=c.currentWeatherRow(data);
  assert.equal(row.temperature,20);assert.equal(row.pressure,null);assert.equal(row.source,'forecast');
  assert.equal(row.apparent_temperature,null,'missing apparent temperature is not invented from air temperature');
  assert.equal(current.temperature,18);assert.equal(current.time,'12:15');assert.equal(current.source,'current');assert.equal(current.rainProb,35);
  assert.equal(current.apparent_temperature,null);
  data.current.wind_speed_10m=null;assert.equal(c.currentWeatherRow(data).wind,null);
  assert.equal(c.weatherRowAt(data,'2026-10-13T00:00'),null);
});

test('a location change clears the previous pressure gauge until the new forecast arrives',async()=>{
  const c=client(),nodes=new Map();for(const id of ['weatherGps','weatherPressureNeedle','weatherPressureValue','weatherPressureStatus','weatherPressureAdvice'])nodes.set(id,{style:{},textContent:''});
  c.document.getElementById=id=>nodes.get(id)||null;c.document.querySelectorAll=()=>[];
  c.window.addEventListener=()=>{};c.window.dispatchEvent=()=>{};c.CustomEvent=class{};
  c.navigator={geolocation:{getCurrentPosition:success=>success({coords:{latitude:42,longitude:45}})}};
  const data=forecast();data.current.pressure_msl=1022;c.openMeteo=async()=>data;
  await c.initWeatherPage(41,44,'თბილისი');assert.equal(nodes.get('weatherPressureValue').textContent,1022);
  let complete;c.openMeteo=()=>new Promise(resolve=>{complete=resolve;});nodes.get('weatherGps').onclick();
  assert.equal(nodes.get('weatherPressureValue').textContent,'—');assert.equal(nodes.get('weatherPressureNeedle').hidden,true);
  data.current.pressure_msl=1008;complete(data);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.get('weatherPressureValue').textContent,1008);assert.equal(nodes.get('weatherPressureNeedle').hidden,false);
});
test('invalid location coordinates cannot trigger a Gulf of Guinea weather request',async()=>{
  let requests=0;const c=client(async()=>{requests++;});
  for(const coordinates of [[null,null],['',44],[91,44],[41,181],[undefined,44]])await assert.rejects(c.openMeteo(...coordinates));
  assert.equal(requests,0);assert.equal(c.validCoordinates(0,0),true);
});
test('simultaneous location reads share one request and forced refresh reaches the gateway',async()=>{
  const urls=[];const c=client(async url=>{urls.push(url);await new Promise(resolve=>setTimeout(resolve,10));return{ok:true,json:async()=>({data:forecast(),meta:{source:'fixture',stale:false}})};});
  const [first,second]=await Promise.all([c.openMeteo(41,44,{force:true}),c.openMeteo(41,44)]);
  assert.equal(urls.length,1);assert.ok(urls[0].includes('refresh=1'));assert.equal(first,second);
  await c.openMeteo(41,44);assert.equal(urls.length,2);
});
test('malformed gateway data falls back to explicitly requested provider units',async()=>{
  const urls=[];const c=client(async url=>{urls.push(url);return{ok:true,json:async()=>url.startsWith('/api/')?{data:{current:{}}}:forecast()};});
  const data=await c.openMeteo(41,44);
  assert.equal(data.current.temperature_2m,18);assert.equal(urls.length,2);
  assert.ok(urls[1].includes('temperature_unit=celsius'));assert.ok(urls[1].includes('wind_speed_unit=kmh'));assert.ok(urls[1].includes('apparent_temperature'));
});
test('malformed timestamps and timezones cannot be marked as fresh current weather',()=>{
  const c=client();
  for(const time of ['garbage','2026-02-31T12:00','2026-10-13T24:00']){const data=forecast();data.current.time=time;assert.throws(()=>c.validateForecast(data));}
  const data=forecast();data.timezone='Invalid/Zone';assert.throws(()=>c.validateForecast(data));
  data.timezone='Asia/Tbilisi';data.utc_offset_seconds=null;assert.throws(()=>c.validateForecast(data));
});
test('static GitHub Pages reads the public provider and never claims an index is a catch percentage',async()=>{
  const urls=[];const c=client(async url=>{urls.push(url);return{ok:true,json:async()=>forecast()};});c.window.location.hostname='niksaniksa25.github.io';
  await c.openMeteo(41,44);assert.equal(urls.length,1);assert.ok(urls[0].startsWith('https://api.open-meteo.com/'));
  assert.ok(c.chanceMarkup(70).includes('70/100'));assert.equal(c.chanceMarkup(70).includes('70%'),false);assert.ok(c.chanceMarkup(null).includes('მონაცემი მიუწვდომელია'));
  assert.ok(c.chanceMarkup(70,'<img>').includes('&lt;img&gt;'));
});
