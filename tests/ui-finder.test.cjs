const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function finder(){
  const context=vm.createContext({document:{readyState:'loading',addEventListener(){}},URL,console});context.window=context;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui-shell.js'),'utf8'),context);
  return context.GeoNatureUI;
}
test('global finder matches Georgian and Latin names across pages, fish, places and wildlife',()=>{
  const ui=finder(),pages=[{href:'ai.html',label:'კითხვები',hint:'საიტის გვერდი',keywords:'ai'}];
  assert.equal(ui.find(' AI ',pages)[0].href,'ai.html');
  assert.equal(ui.find('CARP',[],[['carp','კობრი','Common carp','fresh']])[0].label,'კობრი');
  assert.equal(ui.find('ლისი',[],[],[['lisi','ლისის ტბა','ტბა','თბილისი']])[0].href,'place-details.html?id=lisi');
  assert.equal(ui.find('მწყერი',[],[],[],[['bird','მწყერი','Quail']])[0].hint,'ბუნება • სახეობის გზამკვლევი');
  assert.equal(ui.find('ვერმოიძებნება',pages).length,0);
});
test('finder keeps untrusted-looking names inside encoded URL values and ignores malformed entries',()=>{
  const ui=finder(),name='თევზი & <script> #?';
  const result=ui.find('თევზი',[],[null,{},['x',name,'Fish']]);assert.equal(result.length,1);
  const url=new URL(result[0].href,'https://example.invalid/');assert.equal(url.searchParams.get('id'),name);assert.equal(url.hash,'');
});
test('finder preserves preferred page destinations, removes exact duplicates and bounds large result lists',()=>{
  const ui=finder(),href='species.html?id='+encodeURIComponent('კობრი');
  const results=ui.find('კობრი',[{href,label:'კობრი',hint:'გვერდი'}],[['carp','კობრი','Carp']]);
  assert.equal(results.length,1);assert.equal(results[0].hint,'გვერდი');
  const many=Array.from({length:60},(_,i)=>['fish'+i,'თევზი '+i,'Fish']);assert.equal(ui.find('თევზი',[],many).length,30);
});
