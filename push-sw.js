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
  const destination=event.notification?.data?.url||new URL('index.html',self.registration.scope).toString();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if('focus'in client){
        if('navigate'in client)client.navigate(destination);
        return client.focus();
      }
    }
    return clients.openWindow(destination);
  }));
});