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
  assert.deepEqual(await res.json(), {ok:true, service:'FishHunt AI', configured:false,adminConfigured:false,analyticsConfigured:false,accountConfigured:false});
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
