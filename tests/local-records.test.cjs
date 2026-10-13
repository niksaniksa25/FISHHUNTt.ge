const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture(raw='[]'){
  const ids=['catchDate','catchTime','catchPhoto','photoPreview','catchForm','catchSpecies','catchPlace','catchWeight','catchLength','catchBait','catchNotes','clearCatch','clearAllCatches','catchList'];
  const elements=Object.fromEntries(ids.map(id=>[id,{value:id==='catchPlace'?'ჟინვალი':'',innerHTML:'',textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},querySelectorAll(){return[];},reset(){}}]));
  let stored=raw,failed=false,drawn='';const alerts=[],readers=[];
  const context=vm.createContext({
    window:{GeoNatureCommon:{localDateISO:()=> '2026-10-13',zonedDateTime:()=>({time:'01:30'})}},
    document:{getElementById:id=>elements[id],addEventListener:(type,fn)=>{if(type==='DOMContentLoaded')fn();},createElement:()=>({getContext:()=>({drawImage:image=>{drawn=image.source;}}),toDataURL:()=>drawn})},
    localStorage:{getItem:()=>stored,setItem:(key,value)=>{if(failed)throw Error('QuotaExceededError');stored=value;}},
    FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{width=100;height=100;set src(value){this.source=value;this.onload();}},
    Date,crypto:{randomUUID:()=> 'local-fixture-id'},alert:message=>alerts.push(message),confirm:()=>true,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/catch-log.js'),'utf8'),context);
  return {elements,alerts,readers,get stored(){return JSON.parse(stored);},fail(){failed=true;},submit(){elements.catchForm.listeners.submit({preventDefault(){},target:elements.catchForm});},
    photo(name){return elements.catchPhoto.listeners.change({target:{files:[{name}]}});},finish(index,data){readers[index].result=data;readers[index].onload();}};
}
test('malformed catch storage is recoverable rather than crashing the list',()=>{
  for(const raw of ['{}','null','[null,1]','not json']){const f=fixture(raw);f.elements.catchSpecies.value='კობრი';f.submit();assert.equal(f.stored.length,1);assert.equal(f.stored[0].species,'კობრი');}
});
test('quota failures preserve the form and do not clear saved catches',()=>{
  const f=fixture('[{"id":"old","species":"კობრი"}]');f.fail();f.elements.catchSpecies.value='ლოქო';f.submit();
  assert.equal(f.stored.length,1);assert.equal(f.elements.catchSpecies.value,'ლოქო');assert.ok(f.alerts[0].includes('ვერ შეინახა'));
  f.elements.clearAllCatches.onclick();assert.equal(f.stored.length,1);
});
test('late photo A cannot replace photo B when two images finish out of order',async()=>{
  const f=fixture(),a=f.photo('A'),b=f.photo('B');
  f.finish(1,'data:image/jpeg;base64,Qg==');await b;
  f.finish(0,'data:image/jpeg;base64,QQ==');await a;
  assert.ok(f.elements.photoPreview.innerHTML.includes('Qg=='));assert.equal(f.elements.photoPreview.innerHTML.includes('QQ=='),false);
  f.elements.catchSpecies.value='კობრი';f.submit();assert.equal(f.stored[0].photo,'data:image/jpeg;base64,Qg==');
});
test('clearing a pending photo invalidates it and saving waits for compression',async()=>{
  const f=fixture(),pending=f.photo('A');f.submit();assert.equal(f.stored.length,0);assert.ok(f.alerts[0].includes('მუშავდება'));
  f.elements.clearCatch.onclick();f.finish(0,'data:image/jpeg;base64,QQ==');await pending;
  f.elements.catchSpecies.value='კობრი';f.submit();assert.equal(f.stored[0].photo,'');assert.equal(f.elements.photoPreview.innerHTML.includes('QQ=='),false);
});
test('stored photo markup cannot inject a new image attribute',()=>{
  const f=fixture(JSON.stringify([{id:'1',species:'კობრი',photo:'x" onerror="alert(1)'}]));assert.equal(f.elements.catchList.innerHTML.includes('<img'),false);
});

test('clearing a catch form restores the current Georgia date and time',()=>{
  const f=fixture();f.elements.catchDate.value='';f.elements.catchTime.value='';f.elements.clearCatch.onclick();
  assert.equal(f.elements.catchDate.value,'2026-10-13');assert.equal(f.elements.catchTime.value,'01:30');
});
test('negative measurements and impossible dates do not create saved catch records',()=>{
  const f=fixture();f.elements.catchSpecies.value='კობრი';
  for(const[weight,length,date]of [['-1','','2026-10-13'],['','-1','2026-10-13'],['1','','2026-02-30']]){
    f.elements.catchWeight.value=weight;f.elements.catchLength.value=length;f.elements.catchDate.value=date;f.submit();assert.equal(f.stored.length,0);
  }
});
