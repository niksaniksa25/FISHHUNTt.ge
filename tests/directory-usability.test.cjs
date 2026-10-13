const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=name=>fs.readFileSync(path.join(__dirname,'../js',name),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function browser(search=''){
  const elements=new Map(),ready=[],intervals=[],rendered=[];
  let context;
  class Element{
    constructor(id=''){this.id=id;this.value='';this.textContent='';this.dataset={};this.children=[];this.attributes={};this.listeners={};this.disabled=false;this.isConnected=true;this.firstChild={textContent:''};this.parentElement={appendChild(){}};this.classList={toggle(){},add(){},remove(){}};this.image={isConnected:true,dataset:{}};this.slot={};}
    set innerHTML(value){this.html=value;this.children=[];if(this.id==='catalogResults')for(const match of value.matchAll(/<a class="catalog-card" data-species="([^"]*)" data-score="([^"]*)" href="([^"]*)"/g)){const card=new Element();card.dataset.species=match[1];card.dataset.score=match[2];card.href=match[3];this.children.push(card);}}
    get innerHTML(){return this.html||'';}
    setAttribute(name,value){this.attributes[name]=value;}
    appendChild(child){this.children.push(child);return child;}
    replaceChildren(){this.children=[];this.html='';}
    querySelector(selector){return selector==='img'?this.image:selector==='.catalog-chance-slot'?this.slot:null;}
    querySelectorAll(selector){return selector.startsWith('.catalog-card')?this.children:[];}
    addEventListener(name,callback){this.listeners[name]=callback;}
    focus(){context.document.activeElement=this;}
  }
  const element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  context=vm.createContext({document:{getElementById:id=>['menuBtn','nav'].includes(id)?null:element(id),createElement:()=>new Element(),createDocumentFragment:()=>new Element(),addEventListener(name,callback){if(name==='DOMContentLoaded')ready.push(callback);},querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent(){},activeElement:null},Date,Intl,Number,Object,Map,WeakMap,URLSearchParams,location:{search,href:''},navigator:{},setTimeout,clearTimeout,setInterval:callback=>intervals.push(callback),CustomEvent:class{},console:{warn(){},error(){}},IntersectionObserver:class{observe(){}unobserve(){}disconnect(){}}});
  context.window=context;context.addEventListener=()=>{};
  context.GeoImage={esc:value=>String(value??''),placeholder:()=> 'placeholder.svg',resolveSpeciesImage:async()=> 'placeholder.svg',resolvePlaceImage:async()=> 'placeholder.svg'};
  context.GeoNatureCommon={numberOrNull:value=>value===null||value===undefined||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null,conditionsFromRow:row=>row||{},currentWeatherRow:data=>data.current,validCoordinates:(lat,lon)=>lat!==null&&lat!==undefined&&lon!==null&&lon!==undefined&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180,localDateISO:()=> '2026-10-13'};
  context.GeoChanceUI={markup:score=>`<span>${score??'—'}/100</span>`};
  context.GNLiveFactors={render:snapshot=>rendered.push(snapshot)};
  return{context,element,ready,intervals,rendered,load:name=>vm.runInContext(source(name),context,{filename:name})};
}
function fish(index){return ['fish'+index,'თევზი '+index,'Fish '+index,'მტკნარი','ტბა','საქართველო','1 კგ','10–20°C','1010–1020 hPa','0–10 კმ/სთ','დილა','Fish scientific '+index];}

test('catalog keeps every matching species accessible as a native link after the old 90-entry boundary',()=>{
  const page=browser();page.context.FISHES=Array.from({length:105},(_,i)=>fish(i));page.context.HUNTING_WILDLIFE=[];page.context.openMeteo=()=>new Promise(()=>{});page.context.GeoFishChance=()=>null;
  page.element('catalogType').value='all';page.load('catalog.js');page.context.initCatalog();
  assert.equal(page.element('catalogResults').children.length,105);assert.equal(page.element('catalogCount').textContent,'105 სახეობა');
  assert.match(page.element('catalogResults').children[104].href,/species\.html\?id=/);assert.ok(page.element('catalogResults').innerHTML.includes('<a class="catalog-card"'));
  assert.equal(page.element('catalogSuggestions').innerHTML,'');
  page.element('catalogSearch').value='Fish 104';page.element('catalogSearch').oninput();assert.equal(page.element('catalogCount').textContent,'1 სახეობა');assert.ok(page.element('catalogSuggestions').innerHTML.includes('<a class="btn ghost"'));
  page.element('catalogClear').onclick();assert.equal(page.element('catalogCount').textContent,'105 სახეობა');assert.equal(page.context.document.activeElement,page.element('catalogSearch'));
});
test('catalog weather updates preserve card identity, current filter and keyboard focus',async()=>{
  const page=browser(),pending=deferred();page.context.FISHES=[fish(0),fish(1)];page.context.HUNTING_WILDLIFE=[];page.context.openMeteo=()=>pending.promise;page.context.GeoFishChance=(x,weather)=>weather.temperature_2m??null;
  page.element('catalogType').value='fish';page.element('catalogSearch').value='Fish 1';page.load('catalog.js');page.context.initCatalog();
  const card=page.element('catalogResults').children[0];page.context.document.activeElement=card;
  pending.resolve({current:{temperature_2m:22}});await tick();
  assert.equal(page.element('catalogResults').children[0],card);assert.equal(page.context.document.activeElement,card);assert.equal(page.element('catalogSearch').value,'Fish 1');assert.equal(card.dataset.score,22);assert.match(card.href,/chance=22$/);
});
function places(){const page=browser();page.context.WATERS=[['lake','ტბა','ტბა','კახეთი',42,44,'fish0','აღწერა']];page.context.FISHES=[fish(0)];for(const id of ['placeType','placeRegion'])page.element(id).value='all';page.element('placeSort').value='relevance';page.element('placeGps').textContent='📍 ახლოს';page.load('places.js');page.context.initPlaces();return page;}
test('Places GPS unavailable or denied stays usable and gives an inline recovery path',()=>{
  const page=places();assert.doesNotThrow(()=>page.element('placeGps').onclick());assert.equal(page.element('placeGps').disabled,false);assert.match(page.element('placeSearchNote').textContent,/ამ ბრაუზერში/);
  let fail,options;page.context.navigator.geolocation={getCurrentPosition(ok,error,args){fail=error;options=args;}};
  page.element('placeGps').onclick();assert.equal(page.element('placeGps').disabled,true);assert.equal(options.timeout,8000);fail({code:1});
  assert.equal(page.element('placeGps').disabled,false);assert.equal(page.element('placeGps').textContent,'📍 ახლოს');assert.match(page.element('placeSearchNote').textContent,/ნებართვა გამორთულია/);assert.equal(page.context.location.href,'');
});
test('Places search includes the fish associated with each water and reset restores search focus',()=>{
  const page=places();page.element('placeSearch').value='თევზი 0';page.element('placeSearch').oninput();assert.equal(page.element('shownCount').textContent,1);
  page.element('placeSearch').value='ვერ მოიძებნება';page.element('placeSearch').oninput();assert.equal(page.element('shownCount').textContent,0);
  page.element('placeReset').onclick();assert.equal(page.element('shownCount').textContent,1);assert.equal(page.context.document.activeElement,page.element('placeSearch'));
});
for(const kind of ['species','place-details'])test(`${kind} unknown URLs give a return link without fetching or an endless loading state`,async()=>{
  const page=browser('?id=missing');page.context.FISHES=[];page.context.WATERS=[];page.context.WILDLIFE=[];let requests=0;page.context.openMeteo=()=>{requests++;};page.load(kind+'.js');await page.ready[0]();
  assert.equal(requests,0);assert.equal(page.element('weatherRefresh').disabled,true);assert.doesNotMatch(page.element('environment').innerHTML,/იტვირთება/);
  assert.match(page.element(kind==='species'?'speciesLead':'placeLead').innerHTML,kind==='species'?/href="catalog.html"/:/href="fishing-places.html"/);
});
test('hunting planner clears previous factors while loading and after failure, restores its control and offers retry',async()=>{
  const page=browser(),pending=deferred();page.load('hunting.js');page.element('huntRegion').value='თბილისი';page.element('huntStartDate').value='2026-10-13';page.element('huntDays').value='1';page.context.openMeteo=()=>pending.promise;
  vm.runInContext("selectedHunt=['mammal','მელა','','','','','','','ღამე'];huntWeather={previous:true};huntSelectedRow={temperature:20};",page.context);
  const request=page.context.runHuntPlanner();assert.equal(page.context.huntWeather,null);assert.equal(page.context.GeoHuntingPlanner.selectedRow,null);assert.equal(page.element('huntPlanBtn').disabled,true);assert.equal(page.rendered.at(-1).data,null);
  pending.reject(Error('offline'));await assert.rejects(request,/offline/);
  assert.equal(page.element('huntPlanBtn').disabled,false);assert.match(page.element('huntDayCards').innerHTML,/retryHuntPlanner/);assert.equal(page.rendered.at(-1).error,true);assert.equal(page.rendered.at(-1).data,null);
});
test('season activity follows departure month, preserves explicit overrides and leaves unknown seasons unknown',()=>{
  const page=browser(),modes=[{dataset:{mode:'fish'}},{dataset:{mode:'wildlife'}}].map(button=>Object.assign(button,{classList:{toggle(){}},setAttribute(){},addEventListener(name,callback){this[name]=callback;}}));
  page.context.document.querySelectorAll=selector=>selector==='[data-mode]'?modes:[];
  let checkedDate;page.context.GeoWildlifeRules={today:()=> '2026-10-13',markup:(row,context)=>{checkedDate=context.date;return '<p>წესი</p>';},evaluate:()=>({status:'unknown'})};
  page.context.FISHES=[['carp','კობრი']];page.context.HUNTING_WILDLIFE=[['mammal','უცნობი სახეობა','','','','','საქართველო','დაზუსტებული არ არის','']];page.load('seasons.js');page.ready[0]();
  page.element('seasonRuleDate').value='2026-12-02';page.element('seasonRuleDate').listeners.change({target:page.element('seasonRuleDate')});
  assert.match(page.element('seasonActiveMonth').textContent,/დეკემბერი/);assert.match(page.element('seasonResults').innerHTML,/აქტივობა შედარებით დაბალია/);assert.equal(checkedDate,'2026-12-02');
  page.element('seasonMonth').value='5';page.element('seasonMonth').listeners.change();assert.match(page.element('seasonActiveMonth').textContent,/მაისი/);assert.match(page.element('seasonResults').innerHTML,/აქტიურობა მოსალოდნელია/);assert.equal(checkedDate,'2026-12-02');
  modes[1].click();assert.match(page.element('seasonResults').innerHTML,/სეზონური აქტივობის თვეები დაზუსტებული არ არის/);assert.match(page.element('seasonResults').innerHTML,/თვეები მითითებული არ არის/);
});

test('destination guide is searchable before weather resolves and refresh keeps filters without reloading',async()=>{
  const page=browser(),pending=deferred(),requests=[];
  page.context.FISHES=[fish(0),fish(1)];page.context.WATERS=[];page.context.WILDLIFE=[];page.context.HUNT_PLACES=[];
  page.context.GeoFishChance=(fish,conditions)=>conditions.temperature_2m??null;page.context.outdoorScore=conditions=>conditions.temperature_2m??null;
  page.context.openMeteo=(lat,lon,options)=>{requests.push(options);return pending.promise;};
  for(const id of ['fgType','fgFishType','fgHuntPlaceType'])page.element(id).value='all';
  page.load('fishing-guide.js');page.ready[0]();
  assert.match(page.element('fgFishGrid').innerHTML,/data-fish="fish0"/);assert.equal(page.element('fgRefresh').disabled,true);
  page.element('fgSearch').value='Fish 1';page.element('fgSearch').listeners.input();assert.match(page.element('fgFishGrid').innerHTML,/data-fish="fish1"/);assert.doesNotMatch(page.element('fgFishGrid').innerHTML,/data-fish="fish0"/);
  pending.resolve({current:{time:'2026-10-13T12:15',temperature_2m:22}});await tick();
  assert.match(page.element('fgFishGrid').innerHTML,/22\/100/);assert.equal(page.element('fgSearch').value,'Fish 1');assert.equal(page.element('fgRefresh').disabled,false);assert.equal(page.context.location.href,'');
  page.context.openMeteo=async(lat,lon,options)=>{requests.push(options);return{current:{time:'2026-10-13T12:30',temperature_2m:24}};};
  await page.element('fgRefresh').onclick();assert.equal(requests.at(-1).force,true);assert.match(page.element('fgFishGrid').innerHTML,/24\/100/);assert.equal(page.element('fgSearch').value,'Fish 1');assert.equal(page.context.location.href,'');
});
