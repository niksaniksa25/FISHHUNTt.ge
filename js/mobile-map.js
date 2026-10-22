(function(){
  'use strict';
  const media=window.matchMedia('(max-width:1024px)');
  let shell,side,canvas,ui=null,frame=0;
  function ready(){
    shell=document.querySelector('.map-shell');side=shell?.querySelector('.map-side');canvas=document.getElementById('map');
    if(!shell||!side||!canvas)return;
    function resize(){
      if(frame)cancelAnimationFrame(frame);
      fit();
      frame=requestAnimationFrame(fit);
    }
    function fit(){
        frame=0;if(!ui)return;
        document.body.classList.toggle('gn-map-engine-unavailable',canvas.dataset.mapEngine==='error');
        const viewport=window.visualViewport;
        const bottom=viewport&&viewport.scale===1 ? viewport.height+viewport.offsetTop : window.innerHeight;
        const nav=document.getElementById('nav');
        const navRect=nav?.getBoundingClientRect();
        const navVisible=navRect&&getComputedStyle(nav).display!=='none'&&navRect.height>0;
        const available=Math.max(180,Math.floor(Math.min(bottom,navVisible?navRect.top:bottom)-shell.getBoundingClientRect().top));
        const height=available+'px';
        if(shell.style.getPropertyValue('--gn-phone-map-height')!==height){
          shell.style.setProperty('--gn-phone-map-height',height);
          window.GNMap?.instance?.invalidateSize({pan:false});
        }
    }
    function closePanel(){
      if(!ui)return;
      if(ui.body.contains(document.activeElement))ui.toggle.focus({preventScroll:true});
      ui.body.hidden=true;ui.toggle.setAttribute('aria-expanded','false');side.classList.remove('gn-map-expanded');resize();
    }
    function openPanel(){
      if(!ui)return;
      ui.body.hidden=false;ui.toggle.setAttribute('aria-expanded','true');side.classList.add('gn-map-expanded');resize();
    }
    function enter(){
      if(ui)return;
      const records=[],listeners=[];
      const element=(tag,cls)=>{const el=document.createElement(tag);el.className=cls;return el;};
      const move=(node,parent)=>{if(!node)return;const marker=document.createComment('phone map position');node.before(marker);records.push({node,marker});parent.appendChild(node);};
      const listen=(target,event,fn)=>{if(!target)return;target.addEventListener(event,fn);listeners.push(()=>target.removeEventListener(event,fn));};
      const searchbar=element('div','gn-map-searchbar');searchbar.setAttribute('role','search');searchbar.setAttribute('aria-label','ადგილის ძიება რუკაზე');
      const actions=element('div','gn-map-quick-actions');actions.setAttribute('aria-label','რუკის მოქმედებები');
      const summary=element('div','gn-map-sheet-top'),body=element('div','gn-map-sheet-body');body.id='gnMobileMapControls';body.hidden=true;
      const toggle=element('button','gn-map-sheet-toggle');toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',body.id);toggle.innerHTML='<span>ადგილები და დრო</span><span aria-hidden="true">⌃</span>';
      summary.appendChild(toggle);side.append(summary,body);shell.append(searchbar,actions);
      const search=document.getElementById('mapSearch'),searchButton=document.getElementById('mapSearchBtn');
      move(search,searchbar);move(searchButton,searchbar);
      const buttons=[];
      for(const [id,icon,title] of [['mapGps','⌖','ჩემი მდებარეობა'],['mapNearby','◎','ახლომდებარე სათევზაო ადგილები']]){
        const node=document.getElementById(id);if(!node)continue;
        buttons.push({node,text:node.textContent,label:node.getAttribute('aria-label'),title:node.getAttribute('title')});
        move(node,actions);node.textContent=icon;node.setAttribute('aria-label',title);node.title=title;
      }
      move(document.getElementById('mapInfo'),summary);
      move(document.getElementById('mapNearbyList'),body);
      move(document.getElementById('mapOptions'),body);
      move(shell.querySelector('.score-legend'),body);
      move(side.querySelector('.map-premium-note'),body);
      const tileError=element('div','gn-map-tile-error');tileError.setAttribute('role','status');tileError.hidden=true;
      const message=element('span','');message.textContent='რუკის ფონი ვერ ჩაიტვირთა. ადგილების ნიშნულები ხელმისაწვდომია.';
      const retry=element('button','');retry.type='button';retry.textContent='განახლება';tileError.append(message,retry);shell.appendChild(tileError);
      ui={records,listeners,buttons,searchbar,actions,summary,body,toggle,tileError};
      const searchPlaceholder=search?.getAttribute('placeholder');
      function syncSearch(){
        if(!search)return;
        search.placeholder=search.disabled?'ადგილის ძიება · AI Pro':searchPlaceholder||'მოძებნე ადგილი';
        searchbar.classList.toggle('gn-map-search-locked',search.disabled);
        const label=searchbar.querySelector('.gn-map-search-access');
        if(label)label.hidden=!search.disabled;
      }
      const access=element('a','gn-map-search-access');access.href='premium.html?plan=pro';access.textContent='AI Pro · ძიების გახსნა';searchbar.appendChild(access);
      syncSearch();
      if(typeof MutationObserver==='function'){
        const observer=new MutationObserver(mutations=>{
          for(const mutation of mutations){
            if(mutation.type==='attributes')syncSearch();
            for(const node of mutation.addedNodes||[]){if(node.nodeType===1&&node.matches('.map-premium-note')&&node.parentElement===side)move(node,body);}
          }
        });
        if(search)observer.observe(search,{attributes:true,attributeFilter:['disabled']});
        observer.observe(side,{childList:true});
        ui.observer=observer;
      }
      ui.restoreSearch=()=>{if(search){if(searchPlaceholder===null)search.removeAttribute('placeholder');else search.setAttribute('placeholder',searchPlaceholder);}};
      document.body.classList.add('gn-phone-map');
      listen(toggle,'click',()=>body.hidden?openPanel():closePanel());
      listen(document.getElementById('mapNearby'),'click',openPanel);
      listen(searchButton,'click',()=>{closePanel();search?.blur();});
      listen(search,'keydown',event=>{if(event.key==='Enter'){closePanel();search.blur();}});
      listen(side,'keydown',event=>{if(event.key==='Escape'&&!body.hidden){event.preventDefault();closePanel();toggle.focus({preventScroll:true});}});
      listen(retry,'click',()=>window.GNMap?.redrawTiles());
      listen(window,'gn:map-tiles',event=>{if(ui)ui.tileError.hidden=event.detail?.state!=='error';});
      tileError.hidden=canvas.dataset.mapTiles!=='error';
      resize();
    }
    function leave(){
      if(!ui)return;
      ui.observer?.disconnect();ui.restoreSearch?.();
      for(const dispose of ui.listeners)dispose();
      for(const {node,marker} of ui.records){marker.replaceWith(node);}
      for(const {node,text,label,title} of ui.buttons){node.textContent=text;if(label===null)node.removeAttribute('aria-label');else node.setAttribute('aria-label',label);if(title===null)node.removeAttribute('title');else node.setAttribute('title',title);}
      for(const node of [ui.searchbar,ui.actions,ui.summary,ui.body,ui.tileError])node.remove();
      ui=null;side.classList.remove('gn-map-expanded');document.body.classList.remove('gn-phone-map','gn-map-engine-unavailable');shell.style.removeProperty('--gn-phone-map-height');
      requestAnimationFrame(()=>window.GNMap?.instance?.invalidateSize({pan:false}));
    }
    function sync(){if(media.matches)enter();else leave();resize();}
    media.addEventListener?.('change',sync);
    window.addEventListener('resize',resize,{passive:true});
    window.visualViewport?.addEventListener('resize',resize,{passive:true});
    window.addEventListener('gn:map-ready',resize);
    window.addEventListener('pageshow',resize);
    if(typeof ResizeObserver==='function'){
      const observer=new ResizeObserver(()=>{if(frame)cancelAnimationFrame(frame);fit();});
      for(const node of [document.querySelector('.header'),document.getElementById('nav')])if(node)observer.observe(node);
    }
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
