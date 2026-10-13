const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function model(){const context=vm.createContext({window:{},Date,Intl});vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/fishing-data.js'),'utf8'),context);return context.window;}
const weather={temperature_2m:20,pressure_msl:1015,wind_speed_10m:5,precipitation:0,weather_code:1,relative_humidity_2m:60,precipitation_probability:10,local_hour:0};
test('visible contributions reproduce the exact published index and normalize only measured factors',()=>{
  const m=model(),fish=m.FISHES.find(f=>f[0]==='catfish'),water=m.WATERS.find(w=>w[6].split(',').includes('catfish')),result=m.GeoFishConditions.explain(fish,weather,water);
  assert.equal(result.score,m.GeoFishChance(fish,weather,water));
  assert.ok(Math.abs(result.components.reduce((sum,c)=>sum+c.normalizedWeight,0)-1)<1e-9);
  assert.equal(Math.round(result.components.reduce((sum,c)=>sum+(c.contribution??0),0)),result.rawScore);
  const waterTerm=result.components.find(c=>c.key==='water_temperature');assert.equal(waterTerm.available,false);assert.equal(waterTerm.contribution,null);assert.match(waterTerm.reason,/არ იზომება/);
});
test('missing essential data never presents a completed score explanation',()=>{
  const m=model(),fish=m.FISHES[0],result=m.GeoFishConditions.explain(fish,{...weather,pressure_msl:null});
  assert.equal(result.score,null);assert.equal(result.rawScore,null);assert.ok(result.unknownReason);
  assert.ok(result.components.every(c=>c.contribution===null));assert.equal(result.components.find(c=>c.key==='pressure').available,false);
});
test('explanation exposes actual habitat and storm caps rather than implying the weighted sum is final',()=>{
  const m=model(),fish=m.FISHES.find(f=>f[0]==='catfish'),water=m.WATERS.find(w=>w[6].split(',').includes('catfish'));
  const storm=m.GeoFishConditions.explain(fish,{...weather,weather_code:95},water);
  assert.ok(storm.rawScore>storm.score);assert.equal(storm.score,20);assert.ok(storm.caps.some(c=>c.key==='hazard'&&c.active&&c.value===20));
  const unconfirmed=m.GeoFishConditions.explain(fish,weather,[...water.slice(0,6),'unconfirmed']);
  assert.ok(unconfirmed.score<=40);assert.ok(unconfirmed.caps.some(c=>c.key==='habitat'&&c.active&&c.value===40));
});
