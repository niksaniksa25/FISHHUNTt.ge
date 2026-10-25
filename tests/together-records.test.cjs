const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function fixture(raw='[]'){
  const nodes=new Map(),listeners={};let stored=raw,readBlocked=false,writeBlocked=false;
  class Element{
    constructor(id=''){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.dataset={};this.listeners={};}
    set id(value){this.identifier=value;if(value)nodes.set(value,this);}get id(){return this.identifier;}
    setAttribute(){}after(){}scrollIntoView(){}focus(){}
    addEventListener(type,run){this.listeners[type]=run;}
    querySelector(selector){return selector==='button[type="submit"]'?nodes.get('submit'):null;}
  }
  for(const id of ['tripForm','tripFeed','tripStatus','tripTitle','tripPlace','tripDate','tripText','submit'])new Element(id);
  nodes.get('tripForm').reset=()=>{for(const id of ['tripTitle','tripPlace','tripDate','tripText'])nodes.get(id).value='';};
  const context=vm.createContext({document:{getElementById:id=>nodes.get(id)||null,createElement:()=>new Element()},localStorage:{getItem:()=>{if(readBlocked)throw Error('blocked');return stored;},setItem:(key,value)=>{if(writeBlocked)throw Error('quota');stored=value;}},GeoNatureCommon:{localDateISO:()=> '2026-10-25'},crypto:{randomUUID:()=> 'new-trip'},Date,URL,navigator:{},confirm:()=>true,addEventListener:(type,run)=>{listeners[type]=run;}});
  context.window=context;vm.runInContext(fs.readFileSync(require.resolve('../js/together.js'),'utf8'),context);context.initTogether();
  const setFields=({title='ჩემი გასვლა',place='ლისი',date='2026-10-26',text='აღწერა'}={})=>{for(const [id,value] of [['tripTitle',title],['tripPlace',place],['tripDate',date],['tripText',text]])nodes.get(id).value=value;};
  return {nodes,get raw(){return stored;},get records(){return JSON.parse(stored);},replace(value){stored=value;},blockRead(){readBlocked=true;},blockWrite(){writeBlocked=true;},setFields,save(){nodes.get('tripForm').onsubmit({preventDefault(){}});},async edit(id){const button={dataset:{edit:id},closest(){return this;}};await nodes.get('tripFeed').listeners.click({target:button});},storage(){listeners.storage({key:'geonature_trips_v2'});}};
}

test('Together preserves malformed saved data until the user explicitly confirms a reset',()=>{
  for(const raw of ['not json','null','{}','[null]']){
    const app=fixture(raw);assert.equal(app.nodes.get('tripResetStorage').hidden,false);assert.match(app.nodes.get('tripFeed').innerHTML,/ვერ ჩაიტვირთა/);
    app.setFields();app.save();assert.equal(app.raw,raw);assert.match(app.nodes.get('tripStatus').textContent,/არ შეცვლილა/);
    app.nodes.get('tripResetStorage').onclick();assert.deepEqual(app.records,[]);assert.equal(app.nodes.get('tripResetStorage').hidden,true);
    app.setFields();app.save();assert.equal(app.records[0].title,'ჩემი გასვლა');
  }
});

test('Together refuses a stale open edit after another tab changes the same trip and keeps the draft',async()=>{
  const original={id:'same',title:'ძველი',place:'ლისი',date:'2026-10-26',text:'პირველი'},app=fixture(JSON.stringify([original]));
  assert.equal(app.nodes.get('tripCancelEdit').hidden,true);await app.edit('same');app.setFields({title:'ჩემი ცვლილება'});
  const changed={...original,title:'სხვა ჩანართის ცვლილება',text:'მეორე'},external=JSON.stringify([changed]);app.replace(external);app.storage();app.save();
  assert.equal(app.raw,external);assert.equal(app.nodes.get('tripTitle').value,'ჩემი ცვლილება');assert.match(app.nodes.get('tripStatus').textContent,/სხვა ჩანართში შეიცვალა/);
  app.nodes.get('tripCancelEdit').onclick();await app.edit('same');assert.equal(app.nodes.get('tripTitle').value,changed.title);app.setFields({title:'შემოწმებული ცვლილება'});app.save();
  assert.equal(app.records[0].title,'შემოწმებული ცვლილება');assert.equal(app.records[0].id,'same');
});

test('unreadable or unwritable trip storage preserves existing records and form values',()=>{
  const raw=JSON.stringify([{id:'old',title:'ძველი',date:'2026-10-26'}]);
  for(const failure of ['blockRead','blockWrite']){
    const app=fixture(raw);app[failure]();app.setFields({title:'ახალი ფორმა'});app.save();assert.equal(app.raw,raw);assert.equal(app.nodes.get('tripTitle').value,'ახალი ფორმა');
    assert.match(app.nodes.get('tripStatus').textContent,failure==='blockRead'?/არ შეცვლილა/:/ვერ შეინახა/);
  }
});

test('deleting an edited trip elsewhere cannot recreate it during the first stale save',async()=>{
  const app=fixture(JSON.stringify([{id:'old',title:'ძველი',place:'ლისი',date:'2026-10-26'}]));await app.edit('old');app.setFields();app.replace('[]');app.save();assert.deepEqual(app.records,[]);assert.match(app.nodes.get('tripStatus').textContent,/სხვა ჩანართში წაიშალა/);
  app.save();assert.equal(app.records[0].id,'new-trip');
});
