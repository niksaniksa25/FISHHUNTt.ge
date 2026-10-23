(function(){
  'use strict';
  const API='/api/auth';
  const LOCAL_USERS_KEY='geonature_local_users_v5';
  const LOCAL_SESSION_KEY='geonature_local_session_v5';
  const LAST_EMAIL_KEY='geonature_last_email_v5';
  const PROFILE_KEY_PREFIX='geonature_profile_v1:';
  const NAME_COLORS=[
    {id:'default',label:'თეთრი',hex:'#edf5ea',name:'ჩვეულებრივი'},
    {id:'mint',label:'პიტნა',hex:'#b8e68e',name:'პიტნისფერი'},
    {id:'gold',label:'ოქრო',hex:'#f2ce7a',name:'ოქროსფერი'},
    {id:'sky',label:'ცა',hex:'#a4d8ff',name:'ცისფერი'},
    {id:'aqua',label:'ფირუზი',hex:'#8ee4da',name:'ფირუზისფერი'},
    {id:'rose',label:'ვარდი',hex:'#ffb1cb',name:'ვარდისფერი'},
    {id:'lavender',label:'იასამანი',hex:'#d7c4ff',name:'იასამნისფერი'},
    {id:'coral',label:'მარჯანი',hex:'#ffb6a2',name:'მარჯნისფერი'}
  ];
  function normalizeNameColor(value){return NAME_COLORS.some(item=>item.id===value)?value:'default';}
  function visibleName(value){return String(value||'').trim().replace(/\s+/g,' ')||'მკვლევარი';}
  function effectiveNameColor(value){const id=normalizeNameColor(value);return id==='default'||premiumUnlocked()?id:'default';}
  function applyNameColor(element,value){const id=effectiveNameColor(value),color=NAME_COLORS.find(item=>item.id===id);element.style.color=color.hex;element.dataset.nameColor=id;}
  const AVATARS=[
    {id:'free-fish',emoji:'🐟',src:'assets/avatars/portraits-v2/free-fish.webp',name:'მდინარის მკვლევარი',premium:false},
    {id:'free-leaf',emoji:'🌲',src:'assets/avatars/portraits-v2/free-leaf.webp',name:'ტყის მკვლევარი',premium:false},
    {id:'free-camp',emoji:'⛺',src:'assets/avatars/portraits-v2/free-camp.webp',name:'განთიადის მეთევზე',premium:false},
    {id:'free-fox',emoji:'🦊',src:'assets/avatars/portraits-v2/free-fox.webp',name:'მელას ბილიკი',premium:false},
    {id:'free-wave',emoji:'🌊',src:'assets/avatars/portraits-v2/free-wave.webp',name:'ტბის დამკვირვებელი',premium:false},
    {id:'free-ranger',emoji:'🎣',src:'assets/avatars/portraits-v2/free-ranger.webp',name:'ანკესის მეგობარი',premium:false},
    {id:'plus-eagle',emoji:'🦅',src:'assets/avatars/portraits-v2/plus-eagle.webp',name:'არწივის თვალი',premium:true},
    {id:'plus-wolf',emoji:'🐺',src:'assets/avatars/portraits-v2/plus-wolf.webp',name:'ტყის მცველი',premium:true},
    {id:'plus-bear',emoji:'🐻',src:'assets/avatars/portraits-v2/plus-bear.webp',name:'ტყის ექსპერტი',premium:true},
    {id:'plus-deer',emoji:'🦌',src:'assets/avatars/portraits-v2/plus-deer.webp',name:'მწვანე ბილიკი',premium:true},
    {id:'plus-fishing',emoji:'🎣',src:'assets/avatars/portraits-v2/plus-fishing.webp',name:'ტრაუტის პროფესიონალი',premium:true},
    {id:'plus-compass',emoji:'🧭',src:'assets/avatars/portraits-v2/plus-compass.webp',name:'GeoNature Explorer',premium:true},
    {id:'plus-canyon',emoji:'🏔️',src:'assets/avatars/portraits-v2/plus-canyon.webp',name:'კანიონის მკვლევარი',premium:true},
    {id:'plus-svaneti',emoji:'⛰️',src:'assets/avatars/portraits-v2/plus-svaneti.webp',name:'სვანეთის მთამსვლელი',premium:true},
    {id:'plus-ranger',emoji:'🌲',src:'assets/avatars/portraits-v2/plus-ranger.webp',name:'ბუნების რეინჯერი',premium:true},
    {id:'plus-nocturne',emoji:'🌙',src:'assets/avatars/portraits-v2/plus-nocturne.webp',name:'ღამის მაძიებელი',premium:true},
    {id:'plus-fish-photo',emoji:'🐟',src:'assets/avatars/portraits-v2/plus-fish-photo.webp',name:'ოქროს თევზი',premium:true},
    {id:'plus-reel-photo',emoji:'🎣',src:'assets/avatars/portraits-v2/plus-reel-photo.webp',name:'სპინინგის ოსტატი',premium:true},
    {id:'plus-hunt-photo',emoji:'🦌',src:'assets/avatars/portraits-v2/plus-hunt-photo.webp',name:'ველური ბუნება',premium:true},
    {id:'plus-football',emoji:'⚽',src:'assets/avatars/portraits-v2/plus-football.webp',name:'Football Star',premium:true}
  ];
  const BACKGROUNDS=[
    {id:'bg-fishing-lake',src:'assets/phone/mountain-lake.webp',name:'მთის ტბა',premium:false},
    {id:'bg-fishing-rod',src:'assets/profile-bg/fishing-rod.jpg',name:'ოქროს საათი + ანკესი',premium:false},
    {id:'bg-fish',src:'assets/profile-bg/fish.jpg',name:'თევზი',premium:false},
    {id:'bg-forest',src:'assets/profile-bg/forest.jpg',name:'ტყე',premium:false},
    {id:'bg-mountains',src:'assets/profile-bg/mountains.jpg',name:'მთები',premium:false},
    {id:'bg-lake',src:'assets/profile-bg/lake.jpg',name:'წყალი + მთები',premium:false},
    {id:'bg-football',src:'assets/profile-bg/football-star.svg',name:'Football Star',premium:true}
  ]; function profileKey(email){return PROFILE_KEY_PREFIX+normalizeEmail(email)}
  function localProfile(email){try{const profile=JSON.parse(localStorage.getItem(profileKey(email))||'null');return profile&&typeof profile==='object'&&!Array.isArray(profile)?profile:null;}catch{return null;}}
  function saveLocalProfile(email,profile){try{localStorage.setItem(profileKey(email),JSON.stringify(profile));return true;}catch{return false;}}
  function premiumUnlocked(){if(window.GNPremium?.has)return window.GNPremium.has('plus');try{const p=localStorage.getItem('gn_plan')||'free',expires=Number(localStorage.getItem('gn_plan_expires_at')||0);return (p==='plus'||p==='pro')&&(!expires||expires>Date.now())||localStorage.getItem('gn_admin_local')==='1';}catch{return false;}}
  function defaultProfile(user){return {displayName:String(user?.displayName||'').slice(0,20),avatarId:'free-fish',backgroundId:'bg-fishing-lake',nameColor:'default'}}
  function getProfile(user){const base=defaultProfile(user),local=localProfile(user?.email)||{};return {...base,...local}}
  async function loadProfile(user){if(!user)return null;const base=defaultProfile(user),local=localProfile(user.email)||{};try{const r=await request('/profile');if(r?.profile){const remote={...base,...r.profile};const merged=usesLocalAccounts?{...remote,...local}:remote;saveLocalProfile(user.email,merged);return merged}}catch{}const merged={...base,...local};saveLocalProfile(user.email,merged);return merged}
  const isFileMode=location.protocol==='file:';

  function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function profileImage(item,size=96,lazy=false,kind='avatar'){
    const width=kind==='background'?160:size,height=kind==='background'?100:size;
    return `<img data-gn-profile-image="${kind}" src="${escapeHtml(item.src)}" alt="${escapeHtml(item.name)}" width="${width}" height="${height}" loading="${lazy?'lazy':'eager'}" decoding="async">`;
  }
  function avatarOption(item,selected){
    const locked=item.premium&&!premiumUnlocked();
    const label=item.name+(item.premium?' · Plus':'');
    return `<button type="button" class="gn-avatar-option${item.premium?' premium':''}${locked?' is-locked':''}${selected?' selected':''}" data-avatar-id="${item.id}" aria-label="${escapeHtml(label)}" aria-pressed="${selected}"${locked?' aria-disabled="true"':''} title="${escapeHtml(item.name)}"><span class="gn-avatar-art">${profileImage(item,160,true)}</span><span class="gn-avatar-caption">${escapeHtml(item.name)}</span><span class="gn-avatar-check" aria-hidden="true">✓</span>${item.premium?'<span class="gn-avatar-tier" aria-hidden="true">PLUS</span>':''}</button>`;
  }
  function nameColorOption(item,selected){
    const locked=item.id!=='default'&&!premiumUnlocked();
    return `<button type="button" class="gn-name-color-option${selected?' selected':''}${locked?' is-locked':''}" data-name-color="${item.id}" aria-label="${item.name}${item.id==='default'?'':' · Plus'}" aria-pressed="${selected}"${locked?' aria-disabled="true"':''}><span class="gn-name-color-swatch" style="--gn-swatch:${item.hex}" aria-hidden="true"></span><span class="gn-name-color-label">${item.label}</span></button>`;
  }
  let profileImageFallbackBound=false;
  function ensureProfileImageFallback(){
    if(profileImageFallbackBound)return;
    profileImageFallbackBound=true;
    document.addEventListener('error',event=>{
      const image=event.target;
      if(!image?.matches?.('img[data-gn-profile-image]'))return;
      if(!image.dataset.gnImageFallback){
        image.dataset.gnImageFallback='true';
        image.src=image.dataset.gnProfileImage==='background'?'assets/phone/mountain-lake.webp':'assets/avatars/portraits-v2/free-fish.webp';
        return;
      }
      image.hidden=true;image.style.display='none';image.setAttribute('aria-hidden','true');
      const parent=image.parentElement;
      if(parent&&!parent.querySelector('.gn-profile-image-placeholder')){
        const fallback=document.createElement('i');fallback.className='gn-profile-image-placeholder';
        fallback.textContent=image.dataset.gnProfileImage==='background'?'🌲':'🐟';
        fallback.setAttribute('role','img');fallback.setAttribute('aria-label',image.alt||'ბუნება');parent.appendChild(fallback);
      }
    },true);
  }
  function normalizeEmail(email){return String(email||'').trim().toLowerCase();}
  function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}
  function localReadUsers(){try{const users=JSON.parse(localStorage.getItem(LOCAL_USERS_KEY)||'[]');return Array.isArray(users)?users.filter(user=>user&&typeof user==='object'&&validEmail(user.email)):[];}catch{return [];}}
  function localWriteUsers(users){localStorage.setItem(LOCAL_USERS_KEY,JSON.stringify(users));}
  function getLocalSession(){for(const storage of [sessionStorage,localStorage]){try{const session=JSON.parse(storage.getItem(LOCAL_SESSION_KEY)||'null');if(session&&typeof session==='object'&&!Array.isArray(session)&&validEmail(session.email))return session;}catch{}}return null;}
  function setLocalSession(user,remember){const session=JSON.stringify({email:user.email,plan:user.plan||'free',savedAt:Date.now()});clearLocalSession();if(remember){localStorage.setItem(LOCAL_SESSION_KEY,session);localStorage.setItem(LAST_EMAIL_KEY,user.email);}else{sessionStorage.setItem(LOCAL_SESSION_KEY,session);localStorage.removeItem(LAST_EMAIL_KEY);}}
  function clearLocalSession(){localStorage.removeItem(LOCAL_SESSION_KEY);sessionStorage.removeItem(LOCAL_SESSION_KEY);}
  let usesLocalAccounts=isFileMode;
  const localAccountDescription='ანგარიში ინახება მხოლოდ ამ ბრაუზერში და სხვა მოწყობილობაზე არ გადადის.';
  function markLocalAccounts(){usesLocalAccounts=true;if(window.GeoNatureAuth)window.GeoNatureAuth.localMode=true;const subtitle=document.getElementById('authSubtitle');if(subtitle)subtitle.textContent=localAccountDescription;}
  function randomSalt(){const a=new Uint32Array(8);crypto.getRandomValues(a);return Array.from(a).join('-');}
  async function digest(text){
    if(window.crypto?.subtle){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');}
    let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);
  }
  async function makeLocalHash(password,salt){return digest(`${salt}|${password}`);}
  async function localFind(email,password){
    const user=localReadUsers().find(u=>u.email===normalizeEmail(email));
    if(!user)return null;
    const got=await makeLocalHash(String(password||''),user.passwordSalt);
    return got===user.passwordHash?user:null;
  }
  async function localRequest(path,options={}){
    markLocalAccounts();
    const payload=options.body?JSON.parse(options.body):{};
    if(path==='/me'&&(options.method||'GET')==='GET'){
      const s=getLocalSession();
      if(!s)return {ok:true,user:null,localMode:true};
      const u=localReadUsers().find(x=>x.email===s.email);
      return {ok:true,user:u?{id:u.id,email:u.email,createdAt:u.createdAt,role:'user',plan:u.plan||'free',planExpiresAt:u.planExpiresAt||null,displayName:u.displayName||'',avatarId:u.avatarId||'free-fish',backgroundId:u.backgroundId||'bg-fishing-lake',nameColor:normalizeNameColor(u.nameColor)}:null,localMode:true};
    }
    if(path==='/signup'&&options.method==='POST'){
      const email=normalizeEmail(payload.email),password=String(payload.password||'');
      if(!validEmail(email))throw new Error('შეიყვანე სწორი Gmail / Email მისამართი.');
      if(password.length<8)throw new Error('პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო.');
      const users=localReadUsers();
      if(users.some(u=>u.email===email))throw new Error('ეს ელფოსტა უკვე რეგისტრირებულია.');
      const salt=randomSalt(),passwordHash=await makeLocalHash(password,salt);
      const user={id:'local_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),email,passwordSalt:salt,passwordHash,createdAt:Date.now(),plan:'free',displayName:'',avatarId:'free-fish',nameColor:'default'};
      const latestUsers=localReadUsers();if(latestUsers.some(u=>u.email===email))throw new Error('ეს ელფოსტა უკვე რეგისტრირებულია.');latestUsers.push(user);localWriteUsers(latestUsers);setLocalSession(user,payload.remember!==false);
      return {ok:true,user:{id:user.id,email,createdAt:user.createdAt,role:'user',plan:'free',nameColor:'default'},localMode:true};
    }
    if(path==='/signin'&&options.method==='POST'){
      const user=await localFind(payload.email,payload.password);
      if(!user)throw new Error('ელფოსტა ან პაროლი არასწორია.');
      setLocalSession(user,payload.remember!==false);
      return {ok:true,user:{id:user.id,email:user.email,createdAt:user.createdAt,role:'user',plan:user.plan||'free',displayName:user.displayName||'',avatarId:user.avatarId||'free-fish',nameColor:normalizeNameColor(user.nameColor)},localMode:true};
    }
    if(path==='/profile'&&(options.method||'GET')==='GET'){
      const s=getLocalSession(); if(!s) return {ok:true,profile:null,localMode:true};
      const u=localReadUsers().find(x=>x.email===s.email); return {ok:true,profile:u?{displayName:u.displayName||'',avatarId:u.avatarId||'free-fish',backgroundId:u.backgroundId||'bg-fishing-lake',nameColor:normalizeNameColor(u.nameColor)}:defaultProfile({email:s.email}),localMode:true};
    }
    if(path==='/profile'&&options.method==='PATCH'){
      const s=getLocalSession(); if(!s) throw new Error('შედი ანგარიშში.');
      const users=localReadUsers(),u=users.find(x=>x.email===s.email); if(!u) throw new Error('ანგარიში ვერ მოიძებნა.');
      const name=String(payload.displayName||'').trim().replace(/\s+/g,' '); const avatar=AVATARS.find(a=>a.id===String(payload.avatarId||''))||AVATARS[0]; const background=BACKGROUNDS.find(b=>b.id===String(payload.backgroundId||''))||BACKGROUNDS[0];
      if(payload.nameColor!==undefined&&!NAME_COLORS.some(item=>item.id===payload.nameColor))throw new Error('სახელის ფერი არასწორია.');
      const nameColor=normalizeNameColor(payload.nameColor===undefined?(premiumUnlocked()?u.nameColor:'default'):payload.nameColor);
      if(name.length<2||name.length>20) throw new Error('სახელი უნდა იყოს 2-20 სიმბოლო.');
      if(nameColor!=='default'&&!premiumUnlocked())throw new Error('სახელის ფერები Plus-შია.');
      if(avatar.premium && !premiumUnlocked()) throw new Error('ეს ავატარი Plus-შია.'); if(background.premium&&!premiumUnlocked()) throw new Error('ეს ფონი Plus-შია.');
      u.displayName=name;u.avatarId=avatar.id;u.backgroundId=background.id;u.nameColor=nameColor;localWriteUsers(users);return {ok:true,profile:{displayName:name,avatarId:avatar.id,backgroundId:background.id,nameColor},localMode:true};
    }
    if(path==='/signout'&&options.method==='POST'){clearLocalSession();return {ok:true,localMode:true};}
    throw new Error('ანგარიშის სერვერთან კავშირი ვერ მოხერხდა.');
  }
  let apiConfigPromise=null;
  async function ensureApiConfig(){
    if(window.__GN_API_CONFIG_LOADED)return;
    if(!apiConfigPromise)apiConfigPromise=new Promise(resolve=>{
      const script=document.createElement('script');
      script.src=new URL('js/api-config.js',document.baseURI).href;
      script.onload=resolve;script.onerror=resolve;document.head.appendChild(script);
    });
    await apiConfigPromise;
  }
  function apiUrl(path){
    let base=String(window.GN_API_BASE_URL||'').trim();
    while(base.endsWith('/'))base=base.slice(0,-1);
    return (base||'')+API+path;
  }
  async function request(path,options={}){
    if(isFileMode)return localRequest(path,options);
    await ensureApiConfig();
    const remote=Boolean(String(window.GN_API_BASE_URL||'').trim());
    const fallbackPaths=['/signup','/signin','/signout','/me','/profile'];
    const canFallback=!remote&&fallbackPaths.includes(path);
    if(canFallback&&String(location.hostname||'').toLowerCase().endsWith('.github.io'))return localRequest(path,options);
    const url=apiUrl(path);
    try{
      const r=await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
      let data={};try{data=await r.json();}catch{}
      if(!r.ok){
        if(canFallback&&[404,405,501].includes(r.status))return localRequest(path,options);
        throw new Error(data.message||`Request failed (${r.status})`);
      }
      return data;
    }catch(err){
      if(canFallback&&err instanceof TypeError)return localRequest(path,options);
      throw new Error(err?.message||'ანგარიშის სერვერთან დაკავშირება ვერ მოხერხდა. შეამოწმე js/api-config.js და Node API.');
    }
  }
  async function me(){try{return (await request('/me')).user||null;}catch{return null;}}
  function ensureProfileStyles(){if(document.getElementById('gn-profile-styles'))return;const st=document.createElement('style');st.id='gn-profile-styles';st.textContent=`.gn-auth-slot{position:relative;display:inline-flex;align-items:center;gap:7px;margin-left:8px}.gn-auth-slot.gn-auth-floating{position:fixed;top:12px;right:14px;z-index:10050;margin:0;padding:4px;border:1px solid rgba(180,238,114,.14);border-radius:18px;background:rgba(5,15,10,.88);backdrop-filter:blur(12px);box-shadow:0 8px 28px rgba(0,0,0,.25)}.gn-auth-slot.gn-auth-floating .gn-profile-panel{position:fixed;top:64px;right:14px;max-height:calc(100vh - 80px);overflow:auto}.header-inner>.gn-auth-slot{margin-left:auto;flex:0 0 auto;position:relative;z-index:1510}.header #nav>.gn-auth-slot{flex:0 0 auto;margin-left:auto}.header-inner>.gn-auth-slot .gn-profile-trigger{max-width:190px}.gn-profile-trigger{display:inline-flex;align-items:center;gap:8px;position:relative;background-size:cover;background-position:center;border:1px solid rgba(180,238,114,.17);background:rgba(8,25,15,.72);color:#eef6ef;border-radius:14px;padding:5px 9px;cursor:pointer;max-width:240px}.gn-profile-avatar{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,#163c25,#0b2415);font-size:19px;overflow:hidden}.gn-profile-avatar img{width:100%;height:100%;object-fit:cover;display:block}.gn-profile-text{display:flex;flex-direction:column;align-items:flex-start;min-width:0}.gn-profile-text b{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:125px}.gn-profile-text small{font-size:8px;color:#7d9587;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:145px}.gn-profile-chevron{font-size:13px;color:#8ca495}.gn-profile-panel{position:absolute;right:0;top:calc(100% + 9px);z-index:1000;width:min(360px,calc(100vw - 24px));padding:14px;border:1px solid rgba(180,238,114,.16);border-radius:18px;background:rgba(6,17,11,.98);box-shadow:0 24px 60px rgba(0,0,0,.42)}.gn-profile-trigger::before{content:'';position:absolute;inset:0;border-radius:14px;background:linear-gradient(90deg,rgba(4,12,8,.86),rgba(4,12,8,.45));z-index:0;pointer-events:none}.gn-profile-trigger>*{position:relative;z-index:1}.gn-profile-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.gn-profile-panel-head b{display:block;font-size:14px}.gn-profile-panel-head small{display:block;font-size:9px;color:#82988c;margin-top:3px}.gn-profile-plan{font-size:9px;font-weight:900;padding:5px 8px;border-radius:999px;background:#15301e;color:#b4f07a}.gn-profile-panel label{display:block;font-size:10px;color:#9bb0a4}.gn-profile-panel input{width:100%;margin-top:5px;min-height:42px;border-radius:11px;border:1px solid rgba(255,255,255,.09);background:#0d1c12;color:#fff;padding:0 11px;outline:none}.gn-profile-avatar-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-end;margin:13px 0 8px}.gn-profile-avatar-title b{font-size:11px}.gn-profile-avatar-title small{font-size:8px;color:#748b7e;text-align:right}.gn-profile-hero{display:flex;gap:12px;align-items:center;padding:12px;border:1px solid rgba(180,238,114,.14);border-radius:16px;background:linear-gradient(135deg,rgba(19,47,29,.8),rgba(11,20,14,.96));margin-bottom:12px}.gn-profile-hero>div:nth-child(2){display:flex;flex-direction:column;gap:3px}.gn-profile-hero strong{font-size:14px}.gn-profile-hero small{color:#c0d0c5;font-size:10px}.gn-profile-hero span{color:#748b7e;font-size:8px}.gn-profile-avatar-preview{width:82px;height:82px;border-radius:24px;padding:3px;background:linear-gradient(145deg,#d9ae4e,#b4f07a,#5bd0e5);box-shadow:0 10px 26px rgba(0,0,0,.38),0 0 0 4px rgba(255,255,255,.03);flex:0 0 auto}.gn-profile-avatar-preview img{width:100%;height:100%;border-radius:20px;object-fit:cover;display:block}.gn-avatar-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.gn-profile-avatar-title.premium-title{margin-top:15px}.gn-profile-avatar-title.premium-title b{color:#ffe08b}.gn-avatar-option{min-height:86px;border-radius:16px;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.gn-avatar-option:hover{transform:translateY(-2px) scale(1.02);border-color:rgba(180,238,114,.38);box-shadow:0 10px 24px rgba(0,0,0,.28)}.gn-avatar-option img{object-fit:cover}.gn-avatar-option.premium{box-shadow:inset 0 0 0 1px rgba(255,205,105,.08)}.gn-avatar-option{position:relative;min-height:72px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#0d2015;color:#fff;font-size:21px;cursor:pointer;overflow:hidden;padding:0}.gn-avatar-option img{width:100%;height:100%;display:block;object-fit:cover}.gn-avatar-option.selected{border-color:#b4f07a;box-shadow:0 0 0 1px rgba(180,238,114,.16) inset}.gn-avatar-option.premium{border-color:rgba(255,196,90,.18);background:linear-gradient(180deg,#241b0d,#171108)}.gn-avatar-option span{position:absolute;right:3px;bottom:3px;font-size:6px;padding:2px 4px;border-radius:999px;background:#d9aa47;color:#171006;font-weight:900}.gn-profile-note{min-height:18px;margin-top:8px;color:#b3c2b8;font-size:9px;line-height:1.4}.gn-profile-note a{color:#b4f07a}.gn-profile-bg-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.gn-profile-bg-option{position:relative;min-height:62px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:#0b1911;cursor:pointer}.gn-profile-bg-option img{width:100%;height:100%;object-fit:cover;display:block}.gn-profile-bg-option b{position:absolute;left:4px;right:4px;bottom:4px;background:rgba(0,0,0,.62);padding:3px 5px;border-radius:8px;font-size:7px}.gn-profile-bg-option.premium{border-color:rgba(255,205,105,.22)}.gn-profile-bg-option.selected{border-color:#b4f07a;box-shadow:0 0 0 1px rgba(180,238,114,.18) inset}.gn-profile-bg-option span{position:absolute;right:4px;top:4px;font-size:6px;background:#d6aa45;color:#1a1205;padding:2px 4px;border-radius:999px;font-weight:900}.gn-profile-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:8px}.gn-profile-actions .btn{padding:8px 12px}.gn-profile-panel[hidden]{display:none!important}@media(max-width:1000px){.header-inner>.gn-auth-slot .gn-profile-text{display:none}.header-inner>.gn-auth-slot .gn-profile-trigger{padding:4px 6px}.header-inner>.gn-auth-slot .gn-auth-btn{padding:5px 7px;font-size:9px}}@media(max-width:760px){.gn-profile-text{display:none}.gn-profile-trigger{padding:5px}.gn-profile-panel{right:-6px}.header-inner>.gn-auth-slot .gn-profile-panel{position:fixed;top:64px;right:8px;max-height:calc(100vh - 76px);overflow:auto}.gn-avatar-grid{grid-template-columns:repeat(5,1fr)}}`;document.head.appendChild(st)}
  async function renderHeader(){
    ensureProfileStyles();ensureProfileImageFallback();const nav=document.getElementById('nav');const headerInner=document.querySelector('.header-inner');if(document.getElementById('gnAuthLink'))return;
    const user=await me();if(!nav&&!headerInner&&!user)return; if(user?.plan){ try{const expired=Number(user.planExpiresAt||0)>0&&Number(user.planExpiresAt)<=Date.now(); localStorage.setItem('gn_plan',expired?'free':String(user.plan)); if(user.planExpiresAt)localStorage.setItem('gn_plan_expires_at',String(user.planExpiresAt));else localStorage.removeItem('gn_plan_expires_at'); if(expired)localStorage.setItem('gn_plan_updated_at',new Date().toISOString());}catch{} window.GNHourlyAccess?.refresh?.(); } const wrap=document.createElement('span');wrap.id='gnAuthLink';wrap.className='gn-auth-slot'+(!nav&&!headerInner?' gn-auth-floating':'');const placeProfileSlot=()=>{if(nav){nav.appendChild(wrap);wrap.classList.remove('gn-auth-floating');}else if(headerInner){headerInner.appendChild(wrap);wrap.classList.remove('gn-auth-floating');}else{wrap.classList.add('gn-auth-floating');document.body.appendChild(wrap);}};
    if(user){
      const profile=await loadProfile(user); const avatar=AVATARS.find(a=>a.id===profile.avatarId)||AVATARS[0];
      wrap.innerHTML=`<button class="gn-profile-trigger" id="gnProfileTrigger" type="button"><span class="gn-profile-avatar">${profileImage(avatar,34)}</span><span class="gn-profile-text"><b>${escapeHtml(visibleName(profile.displayName))}</b></span><span class="gn-profile-chevron">⌄</span></button><button class="gn-auth-btn" id="gnSignOut" type="button">გასვლა</button>`;
      const panel=document.createElement('div');panel.className='gn-profile-panel';panel.hidden=true;panel.innerHTML=`<div class="gn-profile-panel-head"><div><b>ჩემი პროფილი</b></div><span class="gn-profile-plan">${String(user.plan||'free').toUpperCase()}</span></div><div class="gn-profile-hero" id="gnProfileHero"><div class="gn-profile-avatar-preview">${profileImage(avatar,82)}</div><div><strong>${escapeHtml(visibleName(profile.displayName))}</strong><small>${escapeHtml(avatar.name)}</small><span>${usesLocalAccounts?localAccountDescription:'აირჩიე ახალი ავატარი, ფონი და სახელი'}</span></div></div><label>სახელი<input id="gnProfileName" maxlength="20" value="${escapeHtml(profile.displayName||'')}" placeholder="მაგ. გიორგი"></label><section class="gn-name-color-section" aria-label="სახელის ფერი"><div class="gn-name-color-title"><b>სახელის ფერი</b><span class="gn-name-color-plus">PLUS</span></div><div class="gn-name-color-options" role="group" aria-label="აირჩიე სახელის ფერი">${NAME_COLORS.map(item=>nameColorOption(item,item.id===effectiveNameColor(profile.nameColor))).join('')}</div><small class="gn-name-color-hint" aria-live="polite">ფერადი სახელი — Plus-ის წევრებისთვის</small></section><div class="gn-profile-avatar-title"><b>უფასო ავატარები</b><small>6 ვარიანტი • ყველასთვის</small></div><div class="gn-avatar-grid free-grid" role="group" aria-label="უფასო ავატარები">${AVATARS.filter(a=>!a.premium).map(a=>avatarOption(a,a.id===avatar.id)).join('')}</div><div class="gn-profile-avatar-title premium-title"><b>✨ PLUS ავატარები</b><small>ბუნების კოლექცია • 14 ავატარი</small></div><div class="gn-avatar-grid premium-grid" role="group" aria-label="Plus ავატარები">${AVATARS.filter(a=>a.premium).map(a=>avatarOption(a,a.id===avatar.id)).join('')}</div><div class="gn-profile-avatar-title premium-title"><b>🖼️ პროფილის ფონი</b><small>სურათი პროფილის უკან • ზოგი PLUS</small></div><div class="gn-profile-bg-grid">${BACKGROUNDS.map(b=>`<button type="button" class="gn-profile-bg-option ${b.premium?'premium ':''}${b.id===(profile.backgroundId||'bg-fishing-lake')?'selected':''}" data-bg-id="${b.id}" title="${escapeHtml(b.name)}">${profileImage(b,160,true,'background')}<b>${escapeHtml(b.name)}</b>${b.premium?'<span>PLUS</span>':''}</button>`).join('')}</div><div class="gn-profile-note" id="gnProfileNote"></div><div class="gn-profile-actions"><button type="button" class="btn ghost" id="gnProfileCancel">დახურვა</button><button type="button" class="btn primary" id="gnProfileSave">შენახვა</button></div>`;panel.id='gnProfilePanel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','ჩემი პროფილი');panel.tabIndex=-1;
      const profileContent=document.createElement('div');profileContent.className='gn-profile-content';
      const profileActions=panel.querySelector('.gn-profile-actions');
      while(panel.firstChild&&panel.firstChild!==profileActions)profileContent.appendChild(panel.firstChild);
      panel.insertBefore(profileContent,profileActions);document.body.appendChild(panel);
      let selectedAvatar=avatar.id; let selectedBackground=profile.backgroundId||'bg-fishing-lake'; const trigger=wrap.querySelector('#gnProfileTrigger'); const setBackground=()=>{const bg=BACKGROUNDS.find(b=>b.id===selectedBackground)||BACKGROUNDS[0]; trigger.style.backgroundImage=`url('${bg.src}')`; const hero=panel.querySelector('#gnProfileHero'); if(hero){hero.style.backgroundImage=`linear-gradient(135deg,rgba(6,18,11,.72),rgba(5,12,8,.91)),url('${bg.src}')`;hero.style.backgroundSize='cover';hero.style.backgroundPosition='center'}}; setBackground();
      let selectedNameColor=effectiveNameColor(profile.nameColor);
      let savedAvatar=selectedAvatar,savedBackground=selectedBackground,savedName=profile.displayName||'',savedNameColor=selectedNameColor;
      applyNameColor(trigger.querySelector('.gn-profile-text b'),savedNameColor);
      const nameInput=panel.querySelector('#gnProfileName');
      function updateNamePreview(){
        const heroName=panel.querySelector('#gnProfileHero strong');heroName.textContent=visibleName(nameInput.value);applyNameColor(heroName,selectedNameColor);
        panel.querySelectorAll('[data-name-color].gn-name-color-option').forEach(button=>{
          const selected=button.dataset.nameColor===selectedNameColor,locked=button.dataset.nameColor!=='default'&&!premiumUnlocked();
          button.classList.toggle('selected',selected);button.classList.toggle('is-locked',locked);button.setAttribute('aria-pressed',String(selected));
          if(locked)button.setAttribute('aria-disabled','true');else button.removeAttribute('aria-disabled');
        });
      }
      nameInput.addEventListener('input',updateNamePreview);
      updateNamePreview();
      function updateAvatarPreview(){
        const chosen=AVATARS.find(item=>item.id===selectedAvatar)||AVATARS[0];
        const hero=panel.querySelector('#gnProfileHero');
        if(hero&&hero.dataset.gnPreviewAvatar!==chosen.id){
          hero.querySelector('.gn-profile-avatar-preview').innerHTML=profileImage(chosen,120);
          hero.querySelector('small').textContent=chosen.name;
          hero.dataset.gnPreviewAvatar=chosen.id;
        }
        panel.querySelectorAll('.gn-avatar-option').forEach(button=>{
          const selected=button.dataset.avatarId===chosen.id;
          const item=AVATARS.find(avatar=>avatar.id===button.dataset.avatarId);
          const locked=Boolean(item?.premium&&!premiumUnlocked());
          button.classList.toggle('selected',selected);button.classList.toggle('is-locked',locked);
          button.setAttribute('aria-pressed',String(selected));
          if(locked)button.setAttribute('aria-disabled','true');else button.removeAttribute('aria-disabled');
        });
      }
      updateAvatarPreview();

      const close=()=>{panel.hidden=true;document.body.classList.remove('gn-header-profile-open');trigger.setAttribute('aria-expanded','false');selectedAvatar=savedAvatar;selectedBackground=savedBackground;panel.querySelector('#gnProfileName').value=savedName;selectedNameColor=effectiveNameColor(savedNameColor);updateNamePreview();updateAvatarPreview();panel.querySelectorAll('.gn-profile-bg-option').forEach(button=>button.classList.toggle('selected',button.dataset.bgId===selectedBackground));setBackground();};
      const compactProfile=()=>Boolean(window.matchMedia?.('(max-width:1024px)').matches);
      const position=()=>{
        if(panel.hidden)return;
        const compact=compactProfile(),rect=trigger.getBoundingClientRect();
        panel.style.position='fixed';panel.style.right='12px';panel.style.overflowY=compact?'hidden':'auto';
        if(compact){
          const viewport=window.visualViewport?.scale===1?window.visualViewport:null,height=viewport?.height||window.innerHeight,offset=viewport?.offsetTop||0;
          const headerBottom=document.querySelector('.header')?.getBoundingClientRect().bottom||56;
          const top=Math.max(8,Math.min(Math.max(0,headerBottom-offset)+8,height-150));
          const bottomSpace=(document.getElementById('nav')?.getBoundingClientRect().height||0)+12;
          panel.style.top=(offset+top)+'px';panel.style.maxHeight=Math.max(80,height-top-bottomSpace)+'px';
        }else{
          panel.style.top=Math.max(8,Math.min(rect.bottom+9,window.innerHeight-120))+'px';
          panel.style.maxHeight='calc(100dvh - '+(parseFloat(panel.style.top)+12)+'px)';
        }
        const editing=document.activeElement;
        if(compact&&profileContent.contains(editing)&&['INPUT','TEXTAREA','SELECT'].includes(editing.tagName)){
          requestAnimationFrame(()=>{
            if(panel.hidden||document.activeElement!==editing)return;
            const frame=profileContent.getBoundingClientRect(),field=editing.getBoundingClientRect();
            if(field.bottom>frame.bottom-8)profileContent.scrollTop+=field.bottom-frame.bottom+8;
            else if(field.top<frame.top+8)profileContent.scrollTop-=frame.top-field.top+8;
          });
        }
      };
      panel.addEventListener('focusin',position);
      trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-expanded','false');
      trigger.onclick=()=>{if(!panel.hidden){close();return;}panel.hidden=false;document.body.classList.add('gn-header-profile-open');trigger.setAttribute('aria-expanded','true');selectedNameColor=effectiveNameColor(selectedNameColor);updateNamePreview();updateAvatarPreview();position();profileContent.scrollTop=0;panel.scrollTop=0;if(compactProfile())panel.focus({preventScroll:true});else panel.querySelector('#gnProfileName')?.focus();};
      window.addEventListener('resize',position,{passive:true});window.visualViewport?.addEventListener('resize',position,{passive:true});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){close();trigger.focus();}});
      panel.querySelectorAll('.gn-name-color-option').forEach(button=>button.onclick=()=>{
        const color=normalizeNameColor(button.dataset.nameColor);
        if(color!=='default'&&!premiumUnlocked()){const explanation='🔒 სახელის ფერები Plus-შია. <a href="premium.html">Plus-ის ნახვა →</a>';panel.querySelector('#gnProfileNote').innerHTML=explanation;panel.querySelector('.gn-name-color-hint').innerHTML=explanation;return;}
        selectedNameColor=color;updateNamePreview();panel.querySelector('#gnProfileNote').textContent='';panel.querySelector('.gn-name-color-hint').textContent='ფერადი სახელი — Plus-ის წევრებისთვის';
      });
      panel.querySelectorAll('.gn-avatar-option').forEach(b=>b.onclick=()=>{const item=AVATARS.find(a=>a.id===b.dataset.avatarId);if(item?.premium&&!premiumUnlocked()){panel.querySelector('#gnProfileNote').innerHTML=`🔒 <b>${escapeHtml(item.name)}</b> — უკეთესი ავატარია და Plus-ში იხსნება. <a href="premium.html">Plus-ის ნახვა →</a>`;return;}selectedAvatar=b.dataset.avatarId;updateAvatarPreview();panel.querySelector('#gnProfileNote').textContent=''});
      panel.querySelectorAll('.gn-profile-bg-option').forEach(b=>b.onclick=()=>{const item=BACKGROUNDS.find(x=>x.id===b.dataset.bgId);if(item?.premium&&!premiumUnlocked()){panel.querySelector('#gnProfileNote').innerHTML=`🔒 <b>${escapeHtml(item.name)}</b> — PLUS ფონი. <a href="premium.html">Plus-ის ნახვა →</a>`;return;}selectedBackground=b.dataset.bgId;panel.querySelectorAll('.gn-profile-bg-option').forEach(x=>x.classList.toggle('selected',x===b));setBackground();panel.querySelector('#gnProfileNote').textContent='' }); panel.querySelector('#gnProfileCancel').onclick=()=>{close();trigger.focus();};
      const saveButton=panel.querySelector('#gnProfileSave');let saving=false;
      saveButton.onclick=async()=>{
        if(saving)return;
        const name=panel.querySelector('#gnProfileName').value.trim().replace(/\s+/g,' '),note=panel.querySelector('#gnProfileNote');
        if(name.length<2||name.length>20){note.textContent='სახელი უნდა იყოს 2-20 სიმბოლო.';return;}
        if((AVATARS.find(a=>a.id===selectedAvatar)?.premium||BACKGROUNDS.find(b=>b.id===selectedBackground)?.premium)&&!premiumUnlocked()){note.textContent='ეს ავატარი ან ფონი Plus-შია.';return;}
        if(selectedNameColor!=='default'&&!premiumUnlocked()){note.textContent='სახელის ფერები Plus-შია.';return;}
        const payload={displayName:name,avatarId:selectedAvatar,backgroundId:selectedBackground,nameColor:normalizeNameColor(selectedNameColor)};
        saving=true;saveButton.disabled=true;note.textContent='პროფილი ინახება…';
        try{
          const result=await request('/profile',{method:'PATCH',body:JSON.stringify(payload)});
          if(!result?.profile||typeof result.profile!=='object')throw new Error('პროფილის შენახვა ვერ დადასტურდა. სცადე ხელახლა.');
          const saved={...payload,...result.profile},av=AVATARS.find(a=>a.id===saved.avatarId)||AVATARS[0];saveLocalProfile(user.email,saved);
          trigger.querySelector('.gn-profile-avatar').innerHTML=profileImage(av,34);
          trigger.querySelector('.gn-profile-text b').textContent=visibleName(saved.displayName);applyNameColor(trigger.querySelector('.gn-profile-text b'),saved.nameColor);
          const hero=panel.querySelector('#gnProfileHero');hero.querySelector('strong').textContent=saved.displayName;hero.querySelector('small').textContent=av.name;hero.querySelector('.gn-profile-avatar-preview').innerHTML=profileImage(av,82);
          savedAvatar=av.id;savedBackground=saved.backgroundId||selectedBackground;savedName=saved.displayName;savedNameColor=effectiveNameColor(saved.nameColor);
          try{const state=window.GeoNaturePlus?.state?.();if(state){state.name=savedName;state.nameColor=savedNameColor;window.GeoNaturePlus.save(state);}}catch{}
          close();trigger.focus();window.GeoNaturePlus?.notify?.(result.localMode?'პროფილი შეინახა ამ ბრაუზერში.':'პროფილი შეინახა.');
        }catch(error){note.textContent=error.message||'პროფილი ვერ შეინახა. შეამოწმე კავშირი და ბრაუზერის მეხსიერება.';}
        finally{saving=false;saveButton.disabled=false;}
      };
      wrap.querySelector('#gnSignOut').onclick=async()=>{try{await request('/signout',{method:'POST',body:'{}'});location.reload();}catch(e){alert(e.message);}};
      document.addEventListener('click',e=>{if(!wrap.contains(e.target)&&!panel.contains(e.target))close();});
    }else wrap.innerHTML='<a class="gn-auth-btn" href="auth.html?mode=signin">შესვლა</a><a class="gn-auth-btn primary" href="auth.html?mode=signup">რეგისტრაცია</a>';
    placeProfileSlot();window.addEventListener('resize',placeProfileSlot,{passive:true});
  }
  function setMessage(msg,type=''){const el=document.getElementById('authMsg');if(el){el.textContent=msg;el.className='auth-message '+type;}}
  function bindAuthPage(){
    const form=document.getElementById('authForm');if(!form)return;
    let busy=false;
    let mode=((new URLSearchParams(location.search).get('mode')||'signin').toLowerCase()==='signup')?'signup':'signin';
    const btnIn=document.getElementById('modeSignin'),btnUp=document.getElementById('modeSignup');
    const email=document.getElementById('authEmail'),password=document.getElementById('authPassword'),password2=document.getElementById('authPassword2'),extra=document.getElementById('signupExtra'),submit=document.getElementById('authSubmit');
    const title=document.getElementById('authTitle'),subtitle=document.getElementById('authSubtitle'),hint=document.getElementById('switchHint');
    try{const last=localStorage.getItem(LAST_EMAIL_KEY)||'';if(last)email.value=last;}catch{}
    function applyMode(next){
      mode=next==='signup'?'signup':'signin';const isUp=mode==='signup';
      btnIn.classList.toggle('active',!isUp);btnUp.classList.toggle('active',isUp);btnIn.setAttribute('aria-selected',String(!isUp));btnUp.setAttribute('aria-selected',String(isUp));
      title.textContent=isUp?'ანგარიშის შექმნა':'GeoNature-ზე შესვლა';subtitle.textContent=usesLocalAccounts?localAccountDescription:(isUp?'შექმენი ანგარიში Gmail / Email-ით და პაროლით.':'შედი შენი GeoNature ანგარიშით.');extra.hidden=!isUp;password2.required=isUp;password2.value=isUp?password2.value:'';submit.textContent=isUp?'Sign up / რეგისტრაცია':'Sign in / შესვლა';
      hint.innerHTML=isUp?'უკვე გაქვს ანგარიში? <button type="button" class="inline-link" data-auth-mode="signin">შესვლა</button>':'არ გაქვს ანგარიში? <button type="button" class="inline-link" data-auth-mode="signup">შექმენი ანგარიში</button>';
      hint.querySelector('[data-auth-mode]').onclick=()=>applyMode(isUp?'signin':'signup');
      password.setAttribute('autocomplete',isUp?'new-password':'current-password');
      history.replaceState({},'',`auth.html?mode=${mode}`);setMessage('');
    }
    [btnIn,btnUp].forEach(b=>b.onclick=()=>applyMode(b.dataset.authMode));
    document.getElementById('passwordToggle')?.addEventListener('click',()=>{const showing=password.type==='text';password.type=showing?'password':'text';document.getElementById('passwordToggle').textContent=showing?'👁':'🙈';});
    form.onsubmit=async e=>{
      e.preventDefault();if(busy)return;setMessage('მუშავდება…');const eMail=normalizeEmail(email.value),pass=password.value,remember=document.getElementById('authRemember')?.checked!==false;
      if(!validEmail(eMail))return setMessage('შეიყვანე სწორი Gmail / Email.','error');
      if(pass.length<8)return setMessage('პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო.','error');
      if(mode==='signup'&&pass!==password2.value)return setMessage('პაროლები არ ემთხვევა.','error');
      busy=true;submit.disabled=true;
      try{if(remember)localStorage.setItem(LAST_EMAIL_KEY,eMail);else localStorage.removeItem(LAST_EMAIL_KEY);const result=await request(mode==='signup'?'/signup':'/signin',{method:'POST',body:JSON.stringify({email:eMail,password:pass,remember,referralCode:mode==='signup'?(localStorage.getItem('gn_referral_code')||''):''})});setMessage(result?.localMode?(remember?'ანგარიში შენახულია მხოლოდ ამ ბრაუზერში.':'შესვლა მოქმედებს ამ ჩანართის დახურვამდე.'):(mode==='signup'?'ანგარიში შეიქმნა.':'წარმატებით შეხვედით.'),'success');setTimeout(()=>location.href='index.html',350);}catch(err){setMessage(err.message||'ვერ მოხერხდა.','error');busy=false;submit.disabled=false;}
    };
    applyMode(mode);
  }
  window.GeoNatureAuth={me,request,renderHeader,localMode:isFileMode,apiUrl};
  document.addEventListener('DOMContentLoaded',()=>{renderHeader();bindAuthPage();});
})();
