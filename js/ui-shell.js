(function(){
  'use strict';
  const normalise=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
  const sections={
    'fishing.html':[['fishResults','თევზები'],['fishProfile','არჩეული თევზი'],['planner','გასვლის გეგმა'],['assessmentFactors','ფაქტორები']],
    'hunting.html':[['huntResults','სახეობები'],['huntProfile','არჩეული სახეობა'],['huntPlanner','გასვლის გეგმა'],['assessmentFactors','ფაქტორები']],
    'weather.html':[['weatherHourlyStrip','საათები'],['assessmentFactors','ფაქტორები'],['weatherDaily','დღეები']],
    'dashboard.html':[['gnDashboard','ჩემი ჩანაწერები'],['badges','მიღწევები'],['photoid','ფოტოთი ამოცნობა'],['gnNotificationCenter','შეტყობინებები']],
    'map.html':[['mapSearch','ადგილის ძებნა'],['map','რუკა']]
  };
  function find(query,pages,fish=[],waters=[],wild=[]){
    const search=normalise(query),matches=value=>normalise(value).includes(search);
    const list=pages.filter(item=>!search||matches(item.label+' '+item.hint+' '+(item.keywords||'')));
    if(search){
      for(const item of fish)if(Array.isArray(item)&&item[1]&&matches(item.slice(0,4).join(' ')))list.push({href:'species.html?id='+encodeURIComponent(item[1]),label:item[1],hint:'თევზი • სახეობის გზამკვლევი',icon:'🐟'});
      for(const item of waters)if(Array.isArray(item)&&item[0]&&item[1]&&matches(item.slice(0,4).join(' ')))list.push({href:'place-details.html?id='+encodeURIComponent(item[0]),label:item[1],hint:[item[2],item[3]].filter(Boolean).join(' • '),icon:'📍'});
      for(const item of wild)if(Array.isArray(item)&&item[1]&&matches(item.slice(0,4).join(' ')))list.push({href:'species.html?id='+encodeURIComponent(item[1]),label:item[1],hint:'ბუნება • სახეობის გზამკვლევი',icon:'🌿'});
    }
    const seen=new Set();return list.filter(item=>{if(seen.has(item.href))return false;seen.add(item.href);return true;}).slice(0,30);
  }
  function pageLinks(){
    const nav=document.getElementById('nav');if(!nav)return[];
    const seen=new Set(),links=[];
    for(const link of nav.querySelectorAll(':scope > a[href], .more-menu a[href], .gn-auth-slot > a[href]')){
      const target=new URL(link.getAttribute('href'),document.baseURI);
      if(target.origin!==location.origin||seen.has(target.href)||link.hidden)continue;
      seen.add(target.href);
      const title=(link.querySelector('.mt')||link).cloneNode(true);title.querySelectorAll('small,.gn-alert-count').forEach(node=>node.remove());
      links.push({href:target.href,label:title.textContent.trim(),hint:'საიტის გვერდი',keywords:target.pathname.split('/').pop().replace('.html',''),icon:'↗'});
    }
    return links;
  }
  function mountFinder(){
    const header=document.querySelector('.header-inner');if(!header||document.getElementById('gnSearchOpen'))return;
    const open=document.createElement('button');open.id='gnSearchOpen';open.className='gn-search-open';open.type='button';open.setAttribute('aria-label','მოძებნე გვერდი, სახეობა ან ადგილი');
    open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5"></path></svg><span>ძებნა</span>';
    header.insertBefore(open,document.getElementById('nav'));
    const dialog=document.createElement('dialog');dialog.id='gnFinder';dialog.className='gn-finder';dialog.setAttribute('aria-labelledby','gnFinderTitle');
    dialog.innerHTML='<div class="gn-finder-head"><h2 id="gnFinderTitle">რას ეძებ?</h2><button type="button" class="gn-finder-close" aria-label="ძებნის დახურვა">×</button></div><div class="gn-finder-search"><label for="gnFinderInput">გვერდი, თევზი, სახეობა ან ადგილი</label><input id="gnFinderInput" type="search" placeholder="მაგალითად: კობრი, ლისი, ამინდი" autocomplete="off"><p class="gn-finder-status" role="status" aria-live="polite"></p></div><div class="gn-finder-results"></div>';
    document.body.appendChild(dialog);
    const input=dialog.querySelector('input'),results=dialog.querySelector('.gn-finder-results'),status=dialog.querySelector('.gn-finder-status');
    let returnFocus=null,scrollPosition={x:0,y:0},locked=false,sequence=0;
    function render(){
      const matches=find(input.value,pageLinks(),window.FISHES||[],window.WATERS||[],window.HUNTING_WILDLIFE||[]);
      results.replaceChildren();status.textContent=matches.length===30?'პირველი 30 შედეგი — დააზუსტე ძებნა':matches.length?matches.length+' შედეგი':'შედეგი ვერ მოიძებნა';
      if(!matches.length){const empty=document.createElement('p');empty.className='gn-finder-empty';empty.textContent='სცადე უფრო მოკლე სახელწოდება, სხვა სიტყვა ან სახეობის ლათინური სახელი.';results.appendChild(empty);return;}
      for(const item of matches){
        const link=document.createElement('a');link.href=item.href;
        const icon=document.createElement('span');icon.className='result-icon';icon.setAttribute('aria-hidden','true');icon.textContent=item.icon;
        const copy=document.createElement('span'),title=document.createElement('strong'),hint=document.createElement('small');title.textContent=item.label;hint.textContent=item.hint;
        copy.append(title,hint);link.append(icon,copy);results.appendChild(link);
      }
    }
    const isOpen=()=>dialog.hasAttribute('open');
    function restoreScroll(){window.scrollTo({left:scrollPosition.x,top:scrollPosition.y,behavior:'instant'});}
    function finishClose(){
      if(isOpen()||!locked)return;locked=false;
      document.body.classList.remove('gn-finder-open','gn-finder-fallback');document.documentElement.classList.remove('gn-finder-open');
      returnFocus?.focus({preventScroll:true});restoreScroll();
      const finished=++sequence;requestAnimationFrame(()=>{if(sequence===finished&&!isOpen())restoreScroll();});
    }
    function close(){if(dialog.open&&typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');finishClose();}
    function show(){
      if(isOpen())return;
      returnFocus=document.activeElement;scrollPosition={x:window.scrollX,y:window.scrollY};render();locked=true;const opened=++sequence;
      if(typeof dialog.showModal==='function')dialog.showModal();else {dialog.setAttribute('open','');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');document.body.classList.add('gn-finder-fallback');}
      document.body.classList.add('gn-finder-open');document.documentElement.classList.add('gn-finder-open');input.focus({preventScroll:true});restoreScroll();
      requestAnimationFrame(()=>{if(sequence===opened&&isOpen())restoreScroll();});
    }
    open.addEventListener('click',show);dialog.querySelector('.gn-finder-close').addEventListener('click',close);
    dialog.addEventListener('close',finishClose);
    dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
    input.addEventListener('input',render);
    input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('a')?.focus();}});
    results.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();const links=[...results.querySelectorAll('a')],i=links.indexOf(document.activeElement),next=i+(event.key==='ArrowDown'?1:-1);if(next<0)input.focus();else links[Math.min(next,links.length-1)]?.focus();});
    document.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();isOpen()?close():show();}
      else if(event.key==='Escape'&&isOpen()&&typeof dialog.showModal!=='function')close();
      else if(event.key==='Tab'&&isOpen()){
        const focusable=[...dialog.querySelectorAll('button,input,a[href]')],first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
  }
  function mountSectionLinks(){
    const name=location.pathname.split('/').pop(),entries=sections[name],main=document.getElementById('main-content');
    if(!entries||!main||document.getElementById('gnSectionNav'))return;
    const available=entries.filter(([id])=>document.getElementById(id));if(available.length<2)return;
    const nav=document.createElement('nav');nav.id='gnSectionNav';nav.className='gn-section-nav container';nav.setAttribute('aria-label','ამ გვერდის განყოფილებები');
    for(const[id,label]of available){const a=document.createElement('a');a.href='#'+id;a.textContent=label;nav.appendChild(a);}
    const head=main.querySelector('.page-head,.fish-hero');if(head)head.insertAdjacentElement('afterend',nav);else main.prepend(nav);
  }
  function mountBackTop(){
    const button=document.createElement('button');button.type='button';button.className='gn-back-top';button.setAttribute('aria-label','გვერდის დასაწყისში დაბრუნება');button.textContent='↑';button.hidden=true;
    document.body.appendChild(button);button.addEventListener('click',()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});document.querySelector('.header .logo')?.focus({preventScroll:true});});
    let frame=false;window.addEventListener('scroll',()=>{if(frame)return;frame=true;requestAnimationFrame(()=>{button.hidden=window.scrollY<650;frame=false;});},{passive:true});
  }
  function simplifyFactorHints(){
    for(const detail of document.querySelectorAll('.factor-item>.factor-detail')){
      const wrapper=document.createElement('details');wrapper.className='factor-hint';const summary=document.createElement('summary');summary.textContent='განმარტება';
      detail.before(wrapper);wrapper.append(summary,detail);
    }
  }
  function setup(){
    mountFinder();mountSectionLinks();mountBackTop();simplifyFactorHints();
    for(const grid of document.querySelectorAll('.factor-grid'))new MutationObserver(simplifyFactorHints).observe(grid,{childList:true});
    const mapOptions=document.getElementById('mapOptions');if(mapOptions&&window.matchMedia('(min-width: 1025px)').matches)mapOptions.open=true;
    const header=document.querySelector('.header');
    if(header){const update=()=>document.documentElement.style.setProperty('--gn-header-height',Math.ceil(header.getBoundingClientRect().height)+'px');update();if(window.ResizeObserver)new ResizeObserver(update).observe(header);else window.addEventListener('resize',update,{passive:true});}
    const main=document.getElementById('main-content');
    const compact=window.matchMedia('(max-width: 768px)');
    function feedbackLabel(){const fab=document.querySelector('.gn-feedback-fab');if(fab){fab.textContent=compact.matches?'💬':'უკუკავშირი';fab.setAttribute('aria-label','უკუკავშირის გაგზავნა');fab.title='შენიშვნის ან შეცდომის შეტყობინება';}}
    if(compact.addEventListener)compact.addEventListener('change',feedbackLabel);else compact.addListener(feedbackLabel);
    feedbackLabel();
    if(main){
      const move=()=>{feedbackLabel();for(const node of [...document.body.children])if(node.tagName==='SECTION'&&!node.classList.contains('gn-premium-gate')){const before=main.querySelector('#homePremiumOffer');before?main.insertBefore(node,before):main.appendChild(node);}};
      move();new MutationObserver(move).observe(document.body,{childList:true});
    }
  }
  window.GeoNatureUI={find,normalise};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
