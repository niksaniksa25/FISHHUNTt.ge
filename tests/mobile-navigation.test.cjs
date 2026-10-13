const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../js/nav-dropdown.js'),'utf8');

function navigation({mobile=true,withMore=true,href='https://example.test/site/index.html',direct=['index.html','map.html'],secondary=['./map.html','dashboard.html','dashboard.html#badges']}={}){
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
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attributes=new Map();this.dataset={};this.events=new Map();this.scrollLeft=0;this.inert=false;this.textContent='';this.rect={left:0,right:100,top:0,bottom:44};}
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
    appendChild(child){child.parentElement=this;this.children.push(child);mutation(this,'childList');return child;}
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
    getBoundingClientRect(){return {...this.rect};}
    focus(){focused=this;}
  }
  function matches(node,selector){
    if(selector.startsWith('.'))return node.classList.contains(selector.slice(1));
    const match=selector.match(/^([a-z]+)(?:\[([^\]]+)\])?$/i);
    return Boolean(match&&node.tagName===match[1].toUpperCase()&&(!match[2]||node.getAttribute(match[2])!==null));
  }
  const body=new Element('body'),nav=new Element('nav');nav.id='nav';nav.rect={left:10,right:210,top:65,bottom:113};body.appendChild(nav);
  const link=href=>{const node=new Element('a');node.href=href;node.textContent=href;return node;};
  direct.forEach(href=>nav.appendChild(link(href)));
  if(withMore){
    const wrap=new Element('div'),trigger=new Element('button'),menu=new Element('div');
    wrap.className='more-wrap';trigger.id='moreTrigger';trigger.className='more-trigger';menu.id='moreMenu';menu.className='more-menu';
    secondary.forEach(href=>menu.appendChild(link(href)));wrap.append(trigger,menu);nav.appendChild(wrap);
  }
  const media={matches:mobile,events:new Map(),addEventListener(type,handler){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(handler);}};
  const document={baseURI:'https://example.test/site/',readyState:'loading',events:documentEvents,getElementById(id){if(body.id===id)return body;let found=null;function visit(node){for(const child of node.children){if(child.id===id)found=child;visit(child);}}visit(body);return found;},createElement:tag=>new Element(tag),addEventListener(type,handler){if(!documentEvents.has(type))documentEvents.set(type,[]);documentEvents.get(type).push(handler);}};
  const context=vm.createContext({document,location:{href},URL,requestAnimationFrame:handler=>frames.push(handler),MutationObserver:class{constructor(callback){this.callback=callback;this.records=[];observers.push(this);}observe(target,options){this.target=target;this.options=options;}},console});
  context.window=context;context.events=windowEvents;context.matchMedia=()=>media;
  context.addEventListener=(type,handler)=>{if(!windowEvents.has(type))windowEvents.set(type,[]);windowEvents.get(type).push(handler);};
  context.scrollTo=()=>windowScrolls++;context.scrollBy=()=>windowScrolls++;
  vm.runInContext(source,context,{filename:'nav-dropdown.js'});
  function start(){emit(document,'DOMContentLoaded');flush();}
  function resize(value){media.matches=value;emit(media,'change');flush();}
  return{nav,body,document,context,link,emit,flush,start,resize,media,get focused(){return focused;},get windowScrolls(){return windowScrolls;},get trigger(){return document.getElementById('moreTrigger');},get menu(){return document.getElementById('moreMenu');},get links(){return nav.querySelectorAll('a[href]');}};
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
  assert.equal(badge.getAttribute('aria-current'),'page');assert.equal(badge.classList.contains('active'),true);assert.equal(page.nav.scrollLeft,258);assert.equal(page.windowScrolls,0);
  page.context.location.href='https://example.test/site/dashboard.html';page.emit(page.context,'hashchange');page.flush();
  assert.equal(badge.getAttribute('aria-current'),null);assert.equal(page.links.find(link=>link.href==='dashboard.html').getAttribute('aria-current'),'page');assert.equal(page.windowScrolls,0);
});
