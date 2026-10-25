'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),BASE='https://fishhunt-ai.example.workers.dev';
const fixtures={
  'image/png':fs.readFileSync(path.join(root,'assets/icons/icon-192.png')),
  'image/jpeg':fs.readFileSync(path.join(root,'assets/profile-bg/fish.jpg')),
  'image/webp':fs.readFileSync(path.join(root,'assets/phone/river-avatar.webp'))
};
const env={GEMINI_API_KEY:'private-test-key-not-real',AI_DAILY_LIMIT:10000,AI_IP_HOURLY_LIMIT:1000};
const photo=(mimeType='image/png')=>({mimeType,data:fixtures[mimeType].toString('base64')});
const result=()=>({status:'identified',summary:'ფოტოზე შესაძლოა კობრი იყოს.',candidates:[{id:'carp',traits:'ხილულია დიდი ქერცლი და სხეულის მომრგვალებული მოხაზულობა.',distinctions:'მსგავსი სახეობებისგან გასარჩევად პირის მიდამოც უნდა ჩანდეს.'}],limitations:'მხოლოდ ერთი ხედია ხელმისაწვდომი.'});
async function worker(suffix=''){return (await import(pathToFileURL(path.join(root,'worker/fishhunt-ai.mjs')).href+suffix)).default;}
function request(body={image:photo()},options={}){
  const method=options.method||'POST',headers={Origin:options.origin||'https://niksaniksa25.github.io','Content-Type':options.type||'application/json','CF-Connecting-IP':options.ip||'192.0.2.83',...options.headers};
  return new Request(BASE+'/api/ai/identify-photo',{method,headers,...(method==='GET'||method==='OPTIONS'?{}:{body:options.raw??JSON.stringify(body)}),...(options.raw instanceof ReadableStream?{duplex:'half'}:{}),...(options.signal?{signal:options.signal}:{})});
}
function provider(value=result(),extra={}){return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]},...extra}]});}
async function withFetch(run,implementation=async()=>provider()){
  const old=global.fetch;global.fetch=implementation;try{return await run();}finally{global.fetch=old;}
}

test('photo catalogue IDs and names stay exactly aligned with the real fish catalogue',async()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'js/fishing-data.js'),'utf8'),context);
  const {FISH_PHOTO_CATALOG}=await import(pathToFileURL(path.join(root,'worker/fish-catalog.mjs')).href);
  assert.equal(FISH_PHOTO_CATALOG.length,84);
  assert.equal(new Set(FISH_PHOTO_CATALOG.map(item=>item.id)).size,84);
  assert.deepEqual(JSON.parse(JSON.stringify(FISH_PHOTO_CATALOG)),JSON.parse(JSON.stringify(context.window.FISHES.map(row=>({id:row[0],name:row[1],englishName:row[2],scientificName:row[11]})))));
});

test('photo capability reports readiness without exposing any credential',async()=>{
  const app=await worker();
  const configured=await (await app.fetch(new Request(BASE+'/api/health'),env)).json();
  assert.equal(configured.photoConfigured,true);assert.equal(configured.configured,true);assert.ok(!JSON.stringify(configured).includes(env.GEMINI_API_KEY));
  const blank=await (await app.fetch(new Request(BASE+'/api/health'),{GEMINI_API_KEY:'   '})).json();assert.equal(blank.photoConfigured,false);assert.equal(blank.configured,false);
});

test('photo route enforces origin, method, JSON and provider readiness before calling upstream',async()=>{
  const app=await worker();let calls=0;
  await withFetch(async()=>{
    assert.equal((await app.fetch(request(undefined,{method:'GET'}),env)).status,405);
    assert.equal((await app.fetch(request(undefined,{method:'OPTIONS'}),env)).status,204);
    assert.equal((await app.fetch(request(undefined,{origin:'https://attacker.invalid'}),env)).status,403);
    assert.equal((await app.fetch(request(undefined,{type:'text/plain'}),env)).status,415);
    assert.equal((await app.fetch(request(),{})).status,503);
    assert.equal(calls,0);
  },async()=>{calls++;return provider();});
});

test('JPEG PNG and WebP are forwarded as actual inline image bytes with conservative structured instructions',async()=>{
  const app=await worker(),seen=[];
  await withFetch(async()=>{
    for(const mimeType of Object.keys(fixtures)){
      const response=await app.fetch(request({image:photo(mimeType),hint:'შესაძლოა კობრი იყოს',filename:'private-name.jpg'}),env);
      assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
      const body=await response.json();assert.equal(body.result.candidates[0].name,'კობრი');assert.equal(body.result.candidates[0].scientificName,'Cyprinus carpio');
      assert.match(body.result.limitations,/სავარაუდოა/);assert.equal(response.headers.get('Cache-Control'),'no-store');
      assert.ok(!JSON.stringify(body).includes(env.GEMINI_API_KEY));
    }
    assert.equal(seen.length,3);
    for(const item of seen){
      assert.match(item.url,/generativelanguage.googleapis.com/);assert.equal(item.options.headers['x-goog-api-key'],env.GEMINI_API_KEY);
      const body=item.body;assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.generationConfig.responseSchema.properties.candidates.maxItems,3);
      assert.match(body.systemInstruction.parts[0].text,/untrusted evidence/);assert.match(body.systemInstruction.parts[0].text,/genetic hybrid\/F1/);assert.match(body.systemInstruction.parts[0].text,/Do not force/);
      assert.equal(body.contents[0].parts[0].inlineData.data,photo(body.contents[0].parts[0].inlineData.mimeType).data);
      assert.ok(!JSON.stringify(body).includes('private-name.jpg'));
    }
  },async(url,options)=>{seen.push({url,options,body:JSON.parse(options.body)});return provider();});
});

test('unsupported, malformed, noncanonical and MIME-mismatched images never reach the provider',async()=>{
  const app=await worker();let calls=0;
  const invalid=[
    {image:null},{image:{mimeType:'image/svg+xml',data:'PHN2Zy8+'}},
    {image:{mimeType:'image/png',data:'data:image/png;base64,'+photo().data}},
    {image:{mimeType:'image/png',data:photo().data+'\n'}},
    {image:{mimeType:'image/jpeg',data:photo().data}},
    {image:{mimeType:'image/png',data:Buffer.from('not a real image file').toString('base64')}},
    {image:{mimeType:'image/jpeg',data:fixtures['image/jpeg'].subarray(0,-3).toString('base64')}},
    {image:{mimeType:'image/webp',data:fixtures['image/webp'].subarray(0,-2).toString('base64')}},
    {image:photo(),hint:'x'.repeat(301)},{image:photo(),hint:false}
  ];
  await withFetch(async()=>{
    for(const body of invalid)assert.ok([400,415].includes((await app.fetch(request(body),env)).status));
    assert.equal(calls,0);
    assert.equal((await app.fetch(request(),env)).status,200,'validation failures release the concurrency slot');
  },async()=>{calls++;return provider();});
});

test('oversized bodies and image dimensions are rejected even when Content-Length is missing or misleading',async()=>{
  const app=await worker();let calls=0;
  const wide=Buffer.from(fixtures['image/png']);wide.writeUInt32BE(5000,16);
  const huge=Buffer.alloc(1572865,65).toString('base64');
  await withFetch(async()=>{
    assert.equal((await app.fetch(request({image:{mimeType:'image/png',data:wide.toString('base64')}}),env)).status,413);
    assert.equal((await app.fetch(request({image:{mimeType:'image/png',data:huge}}),env)).status,413);
    const raw=new ReadableStream({start(controller){for(let i=0;i<35;i++)controller.enqueue(new Uint8Array(65536));controller.close();}});
    const response=await app.fetch(request(undefined,{raw,headers:{'Content-Length':'1'}}),env);assert.equal(response.status,413);
    assert.equal((await app.fetch(request(undefined,{headers:{'Content-Length':'2200001'}}),env)).status,413);
    assert.equal(calls,0);
    assert.equal((await app.fetch(request(),env)).status,200);
  },async()=>{calls++;return provider();});
});

test('model candidate labels are rebuilt from canonical IDs and unexpected confidence or URL fields are discarded',async()=>{
  const app=await worker(),value=result();value.confidence=99;value.url='https://attacker.invalid';value.candidates[0].name='<script>bad</script>';value.candidates[0].scientificName='Invented taxon';value.candidates[0].confidence=100;value.candidates[0].url='https://attacker.invalid';
  await withFetch(async()=>{
    const response=await app.fetch(request(),env);assert.equal(response.status,200);const actual=(await response.json()).result;
    assert.equal(actual.candidates[0].name,'კობრი');assert.equal(actual.candidates[0].scientificName,'Cyprinus carpio');assert.ok(!JSON.stringify(actual).includes('attacker'));assert.equal(actual.confidence,undefined);assert.equal(actual.candidates[0].confidence,undefined);
  },async()=>provider(value));
});

test('unknown, duplicate, contradictory and confidence-claiming model results fail closed',async()=>{
  const app=await worker(),base=result(),bad=[
    {...base,status:'certain'},
    {...base,candidates:[{...base.candidates[0],id:'invented-fish'}]},
    {...base,candidates:[base.candidates[0],base.candidates[0]]},
    {...base,status:'not_fish'},
    {...base,summary:'100% კობრია'},
    {...base,candidates:[{...base.candidates[0],traits:'99.5% დარწმუნებული ვარ'}]},
    {...base,summary:'<script>alert(1)</script>'},
    {...base,limitations:'https://attacker.invalid'},
    {...base,summary:'x'.repeat(901)}
  ];
  for(const value of bad)await withFetch(async()=>{const response=await app.fetch(request(),env);assert.equal(response.status,503);assert.equal((await response.json()).code,'photo_result_unavailable');},async()=>provider(value));
});

test('unclear images and non-fish results remain honest alternatives without forced catalogue matches',async()=>{
  const app=await worker();
  for(const value of [
    {status:'uncertain',summary:'ფარფლები და თავი კარგად არ ჩანს.',candidates:[],limitations:'სხვა კუთხიდან გადაიღე.'},
    {status:'not_fish',summary:'გამოსახულებაზე თევზი არ იკვეთება.',candidates:[],limitations:'აირჩიე თევზის მკაფიო ფოტო.'},
    {...result(),status:'identified',candidates:[]}
  ])await withFetch(async()=>{
    const response=await app.fetch(request(),env);assert.equal(response.status,200);const actual=(await response.json()).result;assert.equal(actual.status,value.status==='identified'?'uncertain':value.status);assert.equal(actual.candidates.length,0);
  },async()=>provider(value));
});

test('blocked, empty, truncated and malformed provider replies cannot become successful identifications',async()=>{
  const app=await worker(),responses=[
    ()=>Response.json({promptFeedback:{blockReason:'SAFETY'}}),
    ()=>provider(result(),{finishReason:'SAFETY'}),
    ()=>provider(result(),{finishReason:'MAX_TOKENS'}),
    ()=>Response.json({candidates:[]}),
    ()=>Response.json({candidates:[{content:{parts:[{text:'not JSON'}]}}]}),
    ()=>Response.json({candidates:[{content:{parts:[{text:'{"status":"identified"'}]}}]}),
    ()=>new Response('x'.repeat(65537))
  ];
  for(const reply of responses)await withFetch(async()=>{const response=await app.fetch(request(),env);assert.equal(response.status,503);assert.equal((await response.json()).ok,false);},async()=>reply());
});

test('thought text is ignored and a fenced structured answer still uses only the validated result',async()=>{
  const app=await worker();
  await withFetch(async()=>{const response=await app.fetch(request(),env);assert.equal(response.status,200);assert.ok(!JSON.stringify(await response.json()).includes('private reasoning'));},async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private reasoning'},{text:'```json\n'+JSON.stringify(result())+'\n```'}]}}]}));
});

test('provider quota, missing models and connection failures give actionable safe failures without reflecting upstream secrets',async()=>{
  const app=await worker();
  for(const status of [400,403,404,429,500])await withFetch(async()=>{
    const response=await app.fetch(request(),env);assert.equal(response.status,status===429?429:503);const actual=await response.json();assert.equal(actual.code,status===429?'photo_provider_limit':status===404?'photo_model_unavailable':'photo_provider_unavailable');assert.ok(!JSON.stringify(actual).includes(env.GEMINI_API_KEY));
  },async()=>new Response(env.GEMINI_API_KEY,{status}));
  await withFetch(async()=>{const response=await app.fetch(request(),env);assert.equal(response.status,503);assert.equal((await response.json()).code,'photo_unavailable');},async()=>{throw new Error(env.GEMINI_API_KEY);});
});

test('photo requests share the existing AI quotas and invalid model configuration does not call upstream',async()=>{
  const app=await worker('?photo-quota='+Date.now());let calls=0;
  await withFetch(async()=>{
    const limited={...env,AI_IP_HOURLY_LIMIT:1};assert.equal((await app.fetch(request(),limited)).status,200);const response=await app.fetch(request(),limited);assert.equal(response.status,429);assert.equal((await response.json()).code,'photo_rate_limited');assert.equal(calls,1);
    assert.equal((await app.fetch(request(undefined,{ip:'192.0.2.92'}),{...env,GEMINI_VISION_MODEL:'../../secret'})).status,503);assert.equal(calls,1);
  },async()=>{calls++;return provider();});
});

test('the photo in-flight cap bounds memory across IPs and releases every slot after completion',async()=>{
  const app=await worker('?photo-concurrency='+Date.now());let release,started,calls=0;
  const wait=new Promise(resolve=>{started=resolve;}),held=new Promise(resolve=>{release=resolve;});
  await withFetch(async()=>{
    const tasks=[1,2,3].map(index=>app.fetch(request(undefined,{ip:'192.0.2.'+index}),env));await wait;
    const extra=await app.fetch(request(undefined,{ip:'192.0.2.4'}),env);assert.equal(extra.status,429);assert.equal((await extra.json()).code,'photo_busy');
    release();assert.deepEqual((await Promise.all(tasks)).map(response=>response.status),[200,200,200]);assert.equal((await app.fetch(request(undefined,{ip:'192.0.2.5'}),env)).status,200);
  },async()=>{calls++;if(calls===3)started();await held;return provider();});
});

test('cancelling a replaced photo aborts the upstream request and releases its slot',async()=>{
  const app=await worker('?photo-abort='+Date.now()),controller=new AbortController();let entered,calls=0;
  const started=new Promise(resolve=>{entered=resolve;});
  await withFetch(async()=>{
    const task=app.fetch(request(undefined,{signal:controller.signal}),env);await started;controller.abort();
    const response=await task;assert.equal(response.status,499);assert.equal((await response.json()).code,'photo_cancelled');
    assert.equal((await app.fetch(request(),env)).status,200);
  },async(url,options)=>{
    calls++;if(calls>1)return provider();entered();
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  });
});

test('cancelling an incomplete upload cancels the input stream without reaching the provider',async()=>{
  const app=await worker('?photo-body-abort='+Date.now()),controller=new AbortController();let cancelled=false,calls=0;
  const raw=new ReadableStream({cancel(){cancelled=true;}});
  await withFetch(async()=>{
    const task=app.fetch(request(undefined,{raw,signal:controller.signal}),env);controller.abort();
    const response=await task;assert.equal(response.status,499);assert.equal(cancelled,true);assert.equal(calls,0);
    assert.equal((await app.fetch(request(),env)).status,200);
  },async()=>{calls++;return provider();});
});
