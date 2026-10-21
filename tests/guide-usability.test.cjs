const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function guide(){
  const context=vm.createContext({Date,Intl,AbortController,setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(),matchMedia:()=>({matches:false}),FISHES:[['browntrout','კალმახი','Brown trout','მტკნარი','მდინარე','საქართველო','0.3–4 კგ','8–18°C','1005–1020 hPa','0–12 კმ/სთ','დილა','Salmo trutta']],HUNTING_WILDLIFE:[['bird','არწივი','Eagle','Aquila chrysaetos','ფრინველი','მთა','საქართველო','მთელი წელი','დღე']],WATERS:[]});
  context.window=context;
  for(const name of ['wildlife-rules.js','ai.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name),'utf8'),context);
  return context;
}
test('species permission questions use the canonical legal rules before activity-time answers',()=>{
  const c=guide(),fish=c.findFish('როდის აკრძალულია კალმახი?'),wild=c.findWild('არწივზე ნადირობა შეიძლება?');
  const fishReply=c.fishAnswer(fish,'როდის აკრძალულია კალმახი 2026-10-13?');assert.match(fishReply,/აკრძალულია მთელი წელი/);assert.match(fishReply,/2026-10-13/);assert.match(fishReply,/seasons\.html/);
  const wildReply=c.wildAnswer(wild,'არწივზე ნადირობა შეიძლება?');assert.match(wildReply,/წითელი ნუსხის სახეობა/);assert.doesNotMatch(wildReply,/აქტივობის საინფორმაციო დროა/);
  assert.equal(c.buildFishQuestions(fish).length,7);assert.equal(c.buildWildQuestions(wild).length,7);
});
test('an explicit invalid legal date stays unverified and a missing rules module links to the date selector',()=>{
  const c=guide(),fish=c.findFish('კალმახი');
  assert.match(c.ruleAnswer(fish,'შეიძლება 2026-02-31?'),/აირჩიე სწორი თარიღი/);
  c.GeoWildlifeRules=undefined;assert.match(c.fishAnswer(fish,'რა შეზღუდვები მოქმედებს?'),/სეზონურ კალენდარში/);
});
test('Georgian inflected names match while short species names cannot match unrelated words',()=>{
  const c=guide();assert.equal(c.findFish('კალმახზე რა შეზღუდვაა?').id,'browntrout');assert.equal(c.findWild('არწივზე ნადირობა?').scientific,'Aquila chrysaetos');
  assert.equal(c.entityNameMatches('ბუნება როგორ მუშაობს','ბუ'),false);assert.equal(c.entityNameMatches('ბუს ჰაბიტატი','ბუ'),true);
});
test('free real-AI chat sends questions to model gateway and preserves category selection',async()=>{
  const c=guide(),nodes=new Map(),messages=[],sent=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{
      value:'',dataset:{},attributes:{},scrollTop:0,scrollIntoView(){},getBoundingClientRect(){return {top:0}},classList:{add(){},remove(){},toggle(){}},
      setAttribute(name,value){this.attributes[name]=value;},
      querySelectorAll(){return[];},appendChild(){},insertAdjacentHTML(){}
    });
    return nodes.get(id);
  };
  const tabs=['quick','weather','fishing','fish','wild','place','site'].map(cat=>({...node('tab'+cat),dataset:{aiCat:cat}}));
  node('aiCategoryTabs').querySelectorAll=()=>tabs;
  node('chatMessages').appendChild=bubble=>{messages.push(bubble);};
  c.document={getElementById:node,createElement:()=>({classList:{add(){}},scrollIntoView(){},getBoundingClientRect(){return {top:0}}})};
  c.location={hostname:'niksaniksa25.github.io'};
  c.GN_AI_WORKER_ORIGIN='https://fishhunt-demo.example.workers.dev';
  c.fetch=async(url,options)=>{
    sent.push({url,payload:JSON.parse(options.body)});
    return {ok:true,json:async()=>({ok:true,answer:'AI პასუხი კობრზე'})};
  };
  c.initAI();
  node('aiInput').value='როგორ ვითევზაო კობრზე?';
  node('aiSend').onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sent.length,1);
  assert.match(sent[0].url,/fishhunt-demo\.example\.workers\.dev\/api\/ai\/chat/);
  assert.equal(sent[0].payload.message,'როგორ ვითევზაო კობრზე?');
  assert.match(messages.at(-1).textContent,/AI პასუხი/);

  tabs.find(tab=>tab.dataset.aiCat==='fish').onclick();
  node('aiEntity').value='0';
  node('aiInput').value='რა ტემპერატურა უხდება?';
  let prevented=false;
  node('aiInput').onkeydown({key:'Enter',isComposing:false,preventDefault(){prevented=true;}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(prevented,true);
  assert.equal(sent.length,2);
  assert.equal(sent[1].payload.context.entity,'კალმახი');
  const count=sent.length;
  node('aiInput').value='კალმახი';
  node('aiInput').onkeydown({key:'Enter',isComposing:true});
  assert.equal(sent.length,count);
  assert.equal(tabs.find(tab=>tab.dataset.aiCat==='fish').attributes['aria-pressed'],'true');
});
