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
  const phoneTitles = {
    'index.html':['მთავარი','⌂','home'], 'map.html':['რუკა','⌖','map'], 'ai.html':['AI','✦','ai'],
    'weather.html':['ამინდი','☀'], 'fishing.html':['თევზაობა','🎣'], 'catalog.html':['კატალოგი','🐟'],
    'hunting.html':['ნადირობა','🦌'], 'donate.html':['დონაცია','♡'],
    'fishing-places.html':['ადგილები','📍'], 'fishing-guide.html':['სად წავიდეთ','◎'],
    'fishing-guide.html#fgHuntPlacesSection':['სანადირო ადგილები','♧'],
    'field-kit.html':['ჩექლისტი','☑'], 'catch-log.html':['ჩემი დაჭერები','▣'],
    'together.html':['ერთად გასვლა','♧'], 'dashboard.html':['პირადი გვერდი','◉'],
    'dashboard.html#badges':['ბეჯები','☆'], 'dashboard.html#gnNotificationCenter':['შეტყობინებები','🔔'],
    'seasons.html':['შეზღუდვები','▦'], 'forests.html':['ტყეები','♧'], 'red-book.html':['წითელი ნუსხა','▤'],
    'knowledge.html':['ცოდნა','▤'], 'moon.html':['მთვარე','☾'], 'safety.html':['უსაფრთხოება','◇'],
    'premium-extras.html':['Smart Tools','◇'], 'trial.html':['საცდელი გეგმა','☆'], 'premium.html':['გეგმები','☆'],
    'admin.html':['Admin','♙']
  };
  function phoneTitle(link, target, duplicate){
    const page = target.pathname.split('/').pop() || 'index.html';
    const meta = phoneTitles[page + target.hash] || phoneTitles[page];
    const fallback = (link.textContent || '').replace(/\s+/g,' ').trim();
    const previousLabel = link.dataset.gnNavLabel;
    const english = document.documentElement?.lang === 'en';
    const label = english ? window.GN_TRANSLATIONS?.[meta?.[0]] || fallback : meta ? meta[0] : fallback;
    const accessible = link.getAttribute('aria-label');
    link.dataset.gnNavLabel = label;
    // Keep dynamic labels such as the unread-notification counter intact.
    if (!accessible || accessible === previousLabel) link.setAttribute('aria-label', label);
    link.dataset.gnNavIcon = meta ? meta[1] : '◉';
    link.dataset.gnBottomPrimary = !duplicate && !target.hash && !target.search && meta?.[2] ? meta[2] : '';
    link.dataset.gnBottomOrder = page === 'weather.html' ? 'weather' : page === 'fishing.html' ? 'fishing' : '';
  }
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
    const phone=mobile;
    document.body?.classList.add('gn-has-bottom-nav');
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
    function revealLink(link){
      if (!link || !mobile.matches || (phone.matches && link.dataset.gnBottomPrimary)) return;
      requestAnimationFrame(()=>{
        const frame=nav.getBoundingClientRect(),item=link.getBoundingClientRect();
        let left=frame.left+8;
        if(phone.matches){
          for(const primary of nav.querySelectorAll('a[data-gn-bottom-primary]')){
            if(primary.dataset.gnBottomPrimary)left=Math.max(left,primary.getBoundingClientRect().right+8);
          }
        }
        const right=frame.right-12;
        if(item.left<left)nav.scrollLeft-=left-item.left;
        else if(item.right>right)nav.scrollLeft+=Math.min(item.right-right,item.left-left);
      });
    }
    let baselineHeight=window.innerHeight || 0,baselineWidth=window.innerWidth || 0;
    function syncKeyboard(){
      const viewport=window.visualViewport;
      const width=window.innerWidth || 0;
      const visible=viewport && viewport.scale===1 ? viewport.height : window.innerHeight || 0;
      const focused=document.activeElement;
      const editing=Boolean(focused && (['INPUT','TEXTAREA','SELECT'].includes(focused.tagName) || focused.isContentEditable));
      if(!editing || Math.abs(width-baselineWidth)>80){baselineHeight=window.innerHeight || visible;baselineWidth=width;}
      const reduced=Math.max(baselineHeight,window.innerHeight || 0)-visible>140;
      const keyboard=Boolean(phone.matches && editing && reduced && (!viewport || viewport.scale===1));
      document.body?.classList.toggle('gn-mobile-keyboard',keyboard);
    }
    function syncFeedback(){
      const fab=document.querySelector?.('.gn-feedback-fab');
      if(fab){
        const parent=phone.matches ? nav : document.body;
        if(fab.parentElement!==parent)parent.appendChild(fab);
        fab.dataset.gnBottomFeedback='true';
        if(!fab.getAttribute('aria-label'))fab.setAttribute('aria-label','უკუკავშირი');
      }
      syncKeyboard();
    }
    function refreshLinks(reveal){
      const links=[...nav.querySelectorAll(':scope > a[href], .more-menu a[href], .gn-auth-slot > a[href]')],seen=new Set();
      const current=new URL(location.href);if(current.pathname.endsWith('/'))current.pathname+='index.html';
      let active=null,root=null;
      for(const link of links){
        const target=new URL(link.getAttribute('href'),document.baseURI),duplicate=seen.has(target.href);
        seen.add(target.href);link.dataset.gnMobileDuplicate=String(duplicate);
        phoneTitle(link,target,duplicate);
        link.removeAttribute('aria-current');link.classList.remove('active');
        if(duplicate||target.pathname!==current.pathname)continue;
        if(!target.hash&&!root)root=link;
        if(!target.hash&&target.search&&target.search===current.search)active=link;
        if(target.hash&&target.hash===current.hash)active=link;
      }
      active=active||root;
      if(active){active.classList.add('active');active.setAttribute('aria-current','page');}
      const shouldReveal=reveal||(!lastActive&&active);lastActive=active;
      if(shouldReveal)revealLink(active);
    }
    function updateMode(){
      nav.setAttribute('aria-label',phone.matches ? 'ქვედა მენიუ — სხვა გვერდები გაასრიალე' : 'საიტის გვერდები');
      setOpen(false);refreshLinks(true);syncFeedback();
    }
    updateMode();
    if(mobile.addEventListener)mobile.addEventListener('change',updateMode);
    else mobile.addListener(updateMode);
    window.addEventListener('hashchange',()=>refreshLinks(true));
    nav.addEventListener('focusin',event=>revealLink(event.target.closest('a[href]')));
    document.addEventListener('focusin',syncKeyboard);
    document.addEventListener('focusout',()=>requestAnimationFrame(syncKeyboard));
    window.addEventListener('resize',syncFeedback,{passive:true});
    window.visualViewport?.addEventListener('resize',syncKeyboard,{passive:true});
    if(document.body)new MutationObserver(syncFeedback).observe(document.body,{childList:true});

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
