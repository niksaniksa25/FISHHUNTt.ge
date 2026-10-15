'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
async function app(){return (await import(pathToFileURL(path.join(__dirname,'..','worker','fishhunt-ai.mjs')).href)).default;}
const ORIGIN='https://niksaniksa25.github.io';
const BASE='https://fishhunt-admin.example.workers.dev';
function kv(){
  const map=new Map();
  return{
    async get(key,format){const v=map.get(key);return v===undefined?null:format==='json'?JSON.parse(v):v;},
    async put(key,value){map.set(key,String(value));},
    async delete(key){map.delete(key);},
    async list({prefix,limit}){return{keys:Array.from(map.keys()).filter(x=>x.startsWith(prefix)).slice(0,limit).map(name=>({name})),list_complete:true};}
  };
}
function req(route,method='GET',data,token,origin=ORIGIN){
 const headers={Origin:origin};
 if(data!==undefined)headers['Content-Type']='application/json';
 if(token)headers.Authorization='Bearer '+token;
 return new Request(BASE+route,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})});
}
test('KV-backed admin requires configured secret and storage; does not expose password',async()=>{
 const worker=await app();
 const missing=await worker.fetch(req('/api/admin/me'),{GEMINI_API_KEY:'dummy'});
 assert.equal(missing.status,503);
 assert.doesNotMatch(await missing.text(),/dummy/);
});
test('admin authentication, feedback lifecycle, and revocation use private storage',async()=>{
 const worker=await app(),store=kv();
 const env={ADMIN_KV:store,ADMIN_PASSWORD:'example-strong-private-admin-password'};
 let r=await worker.fetch(req('/api/admin/me'),env);
 assert.deepEqual(await r.json(),{ok:true,admin:false});
 r=await worker.fetch(req('/api/admin/login','POST',{password:'wrong'}),env);
 assert.equal(r.status,401);
 r=await worker.fetch(req('/api/admin/login','POST',{password:env.ADMIN_PASSWORD,remember:true}),env);
 assert.equal(r.status,200);
 const login=await r.json();
 assert.match(login.token,/^[0-9a-f]{64}$/);
 r=await worker.fetch(req('/api/admin/me','GET',undefined,login.token),env);
 assert.deepEqual(await r.json(),{ok:true,admin:true});
 r=await worker.fetch(req('/api/feedback','POST',{category:'bug',message:'კონკრეტული შეცდომაა',page:'/fishing.html'}),env);
 assert.equal(r.status,201);
 const saved=await r.json();
 assert.match(saved.id,/^[0-9a-f-]{36}$/);
 r=await worker.fetch(req('/api/admin/feedback','GET',undefined,login.token),env);
 const list=await r.json();
 assert.equal(list.items.length,1);
 assert.equal(list.items[0].message,'კონკრეტული შეცდომაა');
 r=await worker.fetch(req('/api/admin/feedback/status','PATCH',{id:saved.id,status:'resolved'},login.token),env);
 assert.equal(r.status,200);
 r=await worker.fetch(req('/api/admin/feedback?status=resolved','GET',undefined,login.token),env);
 assert.equal((await r.json()).items.length,1);
 r=await worker.fetch(req('/api/admin/stats','GET',undefined,login.token),env);
 assert.equal((await r.json()).stats.statsUnavailable,true);
 r=await worker.fetch(req('/api/admin/logout','POST',{},login.token),env);
 assert.equal(r.status,200);
 r=await worker.fetch(req('/api/admin/me','GET',undefined,login.token),env);
 assert.deepEqual(await r.json(),{ok:true,admin:false});
});
test('Worker denies unknown sites and does not allow public feedback listing',async()=>{
 const worker=await app(),env={ADMIN_KV:kv(),ADMIN_PASSWORD:'example-strong-private-admin-password'};
 const blocked=await worker.fetch(req('/api/admin/login','POST',{password:'x'},null,'https://evil.example'),env);
 assert.equal(blocked.status,403);
 const denied=await worker.fetch(req('/api/admin/feedback'),env);
 assert.equal(denied.status,401);
 const options=await worker.fetch(req('/api/admin/login','OPTIONS'),env);
 assert.equal(options.status,204);
 assert.equal(options.headers.get('access-control-allow-headers'),'Content-Type, Authorization');
});