const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=name=>fs.readFileSync(path.join(__dirname,'../js',name),'utf8');
test('HTML pages declare standards mode before visible content and contain no merge artifacts',()=>{
  const root=path.join(__dirname,'..');
  for(const name of fs.readdirSync(root).filter(name=>name.endsWith('.html'))){
    const html=fs.readFileSync(path.join(root,name),'utf8');
    assert.doesNotMatch(html,/^(?:<{7}|={7}|>{7})(?:\s|$)/m,name+' contains unresolved merge artifacts');
    if(/<!doctype\s+html/i.test(html))assert.match(html,/^\s*<!doctype\s+html\b/i,name+' must enter browser standards mode');
  }
});
function shell(search=''){
  const elements=new Map(),ready=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:['placeType','placeRegion'].includes(id)?'all':id==='placeSort'?'relevance':'',href:'#',innerHTML:'',textContent:'',dataset:{},classList:{toggle(){}},replaceChildren(){},appendChild(){},querySelectorAll(){return[];},querySelector(){return{};},addEventListener(){}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:id=>['menuBtn','nav'].includes(id)?null:element(id),addEventListener:(event,callback)=>{if(event==='DOMContentLoaded')ready.push(callback);},querySelector:()=>null,createElement:()=>element(Symbol()),createDocumentFragment:()=>({appendChild(){}})},location:{search,href:''},navigator:{},Date,Intl,URLSearchParams,Object,Number,Map,AbortController,setTimeout,clearTimeout,setInterval:()=>{},console,IntersectionObserver:class{observe(){}}});
  context.window=context;context.addEventListener=()=>{};
  context.GeoImage={esc:v=>String(v??''),placeholder:()=> 'placeholder.svg',resolvePlaceImage:async()=> 'placeholder.svg'};
  vm.runInContext(source('common.js'),context,{filename:'common.js'});
  return{context,element,ready};
}
function detail(water){
  const page=shell('?id='+water[0]);page.context.WATERS=[water];page.context.FISHES=[];
  vm.runInContext(source('place-details.js'),page.context,{filename:'place-details.js'});
  return page;
}
const located=['known','ცნობილი ადგილი','ტბა','თბილისი',41.7151,44.8271,'','აღწერა'];
test('map and planner links work while a location forecast is still loading',async()=>{
  const page=detail(located);page.context.openMeteo=()=>new Promise(()=>{});await page.ready[0]();
  assert.equal(page.element('mapBtn').href,'map.html?lat=41.7151&lon=44.8271&name='+encodeURIComponent(located[1]));
  assert.equal(page.element('planBtn').href,'fishing.html?place=known');
});
test('weather failures do not disable independently known navigation',async()=>{
  const page=detail(located);page.context.openMeteo=async()=>{throw Error('Forecast unavailable');};await page.ready[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.match(page.element('environment').innerHTML,/დროებით ვერ ჩაიტვირთა/);
  assert.match(page.element('mapBtn').href,/lat=41\.7151&lon=44\.8271/);assert.equal(page.element('planBtn').href,'fishing.html?place=known');
});
test('an unlocated directory entry opens the general map without a fabricated pin',async()=>{
  const page=detail(['unknown',...located.slice(1,4),null,null,'','აღწერა']);let fetched=false;
  page.context.openMeteo=async()=>{fetched=true;};await page.ready[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.element('mapBtn').href,'map.html');assert.equal(page.element('mapBtn').textContent,'🗺️ რუკის გახსნა');assert.equal(page.element('planBtn').href,'fishing.html?place=unknown');assert.equal(fetched,false);
});
test('nearest-place GPS excludes null coordinates even near the zero meridian',()=>{
  const page=shell();page.context.WATERS=[['unknown','კოორდინატი არ არის','ტბა','თბილისი',null,null,'',''],['real','რეალური ადგილი','ტბა','თბილისი',1,1,'','']];page.context.FISHES=[];
  page.context.navigator.geolocation={getCurrentPosition:callback=>callback({coords:{latitude:0,longitude:0}})};
  vm.runInContext(source('places.js'),page.context,{filename:'places.js'});page.context.initPlaces();page.element('placeGps').onclick();
  assert.equal(page.context.location.href,'place-details.html?id=real');
});
