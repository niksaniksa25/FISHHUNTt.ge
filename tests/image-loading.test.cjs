const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function fixture(behavior){
  let now=Date.parse('2026-10-13T12:00:00Z'),timerId=0,active=0,maxActive=0;
  const timers=new Map(),requests=[];
  class ClockDate extends Date{static now(){return now;}}
  const context={window:{},Map,Set,Date:ClockDate,Promise,AbortController,
    setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
    fetch(url,options){
      const request={url,signal:options.signal};requests.push(request);
      if(behavior)return Promise.resolve().then(()=>behavior(request));
      active++;maxActive=Math.max(maxActive,active);
      return new Promise((resolve,reject)=>{
        let settled=false;
        const finish=(value,error)=>{if(settled)return;settled=true;active--;options.signal.removeEventListener('abort',abort);error?reject(error):resolve({ok:true,json:async()=>value});};
        const abort=()=>finish(null,new Error('AbortError'));
        options.signal.addEventListener('abort',abort,{once:true});request.finish=value=>finish(value);
      });
    }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/image-utils.js'),'utf8'),context,{filename:'image-utils.js'});
  return{image:context.window.GeoImage,requests,timers,get maxActive(){return maxActive;},flush:()=>new Promise(resolve=>setImmediate(resolve)),
    async advance(ms){now+=ms;for(const [id,timer]of Array.from(timers)){if(timer.at<=now){timers.delete(id);timer.callback();}}await this.flush();}};
}
const successful={thumbnail:{source:'https://upload.wikimedia.org/carp.jpg'}};
test('concurrent duplicate species lookups share their request and cache the real photo',async()=>{
  const f=fixture(),a=f.image.resolveSpeciesImage('კობრი','Cyprinus carpio','Common carp'),b=f.image.resolveSpeciesImage('კობრი','Cyprinus carpio','Common carp');await f.flush();
  assert.equal(f.requests.length,1);f.requests[0].finish(successful);assert.equal(await a,successful.thumbnail.source);assert.equal(await b,successful.thumbnail.source);
  assert.equal(await f.image.resolveSpeciesImage('კობრი','Cyprinus carpio','Common carp'),successful.thumbnail.source);assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);
});
test('many newly visible cards never exceed four concurrent metadata requests',async()=>{
  const f=fixture(),lookups=Array.from({length:11},(_,i)=>f.image.resolveSpeciesImage('Fish '+i,'Species '+i,''));await f.flush();assert.equal(f.requests.length,4);
  for(let i=0;i<11;i++){f.requests[i].finish(successful);await f.flush();}
  assert.equal((await Promise.all(lookups)).length,11);assert.equal(f.maxActive,4);assert.equal(f.timers.size,0);
});
test('a stalled image provider is bounded and retains a named placeholder',async()=>{
  const f=fixture(),lookup=f.image.resolveSpeciesImage('კობრი','Cyprinus carpio','Common carp');await f.flush();await f.advance(16001);
  const result=await lookup;assert.match(result,/^data:image\/svg\+xml/);assert.ok(decodeURIComponent(result).includes('კობრი'));assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.timers.size,0);
});
test('temporary lookup failures cache briefly and can recover after one minute',async()=>{
  let available=false;const f=fixture(()=>{if(!available)throw Error('Provider offline');return{ok:true,json:async()=>successful};});
  const first=await f.image.resolveSpeciesImage('კობრი','Cyprinus carpio','Common carp'),count=f.requests.length;assert.match(first,/^data:image/);
  available=true;assert.equal(await f.image.resolveSpeciesImage('კობრი','Cyprinus carpio','Common carp'),first);assert.equal(f.requests.length,count);
  await f.advance(60001);assert.equal(await f.image.resolveSpeciesImage('კობრი','Cyprinus carpio','Common carp'),successful.thumbnail.source);assert.equal(f.requests.length,count+1);
});
test('forest lookup keeps its exact-title safeguard and unknown places do not borrow a city image',async()=>{
  const f=fixture(()=>({ok:true,json:async()=>({title:'Unrelated forest',thumbnail:{source:'https://upload.wikimedia.org/unrelated.jpg'},query:{pages:{}}})}));
  const forest=await f.image.resolveNatureImage('ბორჯომის ტყე','Borjomi Forest');assert.match(forest,/^data:image/);
  const count=f.requests.length,place=await f.image.resolvePlaceImage('უცნობი წყლები','თბილისი','ტბა');assert.match(place,/^data:image/);assert.equal(f.requests.length,count);
});
test('concurrent gallery opens reuse the lookup and preserve relevant image arrays',async()=>{
  const f=fixture(()=>({ok:true,json:async()=>({query:{pages:{1:{title:'File:Cyprinus carpio photo.jpg',imageinfo:[{thumburl:successful.thumbnail.source}]}}}})}));
  const [a,b]=await Promise.all([f.image.resolveSpeciesGallery('კობრი','Cyprinus carpio','Common carp'),f.image.resolveSpeciesGallery('კობრი','Cyprinus carpio','Common carp')]);
  assert.deepEqual(Array.from(a),[successful.thumbnail.source]);assert.deepEqual(Array.from(b),Array.from(a));const count=f.requests.length;
  assert.deepEqual(Array.from(await f.image.resolveSpeciesGallery('კობრი','Cyprinus carpio','Common carp')),Array.from(a));assert.equal(f.requests.length,count);
});
