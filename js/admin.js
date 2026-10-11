(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const LOCAL_ADMIN_PASSWORD='25201125';
  let serverAvailable=true;
  async function req(path,opt={}){
    const options={credentials:'include',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt};
    const r=await fetch('/api/admin'+path,options);
    let d={};try{d=await r.json()}catch{}
    if(!r.ok)throw new Error(d.message||'Admin request failed');
    return d;
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function date(v){if(!v)return '—';try{return new Intl.DateTimeFormat('ka-GE',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return new Date(v).toLocaleString()}}
  function statusLabel(s){return s==='resolved'?'გასწორებული':s==='read'?'წაკითხული':'ახალი'}
  function showPanel(local=false){$('adminLogin').classList.add('hidden');$('adminPanel').classList.remove('hidden');$('adminSystemNotice').hidden=!local;if(local){$('adminSystemNotice').classList.add('admin-local-warning');$('adminSystemNotice').textContent='LOCAL PREVIEW: სერვერი მიუწვდომელია. Feedback-ის შენახვა, რეალური ვიზიტების სტატისტიკა და გაყიდვების მონაცემები გამოჩნდება მხოლოდ START_GeoNature.bat-ით გაშვებული Node სერვერისას.';$('adminStats').innerHTML=['ვიზიტორები','გვერდის ნახვები','რეგისტრაციები','შესვლები','შესყიდვები','შემოსავალი','Premium','შეკვეთები'].map(x=>`<div><b>—</b><span>${x}</span></div>`).join('');$('adminFeedback').innerHTML='<div class="admin-empty">სერვერთან დაკავშირება ვერ მოხერხდა — შენახული შეტყობინებები ხელმისაწვდომი არ არის.</div>';$('adminPurchaseSummary').innerHTML='';$('adminPurchases').innerHTML='';$('adminUsers').innerHTML='<div class="mini-row"><b>Local preview</b><span>სტატისტიკა მიუწვდომელია</span><span>ADMIN</span></div>';}}
  function renderStats(s){
    const cards=[['ვიზიტორები',s.uniqueVisitors??0,'ბრაუზერის ანონიმური ID'],['გვერდის ნახვები',s.pageViews??0,'ყველა აღრიცხული გვერდი'],['რეგისტრაციები',s.registrations??s.users??0,'ანგარიშები'],['შესვლები',s.logins??0,'წარმატებული ავტორიზაციები'],['შესყიდვები',s.purchases??0,'დადასტურებული გადახდები'],['შემოსავალი',`${Number(s.revenue||0).toFixed(2)} ₾`,'დადასტურებული BOG გადახდები'],['Premium მომხმარებლები',s.activePlans??0,'აქტიური ფასიანი გეგმა'],['შეკვეთის მცდელობები',s.orders??0,'შექმნილი შეკვეთები']];
    $('adminStats').innerHTML=cards.map(([label,value,note])=>`<div><b>${esc(value)}</b><span>${esc(label)}</span><small>${esc(note)}</small></div>`).join('');
    const pp=s.purchasesByPlan||{};
    $('adminPurchaseSummary').innerHTML=`<div><b>${esc(pp.plus||0)}</b><span>GeoNature Plus</span></div><div><b>${esc(pp.pro||0)}</b><span>AI Pro</span></div><div><b>${Number(s.revenue||0).toFixed(2)} ₾</b><span>ჯამური დადასტურებული თანხა</span></div>`;
    const purchases=s.recentPurchases||[];
    $('adminPurchases').innerHTML=purchases.map(p=>`<div class="mini-row"><b>${esc(p.plan==='pro'?'AI Pro':'Plus')} • ${esc(p.termMonths||1)} თვე</b><span>${Number(p.amount||0).toFixed(2)} ₾</span><span>${esc(date(p.at))}</span></div>`).join('')||'<div class="admin-empty">ჯერ დადასტურებული შესყიდვები არ არის.</div>';
    $('adminUsers').innerHTML=(s.recent||[]).map(u=>`<div class="mini-row"><b>${esc(u.email)}</b><span>${esc(u.plan||'free')}</span><span>${esc(u.role||'user')}</span></div>`).join('')||'<div class="admin-empty">ჯერ ანგარიშები არ არის.</div>';
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
    try{const m=await req('/me');if(m.admin){showPanel(false);await reloadAll();return true;}return false;}
    catch(_){return false;}
  }
  $('adminLoginBtn').onclick=async()=>{
    const msg=$('adminMsg');msg.textContent='მოწმდება…';msg.className='auth-message';const pwd=$('adminPassword').value;
    try{
      await req('/login',{method:'POST',body:JSON.stringify({password:pwd,remember:$('adminRemember').checked})});
      try{localStorage.removeItem('gn_admin_local');localStorage.setItem('gn_admin_unlocked_at',String(Date.now()));}catch{}
      msg.textContent='ACCESS GRANTED';msg.className='auth-message success';showPanel(false);await reloadAll();
    }catch(e){
      if(String(pwd)===LOCAL_ADMIN_PASSWORD){try{localStorage.setItem('gn_admin_local','1');}catch{}showPanel(true);msg.textContent='LOCAL PREVIEW — მონაცემები სერვერზე არ იკითხება';msg.className='auth-message';}
      else{msg.textContent=e.message||'Admin access failed';msg.className='auth-message error';}
    }
  };
  $('adminLogout').onclick=async()=>{try{await req('/logout',{method:'POST',body:'{}'})}catch{}try{localStorage.removeItem('gn_admin_local');localStorage.removeItem('gn_admin_unlocked_at')}catch{}location.reload()};
  $('refreshFeedback').onclick=()=>reloadFeedback().catch(e=>alert(e.message));
  $('refreshStats').onclick=()=>reloadAll();
  $('feedbackFilter').onchange=()=>reloadFeedback().catch(e=>alert(e.message));
  $('adminFeedback').addEventListener('click',async e=>{
    const btn=e.target.closest('[data-feedback-id][data-feedback-status]');if(!btn)return;
    btn.disabled=true;
    try{await req('/feedback/status',{method:'PATCH',body:JSON.stringify({id:btn.dataset.feedbackId,status:btn.dataset.feedbackStatus})});await reloadFeedback();}
    catch(err){alert(err.message||'სტატუსის შეცვლა ვერ მოხერხდა.');btn.disabled=false;}
  });
  checkAdmin().then(ok=>{if(!ok){try{if(localStorage.getItem('gn_admin_local')==='1')showPanel(true);}catch{}}});
  setInterval(()=>{if(!$('adminPanel').classList.contains('hidden')&&serverAvailable)reloadAll();},45000);
})();
