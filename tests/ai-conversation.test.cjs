'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual chat controller without sending requests to the public AI.
function conversation(respond = async () => ({ok:true, answer:'პასუხი მზადაა'})) {
  const nodes = new Map(), requests = [], reveals = [], innerScrolls = [], htmlWrites = [], timers = new Map();
  let timerId = 0, context;
  class Element {
    constructor(id = '') {
      this.id = id;
      this.value = '';
      this.dataset = {};
      this.attributes = {};
      this.children = [];
      this.listeners = new Map();
      this.style = {setProperty(){}, getPropertyValue(){return '';}};
      this.disabled = false;
      this.hidden = false;
      this._scrollTop = 0;
      this.clientHeight = 280;
      this.clientWidth = 360;
      this.isConnected = true;
      this._text = '';
      this._html = '';
      const classes = new Set();
      this.classList = {
        add(...names){names.forEach(name => classes.add(name));},
        remove(...names){names.forEach(name => classes.delete(name));},
        contains(name){return classes.has(name);},
        toggle(name, force){const add=force === undefined ? !classes.has(name) : force; add ? classes.add(name) : classes.delete(name); return add;}
      };
    }
    set textContent(text) {this._text = String(text); this.children = [];}
    get textContent() {return this._text + this.children.map(child => child.textContent).join('');}
    set innerHTML(html) {
      this._html = String(html);
      this._text = '';
      this.children = [];
      htmlWrites.push({target:this, value:this._html});
      if (this.id === 'questionList') {
        for (const match of this._html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
          const button = new Element();
          button.textContent = match[1];
          this.appendChild(button);
        }
      }
    }
    get innerHTML() {return this._html;}
    setAttribute(name, value) {this.attributes[name] = String(value);}
    getAttribute(name) {return this.attributes[name] ?? null;}
    removeAttribute(name) {delete this.attributes[name];}
    appendChild(child) {child.parentElement = this; this.children.push(child); return child;}
    append(...children) {children.forEach(child => this.appendChild(child));}
    replaceChildren(...children) {this.children = []; this._text = ''; this.append(...children);}
    querySelectorAll(selector) {return selector === 'button' ? this.children : [];}
    querySelector() {return null;}
    addEventListener(type, handler) {if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler);}
    dispatchEvent(event) {
      this['on' + event.type]?.(event);
      for (const listener of this.listeners.get(event.type) || []) listener(event);
      return !event.defaultPrevented;
    }
    focus() {context.document.activeElement = this;}
    get boxHeight() {return Math.max(64, Math.ceil(this.textContent.length / 48) * 20);}
    get scrollHeight() {return this.children.reduce((height, child) => height + child.boxHeight, 0);}
    get scrollTop() {return this._scrollTop;}
    set scrollTop(value) {
      // A real overflow container cannot scroll beyond its current content.
      this._scrollTop = Math.max(0, Math.min(Number(value) || 0, Math.max(0, this.scrollHeight - this.clientHeight)));
      if (this.id === 'chatMessages') innerScrolls.push({top:this._scrollTop, lastMessage:this.children.at(-1)?.textContent});
    }
    get offsetTop() {
      const siblings=this.parentElement?.children || [];
      return siblings.slice(0, siblings.indexOf(this)).reduce((height, child) => height + child.boxHeight, 0);
    }
    getBoundingClientRect() {
      const isMessage=this.parentElement?.id === 'chatMessages';
      const top=isMessage ? this.parentElement.getBoundingClientRect().top + this.offsetTop - this.parentElement.scrollTop : 160;
      const height=isMessage ? this.boxHeight : 280;
      return {top, bottom:top + height, left:0, right:360, width:360, height};
    }
    scrollIntoView(options) {reveals.push({target:this, options, lastMessage:node('chatMessages').children.at(-1)?.textContent});}
    scrollTo(options) {this.scrollTop = typeof options === 'number' ? options : options.top;}
    insertAdjacentHTML(position, html) {htmlWrites.push({target:this, value:html});}
    closest(selector) {return selector === 'form' ? node('aiComposer') : null;}
  }
  function node(id) {if (!nodes.has(id)) nodes.set(id, new Element(id)); return nodes.get(id);}
  const tabs = ['quick','weather','fishing','fish','wild','place','site'].map(category => {
    const tab = new Element('tab-' + category);
    tab.dataset.aiCat = category;
    return tab;
  });
  node('aiCategoryTabs').querySelectorAll = () => tabs;
  const document = {
    getElementById:node,
    createElement:() => new Element(),
    querySelector:selector => selector === '.header' ? node('header') : null,
    querySelectorAll:() => [],
    activeElement:node('aiInput'),
    documentElement:node('html'),
    body:node('body'),
    visibilityState:'visible'
  };
  context = vm.createContext({
    Date, Intl, AbortController, DOMException, URL, console,
    FISHES:[['browntrout','კალმახი','Brown trout','მტკნარი','მდინარე','საქართველო','0.3–4 კგ','8–18°C','1005–1020 hPa','0–12 კმ/სთ','დილა','Salmo trutta']],
    HUNTING_WILDLIFE:[], WATERS:[], document,
    location:{hostname:'niksaniksa25.github.io', origin:'https://niksaniksa25.github.io'},
    GN_AI_WORKER_ORIGIN:'https://fishhunt-demo.example.workers.dev',
    innerHeight:740, innerWidth:390, scrollY:0,
    getComputedStyle:() => ({getPropertyValue:() => '118px'}),
    matchMedia:() => ({matches:false}),
    requestAnimationFrame:callback => {callback(); return 1;},
    cancelAnimationFrame(){}, scrollTo(){}, scrollBy(){},
    setTimeout(callback, delay) {const id=++timerId; timers.set(id, {callback, delay}); return id;},
    clearTimeout(id) {timers.delete(id);},
    fetch:async (url, options) => {
      const request = {url, options, payload:JSON.parse(options.body)};
      requests.push(request);
      const reply = await respond(request);
      if (reply && typeof reply.json === 'function') return reply;
      return {ok:true, json:async () => reply};
    }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ai.js'), 'utf8'), context);
  context.initAI();
  const event = (type, extra = {}) => ({type, defaultPrevented:false, preventDefault(){this.defaultPrevented = true;}, ...extra});
  return {
    node, requests, reveals, innerScrolls, htmlWrites, timers, tabs, context,
    submit(text) {if (text !== undefined) node('aiInput').value = text; node('aiComposer').dispatchEvent(event('submit'));},
    key(extra) {const e=event('keydown', extra); node('aiInput').dispatchEvent(e); return e;},
    async settle() {await new Promise(resolve => setImmediate(resolve));}
  };
}

test('pending submissions keep the next draft and prevent duplicate model calls', async () => {
  let resolve;
  const app = conversation(() => new Promise(done => {resolve=done;}));
  app.submit('პირველი კითხვა');
  assert.equal(app.requests.length, 1);
  assert.equal(app.node('aiInput').value, '');
  assert.equal(app.node('aiSend').disabled, true);

  app.submit('შემდეგი, ჯერ გაუგზავნელი კითხვა');
  app.key({key:'Enter', isComposing:false, shiftKey:false});
  app.node('questionList').children[0].dispatchEvent({type:'click', preventDefault(){}});
  assert.equal(app.requests.length, 1);
  assert.equal(app.node('aiInput').value, 'შემდეგი, ჯერ გაუგზავნელი კითხვა');

  resolve({ok:true, answer:'პირველი პასუხი'});
  await app.settle();
  assert.equal(app.node('aiSend').disabled, false);
  assert.equal(app.node('aiInput').value, 'შემდეგი, ჯერ გაუგზავნელი კითხვა');
  assert.match(app.node('aiStatus').textContent, /პასუხი მზადაა/);
});

test('IME composition and Shift+Enter do not submit; ordinary Enter submits once', async () => {
  const app = conversation();
  app.node('aiInput').value = 'კალმახზე კითხვა';
  assert.equal(app.key({key:'Enter', isComposing:true, shiftKey:false}).defaultPrevented, false);
  assert.equal(app.key({key:'Enter', isComposing:false, shiftKey:true}).defaultPrevented, false);
  assert.equal(app.requests.length, 0);
  assert.equal(app.node('aiInput').value, 'კალმახზე კითხვა');
  assert.equal(app.key({key:'Enter', isComposing:false, shiftKey:false}).defaultPrevented, true);
  await app.settle();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].payload.message, 'კალმახზე კითხვა');
});

test('provider and network failures leave an honest error state and allow another attempt', async t => {
  for (const failure of ['provider','network','empty']) {
    await t.test(failure, async () => {
      let call=0;
      const app = conversation(async () => {
        call++;
        if (call > 1) return {ok:true, answer:'ახლა პასუხი მოვიდა'};
        if (failure === 'network') throw new Error('ქსელი მიუწვდომელია');
        if (failure === 'empty') return {ok:true, answer:''};
        return {ok:false, json:async () => ({ok:false, message:'მოდელი მიუწვდომელია'})};
      });
      app.submit('რატომ ვერ პასუხობ?');
      await app.settle();
      assert.match(app.node('aiStatus').textContent, /პასუხი ვერ მივიღეთ/);
      assert.doesNotMatch(app.node('aiStatus').textContent, /პასუხი მზადაა|რეალური მოდელი/);
      assert.equal(app.node('aiSend').disabled, false);
      assert.equal(app.timers.size, 0);
      app.submit('ხელახლა ვცადოთ');
      await app.settle();
      assert.equal(app.requests.length, 2);
      assert.match(app.node('aiStatus').textContent, /პასუხი მზადაა/);
    });
  }
});

test('a stalled model request is aborted and releases the composer', async () => {
  const app = conversation(request => new Promise((resolve, reject) => {
    request.options.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), {once:true});
  }));
  app.submit('დიდხანს ხომ არ გელოდო?');
  const timeout = [...app.timers.values()].find(item => item.delay === 30000);
  assert.ok(timeout, 'the browser request must have a finite 30-second timeout');
  timeout.callback();
  await app.settle();
  assert.equal(app.requests[0].options.signal.aborted, true);
  assert.equal(app.node('aiSend').disabled, false);
  assert.match(app.node('aiStatus').textContent, /პასუხი ვერ მივიღეთ/);
  assert.equal(app.timers.size, 0);
});

test('model and user HTML remain inert text while answer line breaks are preserved', async () => {
  const user='<img src=x onerror="window.badUser=true">';
  const answer='<img src=x onerror="window.badModel=true">\nმეორე ხაზი';
  const app = conversation(async () => ({ok:true, answer}));
  app.submit(user);
  await app.settle();
  const bubbles=app.node('chatMessages').children;
  assert.equal(bubbles[0].textContent, user);
  assert.equal(bubbles[1].textContent, answer);
  assert.equal(app.htmlWrites.some(write => write.value.includes(user) || write.value.includes(answer)), false);
  assert.equal(app.context.badUser, undefined);
  assert.equal(app.context.badModel, undefined);
});

test('follow-up requests retain selected species and only the last eight prior turns', async () => {
  const app = conversation(async request => ({ok:true, answer:'პასუხი ' + request.payload.message}));
  app.tabs.find(tab => tab.dataset.aiCat === 'fish').dispatchEvent({type:'click', preventDefault(){}});
  app.node('aiEntity').value='0';
  for (let i=0; i<12; i++) {
    app.submit('კითხვა ' + i);
    await app.settle();
  }
  assert.equal(app.requests.length, 12);
  assert.equal(app.requests[0].payload.history.length, 0);
  const last=app.requests.at(-1).payload;
  assert.equal(last.message, 'კითხვა 11');
  assert.equal(last.context.category, 'fish');
  assert.equal(last.context.entity, 'კალმახი');
  assert.equal(last.history.length, 8);
  assert.deepEqual(last.history[0], {role:'user', content:'კითხვა 7'});
  assert.deepEqual(last.history.at(-1), {role:'assistant', content:'პასუხი კითხვა 10'});
});

test('an unselected species placeholder does not invent a first-species context', async () => {
  const app = conversation();
  app.tabs.find(tab => tab.dataset.aiCat === 'fish').dispatchEvent({type:'click', preventDefault(){}});
  assert.equal(app.node('aiEntity').value, '');
  app.submit('რომელი თევზი ავირჩიო?');
  await app.settle();
  assert.equal(app.requests[0].payload.context.category, 'fish');
  assert.equal(app.requests[0].payload.context.entity, '');
});

test('long Georgian answers remain visible while follow-up history fits the bounded UTF-8 gateway body',async()=>{
  const answer='გრძელი პასუხი '.repeat(400).trim(),app=conversation(async()=>({ok:true,answer}));
  for(let i=0;i<7;i++){app.submit('ქართული შეკითხვა '+i+' '+ 'თევზი '.repeat(150));await app.settle();}
  const last=app.requests.at(-1);
  assert.equal(last.payload.history.length,8);
  assert.ok(last.payload.history.every(turn=>turn.content.length<=1200));
  assert.ok(Buffer.byteLength(last.options.body,'utf8')<64000);
  assert.equal(app.node('chatMessages').children.at(-1).textContent,answer);
});

test('failed questions return to an empty composer without replacing a newer draft',async()=>{
  let reject;
  const app=conversation(()=>new Promise((_,fail)=>{reject=fail;}));
  app.submit('პირველი შეკითხვა');reject(new Error('დროებითი შეცდომა'));await app.settle();
  assert.equal(app.node('aiInput').value,'პირველი შეკითხვა');
  app.submit('ხელახლა ვცადოთ');app.node('aiInput').value='შემდეგი მონახაზი';reject(new Error('დროებითი შეცდომა'));await app.settle();
  assert.equal(app.node('aiInput').value,'შემდეგი მონახაზი');
});

test('the completed long answer is revealed from its beginning, not only the pending placeholder', async () => {
  const answer='პასუხის დასაწყისი\n' + 'დეტალური ახსნა '.repeat(350) + '\nპასუხის დასასრული';
  const app = conversation(async () => ({ok:true, answer}));
  const old=app.context.document.createElement('div');
  old.textContent='წინა საუბრის ჩანაწერი '.repeat(100);
  app.node('chatMessages').appendChild(old);
  app.submit('გრძელი ახსნა მინდა');
  await app.settle();
  const bubble=app.node('chatMessages').children.at(-1);
  const reveal=app.reveals.findLast(item => item.target === app.node('aiChat') && item.lastMessage === answer);
  assert.ok(reveal, 'the chat panel must be brought below the sticky header after the response completes');
  assert.equal(reveal.options.block, 'start');
  assert.ok(app.innerScrolls.some(scroll => scroll.lastMessage === answer), 'completed content must update the chat-local scroll position');
  const start=bubble.getBoundingClientRect().top - app.node('chatMessages').getBoundingClientRect().top;
  assert.ok(start >= 0 && start <= 24, 'the beginning of the reply should be visible at the top of the message viewport');
  assert.equal(bubble.textContent, answer);
});
