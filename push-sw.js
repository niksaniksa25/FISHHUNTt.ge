self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{title:'FishHunt',body:'ახალი ინფორმაცია შენთვის'}}
  catch{data={title:'FishHunt',body:event.data?.text()||'ახალი ინფორმაცია შენთვის'}}
  const icon=new URL('assets/icons/icon-192.png',self.registration.scope).toString();
  const title=data.title||'FishHunt';
  const options={
    body:data.body||'',
    icon:data.icon||icon,
    badge:data.badge||icon,
    tag:data.tag||'geonature',
    renotify:true,
    data:{url:data.url||new URL('index.html',self.registration.scope).toString()},
    requireInteraction:false,
    vibrate:[100,50,100]
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

// Public offline shell only. No auth, admin, API, weather responses or map tiles
// enter this cache. Notification subscriptions and handlers above stay intact.
const FH_OFFLINE_CACHE='fishhunt-offline-20261025a-v1';
const FH_OFFLINE_FILES=['offline.html','css/trip-tools.css','js/trip-tools.js','assets/icons/fishhunt-mark.svg'];
function fhScopeURL(path){return new URL(path,self.registration.scope).href;}
function fhPublicPath(url){
  const scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return null;
  return url.pathname.slice(scope.pathname.length);
}
async function fhPrepareOffline(){
  const cache=await caches.open(FH_OFFLINE_CACHE);
  const existing=await Promise.all(FH_OFFLINE_FILES.map(path=>cache.match(fhScopeURL(path))));
  if(existing.every(Boolean))return true;
  for(const path of FH_OFFLINE_FILES){
    const request=new Request(fhScopeURL(path),{cache:'reload',credentials:'omit'}),response=await fetch(request);
    if(!response.ok||response.type==='opaque')throw new Error('Offline asset unavailable');
    const size=(await response.clone().arrayBuffer()).byteLength;
    if(size>1200000)throw new Error('Offline asset too large');
    await cache.put(fhScopeURL(path),response);
  }
  return true;
}
self.addEventListener('install',event=>{event.waitUntil(fhPrepareOffline().catch(()=>false).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
  const cache=await caches.open(FH_OFFLINE_CACHE),prepared=(await Promise.all(FH_OFFLINE_FILES.map(path=>cache.match(fhScopeURL(path))))).every(Boolean);
  if(prepared){const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith('fishhunt-offline-')&&name!==FH_OFFLINE_CACHE).map(name=>caches.delete(name)));}await self.clients.claim();
})());});
self.addEventListener('message',event=>{
  if(event.data?.type!=='FISHHUNT_PREPARE_OFFLINE')return;
  event.waitUntil((async()=>{try{await fhPrepareOffline();event.ports?.[0]?.postMessage({ok:true});}catch{event.ports?.[0]?.postMessage({ok:false});}})());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),path=fhPublicPath(url);
  if(FH_OFFLINE_FILES.includes(path)){
    event.respondWith((async()=>{try{return await fetch(event.request);}catch(error){const stored=await caches.match(fhScopeURL(path),{cacheName:FH_OFFLINE_CACHE});if(stored)return stored;throw error;}})());return;
  }
  if(event.request.mode==='navigate'&&['index.html','dashboard.html','place-details.html',''].includes(path)){
    event.respondWith((async()=>{try{return await fetch(event.request);}catch(error){const shell=await caches.match(fhScopeURL('offline.html'),{cacheName:FH_OFFLINE_CACHE});if(shell)return shell;throw error;}})());
  }
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const scope=new URL(self.registration.scope),fallback=new URL('index.html',scope);
  let destination=fallback.href;
  try{const requested=new URL(event.notification?.data?.url||fallback.href,scope);if(requested.origin===scope.origin&&requested.pathname.startsWith(scope.pathname))destination=requested.href;}catch{}
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    const eligible=list.filter(client=>{try{const url=new URL(client.url);return url.origin===scope.origin&&url.pathname.startsWith(scope.pathname)&&'focus'in client;}catch{return false;}});
    const client=eligible.find(item=>item.url===destination)||eligible[0];
    if(client){
      try{if(client.url!==destination&&'navigate'in client)await client.navigate(destination);return await client.focus();}catch{}
    }
    return clients.openWindow(destination);
  })());
});
