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
  assert.equal(result.calibration.adjustedScore,Math.round(result.calibration.weightedScore*result.calibration.coverage));
  assert.equal(result.score,Math.min(result.calibration.adjustedScore,...result.caps.map(c=>c.value)));
  assert.ok(result.score<result.rawScore);assert.ok(result.calibration.missing.includes('water_temperature'));assert.ok(result.calibration.missing.includes('gust'));
  const habitat=result.components.find(c=>c.key==='habitat');assert.equal(habitat.fit,100);assert.equal(habitat.weight,0);assert.equal(habitat.contribution,0);
});
test('missing essential data never presents a completed score explanation',()=>{
  const m=model(),fish=m.FISHES[0],result=m.GeoFishConditions.explain(fish,{...weather,pressure_msl:null});
  assert.equal(result.score,null);assert.equal(result.rawScore,null);assert.ok(result.unknownReason);
  assert.ok(result.components.every(c=>c.contribution===null));assert.equal(result.components.find(c=>c.key==='pressure').available,false);
  assert.equal(result.calibration.weightedScore,null);assert.equal(result.calibration.adjustedScore,null);
});

test('only explicitly disabled activity is removed from the confidence denominator',()=>{
  const m=model(),fish=m.FISHES.find(f=>f[0]==='catfish'),water=m.WATERS.find(w=>w[6].split(',').includes('catfish'));
  const absent=m.GeoFishConditions.explain(fish,{...weather,local_hour:null},water),disabled=m.GeoFishConditions.explain(fish,{...weather,local_hour:null},water,false);
  assert.ok(Math.abs(absent.calibration.totalWeight-1)<1e-9);assert.ok(Math.abs(disabled.calibration.totalWeight-.8)<1e-9);
  assert.ok(absent.calibration.missing.includes('activity'));assert.ok(!disabled.calibration.missing.includes('activity'));
  assert.ok(disabled.score>absent.score);assert.equal(disabled.components.find(c=>c.key==='activity').applicable,false);
});

test('complete observations preserve exact weighted contributions and wrapper parity',()=>{
  const m=model(),fish=m.FISHES.find(f=>f[0]==='catfish'),water=m.WATERS.find(w=>w[6].split(',').includes('catfish'));
  const known={...weather,wind_gusts_10m:8,water_temperature:22},result=m.GeoFishConditions.explain(fish,known,water);
  assert.ok(Math.abs(result.calibration.coverage-1)<1e-9);assert.equal(result.calibration.missing.length,0);
  assert.equal(result.score,result.rawScore);assert.equal(result.score,m.GeoFishChance(fish,known,water));
  assert.ok(Math.abs(result.components.reduce((sum,term)=>sum+(term.contribution||0),0)-result.calibration.weightedScore)<1e-9);
  const backend=model();assert.equal(result.score,backend.GeoFishChance(backend.FISHES.find(f=>f[0]===fish[0]),known,backend.WATERS.find(w=>w[0]===water[0])));
});
test('explanation exposes actual habitat and storm caps rather than implying the weighted sum is final',()=>{
  const m=model(),fish=m.FISHES.find(f=>f[0]==='catfish'),water=m.WATERS.find(w=>w[6].split(',').includes('catfish'));
  const storm=m.GeoFishConditions.explain(fish,{...weather,weather_code:95},water);
  assert.ok(storm.rawScore>storm.score);assert.equal(storm.score,20);assert.ok(storm.caps.some(c=>c.key==='hazard'&&c.active&&c.value===20));
  const unconfirmed=m.GeoFishConditions.explain(fish,weather,[...water.slice(0,6),'unconfirmed']);
  assert.ok(unconfirmed.score<=40);assert.ok(unconfirmed.caps.some(c=>c.key==='habitat'&&c.active&&c.value===40));
});
