(function(){
  'use strict';
  const destinations=[
    ['index.html','მთავარი'],['weather.html','ამინდი'],['catalog.html','კატალოგი'],
    ['map.html','რუკა'],['fishing.html','🎣 თევზაობა'],['hunting.html','🦌 ნადირობა'],
    ['ai.html','AI'],['donate.html','♡ დონაცია'],
    ['fishing-places.html','სათევზაო ადგილები'],['fishing-guide.html','სად წავიდეთ სათევზაოდ'],
    ['fishing-guide.html#fgHuntPlacesSection','სანადირო ადგილები'],['field-kit.html','აღჭურვილობა'],
    ['catch-log.html','ჩემი დაჭერები'],['together.html','ერთად გასვლა'],['dashboard.html','ჩემი GeoNature'],
    ['dashboard.html#badges','ბეჯები & ჩელენჯები'],['dashboard.html#gnNotificationCenter','შეტყობინებები'],
    ['seasons.html','სეზონური კალენდარი'],['forests.html','ტყეების Explorer'],['red-book.html','წითელი წიგნი'],
    ['knowledge.html','GeoNature ცოდნა'],['moon.html','მთვარე & ღამის ცა'],['safety.html','უსაფრთხოება'],
    ['premium-extras.html','Smart Tools'],['trial.html','3 დღე უფასოდ'],['premium.html','Premium გეგმები']
  ];
  function ensureDestinations(nav){
    let trigger=document.getElementById('moreTrigger'),menu=document.getElementById('moreMenu');
    if(!trigger||!menu){
      const wrap=document.createElement('div');wrap.className='more-wrap';
      trigger=document.createElement('button');trigger.id='moreTrigger';trigger.className='more-trigger';trigger.textContent='მეტი ⌄';
      menu=document.createElement('div');menu.id='moreMenu';menu.className='more-menu';
      wrap.append(trigger,menu);nav.appendChild(wrap);
    }
    const existing=new Set([...nav.querySelectorAll('a[href]')].map(link=>link.getAttribute('href')));
    for(const [href,label]of destinations){
      if(existing.has(href))continue;
      const link=document.createElement('a');link.className='more-item';link.href=href;
      const title=document.createElement('span');title.className='mt';title.textContent=label;
      link.appendChild(title);menu.appendChild(link);existing.add(href);
    }
    return {trigger,menu};
  }
  function setupMoreMenu(){
    const nav=document.getElementById('nav');if(!nav)return;
    const {trigger,menu}=ensureDestinations(nav);
    if(trigger.dataset.gnMoreBound)return;
    trigger.dataset.gnMoreBound='true';
    trigger.type='button';
    trigger.setAttribute('aria-controls',menu.id);
    const mobile=window.matchMedia('(max-width: 1024px)');
    nav.setAttribute('aria-label','საიტის გვერდები');
    nav.setAttribute('tabindex','0');
    function setOpen(open){
      const dropdownOpen=Boolean(open)&&!mobile.matches,visible=mobile.matches||dropdownOpen;
      menu.classList.toggle('open',dropdownOpen);
      trigger.classList.toggle('open',dropdownOpen);
      trigger.setAttribute('aria-expanded',String(visible));
      menu.setAttribute('aria-hidden',String(!visible));
      menu.inert=!visible;
    }
    let lastActive=null;
    function refreshLinks(reveal){
      const links=[...nav.querySelectorAll(':scope > a[href], .more-menu a[href], .gn-auth-slot > a[href]')],seen=new Set();
      const current=new URL(location.href);if(current.pathname.endsWith('/'))current.pathname+='index.html';
      let active=null,root=null;
      for(const link of links){
        const target=new URL(link.getAttribute('href'),document.baseURI),duplicate=seen.has(target.href);
        seen.add(target.href);link.dataset.gnMobileDuplicate=String(duplicate);
        link.removeAttribute('aria-current');link.classList.remove('active');
        if(duplicate||target.pathname!==current.pathname)continue;
        if(!target.hash&&!root)root=link;
        if(!target.hash&&target.search&&target.search===current.search)active=link;
        if(target.hash&&target.hash===current.hash)active=link;
      }
      active=active||root;
      if(active){active.classList.add('active');active.setAttribute('aria-current','page');}
      const shouldReveal=reveal||(!lastActive&&active);lastActive=active;
      if(shouldReveal&&mobile.matches&&active)requestAnimationFrame(()=>{
        const frame=nav.getBoundingClientRect(),item=active.getBoundingClientRect();
        if(item.left<frame.left+8)nav.scrollLeft-=frame.left+8-item.left;
        else if(item.right>frame.right-8)nav.scrollLeft+=item.right-frame.right+8;
      });
    }
    function updateMode(){setOpen(false);refreshLinks(true);}
    updateMode();
    if(mobile.addEventListener)mobile.addEventListener('change',updateMode);
    else mobile.addListener(updateMode);
    window.addEventListener('hashchange',()=>refreshLinks(true));
    new MutationObserver(()=>{
      refreshLinks(false);
      document.body?.classList.toggle('gn-header-profile-open',Boolean(document.querySelector('.gn-profile-panel:not([hidden])')));
    }).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['href','hidden']});
    trigger.addEventListener('click',event=>{
      event.preventDefault();
      setOpen(!menu.classList.contains('open'));
    });
    trigger.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'){
        event.preventDefault();
        setOpen(true);
        menu.querySelector('a,button')?.focus();
      }
    });
    menu.addEventListener('click',event=>{
      if(event.target.closest('a'))setOpen(false);
    });
    document.addEventListener('click',event=>{
      if(!trigger.contains(event.target)&&!menu.contains(event.target))setOpen(false);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&menu.classList.contains('open')){
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.focus();
      }
    },true);
    if(nav){
      new MutationObserver(()=>{
        if(window.matchMedia('(max-width: 1024px)').matches&&!nav.classList.contains('open'))setOpen(false);
      }).observe(nav,{attributes:true,attributeFilter:['class']});
    }
  }
  function setupHeaderLive(){
    const pill=document.getElementById('headerLivePill');
    if(!pill||pill.dataset.gnLiveBound)return;
    pill.dataset.gnLiveBound='true';
    const text=pill.querySelector('span');
    if(!pill.dataset.live){pill.dataset.live='0';if(text)text.textContent='ამინდი';}
    const update=event=>{
      const data=event.detail?.data;
      const current=Boolean(data?.current)&&!data.__meta?.stale&&!event.detail?.isMissing&&event.detail?.live!==false&&event.detail?.selectedCurrent!==false;
      pill.dataset.live=current?'1':'0';
      if(text)text.textContent=!data?'მიუწვდომელია':data.__meta?.stale?'ბოლო მონაცემი':current?'მიმდინარე':event.detail?.live===false?'შეჩერებულია':'პროგნოზი';
    };
    window.addEventListener('gn:weatherUpdated',update);
    window.addEventListener('gn:assessmentUpdated',update);

  }
  function setup(){setupMoreMenu();setupHeaderLive()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
