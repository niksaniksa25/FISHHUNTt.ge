(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  function apiBase(){let base=String(window.GN_ADMIN_WORKER_ORIGIN||window.GN_API_BASE_URL||'').trim();while(base.endsWith('/'))base=base.slice(0,-1);return base;}
  const cloudAdmin=()=>Boolean(String(window.GN_ADMIN_WORKER_ORIGIN||'').trim());
  const tokenKey='gn_worker_admin_token';
  function savedToken(){
    try{return sessionStorage.getItem(tokenKey)||localStorage.getItem(tokenKey)||'';}
    catch{return '';}
  }
  function clearSavedToken(){
    try{sessionStorage.removeItem(tokenKey);localStorage.removeItem(tokenKey);localStorage.removeItem('gn_admin_local');}
    catch{}
  }
  let serverAvailable=true;
  async function req(path,opt={}){
    const token=cloudAdmin()?savedToken():'';
    const options={credentials:cloudAdmin()?'omit':'include',
      headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(opt.headers||{})},...opt};
    const base=apiBase();
    if(!base && String(location.hostname||'').toLowerCase().endsWith('.github.io')) throw new Error('Admin API არ არის მიბმული. დააკავშირე უსაფრთხო სერვერი js/api-config.js-ში.');
    const r=await fetch(base+'/api/admin'+path,options);
    let d={};try{d=await r.json()}catch{}
    if(!r.ok)throw new Error(d.message||(r.status===404&&cloudAdmin()
      ?'Worker-ის ძველი კოდია. განაახლე Cloudflare-ში worker/fishhunt-ai.mjs და დააჭირე Deploy.'
      :'Admin request failed'));
    return d;
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function date(v){if(!v)return '—';try{return new Intl.DateTimeFormat('ka-GE',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return new Date(v).toLocaleString()}}
  function statusLabel(s){return s==='resolved'?'გასწორებული':s==='read'?'წაკითხული':'ახალი'}
  function showPanel(local=false){$('adminLogin').classList.add('hidden');$('adminPanel').classList.remove('hidden');$('adminSystemNotice').hidden=!local;if(local){$('adminSystemNotice').classList.add('admin-local-warning');$('adminSystemNotice').textContent='LOCAL PREVIEW: სერვერი მიუწვდომელია. Feedback-ის შენახვა, რეალური ვიზიტების სტატისტიკა და გაყიდვების მონაცემები გამოჩნდება მხოლოდ START_GeoNature.bat-ით გაშვებული Node სერვერისას.';$('adminStats').innerHTML=['ვიზიტორები','გვერდის ნახვები','რეგისტრაციები','შესვლები','შესყიდვები','შემოსავალი','Premium','შეკვეთები'].map(x=>`<div><b>—</b><span>${x}</span></div>`).join('');$('adminFeedback').innerHTML='<div class="admin-empty">სერვერთან დაკავშირება ვერ მოხერხდა — შენახული შეტყობინებები ხელმისაწვდომი არ არის.</div>';$('adminPurchaseSummary').innerHTML='';$('adminPurchases').innerHTML='';$('adminUsers').innerHTML='<div class="mini-row"><b>Local preview</b><span>სტატისტიკა მიუწვდომელია</span><span>ADMIN</span></div>';}}
  function renderStats(s){
    const unavailable=Boolean(s.statsUnavailable);
    const analytics=Boolean(s.visitorAnalyticsAvailable);
    const notice=$('adminSystemNotice');
    if(unavailable){
      notice.hidden=false;
      notice.classList.add('admin-local-warning');
      notice.textContent=analytics
        ? 'Cloudflare ითვლის უნიკალურ ბრაუზერებს საქართველოს დროით. დათვლა იწყება ახალი Worker-ის გამოქვეყნების შემდეგ. ანგარიშები, გვერდის ნახვები და BOG გადახდები ამ Worker-ში არ ინახება.'
        : 'ვიზიტორების დათვლა ჯერ არ არის ჩართული. ანგარიშების და BOG გაყიდვების მონაცემები ამ Worker-ში არ ინახება.';
    }
    const cards=[
      ...(analytics?[
        ['დღეს შემოსული',s.visitorsToday,'უნიკალური ბრაუზერები • საქართველოს დრო',true],
        ['გუშინ შემოსული',s.visitorsYesterday,'უნიკალური ბრაუზერები • საქართველოს დრო',true]
      ]:[]),
      ['ვიზიტორები მთლიანობაში',s.uniqueVisitors,'უნიკალური ბრაუზერები • დათვლის დაწყებიდან',analytics||!unavailable],
      ['გვერდის ნახვები',s.pageViews,'ყველა აღრიცხული გვერდი',!unavailable],
      ['მოწვევის ბმულის გახსნა',s.inviteOpensTotal,'გაზიარებული ?ref= ბმულები',!unavailable],
      ['რეგისტრაციები',s.registrations??s.users,'ანგარიშები',!unavailable],
      ['შესვლები',s.logins,'წარმატებული ავტორიზაციები',!unavailable],
      ['შესყიდვები',s.purchases,'დადასტურებული გადახდები',!unavailable],
      ['შემოსავალი',s.revenue!=null?Number(s.revenue).toFixed(2)+' ₾':null,'დადასტურებული BOG გადახდები',!unavailable],
      ['Premium მომხმარებლები',s.activePlans,'აქტიური ფასიანი გეგმა',!unavailable],
      ['შეკვეთის მცდელობები',s.orders,'შექმნილი შეკვეთები',!unavailable]
    ];
    $('adminStats').innerHTML=cards.map(([label,value,note,available])=>'<div><b>'+esc(available&&value!=null?value:'—')+'</b><span>'+esc(label)+'</span><small>'+esc(available?note:'მონაცემთა წყარო არ არის დაკავშირებული')+'</small></div>').join('');
    const pp=s.purchasesByPlan||{};
    $('adminPurchaseSummary').innerHTML=unavailable?'<div class="admin-empty">გაყიდვების მონაცემები ამ სერვერზე არ არის ხელმისაწვდომი.</div>':
      '<div><b>'+esc(pp.plus||0)+'</b><span>FishHunt Plus</span></div><div><b>'+esc(pp.pro||0)+'</b><span>AI Pro</span></div><div><b>'+Number(s.revenue||0).toFixed(2)+' ₾</b><span>ჯამური დადასტურებული თანხა</span></div>';
    const purchases=s.recentPurchases||[];
    $('adminPurchases').innerHTML=unavailable?'<div class="admin-empty">შესყიდვების რეალური ბაზა არ არის დაკავშირებული.</div>':
      (purchases.map(p=>'<div class="mini-row"><b>'+esc(p.plan==='pro'?'AI Pro':'Plus')+' • '+esc(p.termMonths||1)+' თვე</b><span>'+Number(p.amount||0).toFixed(2)+' ₾</span><span>'+esc(date(p.at))+'</span></div>').join('')||'<div class="admin-empty">ჯერ დადასტურებული შესყიდვები არ არის.</div>');
    $('adminUsers').innerHTML=unavailable?'<div class="admin-empty">მომხმარებლების ანგარიშების ბაზა არ არის დაკავშირებული.</div>':
      ((s.recent||[]).map(u=>'<div class="mini-row"><b>'+esc(u.email)+'</b><span>'+esc(u.plan||'free')+'</span><span>'+esc(u.role||'user')+'</span></div>').join('')||'<div class="admin-empty">ჯერ ანგარიშები არ არის.</div>');
    renderRecentActivity(s.recentPageViews||[],s.recentInviteOpens||[]);
    if(unavailable){
      $('adminPageViews').innerHTML='<div class="admin-empty">ითვლება უნიკალური ვიზიტორების რაოდენობა. ინდივიდუალური გვერდების ისტორია ამ Worker-ში არ ინახება.</div>';
      $('adminReferrals').innerHTML='<div class="admin-empty">მოწვევის ბმულების ისტორია ამ Worker-ში არ ინახება.</div>';
    }
  }

  const adminAvatars={
    'free-fish':'assets/avatars/photo/fish.jpg','free-leaf':'assets/avatars/photo/forest.jpg','free-camp':'assets/avatars/photo/sunset.jpg',
    'free-fox':'assets/avatars/photo/fox.jpg','free-wave':'assets/avatars/photo/lake.jpg','free-ranger':'assets/avatars/photo/rod-close.jpg',
    'plus-eagle':'assets/avatars/photo/eagle.jpg','plus-wolf':'assets/avatars/photo/wolf.jpg','plus-bear':'assets/avatars/photo/bear.jpg',
    'plus-deer':'assets/avatars/photo/deer.jpg','plus-fishing':'assets/avatars/photo/fish-plus.jpg','plus-compass':'assets/avatars/photo/mountains.jpg',
    'plus-canyon':'assets/avatars/photo/mountain-plus.jpg','plus-svaneti':'assets/avatars/photo/adventure-plus.jpg','plus-ranger':'assets/avatars/photo/ranger-plus.jpg',
    'plus-nocturne':'assets/avatars/photo/camp.jpg','plus-fish-photo':'assets/avatars/photo/trout-plus.jpg','plus-reel-photo':'assets/avatars/photo/reel-plus.jpg',
    'plus-hunt-photo':'assets/avatars/photo/adventure-plus.jpg','plus-football':'assets/profile-bg/football-star.svg'
  };
  function renderRecentActivity(pageViews,invites){
    const avatar=id=>new URL(adminAvatars[id]||adminAvatars['free-fish'],document.baseURI).href;
    const viewBox=$('adminPageViews'),inviteBox=$('adminReferrals');
    if(viewBox)viewBox.innerHTML=pageViews.length?pageViews.map(v=>{
      const name=v.displayName|| (v.userId?'მომხმარებელი':'სტუმარი');
      return `<article class="admin-activity-row"><img src="${esc(avatar(v.avatarId))}" alt=""><div><b>${esc(name)}</b><small>${esc(v.path||'/')} • ${esc(date(v.at))}</small></div><span>${v.userId?'ანგარიშით':'ანონიმური'}</span><code>${esc(String(v.visitorId||'').slice(0,12))}</code></article>`;
    }).join(''):'<div class="admin-empty">ჯერ ჩაწერილი ვიზიტი არ არის. API სერვერი უნდა იყოს ჩართული.</div>';
    if(inviteBox)inviteBox.innerHTML=invites.length?invites.map(v=>{
      const inviterAvatar=avatar(v.inviterAvatarId),opener=v.openerName||'სტუმარი';
      const state=v.status==='registered'?'რეგისტრაციაც დასრულდა':'ბმული გაიხსნა';
      return `<article class="admin-activity-row"><img src="${esc(inviterAvatar)}" alt=""><div><b>${esc(v.inviterName||'უცნობი გამზიარებელი')} — ${esc(state)}</b><small>გახსნა: ${esc(opener)} • ${esc(v.openedPath||'/')} • ${esc(date(v.at))}</small></div><span>${esc(v.status||'opened')}</span><code>${esc(String(v.referralCode||'').slice(0,18))}</code></article>`;
    }).join(''):'<div class="admin-empty">მოწვევის ბმული ჯერ არ გახსნილა. შექმენი ბმული Dashboard-ში და გაუზიარე მეგობარს.</div>';
  }
  const categories={bug:'🐛 შეცდომა',idea:'💡 იდეა',question:'❓ კითხვა',other:'💬 სხვა'};
  function renderFeedback(items,counts){
    $('feedbackUnreadCount').textContent=String(counts?.new||0);
    if(!items?.length){$('adminFeedback').innerHTML='<div class="admin-empty">ამ ფილტრში შეტყობინებები არ არის.</div>';return;}
    $('adminFeedback').innerHTML=items.map(f=>{
      const status=['new','read','resolved'].includes(f.status)?f.status:'new';
      const contact=f.email||f.accountEmail||'';
      return `<article class="admin-feedback-card"><div class="admin-feedback-top"><div><div class="admin-feedback-title"><span class="admin-type">${esc(categories[f.category]||'შეტყობინება')}</span><span>${esc(f.page||'/')}</span></div><div class="admin-feedback-meta">${esc(date(f.createdAt))}${contact?' • პასუხისთვის: '+esc(contact):''}${f.userId?' • ანგარიშით გაგზავნილი':''}</div></div><span class="admin-status ${status}">${esc(statusLabel(status))}</span></div><div class="admin-feedback-message">${esc(f.message)}</div><div class="admin-feedback-foot"><span class="admin-feedback-meta">ID: ${esc(f.id)}</span><div class="admin-feedback-actions">${status!=='read'?`<button class="admin-small-btn" data-feedback-id="${esc(f.id)}" data-feedback-status="read">წაკითხულად მონიშვნა</button>`:''}${status!=='resolved'?`<button class="admin-small-btn resolved" data-feedback-id="${esc(f.id)}" data-feedback-status="resolved">გასწორებულია</button>`:`<button class="admin-small-btn" data-feedback-id="${esc(f.id)}" data-feedback-status="new">ხელახლა გახსნა</button>`}</div></div></article>`;
    }).join('');
  }
  async function reloadStats(){const data=await req('/stats');renderStats(data.stats||{});}
  async function reloadFeedback(){const filter=$('feedbackFilter').value||'all';const data=await req('/feedback?status='+encodeURIComponent(filter));renderFeedback(data.items||[],data.counts||{});}
  async function reloadAll(){
    try{serverAvailable=true;$('adminSystemNotice').hidden=true;await Promise.all([reloadStats(),reloadFeedback()]);}
    catch(e){if(!serverAvailable)return;serverAvailable=false;$('adminSystemNotice').hidden=false;$('adminSystemNotice').classList.add('admin-local-warning');$('adminSystemNotice').textContent='სერვერთან კავშირი დაკარგულია. ახალი შეტყობინებები/მონაცემები ვერ ჩაიტვირთა; გადაამოწმე START_GeoNature.bat და სცადე განახლება.';console.warn(e);}
  }
  async function checkAdmin(){
    if(cloudAdmin()&&!savedToken()){clearSavedToken();return false;}
    try{
      const m=await req('/me');
      if(m.admin){
        try{localStorage.setItem('gn_admin_local','1');}catch{}
        showPanel(false);await reloadAll();return true;
      }
    }catch(_){}
    if(cloudAdmin())clearSavedToken();
    return false;
  }
  $('adminLoginBtn').onclick=async()=>{
    const msg=$('adminMsg');msg.textContent='მოწმდება…';msg.className='auth-message';const pwd=$('adminPassword').value;
    try{
      const remember=$('adminRemember').checked;
      const result=await req('/login',{method:'POST',body:JSON.stringify({password:pwd,remember})});
      if(cloudAdmin()){
        if(!/^[0-9a-f]{64}$/.test(result.token||''))throw new Error('სერვერმა სესია ვერ დაადასტურა.');
        if(remember){localStorage.setItem(tokenKey,result.token);sessionStorage.removeItem(tokenKey);}
        else{sessionStorage.setItem(tokenKey,result.token);localStorage.removeItem(tokenKey);}
        localStorage.setItem('gn_admin_local','1');
      }
      try{localStorage.setItem('gn_admin_unlocked_at',String(Date.now()));}catch{}
      $('adminPassword').value='';
      msg.textContent='ACCESS GRANTED';msg.className='auth-message success';showPanel(false);await reloadAll();
    }catch(e){
      msg.textContent=e.message||'Admin access failed';
      msg.className='auth-message error';
    }
  };
  $('adminLogout').onclick=async()=>{try{await req('/logout',{method:'POST',body:'{}'})}catch{}clearSavedToken();try{localStorage.removeItem('gn_admin_unlocked_at')}catch{}location.reload()};
  $('refreshFeedback').onclick=()=>reloadFeedback().catch(e=>alert(e.message));
  $('refreshStats').onclick=()=>reloadAll();
  $('refreshActivity')?.addEventListener('click',()=>reloadAll());
  $('feedbackFilter').onchange=()=>reloadFeedback().catch(e=>alert(e.message));
  $('adminFeedback').addEventListener('click',async e=>{
    const btn=e.target.closest('[data-feedback-id][data-feedback-status]');if(!btn)return;
    btn.disabled=true;
    try{await req('/feedback/status',{method:'PATCH',body:JSON.stringify({id:btn.dataset.feedbackId,status:btn.dataset.feedbackStatus})});await reloadFeedback();}
    catch(err){alert(err.message||'სტატუსის შეცვლა ვერ მოხერხდა.');btn.disabled=false;}
  });
  checkAdmin().then(ok=>{if(!ok&&!cloudAdmin()&&!String(location.hostname||'').toLowerCase().endsWith('.github.io')){try{if(localStorage.getItem('gn_admin_local')==='1')showPanel(true);}catch{}}});
  setInterval(()=>{if(!$('adminPanel').classList.contains('hidden')&&serverAvailable)reloadAll();},45000);
})();
