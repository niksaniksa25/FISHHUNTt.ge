'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

async function worker() {
  const moduleUrl = pathToFileURL(path.join(__dirname, '..', 'worker', 'fishhunt-ai.mjs')).href;
  return (await import(moduleUrl)).default;
}
function request(method, body, origin = 'https://niksaniksa25.github.io', type = 'application/json') {
  const opts = {method, headers: {'Origin': origin}};
  if (body !== undefined) {
    opts.headers['Content-Type'] = type;
    opts.body = JSON.stringify(body);
  }
  return new Request('https://fishhunt-ai.example.workers.dev/api/ai/chat', opts);
}

test('free worker health has no secret and reports setup status', async () => {
  const app = await worker();
  const res = await app.fetch(new Request('https://fishhunt-ai.example.workers.dev/api/health'), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {ok:true, service:'FishHunt AI', configured:false,photoConfigured:false,adminConfigured:false,analyticsConfigured:false,accountConfigured:false,accountRecoveryConfigured:false});
});

test('free worker accepts configured frontend CORS preflight only', async () => {
  const app = await worker();
  const good = await app.fetch(request('OPTIONS'), {});
  assert.equal(good.status, 204);
  assert.equal(good.headers.get('access-control-allow-origin'), 'https://niksaniksa25.github.io');
  const bad = await app.fetch(request('OPTIONS', undefined, 'https://attacker.example'), {});
  assert.equal(bad.status, 403);
});

test('free worker does not send to Gemini when key is missing', async () => {
  const app = await worker();
  const res = await app.fetch(request('POST', {message:'მითხარი კობრზე'}), {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).ok, false);
});

test('free worker blocks unapproved origins', async () => {
  const app = await worker();
  const res = await app.fetch(request('POST', {message:'hello'}, 'https://unknown.example'), {GEMINI_API_KEY:'dummy'});
  assert.equal(res.status, 403);
});

test('free worker exchanges real user messages with Gemini REST endpoint', async () => {
  const app = await worker();
  const prior = global.fetch;
  let observed;
  global.fetch = async (url, opts) => {
    observed = {url, opts, payload:JSON.parse(opts.body)};
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'კობრზე თევზაობა'}]}}]}), {
      status: 200, headers:{'content-type':'application/json'}
    });
  };
  try {
    const res = await app.fetch(request('POST', {message:'როგორ ვითევზაო კობრზე?'}), {GEMINI_API_KEY:'local-test-only'});
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {ok:true, answer:'კობრზე თევზაობა'});
    assert.match(observed.url,/generativelanguage.googleapis.com\/v1beta\/models/);
    assert.equal(observed.opts.headers['x-goog-api-key'], 'local-test-only');
    assert.equal(observed.payload.contents.at(-1).role, 'user');
  } finally {global.fetch = prior;}
});

test('Georgian multi-turn conversations fit the byte bound and retain the established history limits',async()=>{
  const app=await worker(),prior=global.fetch;let observed;
  const history=Array.from({length:8},(_,index)=>({role:index%2?'assistant':'user',content:'ა'.repeat(1200)}));
  const payload={message:'ბ'.repeat(1600),history};assert.ok(Buffer.byteLength(JSON.stringify(payload))>16000);assert.ok(Buffer.byteLength(JSON.stringify(payload))<65536);
  global.fetch=async(url,options)=>{observed=JSON.parse(options.body);return Response.json({candidates:[{content:{parts:[{text:'ქართული პასუხი'}]}}]});};
  try{
    const response=await app.fetch(request('POST',payload),{GEMINI_API_KEY:'local-test-only'});assert.equal(response.status,200);
    assert.equal(observed.contents.length,9);assert.equal(observed.contents[0].parts[0].text.length,1200);assert.equal(observed.contents.at(-1).parts[0].text.length,1600);
  }finally{global.fetch=prior;}
});

test('chat enforces the 64KiB byte cap on chunked UTF8 input and cannot trust a small Content-Length',async()=>{
  const app=await worker(),prior=global.fetch;let calls=0;
  global.fetch=async()=>{calls++;throw new Error('Unexpected provider call');};
  try{
    const encoded=new TextEncoder().encode(JSON.stringify({message:'ა'.repeat(30000)}));assert.ok(encoded.byteLength>65536);
    const body=new ReadableStream({start(controller){for(let i=0;i<encoded.length;i+=8192)controller.enqueue(encoded.slice(i,i+8192));controller.close();}});
    const req=new Request('https://fishhunt-ai.example.workers.dev/api/ai/chat',{method:'POST',headers:{Origin:'https://niksaniksa25.github.io','Content-Type':'application/json','Content-Length':'1'},body,duplex:'half'});
    const response=await app.fetch(req,{GEMINI_API_KEY:'local-test-only'});assert.equal(response.status,413);assert.doesNotMatch((await response.json()).message,/ფოტო/);
    const declared=request('POST',{message:'კობრი'});declared.headers.set('Content-Length','65537');assert.equal((await app.fetch(declared,{GEMINI_API_KEY:'local-test-only'})).status,413);
    assert.equal(calls,0);
  }finally{global.fetch=prior;}
});
