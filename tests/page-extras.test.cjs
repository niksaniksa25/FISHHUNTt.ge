const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function script(name,extras={}){
  const nodes=new Map(),intervals=[],listeners=new Map(),saved=new Map();
  const context=vm.createContext({Date,Intl,URLSearchParams,location:{pathname:'/test',hash:''},localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},document:{getElementById:id=>nodes.get(id)||null,addEventListener:(key,fn)=>listeners.set(key,fn),querySelector:()=>null},setInterval:fn=>{intervals.push(fn);},setTimeout:fn=>fn(),clearTimeout(){},CustomEvent:class{},MutationObserver:class{observe(){}},...extras});context.window=context;context.addEventListener=()=>{};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name),'utf8'),context);
  return {context,nodes,intervals,listeners,saved};
}
test('moon cards follow a selected future date and the periodic timer preserves that selection',()=>{
  const env=script('moon.js');env.nodes.set('homeSelectedTime',{textContent:'2026-12-23 • 02:00',addEventListener(){}});env.nodes.set('homeDateSelect',{value:'2026-12-23',addEventListener(){}});
  for(const id of ['homeMoonPhase','homeMoonIllum','homeMoonAge'])env.nodes.set(id,{textContent:''});
  env.listeners.get('DOMContentLoaded')();const before=env.nodes.get('homeMoonAge').textContent;
  assert.equal(before,env.context.GeoNatureMoon.phase(Date.parse('2026-12-22T22:00:00Z')).age.toFixed(1)+' დღე');
  env.intervals[0]();assert.equal(env.nodes.get('homeMoonAge').textContent,before);
});
test('Best Moment considers the selected dates and uses canonical scores without an optimistic fallback',()=>{
  const env=script('geo-page-extras.js');env.context.selectedFish=['fish','Fish'];env.context.selectedWater=['lake'];env.context.GNPremium={maxForecastDays:()=>2};env.nodes.set('startDate',{value:'2026-10-14'});
  env.context.plannerWeather={hourly:{time:['2026-10-13T08:00','2026-10-14T08:00','2026-10-15T08:00']}};
  env.context.GeoNatureCommon={numberOrNull:v=>v===null?null:Number(v),zonedDateTime:()=>({date:'2026-10-13',hour:8})};const calls=[];
  env.context.GeoFishingPlanner={scoredHours:(data,date)=>{calls.push(date);return date==='2026-10-14'?[{r:{iso:date+'T08:00',time:'08:00'},score:30}]:[];}};
  const result=env.context.GeoNaturePageExtras.recommendations('fish');assert.equal(result.length,1);assert.equal(result[0].score,30);assert.equal(result[0].date,'2026-10-14');assert.equal(calls.join(','),'2026-10-14,2026-10-15');
  env.context.GeoFishingPlanner.scoredHours=()=>[];assert.equal(env.context.GeoNaturePageExtras.recommendations('fish').length,0);
});
test('hunting Best Moment uses the selected species scorer and excludes elapsed hours',()=>{
  const env=script('geo-page-extras.js');env.context.selectedHunt=['mammal','Fox'];env.context.HUNT_REGIONS=[['თბილისი']];env.nodes.set('huntRegion',{value:'თბილისი'});env.nodes.set('huntStartDate',{value:'2026-10-13'});
  env.context.huntWeather={hourly:{time:['2026-10-13T07:00','2026-10-13T08:00','2026-10-13T09:00']}};
  env.context.GeoNatureCommon={zonedDateTime:()=>({date:'2026-10-13',hour:8}),hourlyRows:()=>[7,8,9].map(hour=>({iso:'2026-10-13T0'+hour+':00',time:'0'+hour+':00',local_hour:hour}))};const calls=[];
  env.context.GeoHuntingPlanner={scoreForRow:(row,region)=>{calls.push([row.local_hour,region[0]]);return row.local_hour===8?null:75;}};
  const result=env.context.GeoNaturePageExtras.recommendations('hunt');assert.equal(result[0].score,75);assert.equal(result[0].row.local_hour,9);assert.equal(calls.map(call=>call.join(':')).join(','),'8:თბილისი,9:თბილისი');
});
test('Best Moment stays within the selected calendar period even when Premium allows more days',()=>{
  for(const kind of ['fish','hunt']){
    const env=script('geo-page-extras.js');env.context.GNPremium={maxForecastDays:()=>7};
    env.context[kind==='fish'?'selectedFish':'selectedHunt']=['subject','Species'];
    env.nodes.set(kind==='fish'?'startDate':'huntStartDate',{value:'2026-10-14'});
    const control={value:'1'};env.nodes.set(kind==='fish'?'daysCount':'huntDays',control);
    env.context[kind==='fish'?'plannerWeather':'huntWeather']={hourly:{time:['2026-10-14T08:00','2026-10-16T08:00']}};
    const scored=date=>[{row:{iso:date+'T08:00',time:'08:00',local_hour:8},score:date==='2026-10-14'?30:95}];
    env.context.GeoNatureCommon={zonedDateTime:()=>({date:'2026-10-13',hour:8}),hourlyRows:(data,date)=>scored(date).map(item=>item.row)};
    env.context.GeoFishingPlanner={scoredHours:(data,date)=>scored(date).map(item=>({r:item.row,score:item.score}))};
    env.context.GeoHuntingPlanner={scoreForRow:row=>scored(row.iso.slice(0,10))[0].score};
    let result=env.context.GeoNaturePageExtras.recommendations(kind);assert.equal(result.length,1);assert.equal(result[0].score,30);
    control.value='2';result=env.context.GeoNaturePageExtras.recommendations(kind);assert.equal(result.length,1,'missing forecast day must not extend the selected calendar window');
    control.value='3';result=env.context.GeoNaturePageExtras.recommendations(kind);assert.equal(result.length,2);
  }
});
test('standalone and planner catches are combined for display without copying them into either store',()=>{
  const env=script('geonature-plus.js');env.saved.set('geonature_plus_v1',JSON.stringify({catches:[{id:1,fish:'კობრი',weight:1}],xp:50}));env.saved.set('gn_catches',JSON.stringify([{id:'abc',species:'ლოქო',weight:2,createdAt:2}]));
  const combined=env.context.GeoNaturePlus.allCatches();assert.equal(combined.length,2);assert.equal(combined[1].fish,'ლოქო');assert.equal(env.context.GeoNaturePlus.state().catches.length,1);
  env.saved.set('gn_catches','{}');assert.equal(env.context.GeoNaturePlus.allCatches().length,1);
});
test('personal insights use the same combined catch records as the dashboard',()=>{
  const env=script('geo-extras.js',{GeoNaturePlus:{allCatches:()=>[{fish:'ლოქო',place:'თბილისის ზღვა',weight:2.5}]}});
  const box={innerHTML:''};env.nodes.set('gnPersonalInsightsGrid',box);env.saved.set('geonature_plus_v1',JSON.stringify({catches:[],xp:10}));
  env.context.GeoNatureExtras.renderPersonalInsights();assert.match(box.innerHTML,/ლოქო • 2.5 კგ/);assert.match(box.innerHTML,/თბილისის ზღვა/);assert.doesNotMatch(box.innerHTML,/Catch Log ჯერ ცარიელია/);
});
test('fresh and malformed dashboard storage renders personal insights through the actual shared catch helper',()=>{
  const env=script('geonature-plus.js');vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/geo-extras.js'),'utf8'),env.context);
  const box={innerHTML:''};env.nodes.set('gnPersonalInsightsGrid',box);
  env.context.GeoNatureExtras.renderPersonalInsights();assert.match(box.innerHTML,/Catch Log ჯერ ცარიელია/);
  for(const stored of [{},null,{catches:{}},{catches:[null,'bad']}]){
    env.saved.set('geonature_plus_v1',JSON.stringify(stored));env.saved.set('gn_catches',JSON.stringify([{species:'ლოქო',weight:2.5}]));
    env.context.GeoNatureExtras.renderPersonalInsights();assert.match(box.innerHTML,/ლოქო • 2.5 კგ/);assert.doesNotMatch(box.innerHTML,/Catch Log ჯერ ცარიელია/);
  }
  assert.equal(env.context.GeoNaturePlus.allCatches(null).length,1);
});
