const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../js/nav-dropdown.js'),'utf8');

function navigation({mobile=true,width=mobile?390:1280,withMore=true,href='https://example.test/site/index.html',direct=['index.html','map.html'],secondary=['./map.html','dashboard.html','dashboard.html#badges']}={}){
  const observers=[],documentEvents=new Map(),windowEvents=new Map(),frames=[];
  let focused=null,windowScrolls=0;
  function emit(target,type,detail={}){
    const event={type,target,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...detail};
    for(const handler of target.events?.get(type)||[])handler(event);
    return event;
  }
  function mutation(target,type,attributeName){
    for(const observer of observers){
      if(observer.target!==target&&!(observer.options.subtree&&observer.target.contains(target)))continue;
      if(type==='attributes'&&(!observer.options.attributes||observer.options.attributeFilter&&!observer.options.attributeFilter.includes(attributeName)))continue;
      if(type==='childList'&&!observer.options.childList)continue;
      observer.records.push({target,type,attributeName});
    }
  }
  function flush(){
    for(let round=0;round<10;round++){
      const pending=observers.filter(observer=>observer.records.length);
      if(!pending.length)break;
      for(const observer of pending){const records=observer.records.splice(0);observer.callback(records,observer);}
    }
    while(frames.length)frames.shift()();
  }
  class Element{
    constructor(tag){
      this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attributes=new Map();this.events=new Map();this.scrollLeft=0;this.inert=false;this._text='';this.rect={left:0,right:100,top:0,bottom:44};
      const node=this,properties=new Map();
      this.dataset=new Proxy({}, {get(_,name){return node.getAttribute('data-'+String(name).replace(/[A-Z]/g,char=>'-'+char.toLowerCase()))??undefined;},set(_,name,value){node.setAttribute('data-'+String(name).replace(/[A-Z]/g,char=>'-'+char.toLowerCase()),value);return true;},deleteProperty(_,name){node.removeAttribute('data-'+String(name).replace(/[A-Z]/g,char=>'-'+char.toLowerCase()));return true;}});
      this.style={setProperty(name,value){properties.set(name,String(value));},getPropertyValue(name){return properties.get(name)||'';},removeProperty(name){properties.delete(name);}};
    }
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}set textContent(value){this._text=String(value);this.children=[];mutation(this,'childList');}
    get parentNode(){return this.parentElement;}
    get nextSibling(){if(!this.parentElement)return null;return this.parentElement.children[this.parentElement.children.indexOf(this)+1]||null;}
    get isConnected(){return this===body||body.contains(this);}
    get isContentEditable(){return this.getAttribute('contenteditable')==='true'||this.getAttribute('contenteditable')==='';}
    get clientWidth(){return this.rect.right-this.rect.left;}
    get clientHeight(){return this.rect.bottom-this.rect.top;}
    get offsetHeight(){return this.clientHeight;}
    get offsetWidth(){return this.clientWidth;}

    get id(){return this.getAttribute('id')||'';}set id(value){this.setAttribute('id',value);}
    get className(){return this.getAttribute('class')||'';}set className(value){this.setAttribute('class',value);}
    get href(){return this.getAttribute('href')||'';}set href(value){this.setAttribute('href',value);}
    get classList(){const node=this;return{
      contains(name){return node.className.split(/\s+/).includes(name);},
      add(name){this.toggle(name,true);},remove(name){this.toggle(name,false);},
      toggle(name,force){const names=new Set(node.className.split(/\s+/).filter(Boolean));const active=force===undefined?!names.has(name):Boolean(force);if(active)names.add(name);else names.delete(name);node.className=[...names].join(' ');return active;}
    };}
    setAttribute(name,value){value=String(value);if(this.attributes.get(name)===value)return;this.attributes.set(name,value);mutation(this,'attributes',name);}
    getAttribute(name){return this.attributes.get(name)??null;}
    removeAttribute(name){if(this.attributes.delete(name))mutation(this,'attributes',name);}
    appendChild(child){if(child.parentElement)child.parentElement.removeChild(child);child.parentElement=this;this.children.push(child);mutation(this,'childList');return child;}
    removeChild(child){const index=this.children.indexOf(child);if(index!==-1){this.children.splice(index,1);child.parentElement=null;mutation(this,'childList');}return child;}
    insertBefore(child,before){if(!before)return this.appendChild(child);if(child.parentElement)child.parentElement.removeChild(child);const index=this.children.indexOf(before);if(index===-1)throw new Error('Unknown sibling');this.children.splice(index,0,child);child.parentElement=this;mutation(this,'childList');return child;}
    remove(){this.parentElement?.removeChild(this);}
    matches(selector){return matches(this,selector);}

    append(...children){children.forEach(child=>this.appendChild(child));}
    contains(child){return this===child||this.children.some(node=>node.contains(child));}
    addEventListener(type,handler){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(handler);}
    closest(selector){for(let node=this;node;node=node.parentElement)if(matches(node,selector))return node;return null;}
    querySelectorAll(selector){
      const results=[],selectors=selector.split(',').map(item=>item.trim());
      function visit(node){for(const child of node.children){if(selectors.some(item=>{
        if(item.startsWith(':scope > '))return child.parentElement===this&&matches(child,item.slice(9));
        const split=item.lastIndexOf(' ');if(split!==-1)return matches(child,item.slice(split+1))&&Boolean(child.parentElement?.closest(item.slice(0,split)));
        return matches(child,item);
      }))results.push(child);visit.call(this,child);}}
      visit.call(this,this);return results;
    }
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    getBoundingClientRect(){return {...this.rect,width:this.clientWidth,height:this.clientHeight};}
    focus(){focused=this;document.activeElement=this;emit(document,'focusin',{target:this});}
    blur(){if(document.activeElement===this)document.activeElement=body;emit(document,'focusout',{target:this});}
  }
  function matches(node,selector){
    let base=selector.trim();
    const negative=base.match(/:not\(([^)]+)\)/);
    if(negative){if(matches(node,negative[1]))return false;base=base.replace(negative[0],'');}
    const tag=base.match(/^[a-z]+/i);if(tag&&node.tagName!==tag[0].toUpperCase())return false;
    for(const match of base.matchAll(/\.([\w-]+)/g))if(!node.classList.contains(match[1]))return false;
    for(const match of base.matchAll(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/g)){
      const value=node.getAttribute(match[1]);if(value===null||match[2]!==undefined&&value!==match[2])return false;
    }
    return Boolean(base==='*'||tag||base.startsWith('.')||base.startsWith('['));
  }
  const body=new Element('body'),nav=new Element('nav');nav.id='nav';nav.rect={left:0,right:width,top:735,bottom:800};body.appendChild(nav);
  const link=href=>{const node=new Element('a');node.href=href;node.textContent=href;return node;};
  direct.forEach(href=>nav.appendChild(link(href)));
  if(withMore){
    const wrap=new Element('div'),trigger=new Element('button'),menu=new Element('div');
    wrap.className='more-wrap';trigger.id='moreTrigger';trigger.className='more-trigger';menu.id='moreMenu';menu.className='more-menu';
    secondary.forEach(href=>menu.appendChild(link(href)));wrap.append(trigger,menu);nav.appendChild(wrap);
  }
  const makeMedia=matches=>({matches,events:new Map(),addEventListener(type,handler){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(handler);},addListener(handler){this.addEventListener('change',handler);}});
  const media=makeMedia(mobile);
  const visualViewport={height:800,width,scale:1,offsetTop:0,events:new Map(),addEventListener(type,handler){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(handler);}};
  const html=new Element('html');html.appendChild(body);

  const document={body,baseURI:'https://example.test/site/',readyState:'loading',events:documentEvents,getElementById(id){if(body.id===id)return body;let found=null;function visit(node){for(const child of node.children){if(child.id===id)found=child;visit(child);}}visit(body);return found;},documentElement:html,activeElement:body,querySelector:selector=>body.querySelector(selector),querySelectorAll:selector=>body.querySelectorAll(selector),createElement:tag=>new Element(tag),addEventListener(type,handler){if(!documentEvents.has(type))documentEvents.set(type,[]);documentEvents.get(type).push(handler);}};
  const context=vm.createContext({document,location:{href},URL,requestAnimationFrame:handler=>frames.push(handler),MutationObserver:class{constructor(callback){this.callback=callback;this.records=[];observers.push(this);}observe(target,options){this.target=target;this.options=options;}},console});
  context.window=context;context.events=windowEvents;context.matchMedia=()=>media;
  context.innerHeight=800;context.innerWidth=width;context.visualViewport=visualViewport;context.getComputedStyle=()=>({getPropertyValue:()=>''});context.setTimeout=callback=>{frames.push(callback);return frames.length;};context.clearTimeout=()=>{};
  context.addEventListener=(type,handler)=>{if(!windowEvents.has(type))windowEvents.set(type,[]);windowEvents.get(type).push(handler);};
  context.scrollTo=()=>windowScrolls++;context.scrollBy=()=>windowScrolls++;
  vm.runInContext(source,context,{filename:'nav-dropdown.js'});
  function layoutPrimaries(){
    if(!media.matches)return;
    const positions={home:8,map:64,ai:120};
    for(const item of nav.querySelectorAll('a[data-gn-bottom-primary]')){
      const left=positions[item.dataset.gnBottomPrimary];
      if(left!==undefined)item.rect={left,right:left+52,top:735,bottom:791};
    }
  }
  function start(){emit(document,'DOMContentLoaded');layoutPrimaries();flush();}

  function resize(value,width=value?390:1280){media.matches=value;context.innerWidth=width;visualViewport.width=width;nav.rect.right=width;emit(media,'change');emit(context,'resize');layoutPrimaries();flush();}
  function viewport(height,{scale=1,offsetTop=0}={}){visualViewport.height=height;visualViewport.scale=scale;visualViewport.offsetTop=offsetTop;emit(visualViewport,'resize');flush();}

  return{nav,body,document,context,link,emit,flush,start,resize,viewport,media,visualViewport,get focused(){return focused;},get windowScrolls(){return windowScrolls;},get trigger(){return document.getElementById('moreTrigger');},get menu(){return document.getElementById('moreMenu');},get links(){return nav.querySelectorAll('a[href]');}};
}

test('phone secondary titles stay accessible after outside clicks and hamburger closure',()=>{
  const page=navigation();page.start();
  const accessible=()=>{assert.equal(page.menu.inert,false);assert.equal(page.menu.getAttribute('aria-hidden'),'false');assert.equal(page.trigger.getAttribute('aria-expanded'),'true');};
  accessible();page.emit(page.document,'click',{target:page.body});accessible();
  page.nav.classList.add('open');page.flush();page.nav.classList.remove('open');page.flush();accessible();
  page.emit(page.menu,'click',{target:page.menu.querySelector('a')});accessible();
});

test('breakpoint changes restore desktop dropdown behavior and expose phone links again',()=>{
  const page=navigation();page.start();page.resize(false);
  assert.equal(page.menu.inert,true);assert.equal(page.menu.getAttribute('aria-hidden'),'true');
  page.emit(page.trigger,'click');assert.equal(page.menu.inert,false);assert.equal(page.trigger.getAttribute('aria-expanded'),'true');
  const escape=page.emit(page.document,'keydown',{key:'Escape',target:page.body});
  assert.equal(escape.defaultPrevented,true);assert.equal(page.menu.inert,true);assert.equal(page.focused,page.trigger);
  page.resize(true);assert.equal(page.menu.inert,false);assert.equal(page.menu.getAttribute('aria-hidden'),'false');
  page.resize(false);assert.equal(page.menu.inert,true);assert.equal(page.menu.classList.contains('open'),false);
});

test('desktop ArrowDown opens More and focuses its first destination',()=>{
  const page=navigation({mobile:false});page.start();
  const event=page.emit(page.trigger,'keydown',{key:'ArrowDown'});
  assert.equal(event.defaultPrevented,true);assert.equal(page.menu.inert,false);assert.equal(page.focused,page.menu.querySelector('a'));
  page.emit(page.document,'click',{target:page.body});assert.equal(page.menu.inert,true);
});

test('a header without More gains the complete canonical title list',()=>{
  const page=navigation({withMore:false});page.start();
  const hrefs=new Set(page.links.map(link=>link.getAttribute('href')));
  for(const href of ['index.html','weather.html','catalog.html','map.html','fishing.html','hunting.html','ai.html','donate.html','fishing-places.html','fishing-guide.html','fishing-guide.html#fgHuntPlacesSection','field-kit.html','catch-log.html','together.html','dashboard.html','dashboard.html#badges','dashboard.html#gnNotificationCenter','seasons.html','forests.html','red-book.html','knowledge.html','moon.html','safety.html','premium-extras.html','trial.html','premium.html'])assert.equal(hrefs.has(href),true,href);
  assert.equal(page.menu.inert,false);assert.equal(hrefs.size,page.links.length);
  for(const link of page.menu.querySelectorAll('a'))assert.ok(link.querySelector('.mt').textContent.trim());
});

test('exact destinations collapse on phones while distinct section destinations remain',()=>{
  const page=navigation();page.start();
  const map=page.links.filter(link=>new URL(link.href,page.document.baseURI).pathname.endsWith('/map.html'));
  assert.equal(map.length,2);assert.equal(map[0].dataset.gnMobileDuplicate,'false');assert.equal(map[1].dataset.gnMobileDuplicate,'true');
  for(const href of ['dashboard.html','dashboard.html#badges','dashboard.html#gnNotificationCenter','fishing-guide.html','fishing-guide.html#fgHuntPlacesSection']){
    const link=page.links.find(link=>link.href===href);assert.equal(link.dataset.gnMobileDuplicate,'false',href);
  }
});

test('late notification and account links keep their own nodes and listeners',()=>{
  const page=navigation();page.start();
  const notification=page.links.find(link=>link.href==='dashboard.html#gnNotificationCenter');let clicks=0;
  notification.addEventListener('click',()=>clicks++);
  const late=page.link('dashboard.html#customPanel');page.nav.appendChild(late);page.flush();
  const account=page.document.createElement('span'),profile=page.document.createElement('button');let profileClicks=0;
  account.className='gn-auth-slot';profile.addEventListener('click',()=>profileClicks++);account.appendChild(profile);page.nav.appendChild(account);page.flush();
  assert.equal(late.dataset.gnMobileDuplicate,'false');assert.equal(page.links.find(link=>link.href===notification.href),notification);
  page.emit(notification,'click');assert.equal(clicks,1);
  page.resize(false);page.resize(true);page.emit(profile,'click');assert.equal(profileClicks,1);assert.equal(account.children[0],profile);
  const duplicate=page.link('https://example.test/site/dashboard.html#gnNotificationCenter');page.nav.appendChild(duplicate);page.flush();
  assert.equal(duplicate.dataset.gnMobileDuplicate,'true');assert.equal(notification.dataset.gnMobileDuplicate,'false');
});

test('the selected section title is revealed inside the row without scrolling the page',()=>{
  const page=navigation({href:'https://example.test/site/dashboard.html#badges'});
  const badge=page.links.find(link=>link.href==='dashboard.html#badges');badge.rect={left:360,right:460,top:65,bottom:113};page.start();
  assert.equal(badge.getAttribute('aria-current'),'page');assert.equal(badge.classList.contains('active'),true);assert.equal(badge.rect.right-page.nav.scrollLeft,page.nav.rect.right-12);assert.ok(badge.rect.left-page.nav.scrollLeft>=180);assert.equal(page.windowScrolls,0);
  page.context.location.href='https://example.test/site/dashboard.html';page.emit(page.context,'hashchange');page.flush();
  assert.equal(badge.getAttribute('aria-current'),null);assert.equal(page.links.find(link=>link.href==='dashboard.html').getAttribute('aria-current'),'page');assert.equal(page.windowScrolls,0);
});


test('phone pin metadata marks only original home, map and AI destinations without rewriting desktop labels',()=>{
  const page=navigation();page.start();
  const pinned=page.links.filter(link=>link.dataset.gnBottomPrimary);
  assert.deepEqual(pinned.map(link=>link.dataset.gnBottomPrimary).sort(),['ai','home','map']);
  assert.equal(new Set(pinned.map(link=>new URL(link.href,page.document.baseURI).href)).size,3);
  const duplicateMap=page.links.find(link=>link.href==='./map.html');
  assert.equal(duplicateMap.dataset.gnBottomPrimary,'');
  const weather=page.links.find(link=>link.href==='weather.html');
  const fishing=page.links.find(link=>link.href==='fishing.html');
  assert.equal(weather.dataset.gnBottomOrder,'weather');
  assert.equal(fishing.dataset.gnBottomOrder,'fishing');
  assert.equal(fishing.dataset.gnNavLabel,'თევზაობა');
  const originalText=fishing.textContent;
  const notification=page.links.find(link=>link.href==='dashboard.html#gnNotificationCenter');
  assert.equal(notification.dataset.gnNavLabel,'შეტყობინებები');
  page.resize(false);
  assert.equal(fishing.textContent,originalText);
  assert.equal(page.links.find(link=>link.href===notification.href),notification);
  assert.equal(page.menu.inert,true);
});

test('a focused swipe destination clears the pinned area while pinned links never change rail scroll',()=>{
  const page=navigation({href:'https://example.test/site/ai.html'});page.start();
  const ai=page.links.find(link=>link.href==='ai.html');
  assert.equal(ai.getAttribute('aria-current'),'page');
  page.nav.scrollLeft=200;
  page.emit(page.nav,'focusin',{target:ai});page.flush();
  assert.equal(page.nav.scrollLeft,200);
  const destination=page.links.find(link=>link.href==='premium.html');
  destination.rect={left:90,right:180,top:735,bottom:791};
  page.emit(page.nav,'focusin',{target:destination});page.flush();
  assert.equal(page.nav.scrollLeft,110);
  assert.equal(destination.rect.left+(200-page.nav.scrollLeft),180);
  assert.equal(page.windowScrolls,0);
});

test('landscape and tablet widths retain the pinned phone rail until the desktop breakpoint',()=>{
  const page=navigation({mobile:true,width:900});page.start();
  const destination=page.links.find(link=>link.href==='premium.html');
  destination.rect={left:90,right:180,top:735,bottom:791};page.nav.scrollLeft=160;
  page.emit(page.nav,'focusin',{target:destination});page.flush();
  assert.equal(page.nav.scrollLeft,70);
  assert.equal(destination.rect.left+(160-page.nav.scrollLeft),180);
  assert.equal(page.menu.inert,false);
  page.resize(false,1280);
  assert.equal(page.menu.inert,true);
  page.nav.scrollLeft=120;page.emit(page.nav,'focusin',{target:destination});page.flush();
  assert.equal(page.nav.scrollLeft,120,'desktop dropdown never pans the old rail');
});

test('the real feedback button and its click listener survive phone, tablet and desktop placement',()=>{
  const page=navigation();page.start();
  const fab=page.document.createElement('button');fab.className='gn-feedback-fab';
  let clicks=0;fab.addEventListener('click',()=>clicks++);
  page.body.appendChild(fab);page.flush();
  assert.equal(page.document.querySelector('.gn-feedback-fab'),fab);
  assert.equal(fab.parentElement,page.nav);
  assert.equal(fab.dataset.gnBottomFeedback,'true');
  page.emit(fab,'click');assert.equal(clicks,1);
  page.resize(true,900);assert.equal(fab.parentElement,page.nav);
  page.resize(false);assert.equal(fab.parentElement,page.body);
  page.resize(true,390);assert.equal(fab.parentElement,page.nav);
  page.emit(fab,'click');assert.equal(clicks,2);
  assert.equal(page.body.querySelectorAll('.gn-feedback-fab').length,1);
});

test('only a focused editor with actual unzoomed keyboard-sized viewport reduction hides phone navigation',()=>{
  const page=navigation();page.start();
  const field=page.document.createElement('textarea');page.body.appendChild(field);page.flush();
  page.viewport(500);
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),false,'ordinary unfocused resize');
  page.viewport(800);field.focus();page.flush();
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),false,'focus alone');
  page.viewport(700);
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),false,'small toolbar reduction');
  page.viewport(500,{scale:1.5});
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),false,'pinch zoom');
  page.viewport(500);
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),true,'keyboard-sized reduction');
  field.blur();page.flush();
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),false,'dismissed editor');
  field.focus();page.flush();page.resize(false);
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),false,'desktop stays visible');
});

test('contenteditable keyboard detection tolerates layout viewport shrink and resets on rotation',()=>{
  const page=navigation();page.start();
  const editor=page.document.createElement('div');editor.setAttribute('contenteditable','true');page.body.appendChild(editor);page.flush();editor.focus();
  page.context.innerHeight=500;page.viewport(500);
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),true,'retains original height through native resize');
  page.context.innerWidth=700;page.context.innerHeight=390;page.visualViewport.height=390;
  page.emit(page.context,'resize');page.flush();
  assert.equal(page.body.classList.contains('gn-mobile-keyboard'),false,'rotation establishes new baseline');
  assert.equal(page.windowScrolls,0);
});

test('window resize relocates the original feedback button before delayed media-query notifications',()=>{
  const page=navigation({mobile:false});
  const fab=page.document.createElement('button');fab.className='gn-feedback-fab';
  let clicks=0;fab.addEventListener('click',()=>clicks++);
  page.body.appendChild(fab);page.start();assert.equal(fab.parentElement,page.body);
  // Browsers may update the matching viewport before dispatching MQL change.
  page.media.matches=true;page.context.innerWidth=390;page.visualViewport.width=390;
  page.emit(page.context,'resize');page.flush();
  assert.equal(fab.parentElement===page.nav,true,'resize alone must restore the mobile feedback control');
  assert.equal(page.document.querySelector('.gn-feedback-fab')===fab,true);
  page.emit(fab,'click');assert.equal(clicks,1);
  page.media.matches=false;page.context.innerWidth=1280;page.visualViewport.width=1280;
  page.emit(page.context,'resize');page.flush();
  assert.equal(fab.parentElement===page.body,true,'resize alone must restore desktop placement');
  assert.equal(page.body.querySelectorAll('.gn-feedback-fab').length,1);
});


test('CSS navigation labels remain accessible, translate to English and preserve unread announcement labels',()=>{
  const page=navigation();page.start();
  for(const link of page.links.filter(link=>link.dataset.gnMobileDuplicate==='false')){
    assert.ok(link.getAttribute('aria-label')?.trim(),link.href);
    assert.equal(link.getAttribute('aria-label'),link.dataset.gnNavLabel,link.href);
  }
  const home=page.links.find(link=>link.href==='index.html');
  const map=page.links.find(link=>link.href==='map.html');
  const notification=page.links.find(link=>link.href==='dashboard.html#gnNotificationCenter');
  const unread='შეტყობინებები — 3 წაუკითხავი';notification.setAttribute('aria-label',unread);
  const fab=page.document.createElement('button');fab.className='gn-feedback-fab';page.body.appendChild(fab);page.flush();
  assert.equal(fab.getAttribute('aria-label'),'უკუკავშირი');
  page.context.GN_TRANSLATIONS={'მთავარი':'Home','რუკა':'Map','AI':'AI','შეტყობინებები':'Notifications'};
  page.document.documentElement.lang='en';
  home.textContent='Home';map.textContent='Map';page.flush();
  assert.equal(home.dataset.gnNavLabel,'Home');assert.equal(home.getAttribute('aria-label'),'Home');
  assert.equal(map.dataset.gnNavLabel,'Map');assert.equal(map.getAttribute('aria-label'),'Map');
  assert.equal(notification.dataset.gnNavLabel,'Notifications');
  assert.equal(notification.getAttribute('aria-label'),unread,'the unread counter owns this accessible label');
  page.document.documentElement.lang='ka';home.textContent='მთავარი';map.textContent='რუკა';page.flush();
  assert.equal(home.getAttribute('aria-label'),'მთავარი');assert.equal(map.getAttribute('aria-label'),'რუკა');
  assert.equal(notification.getAttribute('aria-label'),unread);
});
