'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {webcrypto}=require('node:crypto');
if(!global.crypto)global.crypto=webcrypto;
const source=fs.readFileSync(require.resolve('../js/account-sync.js'),'utf8');
const workerOrigin='https://fishhunt-fixture.example.workers.dev';
const credentials={email:'recovery-ui@example.test',password:'old-password-123',mode:'signup',consent:true,remember:true};
class DOStorage{
  constructor(){this.values=new Map();}
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){this.values.set(key,structuredClone(value));}
  async delete(key){this.values.delete(key);}
  async transaction(run){const before=new Map(structuredClone([...this.values]));try{return await run(this);}catch(error){this.values=before;throw error;}}
}
function storage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
async function service(){
  const module=await import(pathToFileURL(require.resolve('../worker/fishhunt-ai.mjs')).href),data=new DOStorage(),object=new module.FishHuntAccountsDO({storage:data},{}),calls=[];
  const env={FISHHUNT_ACCOUNTS:{idFromName:name=>name,get:()=>object}};
  return {data,calls,async fetch(url,options={}){calls.push({url,method:options.method||'GET'});return module.default.fetch(new Request(url,{...options,headers:{...options.headers,Origin:'https://niksaniksa25.github.io','CF-Connecting-IP':'192.0.2.44'}}),env);}};
}
function browser(server){
  const local=storage(),tab=storage(),events=new Map(),context={localStorage:local,sessionStorage:tab,URL,TextEncoder,AbortController,crypto:webcrypto,setTimeout,clearTimeout,navigator:{onLine:true},location:{reload(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},document:{addEventListener(){},dispatchEvent(){},getElementById(){return null;},querySelector(){return null;}},addEventListener(type,run){events.set(type,run);},__GN_API_CONFIG_LOADED:true,GN_ACCOUNT_WORKER_ORIGIN:workerOrigin,fetch:(...args)=>server.fetch(...args)};
  context.window=context;vm.runInNewContext(source,context);
  return {api:context.FishHuntAccountSync,context,local,tab,events};
}
function values(client){return JSON.stringify([...client.local.values,...client.tab.values]);}

test('recovery setup verifies current password without logging out or persisting the returned secret',async()=>{
  const server=await service(),client=browser(server);await client.api.connect(credentials);
  const before=client.local.getItem('fishhunt_cloud_session_v1');
  await assert.rejects(client.api.createRecoveryCode('incorrect-password'),error=>error.status===403);
  assert.equal(client.api.sessionActive(),true);assert.equal(client.local.getItem('fishhunt_cloud_session_v1'),before);
  const code=await client.api.createRecoveryCode(credentials.password);
  assert.match(code,/^(?:[A-F0-9]{8}-){7}[A-F0-9]{8}$/);assert.equal(values(client).includes(code),false);
  assert.equal(values(client).includes(credentials.password),false);assert.equal(JSON.parse(client.local.getItem('fishhunt_cloud_session_v1')).user.recoveryConfigured,true);
});

test('recovery on another device consumes code, revokes old session and safely restores local records',async()=>{
  const server=await service(),first=browser(server),second=browser(server);
  first.local.setItem('geonature_plus_v1',JSON.stringify({favorites:['ადგილობრივი']}));await first.api.connect(credentials);await first.api.resolvePending('merge');
  first.local.setItem('geonature_plus_v1',JSON.stringify({favorites:['პირადი']}));await first.api.sync();const code=await first.api.createRecoveryCode(credentials.password);
  const result=await second.api.recoverPassword({email:credentials.email,recoveryCode:code,newPassword:'new-password-123'});assert.equal(result.ok,true);assert.equal(second.api.sessionActive(),false);assert.equal(values(second).includes(code),false);
  await assert.rejects(first.api.request('/me'),error=>error.status===401);assert.equal(first.api.sessionActive(),false);
  assert.deepEqual(JSON.parse(first.local.getItem('geonature_plus_v1')).favorites,['ადგილობრივი']);
  assert.ok([...first.local.values.keys()].some(key=>key.startsWith('fishhunt_cloud_device_records_v1:')));
  await assert.rejects(second.api.connect({...credentials,mode:'signin'}),error=>error.status===401);
  await second.api.connect({...credentials,password:'new-password-123',mode:'signin'});assert.equal(second.api.sessionActive(),true);
  assert.equal((await second.api.request('/me')).user.recoveryConfigured,false);
  await second.api.disconnect();await assert.rejects(second.api.recoverPassword({email:credentials.email,recoveryCode:code,newPassword:'another-password-123'}),error=>error.status===401);
});

test('reset requires an anonymous cloud session and a failed recovery preserves local account records',async()=>{
  const server=await service(),first=browser(server),second=browser(server);await first.api.connect(credentials);
  await assert.rejects(first.api.recoverPassword({email:credentials.email,recoveryCode:'a'.repeat(64),newPassword:'new-password-123'}),/გათიშე/);
  assert.equal(first.api.sessionActive(),true);assert.equal(server.calls.filter(call=>call.url.endsWith('/recover')).length,0);
  second.local.setItem('geonature_local_users_v5','[{"email":"device@example.test"}]');second.local.setItem('geonature_plus_v1','{"favorites":["საწყისი"]}');const before=values(second);
  await assert.rejects(second.api.recoverPassword({email:credentials.email,recoveryCode:'a'.repeat(64),newPassword:'new-password-123'}),error=>error.status===401);
  assert.equal(values(second),before);assert.equal(second.api.view().status,'ready');
});

test('old Worker capabilities hide recovery and do not send unsupported routes',async()=>{
  const server=await service(),fetch=server.fetch;server.fetch=async(url,options)=>{const response=await fetch(url,options);if(url.endsWith('/api/health')){const value=await response.json();delete value.accountRecoveryConfigured;return Response.json(value);}return response;};
  const client=browser(server);await client.api.connect(credentials);assert.equal(client.api.view().recoveryAvailable,false);
  await assert.rejects(client.api.createRecoveryCode(credentials.password),/ჯერ არ გააქტიურებულა/);
  assert.equal(server.calls.filter(call=>call.url.endsWith('/recovery-code')).length,0);
});

test('recovery setup pins initiating identity and discards a secret after another tab changes accounts',async()=>{
  const server=await service(),first=browser(server),other=browser(server);await first.api.connect(credentials);await other.api.connect({...credentials,email:'second-ui@example.test'});
  const fetch=server.fetch;let release,started;const waiting=new Promise(resolve=>{started=resolve;});server.fetch=async(url,options)=>{if(url.endsWith('/recovery-code')){started();await new Promise(resolve=>{release=resolve;});}return fetch(url,options);};
  const attempt=first.api.createRecoveryCode(credentials.password);await waiting;
  const replacement=other.local.getItem('fishhunt_cloud_session_v1');first.local.setItem('fishhunt_cloud_session_v1',replacement);release();
  await assert.rejects(attempt,/ანგარიში შეიცვალა/);assert.equal(first.local.getItem('fishhunt_cloud_session_v1'),replacement);assert.equal(JSON.parse(replacement).user.recoveryConfigured,false);
});

test('a delayed recovery401 for account A cannot clear account B selected in another tab',async()=>{
  const server=await service(),first=browser(server),other=browser(server);await first.api.connect(credentials);await other.api.connect({...credentials,email:'second-ui@example.test'});
  const fetch=server.fetch;let release,started;const waiting=new Promise(resolve=>{started=resolve;});server.fetch=async(url,options)=>{if(url.endsWith('/recovery-code')){started();await new Promise(resolve=>{release=resolve;});return Response.json({message:'Session expired'},{status:401});}return fetch(url,options);};
  const attempt=first.api.createRecoveryCode(credentials.password);await waiting;
  const replacement=other.local.getItem('fishhunt_cloud_session_v1');first.local.setItem('fishhunt_cloud_session_v1',replacement);release();
  await assert.rejects(attempt,error=>error.status===401);assert.equal(first.local.getItem('fishhunt_cloud_session_v1'),replacement);assert.equal(first.api.sessionActive(),true);
});

test('pending recovery prevents a concurrent connection or second reset request',async()=>{
  const server=await service(),client=browser(server);await client.api.ready();const fetch=server.fetch;let release,started;const waiting=new Promise(resolve=>{started=resolve;});server.fetch=async(url,options)=>{if(url.endsWith('/recover')){started();await new Promise(resolve=>{release=resolve;});return Response.json({message:'Invalid recovery'},{status:401});}return fetch(url,options);};
  const attempt=client.api.recoverPassword({email:credentials.email,recoveryCode:'a'.repeat(64),newPassword:'new-password-123'});await waiting;
  await assert.rejects(client.api.connect(credentials),/მიმდინარეობს/);await assert.rejects(client.api.recoverPassword({}),/მიმდინარეობს/);release();await assert.rejects(attempt,error=>error.status===401);
  assert.equal(server.calls.filter(call=>call.url.endsWith('/signup')).length,0);
});
