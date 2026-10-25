(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document){root.FishHuntPhotoIdentify=api;if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',api.init);else api.init();}
})(typeof window==='object'?window:globalThis,function(root){
  'use strict';
  const MAX_FILE_BYTES=20*1024*1024,MAX_IMAGE_BYTES=1572864,MAX_PIXELS=40000000,MAX_EDGE=1600;
  const instances=new WeakMap();let serial=0;
  const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
  function imageType(bytes){
    if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
    if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
    const ascii=(from,to)=>String.fromCharCode(...bytes.slice(from,to));
    if(bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
    if(bytes.length>=16&&ascii(4,8)==='ftyp'&&/(?:heic|heix|hevc|hevx|heif|mif1|msf1)/.test(ascii(8,Math.min(bytes.length,48))))return 'image/heic';
    return '';
  }
  function dimensions(bytes,type){
    const u16=i=>bytes[i]*256+bytes[i+1],u32=i=>bytes[i]*16777216+bytes[i+1]*65536+bytes[i+2]*256+bytes[i+3];
    if(type==='image/png'&&bytes.length>=24)return {width:u32(16),height:u32(20)};
    if(type==='image/webp'){
      const chunk=String.fromCharCode(...bytes.slice(12,16));
      if(bytes.length>=30&&chunk==='VP8X')return {width:1+bytes[24]+bytes[25]*256+bytes[26]*65536,height:1+bytes[27]+bytes[28]*256+bytes[29]*65536};
      if(bytes.length>=30&&chunk==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return {width:(bytes[26]+bytes[27]*256)&16383,height:(bytes[28]+bytes[29]*256)&16383};
      if(bytes.length>=25&&chunk==='VP8L'&&bytes[20]===47){const packed=(bytes[21]+bytes[22]*256+bytes[23]*65536+bytes[24]*16777216)>>>0;return {width:1+(packed&16383),height:1+((packed>>>14)&16383)};}
    }
    if(type==='image/jpeg'){
      let at=2;
      while(at+8<bytes.length){
        if(bytes[at]!==255)break;while(bytes[at]===255)at++;
        const marker=bytes[at++];if(marker===217||marker===218)break;
        if(marker===1||marker>=208&&marker<=215)continue;
        if(at+2>bytes.length)break;const length=u16(at);if(length<2||at+length>bytes.length)break;
        if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {height:u16(at+3),width:u16(at+5)};
        at+=length;
      }
    }
    return null;
  }
  function checkDimensions(size){
    if(!size||!Number.isInteger(size.width)||!Number.isInteger(size.height)||size.width<1||size.height<1||size.width*size.height>MAX_PIXELS||Math.max(size.width,size.height)>30000)throw new Error('ფოტოს ზომა ძალიან დიდია ან არასწორია. აირჩიე სტანდარტული ან შემცირებული ფოტო.');
    return size;
  }
  async function inspectFile(file){
    if(!file||typeof file.size!=='number'||typeof file.slice!=='function')throw new Error('ჯერ აირჩიე თევზის ფოტო.');
    if(file.size<12)throw new Error('ფოტო დაზიანებულია ან ცარიელია. აირჩიე სხვა ფაილი.');
    if(file.size>MAX_FILE_BYTES)throw new Error('ფოტო მაქსიმუმ 20 მბ უნდა იყოს. აირჩიე შემცირებული ფოტო.');
    const bytes=new Uint8Array(await file.slice(0,262144).arrayBuffer()),type=imageType(bytes);
    if(!type)throw new Error('აირჩიე JPEG, PNG ან WebP ფოტო. HEIC-ისთვის გამოიყენე JPEG-ად შენახვა, თუ ბრაუზერი მას ვერ ხსნის.');
    const size=dimensions(bytes,type);if(size)checkDimensions(size);else if(type!=='image/heic')throw new Error('ფოტოს ზომა ვერ დადგინდა. აირჩიე სხვა ან ხელახლა შენახული JPEG, PNG ან WebP ფაილი.');return {type,size};
  }
  async function decode(file,type){
    if(typeof root.createImageBitmap==='function'){
      try{const image=await root.createImageBitmap(file,{imageOrientation:'from-image'});return {image,width:image.width,height:image.height,release:()=>image.close?.()};}catch{}
    }
    const url=root.URL.createObjectURL(file),image=new root.Image();
    try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error(type==='image/heic'?'ამ ბრაუზერში HEIC ვერ გაიხსნა. გადაიყვანე JPEG-ად ან აირჩიე სხვა ფოტო.':'ფოტო ვერ გაიხსნა. შესაძლოა ფაილი დაზიანებულია.'));image.src=url;});return {image,width:image.naturalWidth,height:image.naturalHeight,release:()=>root.URL.revokeObjectURL(url)};}
    catch(error){root.URL.revokeObjectURL(url);throw error;}
  }
  function blobData(blob){return blob.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer);let binary='';for(let at=0;at<bytes.length;at+=32768)binary+=String.fromCharCode(...bytes.subarray(at,at+32768));return root.btoa(binary);});}
  async function prepareImage(file){
    const inspected=await inspectFile(file);let decoded;
    try{
      decoded=await decode(file,inspected.type);checkDimensions(decoded);
      const canvas=root.document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw new Error('ბრაუზერმა ფოტოს დამუშავება ვერ შეძლო. სცადე სხვა ბრაუზერი.');
      let ratio=Math.min(1,MAX_EDGE/Math.max(decoded.width,decoded.height)),blob;
      for(let attempt=0;attempt<5;attempt++){
        canvas.width=Math.max(1,Math.round(decoded.width*ratio));canvas.height=Math.max(1,Math.round(decoded.height*ratio));
        context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(decoded.image,0,0,canvas.width,canvas.height);
        blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('ფოტოს შემცირება ვერ მოხერხდა.')),'image/jpeg',attempt===0?.86:attempt===1?.76:.66));
        if(blob.type==='image/jpeg'&&blob.size<=MAX_IMAGE_BYTES)break;ratio*=.8;
      }
      if(!blob||blob.type!=='image/jpeg'||blob.size>MAX_IMAGE_BYTES)throw new Error('ფოტო ვერ შემცირდა. აირჩიე უფრო პატარა გამოსახულება.');
      return {mimeType:'image/jpeg',data:await blobData(blob),width:canvas.width,height:canvas.height,bytes:blob.size,previewURL:root.URL.createObjectURL(blob)};
    }finally{decoded?.release();}
  }
  function endpoint(){
    const base=String(root.GN_AI_WORKER_ORIGIN||root.GN_API_BASE_URL||'').trim().replace(/\/+$/,'');
    if(!base)return String(root.location?.hostname||'').endsWith('github.io')?'':'/api/ai/identify-photo';
    try{const url=new URL(base);if(url.pathname!=='/'||url.search||url.hash||url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return '';return url.origin+'/api/ai/identify-photo';}catch{return '';}
  }
  async function sendImage(image,hint,signal){
    const url=endpoint();if(!url)throw new Error('ფოტოთი ამოცნობის სერვერი ჯერ არ არის დაკავშირებული. შეგიძლია სახეობა კატალოგში ხელით მოძებნო.');
    const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},42000);
    try{
      const response=await root.fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',credentials:'omit',signal:controller.signal,body:JSON.stringify({image:{mimeType:image.mimeType,data:image.data},hint:clean(hint,300)})});
      let value={};try{value=await response.json();}catch{}
      if(!response.ok||value.ok!==true){const error=new Error(response.status===404?'ფოტოთი ამოცნობა ჯერ არ არის ჩართული სერვერზე. განაახლე გვერდი ან სცადე მოგვიანებით.':clean(value.message,600)||'ამოცნობის სერვისი დროებით მიუწვდომელია. სცადე ხელახლა.');error.status=response.status;throw error;}
      return value.result;
    }catch(error){if(timedOut)throw new Error('პასუხს დიდი დრო დასჭირდა. ფოტო შენარჩუნებულია — სცადე ხელახლა.');throw error;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  function normalizeResult(value,fishList){
    if(!value||!['identified','uncertain','not_fish'].includes(value.status)||!clean(value.summary,1200)||!Array.isArray(value.candidates)||value.candidates.length>3)throw new Error('AI-ის პასუხი ვერ დამუშავდა. სცადე სხვა ფოტო ან ხელახლა ამოცნობა.');
    const ids=new Set(),candidates=[];
    if(value.status!=='not_fish')for(const item of value.candidates){
      const fish=(fishList||[]).find(row=>row[0]===item?.id);if(!fish||ids.has(fish[0]))continue;ids.add(fish[0]);
      candidates.push({id:fish[0],name:fish[1],scientificName:fish[11]||'',traits:clean(item.traits,1000),distinctions:clean(item.distinctions,1000)});
    }
    return {status:value.status==='identified'&&!candidates.length?'uncertain':value.status,summary:clean(value.summary,1200),candidates,limitations:clean(value.limitations,1200)||'ფოტოს მიხედვით სახეობის ზუსტად დადასტურება ყოველთვის ვერ ხერხდება. გადაამოწმე განმასხვავებელი ნიშნები.'};
  }
  function createController(options={}){
    const prepare=options.prepare||prepareImage,send=options.send||sendImage,release=options.release||(url=>root.URL.revokeObjectURL(url));
    let revision=0,prepared=null,pending=null,state={phase:'idle',message:'აირჩიე თევზის მკაფიო ფოტო და შემდეგ დააჭირე ამოცნობას.',result:null};
    const snapshot=()=>({...state,hasImage:!!prepared,canAnalyze:!!prepared&&state.phase!=='analyzing'&&state.phase!=='preparing',previewURL:prepared?.previewURL||'',width:prepared?.width||null,height:prepared?.height||null,bytes:prepared?.bytes||null});
    const emit=()=>{options.onState?.(snapshot());};
    function discard(){if(prepared?.previewURL)release(prepared.previewURL);prepared=null;}
    function remove(){revision++;pending?.abort();pending=null;discard();state={phase:'idle',message:'ფოტო წაშლილია. შეგიძლია ახალი აირჩიო.',result:null};emit();}
    async function choose(file){
      const token=++revision;pending?.abort();pending=null;discard();state={phase:file?'preparing':'idle',message:file?'ფოტო მუშავდება…':'აირჩიე თევზის ფოტო.',result:null};emit();if(!file)return;
      try{const result=await prepare(file);if(token!==revision){if(result?.previewURL)release(result.previewURL);return;}prepared=result;state={phase:'ready',message:'ფოტო მზადაა. ამოცნობა მხოლოდ ღილაკზე დაჭერის შემდეგ დაიწყება.',result:null};emit();}
      catch(error){if(token!==revision)return;state={phase:'error',message:error.message||'ფოტო ვერ გაიხსნა. აირჩიე სხვა ფაილი.',result:null};emit();}
    }
    async function analyze(hint=''){
      if(!prepared||state.phase==='analyzing'||state.phase==='preparing')return false;
      const token=revision,image=prepared,controller=new AbortController();pending=controller;state={phase:'analyzing',message:'AI ფოტოს აანალიზებს…',result:null};emit();
      try{const answer=await send(image,hint,controller.signal);if(token!==revision||controller.signal.aborted)return false;const result=normalizeResult(answer,options.fishes?.()||[]);state={phase:'done',message:'ანალიზი მზადაა. შედეგი შესაძლო დამთხვევაა და გადამოწმებას საჭიროებს.',result};emit();return true;}
      catch(error){if(token!==revision||controller.signal.aborted)return false;state={phase:'error',message:error.message||'ამოცნობა ვერ დასრულდა. ფოტო შენარჩუნებულია — სცადე ხელახლა.',result:null};emit();return false;}
      finally{if(pending===controller)pending=null;}
    }
    return {snapshot,choose,analyze,remove};
  }
  function element(tag,className,text){const node=root.document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;}
  function manualSearch(query,type='all'){
    const q=clean(query,160).toLocaleLowerCase();if(!q)return [];
    const fish=(root.FISHES||[]).map(row=>({id:row[0],name:row[1],english:row[2],scientific:row[11]||'',kind:'fish'}));
    const wildlife=(root.HUNTING_WILDLIFE||[]).map(row=>({id:row[1],name:row[1],english:row[2],scientific:row[3]||'',kind:row[0]}));
    return [...fish,...wildlife].filter(item=>(type==='all'||item.kind===type)&&(item.name+' '+item.english+' '+item.scientific).toLocaleLowerCase().includes(q)).slice(0,8);
  }
  function renderResult(host,result){
    host.replaceChildren();if(!result)return;
    const titles={identified:'შესაძლო დამთხვევა',uncertain:'სახეობა დასაზუსტებელია',not_fish:'თევზი მკაფიოდ ვერ ჩანს'};
    host.append(element('h3','',titles[result.status]),element('p','',result.summary));
    for(const item of result.candidates){
      const card=element('article','fh-photo-candidate'),name=element('h4','',item.name),scientific=element('small','',item.scientificName);card.append(name,scientific);
      if(item.traits)card.append(element('p','','ფოტოზე შესადარებელი ნიშნები: '+item.traits));
      if(item.distinctions)card.append(element('p','','სხვაობები მსგავს სახეობებთან: '+item.distinctions));
      const link=element('a','btn ghost','სახეობის ცნობარი და შეზღუდვები →');link.href='species.html?id='+encodeURIComponent(item.id);card.append(link);host.append(card);
    }
    host.append(element('p','fh-photo-limitations',result.limitations),element('p','fh-photo-help','AI-ის შესაძლო დამთხვევა მოპოვების ნებართვას ან საკვებად ვარგისიანობას არ ადასტურებს. მოქმედი წესები ცალკე გადაამოწმე.'));
  }
  function mount(host){
    if(!host||instances.has(host))return;const index=++serial,prefix=index===1?'gnPhoto':'fhPhoto'+index;
    host.classList.add('fh-photo-identify');host.dataset.photoIdentifyMounted='1';
    host.innerHTML='<p class="fh-photo-help">გადაუღე თევზს გვერდიდან, კარგ განათებაში. AI შესაძლო სახეობებსა და შესადარებელ ნიშნებს გაჩვენებს.</p><div class="fh-photo-layout"><div><div class="fh-photo-pickers"><label class="btn ghost fh-photo-picker">ფოტოს არჩევა<input id="'+prefix+'File" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"></label><label class="btn ghost fh-photo-picker">კამერა<input type="file" accept="image/*" capture="environment" data-photo-camera></label></div><div class="fh-photo-preview-box" hidden><img id="'+prefix+'Preview" class="fh-photo-preview" alt="არჩეული თევზის ფოტო"><p class="fh-photo-size"></p><button type="button" class="btn ghost" data-photo-action="remove">ფოტოს წაშლა</button></div></div><form class="fh-photo-form"><label>მინიშნება — სურვილისამებრ<input name="photoHint" maxlength="300" placeholder="მაგ. მდინარეში დაჭერილი თევზი"></label><p class="fh-photo-disclosure">„ფოტოს ამოცნობაზე“ დაჭერისას შემცირებული ფოტო გაიგზავნება Google Gemini-ში. FishHunt მას ანგარიშში არ ინახავს.</p><button type="submit" class="btn primary" data-photo-action="analyze" disabled>ფოტოს ამოცნობა</button><p class="fh-photo-status" role="status" aria-live="polite"></p></form></div><div class="fh-photo-results" aria-live="polite"></div><details class="fh-photo-manual"><summary>სახეობების ხელით ძებნა</summary><p class="fh-photo-help">ეს ძებნა სახელსა და ტექსტურ მინიშნებას იყენებს, ფოტოს გარეშე.</p><form class="fh-photo-search-form"><label>კატეგორია<select id="'+prefix+'Type"><option value="all">ყველა</option><option value="fish">თევზი</option><option value="bird">ფრინველი</option><option value="mammal">ცხოველი</option><option value="reptile">ქვეწარმავალი</option></select></label><label>სახელი ან მინიშნება<input id="'+prefix+'Hint" maxlength="160" placeholder="მაგ. კობრი ან trout"></label><button id="'+prefix+'Find" type="submit" class="btn ghost">კატალოგში მოძებნა</button><div class="fh-photo-manual-result" aria-live="polite"></div></form></details>';
    const form=host.querySelector('.fh-photo-form'),status=host.querySelector('.fh-photo-status'),results=host.querySelector('.fh-photo-results'),previewBox=host.querySelector('.fh-photo-preview-box'),preview=host.querySelector('.fh-photo-preview'),analyze=host.querySelector('[data-photo-action="analyze"]'),remove=host.querySelector('[data-photo-action="remove"]');
    let lastResult=null;
    const controller=createController({fishes:()=>root.FISHES||[],onState:value=>{
      status.textContent=value.message;status.dataset.state=value.phase;analyze.disabled=!value.canAnalyze;analyze.textContent=value.phase==='analyzing'?'ამოცნობა მიმდინარეობს…':'ფოტოს ამოცნობა';form.setAttribute('aria-busy',String(value.phase==='analyzing'));
      previewBox.hidden=!value.hasImage;if(value.previewURL){if(preview.getAttribute('src')!==value.previewURL)preview.src=value.previewURL;}else preview.removeAttribute('src');
      host.querySelector('.fh-photo-size').textContent=value.width?value.width+' × '+value.height+' · '+Math.ceil(value.bytes/1024)+' კბ · JPEG':'';
      if(value.result!==lastResult){renderResult(results,value.result);lastResult=value.result;}
    }});instances.set(host,controller);
    host.querySelectorAll('input[type="file"]').forEach(input=>input.addEventListener('change',()=>{if(input.files?.[0])controller.choose(input.files[0]);input.value='';}));
    remove.addEventListener('click',()=>controller.remove());
    form.addEventListener('submit',async event=>{event.preventDefault();if(!controller.snapshot().hasImage){status.textContent='ჯერ აირჩიე ფოტო.';return;}await controller.analyze(form.elements.namedItem('photoHint').value);if(controller.snapshot().result)results.scrollIntoView({block:'nearest',inline:'nearest'});else status.scrollIntoView({block:'nearest',inline:'nearest'});});
    host.querySelector('.fh-photo-search-form').addEventListener('submit',event=>{
      event.preventDefault();const query=host.querySelector('#'+prefix+'Hint').value,type=host.querySelector('#'+prefix+'Type').value,out=host.querySelector('.fh-photo-manual-result');out.replaceChildren();
      if(!query.trim()){out.textContent='შეიყვანე სახელი ან მინიშნება.';return;}
      const matches=manualSearch(query,type);if(!matches.length){out.textContent='სახელი ვერ მოიძებნა. სცადე სხვა სიტყვა ან გახსენი კატალოგი.';return;}
      for(const item of matches){const link=element('a','fh-photo-manual-match');link.href='species.html?id='+encodeURIComponent(item.id);link.append(element('strong','',item.name),element('small','',item.scientific||item.english));out.append(link);}
    });
    root.addEventListener('pagehide',()=>controller.remove());
    const initial=controller.snapshot();status.textContent=initial.message;return controller;
  }
  function init(){root.document.querySelectorAll('#photoIdBox,[data-photo-identify]').forEach(mount);}
  return Object.freeze({MAX_FILE_BYTES,MAX_IMAGE_BYTES,MAX_PIXELS,MAX_EDGE,imageType,dimensions,inspectFile,checkDimensions,prepareImage,endpoint,sendImage,normalizeResult,createController,manualSearch,mount,init});
});
