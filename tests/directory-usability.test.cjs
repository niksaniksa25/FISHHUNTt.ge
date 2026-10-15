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
    set innerHTML(value){
      this.html=value;this.children=[];
      if(this.id==='catalogResults')for(const match of value.matchAll(/<a class="catalog-card" data-species="([^"]*)" data-score="([^"]*)" href="([^"]*)" data-catalog-id="([^"]*)"/g)){const card=new Element();card.dataset.species=match[1];card.dataset.score=match[2];card.href=match[3];card.dataset.catalogId=match[4];card.parentElement=this;this.children.push(card);}
      if(this.id==='catalogSuggestions')for(const match of value.matchAll(/<a class="btn ghost" data-catalog-id="([^"]*)" href="([^"]*)">([^<]*)<\/a>/g)){const link=new Element();link.dataset.catalogId=match[1];link.href=match[2];link.textContent=match[3];link.parentElement=this;this.children.push(link);}
      if(/^fg.*Grid$/.test(this.id))for(const match of value.matchAll(/<article class="fg-card[^>]*data-(fish|place|species|hunt-place)="([^"]*)" data-score="([^"]*)">([\s\S]*?)(?=<article|$)/g)){
        const card=new Element(),key=match[1]==='hunt-place'?'huntPlace':match[1];card.dataset[key]=match[2];card.dataset.score=match[3];card.parentElement=this;
        card.parts={rank:new Element(),imageScore:new Element(),bar:{style:{}},links:[]};card.slot.innerHTML='<span>'+(match[3]||'—')+'/100</span>';
        for(const link of match[4].matchAll(/<a class="[^"]*fg-detail-link[^"]*" href="([^"]*)"/g)){const child=new Element();child.href=link[1].replace(/&amp;/g,'&');child.parentElement=card;card.parts.links.push(child);}
        const button=match[4].match(/data-destination-weather="([^"]*)" data-destination-kind="([^"]*)"/);if(button){card.parts.button=new Element();card.parts.button.dataset={destinationWeather:button[1],destinationKind:button[2]};card.parts.button.parentElement=card;card.parts.context=new Element();}
        this.children.push(card);
      }
    }
    get innerHTML(){return this.html||'';}
    setAttribute(name,value){this.attributes[name]=value;}
    appendChild(child){child.parentElement=this;this.children.push(child);return child;}
    contains(node){return node===this||this.children.some(child=>child===node||child.contains?.(node))||this.parts?.button===node||this.parts?.links?.includes(node);}
    insertBefore(child,at){if(child.contains(context.document.activeElement)){context.document.activeElement=null;context.scrollY+=100;}this.children=this.children.filter(item=>item!==child);const index=at?this.children.indexOf(at):this.children.length;this.children.splice(index<0?this.children.length:index,0,child);child.parentElement=this;}
    closest(selector){if(selector==='.fg-clickable')return this.dataset.fish||this.dataset.place||this.dataset.species||this.dataset.huntPlace?this:this.parentElement?.closest?.(selector);if(selector==='a,button,input,select,textarea')return this.parts?null:this;return null;}
    replaceChildren(){this.children=[];this.html='';}
    querySelector(selector){return selector==='img'?this.image:['.catalog-chance-slot','.fg-score-slot'].includes(selector)?this.slot:selector==='.fg-rank'?this.parts?.rank:selector==='.fg-image-score'?this.parts?.imageScore:selector==='.fg-bar > span'?this.parts?.bar:selector==='[data-destination-weather]'?this.parts?.button:selector==='[data-destination-context]'?this.parts?.context:null;}
    querySelectorAll(selector){if(selector.startsWith('.catalog-card')||selector==='a[data-catalog-id]'||selector==='.fg-clickable')return this.children;if(selector==='.fg-detail-link')return this.parts?.links||[];return[];}
    addEventListener(name,callback){this.listeners[name]=callback;}
    focus(){context.document.activeElement=this;}
  }
  const element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  context=vm.createContext({document:{getElementById:id=>['menuBtn','nav'].includes(id)?null:element(id),createElement:()=>new Element(),createDocumentFragment:()=>new Element(),listeners:{},addEventListener(name,callback){this.listeners[name]=callback;if(name==='DOMContentLoaded')ready.push(callback);},querySelectorAll:selector=>{const match=selector.match(/^#(fg\w+Grid) \.fg-clickable$/);if(match)return element(match[1]).children;if(selector==='[data-destination-weather]')return['fgPlaceGrid','fgHuntPlaceGrid'].flatMap(id=>element(id).children.map(card=>card.parts?.button).filter(Boolean));return[];},querySelector:()=>null,dispatchEvent(){},activeElement:null,hidden:false},Date,Intl,Number,Object,Map,WeakMap,URLSearchParams,location:{search,href:''},navigator:{},setTimeout,clearTimeout,setInterval:callback=>intervals.push(callback),CustomEvent:class{},console:{warn(){},error(){}},IntersectionObserver:class{observe(){}unobserve(){}disconnect(){}}});
  context.window=context;context.addEventListener=()=>{};context.scrollX=0;context.scrollY=500;context.scrollTo=({left,top})=>{context.scrollX=left;context.scrollY=top;};
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
  assert.match(page.element('fgFishGrid').children[0].slot.innerHTML,/22\/100/);assert.equal(page.element('fgSearch').value,'Fish 1');assert.equal(page.element('fgRefresh').disabled,false);assert.equal(page.context.location.href,'');
  page.context.openMeteo=async(lat,lon,options)=>{requests.push(options);return{current:{time:'2026-10-13T12:30',temperature_2m:24}};};
  await page.element('fgRefresh').onclick();assert.equal(requests.at(-1).force,true);assert.match(page.element('fgFishGrid').children[0].slot.innerHTML,/24\/100/);assert.equal(page.element('fgSearch').value,'Fish 1');assert.equal(page.context.location.href,'');
});

const catalogIds=page=>page.element('catalogResults').children.map(card=>card.dataset.catalogId);
const guideIds=page=>page.element('fgFishGrid').children.map(card=>card.dataset.fish);
function catalogRankingPage(scores,wildlife=[]){
  const page=browser();page.context.FISHES=scores.map((_,i)=>fish(i));page.context.HUNTING_WILDLIFE=wildlife;page.context.GeoWildlifeChance=x=>x[1]==='A'?99:1;
  let values=scores;page.context.GeoFishChance=f=>values[Number(f[0].slice(4))];page.context.openMeteo=async()=>({current:{time:'2026-10-13T12:15',temperature_2m:20}});
  page.element('catalogType').value='all';page.load('catalog.js');page.context.initCatalog();
  return Object.assign(page,{setScores(next){values=next;}});
}
test('catalog defaults to fish ranked separately ahead of wildlife, keeping zero and stable unknown/equal-score order',async()=>{
  const wildlife=[['mammal','A'],['bird','B']],page=catalogRankingPage([20,80,80,0,null,NaN,101],wildlife);await tick();
  assert.deepEqual(catalogIds(page),['fish:fish1','fish:fish2','fish:fish0','fish:fish3','fish:fish4','fish:fish5','fish:fish6','wildlife:0','wildlife:1']);
  assert.equal(page.element('catalogResults').children[3].dataset.score,0);assert.equal(page.element('catalogCount').textContent,'9 სახეობა');
  assert.match(page.element('catalogRankingContext').textContent,/თბილისი/);assert.match(page.element('catalogRankingContext').textContent,/2026-10-13 12:15/);
  const before=[...page.element('catalogResults').children],focused=before[1];page.context.document.activeElement=focused;page.context.scrollY=610;
  page.setScores([90,10,10,0,null,NaN,101]);await page.context.GeoCatalogRanking.refresh({force:true});
  assert.deepEqual(catalogIds(page),['fish:fish0','fish:fish1','fish:fish2','fish:fish3','fish:fish4','fish:fish5','fish:fish6','wildlife:0','wildlife:1']);
  assert.ok(page.element('catalogResults').children.every(card=>before.includes(card)));assert.equal(page.context.document.activeElement,focused);assert.equal(page.context.scrollY,610);
});
test('catalog uses canonical identity for duplicate fish names and preserves filtered suggestions during live reordering',async()=>{
  const page=catalogRankingPage([20,80,30]);page.context.FISHES[0][1]='თეთრი ამური';page.context.FISHES[1][1]='თეთრი ამური';
  page.element('catalogType').value='fish';page.element('catalogSearch').value='თეთრი ამური';page.element('catalogSearch').oninput();await tick();
  const links=page.element('catalogSuggestions').children,cards=[...page.element('catalogResults').children];assert.equal(cards.length,2);assert.match(cards[0].href,/id=fish1&chance=80$/);assert.match(cards[1].href,/id=fish0&chance=20$/);
  const focused=links[0];page.context.document.activeElement=focused;page.setScores([90,10,30]);await page.context.GeoCatalogRanking.refresh();
  assert.deepEqual(catalogIds(page),['fish:fish0','fish:fish1']);assert.equal(page.element('catalogSearch').value,'თეთრი ამური');assert.equal(page.element('catalogType').value,'fish');assert.equal(page.element('catalogCount').textContent,'2 სახეობა');
  assert.equal(page.element('catalogSuggestions').children[1],focused);assert.equal(page.context.document.activeElement,focused);assert.match(focused.href,/id=fish1&chance=10$/);assert.equal(page.element('catalogResults').children[0],cards[1]);
});
test('catalog rejects an older refresh response and refreshes forcefully on mobile foreground return',async()=>{
  const page=catalogRankingPage([1,2]);await tick();const first=deferred(),second=deferred();let requests=0;
  page.context.GeoFishChance=(f,c)=>c.temperature_2m+(f[0]==='fish0'?1:0);page.context.openMeteo=()=>++requests===1?first.promise:second.promise;
  const older=page.context.GeoCatalogRanking.refresh(),newer=page.context.GeoCatalogRanking.refresh({force:true});second.resolve({current:{temperature_2m:25}});await newer;first.resolve({current:{temperature_2m:5}});await older;
  assert.equal(page.context.__gnCatalogWeather.temperature_2m,25);
  const options=[];page.context.openMeteo=async(lat,lon,value)=>{options.push(value);return{current:{temperature_2m:23}};};
  page.context.document.hidden=true;page.context.document.listeners.visibilitychange();await tick();assert.equal(options.length,0);
  page.context.document.hidden=false;page.context.document.listeners.visibilitychange();await tick();assert.equal(options.at(-1).force,true);
});
test('catalog provider failure clears live scores and timestamps without replacing cards and can recover',async()=>{
  const page=catalogRankingPage([70,30]);await tick();page.element('catalogType').value='fish';
  const before=[...page.element('catalogResults').children];
  page.context.GeoFishChance=(f,c)=>c.temperature_2m===undefined?null:(f[0]==='fish0'?70:30);
  page.context.openMeteo=async()=>{throw Error('offline');};
  await assert.doesNotReject(()=>page.context.GeoCatalogRanking.refresh({force:true}));
  assert.equal(page.context.__gnCatalogWeather,null);
  assert.ok(page.element('catalogResults').children.every(card=>before.includes(card)));
  assert.ok(page.element('catalogResults').children.every(card=>card.dataset.score===''));
  assert.ok(page.element('catalogResults').children.every(card=>!card.href.includes('chance=')));
  assert.match(page.element('catalogRankingContext').textContent,/მიუწვდომელია/);
  assert.doesNotMatch(page.element('catalogRankingContext').textContent,/12:15/);
  page.context.openMeteo=async()=>({current:{time:'2026-10-13T12:30',temperature_2m:22}});
  await page.context.GeoCatalogRanking.refresh({force:true});
  assert.deepEqual(page.element('catalogResults').children.map(card=>card.dataset.score),[70,30]);
  assert.ok(page.element('catalogResults').children.every(card=>before.includes(card)));
  assert.match(page.element('catalogRankingContext').textContent,/12:30/);
});
function guideRankingPage(scores){
  const page=browser();page.context.FISHES=scores.map((_,i)=>fish(i));page.context.WATERS=[];page.context.WILDLIFE=[];page.context.HUNT_PLACES=[];
  let values=scores;page.context.GeoFishChance=f=>values[Number(f[0].slice(4))];page.context.outdoorScore=()=>50;page.context.openMeteo=async()=>({current:{time:'2026-10-13T12:15',temperature_2m:20}});
  for(const id of ['fgType','fgFishType','fgHuntPlaceType'])page.element(id).value='all';page.load('fishing-guide.js');page.ready[0]();
  return Object.assign(page,{setScores(next){values=next;}});
}
test('guide live rankings move existing fish cards and retain native links, focus, filters, zero and stable ties',async()=>{
  const page=guideRankingPage([20,10,80,0,null,NaN]);await tick();assert.deepEqual(guideIds(page),['fish2','fish0','fish1','fish3','fish4','fish5']);
  const before=[...page.element('fgFishGrid').children],focused=before[0].parts.links[0];page.context.document.activeElement=focused;page.context.scrollY=720;
  page.setScores([90,10,10,0,null,NaN]);await page.context.GeoGuideRanking.refresh({force:true});
  assert.deepEqual(guideIds(page),['fish0','fish1','fish2','fish3','fish4','fish5']);assert.ok(page.element('fgFishGrid').children.every(card=>before.includes(card)));assert.equal(page.context.document.activeElement,focused);assert.equal(page.context.scrollY,720);assert.match(focused.href,/id=fish2&chance=10$/);
  assert.equal(page.element('fgFishGrid').children[3].dataset.score,0);assert.equal(page.element('fgFishGrid').children[2].parts.rank.textContent,'TOP 3');
  page.element('fgSearch').value='Fish 1';page.element('fgSearch').listeners.input();const filtered=page.element('fgFishGrid').children[0];page.setScores([90,55,10,0,null,null]);await page.context.GeoGuideRanking.refresh();
  assert.equal(page.element('fgFishGrid').children[0],filtered);assert.equal(page.element('fgSearch').value,'Fish 1');assert.equal(page.element('fgFishType').value,'all');assert.equal(filtered.dataset.score,55);
});
test('guide canonical fish links handle duplicate English names and freshwater filter includes river species',async()=>{
  const page=guideRankingPage([25,40,30]);await tick();page.context.FISHES[0][2]='Golden grey mullet';page.context.FISHES[1][2]='Golden grey mullet';page.context.FISHES[0][3]='მდინარე';page.context.FISHES[1][3]='ზღვა';
  page.element('fgFishType').value='მტკნარი';page.element('fgFishType').listeners.change();assert.deepEqual(guideIds(page),['fish2','fish0']);
  const river=page.element('fgFishGrid').children.find(card=>card.dataset.fish==='fish0');assert.match(river.parts.links[0].href,/id=fish0&chance=25$/);
  page.element('fgFishType').value='all';page.element('fgFishType').listeners.change();const sea=page.element('fgFishGrid').children.find(card=>card.dataset.fish==='fish1');assert.match(sea.parts.links[0].href,/id=fish1&chance=40$/);
});
test('guide shares canonical current conditions, coalesces refresh and refreshes on visible return without replacing cards',async()=>{
  const page=guideRankingPage([20,30]);await tick();const observed=[],options=[],pending=deferred();
  page.context.GeoNatureCommon.currentWeatherRow=data=>({temperature_2m:data.current.temperature_2m,rainProb:87,time:'12:15'});page.context.GeoNatureCommon.conditionsFromRow=row=>({temperature_2m:row.temperature_2m,precipitation_probability:row.rainProb,local_hour:12});page.context.GeoFishChance=(f,c)=>{observed.push(c);return c.precipitation_probability;};
  page.context.openMeteo=(lat,lon,value)=>{options.push(value);return pending.promise;};const before=[...page.element('fgFishGrid').children];
  const a=page.context.GeoGuideRanking.refresh({force:true}),b=page.context.GeoGuideRanking.refresh();assert.equal(a,b);assert.equal(options.length,1);
  pending.resolve({current:{temperature_2m:22}});await a;assert.equal(observed.at(-1).precipitation_probability,87);assert.equal(observed.at(-1).local_hour,12);assert.ok(page.element('fgFishGrid').children.every(card=>before.includes(card)));
  page.context.openMeteo=async(lat,lon,value)=>{options.push(value);return{current:{temperature_2m:23}};};page.context.document.hidden=true;page.context.document.listeners.visibilitychange();await tick();assert.equal(options.length,1);
  page.context.document.hidden=false;page.context.document.listeners.visibilitychange();await tick();assert.equal(options.length,2);assert.equal(options.at(-1).force,true);
  await page.intervals[0]();assert.equal(options.length,3);assert.equal(options.at(-1).force,undefined);
});
test('guide destination loading keeps the focused weather button and independent state through ranking updates and failure',async()=>{
  const page=browser(),pending=deferred();page.context.FISHES=[fish(0)];page.context.WATERS=[['lake0','ტბა0','ტბა','კახეთი',42,44,'fish0',''],['lake1','ტბა1','ტბა','კახეთი',43,45,'fish0','']];page.context.WILDLIFE=[];page.context.HUNT_PLACES=[];page.context.GeoFishChance=()=>40;page.context.outdoorScore=()=>50;page.context.openMeteo=async()=>({current:{time:'2026-10-13T12:15',temperature_2m:20}});
  for(const id of ['fgType','fgFishType','fgHuntPlaceType'])page.element(id).value='all';page.load('fishing-guide.js');page.ready[0]();await tick();
  const cards=[...page.element('fgPlaceGrid').children],target=cards[1].parts.button;page.context.document.activeElement=target;page.context.openMeteo=()=>pending.promise;
  const request=target.onclick({stopPropagation(){}});assert.equal(target.disabled,true);assert.equal(page.context.document.activeElement,target);assert.equal(cards[1].parts.button,target);
  pending.resolve({current:{time:'2026-10-13T12:30',temperature_2m:22}});await request;assert.equal(page.element('fgPlaceGrid').children[0],cards[1]);assert.equal(page.context.document.activeElement,target);assert.equal(target.disabled,false);assert.match(cards[1].parts.context.textContent,/12:30/);
  await page.context.GeoGuideRanking.refresh();assert.equal(page.element('fgPlaceGrid').children[0],cards[1]);assert.equal(cards[1].dataset.score,40);
  page.context.openMeteo=async()=>{throw Error('offline');};await target.onclick({stopPropagation(){}});assert.equal(target.disabled,false);assert.equal(page.context.document.activeElement,target);assert.equal(cards[1].dataset.score,'');assert.equal(cards[1].parts.context.textContent,'');
});
