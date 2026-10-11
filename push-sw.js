self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{title:'GeoNature',body:'ახალი ინფორმაცია შენთვის'}}catch{data={title:'GeoNature',body:event.data?.text()||'ახალი ინფორმაცია შენთვის'}}
  const title=data.title||'GeoNature';
  const options={body:data.body||'',icon:data.icon||'/assets/icons/icon-192.png',badge:data.badge||'/assets/icons/icon-192.png',tag:data.tag||'geonature',renotify:true,data:{url:data.url||'/index.html'},requireInteraction:false,vibrate:[100,50,100]};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification?.data?.url||'/index.html';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus' in c){c.navigate(url);return c.focus()}}return clients.openWindow(url)}));});
