const assert = require('node:assert/strict');
const {test} = require('node:test');
const budget = require('../js/trip-budget.js');

const complete = overrides => ({title:'გასვლა მეგობრებთან',place:'ლისის ტბა',date:'2026-10-25',distance:'100',returnTrip:false,consumption:'8',fuelPrice:'3',noFuel:false,bait:'10',food:'20',other:'5',participants:'3',...overrides});
function storage() {
  const data = new Map();
  return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}

test('strict decimal parsing accepts decimal commas and rejects ambiguous or invalid currency',()=>{
  for (const [raw,cents] of [['0',0],['0.00',0],['1',100],['1.2',120],['1,20',120],[' 25,09 ',2509],[12.34,1234],['1000000',100000000]]) assert.equal(budget.parseDecimal(raw),cents);
  for (const empty of ['', '   ']) assert.equal(budget.parseDecimal(empty),null);
  for (const invalid of ['-1','-0.01','1.001','1,2.3','1e2','0x10','NaN','Infinity','1 000','1,000.00',NaN,Infinity,true,false,null,undefined,{},[], '1000000.01']) assert.throws(()=>budget.parseDecimal(invalid));
  assert.equal(budget.parseDecimal('50',{integer:true,max:50}),50);
  for (const invalid of ['1.5','1,5','1.0','51']) assert.throws(()=>budget.parseDecimal(invalid,{integer:true,max:50}));
});

test('fuel uses entered road distance once and return travel doubles only its cost',()=>{
  const one = budget.calculate(complete());
  assert.equal(one.complete,true);assert.equal(one.fuelCents,2400);assert.equal(one.totalCents,5900);assert.equal(one.knownTotalCents,5900);assert.equal(one.participants,3);assert.deepEqual(one.missing,[]);
  const returning = budget.calculate(complete({returnTrip:true}));
  assert.equal(returning.fuelCents,4800);assert.equal(returning.totalCents,8300);
  assert.equal(returning.totalCents-one.totalCents,2400,'food and bait are group costs and must not double with the road distance');
});

test('fuel rounds half cents once after the complete product, without intermediate litre rounding',()=>{
  const inputs = [
    ['1','1','0.49',0],
    ['1','1','0.50',1],
    ['1','1','0.51',1],
    ['13.75','7.25','3.19',318],
    ['99999.99','99.99','99.99',999799910]
  ];
  for (const [distance,consumption,fuelPrice,cents] of inputs) {
    const result=budget.calculate(complete({distance,consumption,fuelPrice,bait:'0',food:'0',other:'0',participants:'1'}));
    assert.equal(result.fuelCents,cents,`${distance}km, ${consumption}L/100km, ${fuelPrice}GEL/L`);
    assert.equal(result.totalCents,cents);
  }
});

test('blank costs remain incomplete rather than becoming a free trip or a full estimate',()=>{
  const partial=budget.calculate(complete({distance:'',bait:'',food:'20.50',other:''}));
  assert.equal(partial.complete,false);assert.equal(partial.totalCents,null);assert.equal(partial.fuelCents,null);assert.equal(partial.knownTotalCents,2050);assert.equal(partial.shares,null);
  for (const field of ['distance','bait','other']) assert.ok(partial.missing.includes(field));
  const blank=budget.calculate(complete({distance:'',consumption:'',fuelPrice:'',bait:'',food:'',other:''}));
  assert.equal(blank.complete,false);assert.equal(blank.knownTotalCents,0);assert.equal(blank.totalCents,null);assert.equal(blank.shares,null);
  const noPeople=budget.calculate(complete({participants:''}));
  assert.equal(noPeople.complete,false);assert.equal(noPeople.participants,null);assert.equal(noPeople.totalCents,null);assert.equal(noPeople.knownTotalCents,5900);assert.equal(noPeople.shares,null);assert.ok(noPeople.missing.includes('participants'));
});

test('explicit no-fuel mode excludes fuel without forgetting typed values or inventing prices',()=>{
  const raw=complete({noFuel:true,distance:'',consumption:'',fuelPrice:'',bait:'10,01',food:'0',other:'0'}),before=structuredClone(raw);
  const result=budget.calculate(raw);
  assert.equal(result.complete,true);assert.equal(result.fuelCents,0);assert.equal(result.totalCents,1001);assert.deepEqual(result.missing,[]);assert.deepEqual(raw,before,'calculation must not mutate a draft');
  const typed=complete({noFuel:true,distance:'-bad',consumption:'-bad',fuelPrice:'-bad',bait:'0',food:'0',other:'0'});
  assert.equal(budget.calculate(typed).totalCents,0);
  assert.throws(()=>budget.calculate({...typed,noFuel:false}));
});

test('fair splitting distributes every cent and never makes participants pay more than the group total',()=>{
  const result=budget.calculate(complete({noFuel:true,bait:'10',food:'0',other:'0',participants:'3'}));
  assert.deepEqual(result.shares,{lowCents:333,highCents:334,highCount:1,lowCount:2});
  for (let people=1;people<=50;people++) {
    for (const cents of [0,1,2,49,50,99,1000,10001]) {
      const value=budget.calculate(complete({noFuel:true,bait:(cents/100).toFixed(2),food:'0',other:'0',participants:String(people)})),share=value.shares;
      assert.equal(share.lowCount+share.highCount,people);
      assert.equal(share.lowCount*share.lowCents+share.highCount*share.highCents,value.totalCents);
      assert.ok(share.highCents-share.lowCents<=1);assert.ok(share.lowCents>=0);
    }
  }
});

test('invalid active values and participant counts cannot produce an estimate',()=>{
  for (const change of [{distance:'100000.01'},{consumption:'100.01'},{fuelPrice:'100.01'},{bait:'1000000.01'},{food:'-1'},{other:'1e2'},{participants:'0'},{participants:'51'},{participants:'2.5'},{participants:true},{returnTrip:'false'},{noFuel:'false'}]) assert.throws(()=>budget.calculate(complete(change)),JSON.stringify(change));
  const max=budget.calculate(complete({distance:'100000',returnTrip:true,consumption:'100',fuelPrice:'100',bait:'1000000',food:'1000000',other:'1000000',participants:'50'}));
  assert.equal(max.totalCents,2300000000);assert.ok(Number.isSafeInteger(max.totalCents));
});

test('saved incomplete drafts survive a reload without truncation, inference or changes to other account keys',()=>{
  const area=storage(),now=Date.now()-1000,input=complete({distance:'',fuelPrice:'',other:'',title:'მეგობრებთან გასვლა',place:'ჟინვალის წყალსაცავი'});
  area.setItem('fishhunt_cloud_session_v1','keep-session');area.setItem('geonature_plus_v1','keep-records');
  budget.save(input,area,now);
  const loaded=budget.load(area);assert.deepEqual(loaded.input,input);assert.equal(loaded.savedAt,new Date(now).toISOString());assert.equal(budget.calculate(loaded.input).complete,false);
  assert.ok(new TextEncoder().encode(area.getItem(budget.storageKey)).byteLength<=18000);
  budget.remove(area);assert.equal(budget.load(area),null);assert.equal(area.getItem('fishhunt_cloud_session_v1'),'keep-session');assert.equal(area.getItem('geonature_plus_v1'),'keep-records');
});

test('blocked reads, quota failures and corrupt old drafts are reported and never silently replaced',()=>{
  const area=storage(),now=Date.now()-1000;budget.save(complete(),area,now);const original=area.getItem(budget.storageKey),get=area.getItem,set=area.setItem;
  area.getItem=()=>{throw new Error('blocked');};assert.throws(()=>budget.load(area));assert.throws(()=>budget.save(complete({title:'ნუ ჩაანაცვლებ'}),area,now));area.getItem=get;assert.equal(area.getItem(budget.storageKey),original);
  area.setItem=()=>{throw new Error('quota');};assert.throws(()=>budget.save(complete({bait:'9'}),area,now));area.setItem=set;assert.equal(area.getItem(budget.storageKey),original);
  for (const raw of ['null','[]','{broken','{}', 'x'.repeat(18001)]) {
    area.setItem(budget.storageKey,raw);assert.throws(()=>budget.load(area));assert.throws(()=>budget.save(complete(),area,now));assert.equal(area.getItem(budget.storageKey),raw);
    budget.remove(area);assert.equal(budget.load(area),null,'explicit reset can recover corrupt storage');
  }
});

test('invalid stored or submitted drafts cannot silently truncate names, dates or amounts',()=>{
  const area=storage(),now=Date.now()-1000;budget.save(complete(),area,now);const original=area.getItem(budget.storageKey);
  for (const change of [{title:'გ'.repeat(5000)},{place:'გ'.repeat(5000)},{date:'2026-02-30'},{date:'tomorrow'},{bait:'3.14159'},{participants:'51'}]) {
    assert.throws(()=>budget.save(complete(change),area,now));assert.equal(area.getItem(budget.storageKey),original);
  }
});

test('stored schema, timestamps and amounts are checked before a draft is used',()=>{
  const area=storage(),now=Date.now()-1000;budget.save(complete(),area,now);const original=JSON.parse(area.getItem(budget.storageKey));
  for (const change of [{version:99},{savedAt:'yesterday'},{input:{...original.input,participants:'not-a-person-count'}},{input:{...original.input,date:'2026-02-30'}},{input:{...original.input,food:'NaN'}}]) {
    const raw=JSON.stringify({...original,...change});area.setItem(budget.storageKey,raw);assert.throws(()=>budget.load(area));assert.throws(()=>budget.save(complete(),area,now));assert.equal(area.getItem(budget.storageKey),raw);
  }
  area.setItem(budget.storageKey,JSON.stringify(original));area.removeItem=()=>{throw new Error('blocked');};assert.throws(()=>budget.remove(area));assert.deepEqual(budget.load(area).input,original.input);
});
