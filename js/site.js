document.addEventListener('DOMContentLoaded', function(){
  const menu=document.getElementById('menuBtn');
  const nav=document.getElementById('nav');
  if(menu && nav){
    if(!menu.querySelector('.menu-lines')){
      menu.innerHTML='<span class="menu-lines" aria-hidden="true"><i></i><i></i><i></i></span>';
    }
    menu.type='button';
    menu.setAttribute('aria-controls','nav');
    menu.setAttribute('aria-expanded',nav.classList.contains('open')?'true':'false');
    menu.setAttribute('aria-label',nav.classList.contains('open')?'მენიუს დახურვა':'მენიუს გახსნა');
    function setNavOpen(open){
      nav.classList.toggle('open',Boolean(open));
      menu.setAttribute('aria-expanded',open?'true':'false');
      menu.setAttribute('aria-label',open?'მენიუს დახურვა':'მენიუს გახსნა');
    }
    if(!menu.dataset.gnMenuBound){
      menu.dataset.gnMenuBound='true';
      menu.addEventListener('click',event=>{
        event.preventDefault();
        setNavOpen(!nav.classList.contains('open'));
      });
      nav.addEventListener('click',event=>{
        const link=event.target.closest('a');
        if(link) setNavOpen(false);
      });
      document.addEventListener('click',event=>{
        if(nav.classList.contains('open')&&!nav.contains(event.target)&&!menu.contains(event.target)) setNavOpen(false);
      });
      document.addEventListener('keydown',event=>{
        if(event.key==='Escape'&&nav.classList.contains('open')){setNavOpen(false);menu.focus();}
      });
      window.addEventListener('resize',()=>{
        if(window.innerWidth>=1025) setNavOpen(false);
      });
    }
  }

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
  ensureMoreLink('dashboard.html','📊','ჩემი FishHunt','XP • სტატისტიკა • გეგმები','🧭 ინსტრუმენტები');
  ensureMoreLink('forests.html','🌲','ტყეების Explorer','ტყე → ბინადრები','📚 ცოდნა');
  ensureMoreLink('red-book.html','📕','წითელი წიგნი','დაცული სახეობების ცნობარი','📚 ცოდნა');
  addTopLink('donate.html','♡ დონაცია');
  const donationLink=directLink('donate.html');
  if(donationLink){
    donationLink.classList.add('nav-donate');
    donationLink.textContent='♡ დონაცია';
  }
  nav?.querySelectorAll('.more-menu a[href="donate.html"]').forEach(link=>link.remove());
  ensureMoreLink('seasons.html','🗓️','სეზონური კალენდარი','თევზაობის თვეები • ველური ბუნების სეზონურობა','🧭 ინსტრუმენტები');
});
