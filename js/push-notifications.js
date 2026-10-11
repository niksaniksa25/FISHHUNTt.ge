(function(){
  'use strict';
  const API_BASE = location.origin.includes(':5500') || location.origin.includes(':5501') ? 'http://localhost:8787/api/push' : '/api/push';
  const CLIENT_KEY='geonature_push_client_v1';
  const PREF_KEY='geonature_push_prefs_v1';
  function clientId(){let x=localStorage.getItem(CLIENT_KEY);if(!x){x=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));localStorage.setItem(CLIENT_KEY,x)}return x}
  function prefs(){try{return JSON.parse(localStorage.getItem(PREF_KEY)||'{"fish":[],"places":[],"enabled":false}')}catch{return {fish:[],places:[],enabled:false}}}
  function savePrefs(p){localStorage.setItem(PREF_KEY,JSON.stringify(p))}
  function b64uToBytes(b64){const pad='='.repeat((4-b64.length%4)%4);const s=(b64+pad).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
  async function cfg(){const r=await fetch(API_BASE+'/config');if(!r.ok)throw new Error('Push სერვერი ვერ მოიძებნა. გაუშვი GeoNature server.');return r.json()}
  async function subscribe(){
    if(!('serviceWorker' in navigator)&&!('PushManager' in window))throw new Error('ამ ბრაუზერს Push Notification არ აქვს მხარდაჭერილი.');
    if(!window.isSecureContext)throw new Error('Push შეტყობინებისთვის HTTPS ან localhost საჭიროა.');
    const reg=await navigator.serviceWorker.register('/push-sw.js',{scope:'/'});
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('შეტყობინებების ნებართვა უარყოფილია.');
    const c=await cfg(); const existing=await reg.pushManager.getSubscription();
    const sub=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToBytes(c.publicKey)});
    const p=prefs(); p.enabled=true; savePrefs(p);
    const payload={clientId:clientId(),subscription:sub.toJSON(),preferences:{fish:p.fish||[],places:p.places||[]}};
    const r=await fetch(API_BASE+'/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json(); if(!r.ok)throw new Error(d.message||'Push რეგისტრაცია ვერ მოხერხდა.');
    return d;
  }
  async function savePreferences(fish,places){
    const p={...prefs(),fish,places}; savePrefs(p);
    const r=await fetch(API_BASE+'/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:clientId(),preferences:{fish,places}})});
    const d=await r.json();if(!r.ok)throw new Error(d.message||'პარამეტრები ვერ შეინახა.');return d;
  }
  async function testPush(){const r=await fetch(API_BASE+'/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:clientId()})});const d=await r.json();if(!r.ok)throw new Error(d.message||'სატესტო შეტყობინება ვერ გაიგზავნა.');return d}
  async function unsubscribe(){try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=await reg?.pushManager.getSubscription();if(sub)await sub.unsubscribe();await fetch(API_BASE+'/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:clientId()})})}catch{}const p=prefs();p.enabled=false;savePrefs(p)}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function parseFishTemp(v){const nums=(String(v||'').match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);return nums.length>=2?{min:Math.min(nums[0],nums[1]),max:Math.max(nums[0],nums[1])}:{min:null,max:null}}
  function normalHourTags(v){const s=String(v||'').toLowerCase();const tags=[];if(s.includes('გამთენ')||s.includes('დილ'))tags.push('morning');if(s.includes('დღე'))tags.push('day');if(s.includes('საღ'))tags.push('evening');if(s.includes('ღამე')||s.includes('ბინდი'))tags.push('night');return tags}
  function available(){return {fish:(window.FISHES||[]).slice(0,60),places:(window.WATERS||[])} }
  function mount(){
    const host=document.getElementById('gnNotificationCenter'); if(!host||host.dataset.mounted)return; host.dataset.mounted='1';
    const data=available(), p=prefs();
    host.innerHTML=`<div class="gn-push-head"><div><span class="eyebrow">SMART NOTIFICATIONS</span><h2>🔔 შენთვის მორგებული შეტყობინებები</h2><p>აირჩიე თევზი და ადგილი. როცა არჩეულ ადგილას არჩეული სახეობის აქტივობა მაღლა ავა, GeoNature გამოგიგზავნის შეტყობინებას — საიტი დახურულიც რომ იყოს.</p></div><span class="gn-push-status" id="gnPushStatus">${p.enabled?'ჩართულია':'გამორთულია'}</span></div>
    <div class="gn-push-actions"><button class="btn primary" id="gnPushEnable">🔔 შეტყობინებების ჩართვა</button><button class="btn ghost" id="gnPushTest">📨 სატესტო შეტყობინება</button><button class="btn ghost" id="gnPushOff">გამორთვა</button></div>
    <div class="gn-push-grid"><div><label>🐟 აირჩიე თევზები <small>რამდენიმე შეგიძლია</small></label><select id="gnPushFish" multiple size="7">${data.fish.map(f=>{const t=parseFishTemp(f[7]);const tags=normalHourTags(f[10]);const v=JSON.stringify({id:f[0],name:f[1],temp:t,tags});return `<option value='${esc(v)}' ${p.fish?.some(x=>x.id===f[0])?'selected':''}>${esc(f[1])} • ${esc(f[4])}</option>`}).join('')}</select></div><div><label>📍 აირჩიე ადგილები <small>ტბა • წყალსაცავი • მდინარე</small></label><select id="gnPushPlaces" multiple size="7">${data.places.map(w=>{const v=JSON.stringify({id:w[0],name:w[1],type:w[2],region:w[3],lat:w[4],lon:w[5]});return `<option value='${esc(v)}' ${p.places?.some(x=>x.id===w[0])?'selected':''}>${esc(w[1])} • ${esc(w[2])}</option>`}).join('')}</select></div></div><div class="gn-push-note" id="gnPushNote">აირჩიე მინიმუმ ერთი თევზი და ერთი ადგილი. შემდეგ GeoNature თვითონ შეამოწმებს პირობებს.</div>`;
    const status=host.querySelector('#gnPushStatus'), note=host.querySelector('#gnPushNote');
    const readSel=id=>[...host.querySelector('#'+id).selectedOptions].map(o=>JSON.parse(o.value));
    host.querySelector('#gnPushEnable').onclick=async()=>{try{await subscribe();await savePreferences(readSel('gnPushFish'),readSel('gnPushPlaces'));status.textContent='ჩართულია';note.textContent='✅ მზადაა. როცა არჩეული კომბინაციის შანსი საკმარისად გაიზრდება, Push მოვა.'}catch(e){note.textContent='⚠️ '+e.message}};
    host.querySelector('#gnPushTest').onclick=async()=>{try{await savePreferences(readSel('gnPushFish'),readSel('gnPushPlaces'));const d=await testPush();note.textContent=d.message||'📨 სატესტო შეტყობინება გაიგზავნა.'}catch(e){note.textContent='⚠️ '+e.message}};
    host.querySelector('#gnPushOff').onclick=async()=>{await unsubscribe();status.textContent='გამორთულია';note.textContent='შეტყობინებები გამორთულია.'};
  }
  document.addEventListener('DOMContentLoaded',mount);
  window.GeoNaturePush={clientId,prefs,subscribe,savePreferences,testPush,unsubscribe,mount};
})();
