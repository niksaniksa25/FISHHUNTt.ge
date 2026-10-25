'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const photo=require('../js/photo-identify.js');
const fish=['carp','კობრი','Common carp','', '', '', '', '', '', '', '', 'Cyprinus carpio'];
const jpeg=new Uint8Array([255,216,255,192,0,17,8,0,50,0,100,...Array(10).fill(0)]);
const prepared=name=>({mimeType:'image/jpeg',data:'private-'+name,width:100,height:50,bytes:1000,previewURL:'blob:'+name});
const result=(status='identified')=>({status,summary:'შესაძლო კობრი',candidates:[{id:'carp',name:'untrusted label',scientificName:'wrong',traits:'ქერცლი',distinctions:'ულვაშები'}],limitations:'შეადარე ნიშნები'});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function browser(extra={}){
  const root={document:{readyState:'loading',addEventListener(){}},location:{hostname:'niksaniksa25.github.io'},GN_AI_WORKER_ORIGIN:'https://fishhunt-fixture.example.workers.dev',URL,Blob,AbortController,setTimeout,clearTimeout,btoa,valueOf(){return this;},...extra};
  root.window=root;vm.runInNewContext(fs.readFileSync(require.resolve('../js/photo-identify.js'),'utf8'),root);return root;
}

test('photo headers, rather than extension or claimed MIME, decide which images can be decoded',async()=>{
  assert.equal(photo.imageType(jpeg),'image/jpeg');assert.deepEqual(photo.dimensions(jpeg,'image/jpeg'),{width:100,height:50});
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png.set([0,0,0,12,0,0,0,10],16);
  assert.equal(photo.imageType(png),'image/png');assert.deepEqual(photo.dimensions(png,'image/png'),{width:12,height:10});
  const lossy=new Uint8Array(30);lossy.set(Buffer.from('RIFF'),0);lossy.set(Buffer.from('WEBPVP8 '),8);lossy.set([157,1,42,100,0,50,0],23);
  assert.deepEqual(photo.dimensions(lossy,'image/webp'),{width:100,height:50});
  const lossless=new Uint8Array(25);lossless.set(Buffer.from('RIFF'),0);lossless.set(Buffer.from('WEBPVP8L'),8);lossless[20]=47;new DataView(lossless.buffer).setUint32(21,99+(49<<14),true);
  assert.deepEqual(photo.dimensions(lossless,'image/webp'),{width:100,height:50});
  const disguised=new Blob(['<svg xmlns="http://www.w3.org/2000/svg">x</svg>'],{type:'image/jpeg'});
  await assert.rejects(photo.inspectFile(disguised),/JPEG/);
  await assert.rejects(photo.inspectFile(new Blob([])),/ცარიელია/);
  let read=false;await assert.rejects(photo.inspectFile({size:photo.MAX_FILE_BYTES+1,slice(){read=true;}}),/20/);assert.equal(read,false);
});
test('oversized image dimensions are rejected before decoding and HEIC is distinguished for decoder fallback',async()=>{
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(16,30000);new DataView(png.buffer).setUint32(20,30000);
  await assert.rejects(photo.inspectFile(new Blob([png],{type:'image/png'})),/ძალიან დიდია/);
  const heic=new Uint8Array(24);heic.set(Buffer.from('ftypheic'),4);assert.equal(photo.imageType(heic),'image/heic');
  assert.throws(()=>photo.checkDimensions({width:0,height:1}));assert.throws(()=>photo.checkDimensions({width:1,height:Infinity}));
});
test('preparation redraws to bounded JPEG, discards original metadata bytes and releases the decoder',async()=>{
  let closed=0,drawn=0;const encoded=new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}),urls=[];
  const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){drawn++;}}),toBlob(callback,type){assert.equal(type,'image/jpeg');callback(encoded);}};
  const root=browser({document:{readyState:'loading',addEventListener(){},createElement:tag=>{assert.equal(tag,'canvas');return canvas;}},createImageBitmap:async(file,options)=>{assert.equal(options.imageOrientation,'from-image');return {width:4000,height:3000,close(){closed++;}};},URL:{createObjectURL:blob=>{urls.push(blob);return 'blob:prepared';},revokeObjectURL(){}}});
  const converted=await root.FishHuntPhotoIdentify.prepareImage(new Blob([jpeg,'GPS-private-metadata'],{type:'image/jpeg'}));
  assert.equal(converted.mimeType,'image/jpeg');assert.equal(converted.width,1600);assert.equal(converted.height,1200);assert.equal(converted.bytes,encoded.size);assert.equal(closed,1);assert.equal(drawn,1);assert.equal(urls[0],encoded);
  assert.equal(Buffer.from(converted.data,'base64').toString().includes('GPS-private-metadata'),false);
});
test('a slower previous file cannot replace the newly selected preview',async()=>{
  const a=deferred(),b=deferred(),released=[],controller=photo.createController({prepare:file=>file==='A'?a.promise:b.promise,release:url=>released.push(url)});
  const first=controller.choose('A'),second=controller.choose('B');b.resolve(prepared('B'));await second;a.resolve(prepared('A'));await first;
  assert.equal(controller.snapshot().previewURL,'blob:B');assert.deepEqual(released,['blob:A']);assert.equal(controller.snapshot().canAnalyze,true);
  assert.equal(JSON.stringify(controller.snapshot()).includes('private-B'),false);
});
test('removing a photo cancels a pending preparation and releases its late object URL',async()=>{
  const pending=deferred(),released=[],controller=photo.createController({prepare:()=>pending.promise,release:url=>released.push(url)});
  const work=controller.choose('A');controller.remove();pending.resolve(prepared('A'));await work;
  assert.equal(controller.snapshot().hasImage,false);assert.equal(controller.snapshot().result,null);assert.deepEqual(released,['blob:A']);
});
test('changing a file aborts analysis and discards an upstream response even if abort was ignored',async()=>{
  const pending=deferred();let signal;
  const controller=photo.createController({prepare:async file=>prepared(file),send:(image,hint,passed)=>{signal=passed;return pending.promise;},fishes:()=>[fish],release(){}});
  await controller.choose('A');const request=controller.analyze();await controller.choose('B');assert.equal(signal.aborted,true);pending.resolve(result());await request;
  assert.equal(controller.snapshot().previewURL,'blob:B');assert.equal(controller.snapshot().result,null);assert.equal(controller.snapshot().phase,'ready');
});
test('a failed request keeps the compressed image for retry and double submission sends only once',async()=>{
  const pending=deferred();let calls=0;const controller=photo.createController({prepare:async()=>prepared('A'),send:()=>{calls++;return calls===1?pending.promise:Promise.resolve(result());},fishes:()=>[fish],release(){}});
  await controller.choose('A');const work=controller.analyze('hint');assert.equal(await controller.analyze(),false);assert.equal(calls,1);pending.reject(new Error('temporary provider error'));await work;
  assert.equal(controller.snapshot().phase,'error');assert.equal(controller.snapshot().hasImage,true);assert.equal(controller.snapshot().canAnalyze,true);
  assert.equal(await controller.analyze(),true);assert.equal(calls,2);assert.equal(controller.snapshot().result.candidates[0].name,'კობრი');
});
test('candidate IDs resolve to native catalogue names and unknown or duplicate IDs cannot create arbitrary links',()=>{
  const normalized=photo.normalizeResult({...result(),candidates:[{id:'carp',name:'<script>',scientificName:'fake'}, {id:'carp'}, {id:'https://evil.example'}]},[fish]);
  assert.equal(normalized.candidates.length,1);assert.equal(normalized.candidates[0].name,'კობრი');assert.equal(normalized.candidates[0].scientificName,'Cyprinus carpio');
  assert.equal(photo.normalizeResult({...result(),candidates:[{id:'unknown'}]},[fish]).status,'uncertain');
  assert.deepEqual(photo.normalizeResult(result('not_fish'),[fish]).candidates,[]);
  assert.throws(()=>photo.normalizeResult({...result(),candidates:Array(4).fill({id:'carp'})},[fish]));
  assert.throws(()=>photo.normalizeResult({...result(),status:'certain'},[fish]));
});
test('only the prepared image and optional hint are sent; credentials, filenames and preview URLs are omitted',async()=>{
  let request;const root=browser({fetch:async(url,options)=>{request={url,options};return Response.json({ok:true,result:result()});}});
  await root.FishHuntPhotoIdentify.sendImage({...prepared('A'),filename:'private-location.jpg',originalGPS:'private'},'  მდინარე  ');
  assert.equal(request.url,'https://fishhunt-fixture.example.workers.dev/api/ai/identify-photo');assert.equal(request.options.credentials,'omit');assert.equal(request.options.cache,'no-store');
  const payload=JSON.parse(request.options.body);assert.deepEqual(payload,{image:{mimeType:'image/jpeg',data:'private-A'},hint:'მდინარე'});assert.doesNotMatch(request.options.body,/filename|previewURL|originalGPS|blob:/);
});
test('unsupported service origin and server failures never become fake identification results',async()=>{
  const root=browser({fetch:async()=>Response.json({ok:false,message:'დროებითი პრობლემა'},{status:503})});
  await assert.rejects(root.FishHuntPhotoIdentify.sendImage(prepared('A'),''),/დროებითი პრობლემა/);
  root.GN_AI_WORKER_ORIGIN='https://example.test/private/path';assert.equal(root.FishHuntPhotoIdentify.endpoint(),'');
  root.GN_AI_WORKER_ORIGIN='https://user:password@example.test';assert.equal(root.FishHuntPhotoIdentify.endpoint(),'');
  root.GN_AI_WORKER_ORIGIN='javascript:alert(1)';assert.equal(root.FishHuntPhotoIdentify.endpoint(),'');
  root.GN_AI_WORKER_ORIGIN='';assert.equal(root.FishHuntPhotoIdentify.endpoint(),'');
});
test('manual search stays a separate catalogue lookup with canonical fish links and no photo or XP writes',()=>{
  let writes=0;const root=browser({FISHES:[fish],HUNTING_WILDLIFE:[['bird','მწყერი','Quail','Coturnix coturnix']],localStorage:{setItem(){writes++;}}});
  assert.equal(root.FishHuntPhotoIdentify.manualSearch('carp','fish')[0].id,'carp');assert.equal(root.FishHuntPhotoIdentify.manualSearch('Coturnix','bird')[0].id,'მწყერი');assert.equal(root.FishHuntPhotoIdentify.manualSearch('carp','bird').length,0);assert.equal(writes,0);
});
