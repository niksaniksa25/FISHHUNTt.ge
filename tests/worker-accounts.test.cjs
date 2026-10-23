'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {webcrypto}=require('node:crypto');
if(!global.crypto)global.crypto=webcrypto;
const ORIGIN='https://niksaniksa25.github.io';
const BASE='https://fishhunt-ai.example.workers.dev';
class Storage {
  constructor(){this.values=new Map();this.failKey='';this.alarmTime=null;}
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){if(this.failKey&&key.includes(this.failKey))throw Error('Simulated persistence failure');this.values.set(key,structuredClone(value));}
  async delete(key){return this.values.delete(key);}
  async getAlarm(){return this.alarmTime;}
  async setAlarm(time){this.alarmTime=time;}
  async list({prefix,limit,startAfter}){return new Map([...this.values].filter(([key])=>key.startsWith(prefix)&&(!startAfter||key>startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([key,value])=>[key,structuredClone(value)]));}
  async transaction(fn){const before=new Map(structuredClone([...this.values]));try{return await fn(this);}catch(error){this.values=before;throw error;}}
}
async function app(){
  const module=await import(pathToFileURL(path.join(__dirname,'..','worker','fishhunt-ai.mjs')).href);
  const storage=new Storage(),object=new module.FishHuntAccountsDO({storage},{}),binding={idFromName:name=>name,get:()=>object};
  return {worker:module.default,object,storage,env:{FISHHUNT_ACCOUNTS:binding,ADMIN_KV:{get(){throw Error('Accounts must not touch admin KV');}}}};
}
function request(route,{method='GET',body,token,origin=ORIGIN,ip='192.0.2.1',headers={}}={}){
  return new Request(BASE+'/api/account/'+route,{method,headers:{Origin:origin,'CF-Connecting-IP':ip,...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function call(app,route,options={}){const response=await app.worker.fetch(request(route,options),app.env);return {status:response.status,headers:response.headers,body:await response.json()};}
async function signup(app,email='angler@example.test'){const result=await call(app,'signup',{method:'POST',body:{email,password:'private-test-password-123',remember:true}});assert.equal(result.status,201,JSON.stringify(result.body));return result.body;}

test('account capability requires strongly consistent binding and never exposes secrets',async()=>{
  const instance=await app();
  const response=await instance.worker.fetch(new Request(BASE+'/api/health'),{ADMIN_KV:{},GEMINI_API_KEY:'private-not-public'});
  assert.equal((await response.json()).accountConfigured,false);
  const missing=await instance.worker.fetch(request('me'),{ADMIN_KV:{}});
  assert.equal(missing.status,503);assert.doesNotMatch(await missing.text(),/private-not-public/);
  const health=await instance.worker.fetch(new Request(BASE+'/api/health'),instance.env);assert.equal((await health.json()).accountConfigured,true);
  const denied=await call(instance,'signup',{method:'POST',body:{email:'a@example.test',password:'test-pass-123'},origin:'https://attacker.invalid'});assert.equal(denied.status,403);
  const options=await instance.worker.fetch(request('profile',{method:'OPTIONS'}),instance.env);
  assert.match(options.headers.get('Access-Control-Allow-Methods'),/PATCH/);assert.match(options.headers.get('Access-Control-Allow-Methods'),/PUT/);
});

test('registration stores salted PBKDF2 credentials and hashed revocable tokens only',async()=>{
  const instance=await app(),created=await signup(instance);
  assert.match(created.token,/^[a-f0-9]{64}$/);assert.equal(created.user.plan,'free');
  const serialized=JSON.stringify([...instance.storage.values]);
  assert.doesNotMatch(serialized,/private-test-password-123/);assert.ok(!serialized.includes(created.token));
  const stored=await instance.storage.get('user:'+created.user.id);assert.equal(stored.passwordIterations,100000);assert.match(stored.passwordSalt,/^[a-f0-9]{32}$/);assert.match(stored.passwordHash,/^[a-f0-9]{64}$/);
  const signed=await call(instance,'signin',{method:'POST',body:{email:' ANGLER@EXAMPLE.TEST ',password:'private-test-password-123'}});assert.equal(signed.status,200);assert.notEqual(signed.body.token,created.token);
  assert.equal((await call(instance,'me',{token:created.token})).body.user.email,'angler@example.test');
  assert.equal((await call(instance,'signout',{method:'POST',body:{},token:created.token})).status,200);
  assert.equal((await call(instance,'me',{token:created.token})).status,401);
  assert.equal((await call(instance,'me',{token:signed.body.token})).status,200);
  const wrong=await call(instance,'signin',{method:'POST',body:{email:'angler@example.test',password:'wrong-private-password'}});assert.equal(wrong.status,401);assert.equal(wrong.body.code,'invalid_credentials');
});

test('concurrent email registrations cannot replace another account password',async()=>{
  const instance=await app();
  const attempts=await Promise.all([
    call(instance,'signup',{method:'POST',body:{email:'same@example.test',password:'first-password-123'}}),
    call(instance,'signup',{method:'POST',body:{email:'same@example.test',password:'second-password-123'}})
  ]);
  assert.deepEqual(attempts.map(value=>value.status).sort(),[201,409]);
  const successful=attempts.findIndex(value=>value.status===201),password=successful===0?'first-password-123':'second-password-123';
  assert.equal((await call(instance,'signin',{method:'POST',body:{email:'same@example.test',password}})).status,200);
  const users=[...instance.storage.values.keys()].filter(key=>key.startsWith('user:'));assert.equal(users.length,1);
});

test('profile revisions prevent lost updates and transactions preserve acknowledged data on failure',async()=>{
  const instance=await app(),created=await signup(instance);
  const first=await call(instance,'profile',{method:'PATCH',token:created.token,body:{displayName:'გიორგი',avatarId:'free-fox',nameColor:'default',avatarFrame:'none',baseRevision:created.revision}});
  assert.equal(first.status,200);
  const stale=await call(instance,'profile',{method:'PATCH',token:created.token,body:{displayName:'ნიკა',baseRevision:created.revision}});assert.equal(stale.status,409);assert.equal(stale.body.code,'sync_conflict');assert.equal(stale.body.revisions[0].profile.displayName,'გიორგი');
  instance.storage.failKey='user:';
  const failed=await call(instance,'profile',{method:'PATCH',token:created.token,body:{displayName:'ნიკა',baseRevision:first.body.revision}});assert.equal(failed.status,503);
  instance.storage.failKey='';
  const after=await call(instance,'profile',{token:created.token});assert.equal(after.body.profile.displayName,'გიორგი');assert.equal(after.body.revision,first.body.revision);
  const retry=await call(instance,'profile',{method:'PATCH',token:created.token,body:{displayName:'ნიკა',baseRevision:null,resolveRevisions:[first.body.revision]}});assert.equal(retry.status,200);assert.equal((await call(instance,'me',{token:created.token})).body.user.displayName,'ნიკა');
});

test('private state sync sanitizes records and detects concurrent device writes',async()=>{
  const instance=await app(),created=await signup(instance),other=await signup(instance,'other@example.test');
  const state={name:'გიორგი',xp:550,plan:'pro',password:'must-not-save',favorites:['ჟინვალი','ჟინვალი','თბილისის ზღვა','კუმისი'],plans:[{id:'plan-1',kind:'fishing',title:'ტბა',meta:'დილა',date:'2026-10-23'}],catches:[{id:'catch-1',fish:'კობრი',place:'ტბა',weight:2,date:'2026-10-23',photo:'data:image/jpeg;base64,AAAA'}],checklists:{fishing:{'წყალი':true}}};
  const original=await call(instance,'state',{method:'PUT',token:created.token,body:{baseRevision:null,state}});assert.equal(original.status,200);assert.equal(original.body.state.favorites.length,3);assert.equal(original.body.progressVerified,false);assert.ok(original.body.state.badges.includes('first-catch'));assert.ok(original.body.state.badges.includes('xp500'));assert.ok(!JSON.stringify(original.body).includes('must-not-save'));assert.ok(!JSON.stringify(original.body).includes('data:image'));
  assert.equal((await call(instance,'me',{token:created.token})).body.user.plan,'free');
  const hidden=await call(instance,'state',{token:other.token});assert.equal(hidden.body.state,null);
  const writes=await Promise.all(['A','B'].map(value=>call(instance,'state',{method:'PUT',token:created.token,body:{baseRevision:original.body.revision,state:{favorites:[value]}}})));
  assert.deepEqual(writes.map(value=>value.status).sort(),[200,409]);
  const rejected=writes.find(value=>value.status===409);assert.equal(rejected.body.conflict,true);
  const resolved=await call(instance,'state',{method:'PUT',token:created.token,body:{baseRevision:null,resolveRevisions:[rejected.body.revision],state:{favorites:['A','B']}}});assert.equal(resolved.status,200);assert.deepEqual(resolved.body.state.favorites,['A','B']);
});

test('cloud clients cannot self-assign paid plans, colors, avatars or unearned frames',async()=>{
  const instance=await app(),created=await signup(instance);
  for(const option of [{nameColor:'gold'},{avatarFrame:'aurora'},{avatarId:'plus-wolf'},{backgroundId:'bg-football'},{avatarFrame:'first-catch'}]){
    assert.equal((await call(instance,'profile',{method:'PATCH',token:created.token,body:{...option,baseRevision:created.revision}})).status,403);
  }
  for(const option of [{nameColor:'red; background:url(https://invalid.test)'},{avatarFrame:'constructor'},{avatarId:'unknown'}])assert.equal((await call(instance,'profile',{method:'PATCH',token:created.token,body:{...option,baseRevision:created.revision}})).status,400);
  const saved=await call(instance,'state',{method:'PUT',token:created.token,body:{baseRevision:null,state:{catches:[{id:'first',fish:'კობრი'}]}}});assert.equal(saved.status,200);
  const earned=await call(instance,'profile',{method:'PATCH',token:created.token,body:{avatarFrame:'first-catch',baseRevision:created.revision}});assert.equal(earned.status,200);
  const free=await call(instance,'signup',{method:'POST',body:{email:'paid-self@example.test',password:'example-password-123',plan:'pro',role:'admin'}});assert.equal(free.body.user.plan,'free');
});

test('expired sessions, malformed requests and oversized or invalid state fail closed',async()=>{
  const instance=await app(),created=await signup(instance),key=[...instance.storage.values.keys()].find(value=>value.startsWith('session:'));
  const session=await instance.storage.get(key);session.expiresAt=Date.now()-1;await instance.storage.put(key,session);
  assert.equal((await call(instance,'me',{token:created.token})).status,401);
  const fresh=await call(instance,'signin',{method:'POST',body:{email:'angler@example.test',password:'private-test-password-123'}});
  assert.equal((await call(instance,'state',{method:'PUT',token:fresh.body.token,body:{baseRevision:null,state:{favorites:Array(101).fill('one')}}})).status,400);
  assert.equal((await call(instance,'state',{method:'PUT',token:fresh.body.token,body:{baseRevision:null,state:{catches:[{id:'one',fish:'კობრი',date:'2026-02-30'}]}}})).status,400);
  assert.equal((await call(instance,'state',{method:'PUT',token:fresh.body.token,body:{baseRevision:null,state:{catches:[{id:'one',fish:'კობრი',weight:-1}]}}})).status,400);
  const big=await call(instance,'state',{method:'PUT',token:fresh.body.token,body:{baseRevision:null,state:{junk:'x'.repeat(160001)}}});assert.equal(big.status,413);
  const badType=await instance.worker.fetch(new Request(BASE+'/api/account/signin',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'text/plain'},body:'bad'}),instance.env);assert.equal(badType.status,415);
  const malformed=await instance.worker.fetch(new Request(BASE+'/api/account/signin',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{' }),instance.env);assert.equal(malformed.status,400);
});

test('failed sign-in throttles a target email before unlimited password derivations',async()=>{
  const instance=await app();
  let last;for(let index=0;index<13;index++)last=await call(instance,'signin',{method:'POST',body:{email:'missing@example.test',password:'guess-password-123'},ip:'192.0.2.7'});
  assert.equal(last.status,429);assert.equal(last.body.code,'rate_limited');
});


test('bounded maintenance removes expired sessions and rate rows while preserving active and private data',async()=>{
  const instance=await app(),created=await signup(instance),now=Date.now();
  assert.ok(await instance.storage.getAlarm()>now);
  await instance.storage.put('session:expired',{userId:created.user.id,expiresAt:now-1000});
  await instance.storage.put('session:malformed',{userId:created.user.id});
  await instance.storage.put('session:active',{userId:created.user.id,expiresAt:now+86400000});
  for(let index=0;index<1600;index++)await instance.storage.put('limit:zz-expired-'+String(index).padStart(4,'0'),{count:1,expiresAt:now-1000});
  await instance.storage.put('limit:active',{count:1,expiresAt:now+3600000});
  const privateUser=await instance.storage.get('user:'+created.user.id);
  await instance.object.alarm();
  assert.equal(await instance.storage.get('session:expired'),undefined);
  assert.equal(await instance.storage.get('session:malformed'),undefined);
  assert.ok(await instance.storage.get('session:active'));
  const remaining=[...instance.storage.values.keys()].filter(key=>key.startsWith('limit:zz-expired-'));assert.ok(remaining.length>0&&remaining.length<1600);
  await instance.object.alarm();
  assert.equal([...instance.storage.values.keys()].filter(key=>key.startsWith('limit:zz-expired-')).length,0);
  assert.ok(await instance.storage.get('limit:active'));assert.deepEqual(await instance.storage.get('user:'+created.user.id),privateUser);assert.ok(await instance.storage.getAlarm()>now);
});


test('state rejects over-limit known text instead of acknowledging truncated private records',async()=>{
  const instance=await app(),created=await signup(instance);
  const initial=await call(instance,'state',{method:'PUT',token:created.token,body:{baseRevision:null,state:{catches:[{id:'one',fish:'კობრი',note:'ერთი ხაზი\nმეორე ხაზი'}]}}});assert.equal(initial.status,200);assert.equal(initial.body.state.catches[0].note,'ერთი ხაზი\nმეორე ხაზი');
  for(const state of [
    {catches:[{id:'one',fish:'კობრი',note:'x'.repeat(700)}]},
    {catchLog:[{id:'one',species:'კობრი',notes:'x'.repeat(501)}]},
    {plans:[{id:'one',title:'x'.repeat(121)}]},
    {plans:[{id:'one',meta:'x'.repeat(301)}]},
    {favorites:['x'.repeat(101)]},
    {catches:[{id:'one',fish:'კობრი',place:'x'.repeat(121)}]},
    {catchLog:[{id:'one',species:'კობრი',time:'29:99'}]},
    {checklists:{fishing:{['x'.repeat(161)]:true}}},
    JSON.parse('{"checklists":{"__proto__":{"polluted":true}}}')
  ])assert.equal((await call(instance,'state',{method:'PUT',token:created.token,body:{baseRevision:initial.body.revision,state}})).status,400);
  const after=await call(instance,'state',{token:created.token});assert.equal(after.body.revision,initial.body.revision);assert.equal(after.body.state.catches[0].note,'ერთი ხაზი\nმეორე ხაზი');
});
