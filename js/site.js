document.addEventListener('DOMContentLoaded', function(){
  const menu=document.getElementById('menuBtn');
  const nav=document.getElementById('nav');
  if(menu && nav && typeof menu.onclick!=='function') menu.addEventListener('click',()=>nav.classList.toggle('open'));

  function directLink(href){
    if(!nav) return null;
    return Array.from(nav.children).find(el=>el.tagName==='A'&&el.getAttribute('href')===href)||null;
  }
  function addTopLink(href,text,afterHref){
    if(!nav||directLink(href)) return;
    const link=document.createElement('a');
    link.href=href;
    link.textContent=text;
    if(location.pathname.endsWith(href)) link.className='active';
    const after=directLink(afterHref);
    if(after) after.insertAdjacentElement('afterend',link);
    else {
      const moreWrap=nav.querySelector('.more-wrap');
      if(moreWrap) nav.insertBefore(link,moreWrap);
      else nav.appendChild(link);
    }
  }
  function ensureMoreLink(href,icon,label,sub,groupKeyword){
    const more=document.getElementById('moreMenu');
    if(!more) return;
    const direct=directLink(href);
    const existing=Array.from(more.querySelectorAll('a')).find(a=>a.getAttribute('href')===href);
    if(direct) direct.remove();
    if(existing) return;

    const a=document.createElement('a');
    a.className='more-item';
    a.href=href;
    a.innerHTML='<span class="mi">'+icon+'</span><span class="mt">'+label+'<small>'+sub+'</small></span>';
    if(href==='ai.html') a.setAttribute('data-required-plan','pro');
    if(location.pathname.endsWith(href)) a.classList.add('active');

    const headings=Array.from(more.querySelectorAll('.more-group-title'));
    let group=headings.find(h=>h.textContent.toLowerCase().includes(String(groupKeyword||'').toLowerCase()));
    if(!group){
      group=document.createElement('div');
      group.className='more-group-title';
      group.textContent=groupKeyword||'➕ დამატებითი';
      more.appendChild(group);
    }
    let next=group.nextElementSibling;
    while(next && !next.classList.contains('more-group-title')) next=next.nextElementSibling;
    if(next) more.insertBefore(a,next);
    else more.appendChild(a);
  }

  // Keep only high-frequency destinations in the primary navigation.
  addTopLink('hunting.html','🦌 ნადირობა','fishing.html');

  // Secondary destinations live in the expandable "მეტი" menu on every page.
  ensureMoreLink('fishing-guide.html','🎯','სად წავიდეთ','TOP თევზები • ადგილები • შანსი','🧭 ინსტრუმენტები');
  addTopLink('ai.html','🤖 AI','hunting.html');
  ensureMoreLink('dashboard.html','📊','ჩემი GeoNature','XP • სტატისტიკა • გეგმები','🧭 ინსტრუმენტები');
  ensureMoreLink('forests.html','🌲','ტყეების Explorer','ტყე → ბინადრები','📚 ცოდნა');
  ensureMoreLink('red-book.html','📕','წითელი წიგნი','დაცული სახეობების ცნობარი','📚 ცოდნა');
  ensureMoreLink('donate.html','❤️','მხარდაჭერა / დონაცია','დაეხმარე GeoNature-ის განვითარებას','📚 ცოდნა');
});
