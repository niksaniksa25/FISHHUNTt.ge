const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function fixture({language='ka',blocked=false,writeBlocked=false}={}){
  let stored=language,reloads=0,button=null;
  const parent={dataset:{},childNodes:[]},text={nodeType:3,nodeValue:'მთავარი',parentElement:parent};parent.childNodes=[text];
  const header={appendChild(node){button=node;}},document={documentElement:{lang:'ka'},body:{},getElementById:()=>button,querySelector:selector=>selector==='#nav'?header:null,querySelectorAll:()=>parent.dataset.gnKa?[parent]:[],createElement:()=>({setAttribute(name,value){this[name]=value;}}),createTreeWalker:()=>{let index=0;return {nextNode(){if(index++)return false;this.currentNode=text;return true;}};},addEventListener(type,run){if(type==='DOMContentLoaded')run();}};
  const context=vm.createContext({document,NodeFilter:{SHOW_TEXT:4},Node:{TEXT_NODE:3,ELEMENT_NODE:1},localStorage:{getItem(){if(blocked)throw Error('blocked');return stored;},setItem(key,value){if(blocked||writeBlocked)throw Error('blocked');stored=value;}},location:{reload(){reloads++;}},GN_TRANSLATIONS:{'მთავარი':'Home'}});
  context.window=context;vm.runInContext(fs.readFileSync(require.resolve('../js/i18n.js'),'utf8'),context);
  return {document,text,get button(){return button;},get stored(){return stored;},get reloads(){return reloads;}};
}

test('blocked storage cannot crash language bootstrap and the toggle remains usable on the current page',()=>{
  const app=fixture({blocked:true});assert.equal(app.document.documentElement.lang,'ka');assert.equal(app.button.textContent,'EN');
  app.button.onclick();assert.equal(app.document.documentElement.lang,'en');assert.equal(app.text.nodeValue,'Home');assert.equal(app.button.textContent,'ქართულად');assert.equal(app.reloads,0);assert.match(app.button.title,/შენახვა მიუწვდომელია/);
  app.button.onclick();assert.equal(app.document.documentElement.lang,'ka');assert.equal(app.text.nodeValue,'მთავარი');assert.equal(app.button.textContent,'EN');
});

test('language write failures retain the requested temporary language instead of reloading into the old one',()=>{
  const app=fixture({language:'en',writeBlocked:true});assert.equal(app.text.nodeValue,'Home');app.button.onclick();assert.equal(app.document.documentElement.lang,'ka');assert.equal(app.text.nodeValue,'მთავარი');assert.equal(app.stored,'en');assert.equal(app.reloads,0);
});

test('normal language selection still persists and reloads using the original preference key',()=>{
  const app=fixture();app.button.onclick();assert.equal(app.stored,'en');assert.equal(app.reloads,1);
});
