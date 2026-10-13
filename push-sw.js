self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{title:'GeoNature',body:'ახალი ინფორმაცია შენთვის'}}
  catch{data={title:'GeoNature',body:event.data?.text()||'ახალი ინფორმაცია შენთვის'}}
  const icon=new URL('assets/icons/icon-192.png',self.registration.scope).toString();
  const title=data.title||'GeoNature';
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
