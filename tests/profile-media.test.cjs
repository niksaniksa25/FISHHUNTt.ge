const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
async function fixture(){
  const errors=[];
  function element(){return {style:{},dataset:{},attributes:{},setAttribute(name,value){this.attributes[name]=value;}};}
  const context={URLSearchParams,location:{protocol:'https:',hostname:'example.test',search:'',href:''},localStorage:{getItem(){return null;}},fetch:async()=>({ok:true,json:async()=>({ok:true,user:null})}),document:{head:{appendChild(){}},getElementById(){return null;},querySelector(){return null;},createElement:element,addEventListener(type,listener,capture){if(type==='error')errors.push({listener,capture});}}};
  context.window=context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/auth.js'),'utf8'),context);
  await context.GeoNatureAuth.renderHeader();
  function image(kind='avatar',alt='მელას ბილიკი'){
    const children=[],requests=[],parent={querySelector(){return children.find(child=>child.className==='gn-profile-image-placeholder')||null;},appendChild(child){children.push(child);}};
    const img={...element(),alt,parentElement:parent,dataset:{gnProfileImage:kind},matches:selector=>selector==='img[data-gn-profile-image]'};
    Object.defineProperty(img,'src',{set:value=>requests.push(value)});
    return {img,children,requests,fail:()=>errors[0].listener({target:img})};
  }
  return {image,errors,auth:context.GeoNatureAuth};
}
test('a failed avatar uses one local fallback without changing its original accessible name',async()=>{
  const f=await fixture(),image=f.image();image.fail();
  assert.deepEqual(image.requests,['assets/phone/river-avatar.webp']);
  assert.equal(image.img.alt,'მელას ბილიკი');assert.equal(image.img.hidden,undefined);
  image.fail();image.fail();
  assert.equal(image.requests.length,1);assert.equal(image.img.hidden,true);assert.equal(image.img.style.display,'none');
  assert.equal(image.children.length,1);assert.equal(image.children[0].attributes.role,'img');assert.equal(image.children[0].attributes['aria-label'],'მელას ბილიკი');assert.equal(image.children[0].textContent,'🐟');
});
test('a failed background thumbnail falls back to a landscape and terminates if it also fails',async()=>{
  const f=await fixture(),image=f.image('background','ტყის ფონი');image.fail();image.fail();
  assert.deepEqual(image.requests,['assets/phone/mountain-lake.webp']);assert.equal(image.children[0].textContent,'🌲');assert.equal(image.children[0].attributes['aria-label'],'ტყის ფონი');
});
test('header re-rendering does not install duplicate fallback handlers or change unrelated images',async()=>{
  const f=await fixture();await f.auth.renderHeader();assert.equal(f.errors.length,1);assert.equal(f.errors[0].capture,true);
  let changed=false;
  f.errors[0].listener({target:{matches:()=>false,set src(value){changed=true;}}});assert.equal(changed,false);
});
