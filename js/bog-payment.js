(function(){
'use strict';
const FALLBACK={plus:{name:'FishHunt Plus',regularPrice:5.99,currentPrice:2.99,days:3,saleActive:true},pro:{name:'FishHunt AI Pro',regularPrice:15,currentPrice:7.99,days:7,saleActive:true}};
const qs=new URLSearchParams(location.search),plan=qs.get('plan')==='pro'?'pro':'plus';
const termMonths=[1,3,6,12].includes(Number(qs.get('term')))?Number(qs.get('term')):1;
const base=String(window.GN_API_BASE_URL||document.querySelector('meta[name="gn-api-base"]')?.content||'').replace(/\/+$/,'');
const staticOnly=!base&&(location.protocol==='file:'||String(location.hostname||'').toLowerCase().endsWith('.github.io'));
let pricing=FALLBACK[plan],termData=null,promoCode='',promo=null,serviceAvailable=false,promoRequest=0,paying=false;
const $=id=>document.getElementById(id),fmt=value=>`${Number(value||0).toFixed(2)} ₾`;
const unavailable='გადახდის სერვისი ჯერ არ არის დაკავშირებული. ფასების ნახვა შეგიძლია; თანხა არ ჩამოგეჭრება და Premium არ გააქტიურდება.';
function localTermPricing(){const discount={1:0,3:.10,6:.15,12:.25}[termMonths],labels={1:'1 თვე',3:'3 თვე',6:'6 თვე',12:'1 წელი'},baseTotal=Math.round(pricing.currentPrice*termMonths*100)/100;return {label:labels[termMonths],baseTotal,finalTotal:Math.round(baseTotal*(1-discount)*100)/100};}
async function fetchPricing(){
  termData=localTermPricing();if(staticOnly)return;
  try{const response=await fetch(base+`/api/payments/pricing?plan=${plan}&term=${termMonths}`,{cache:'no-store'}),data=await response.json();
    if(!response.ok||!data.pricing||!Number.isFinite(Number(data.pricing.currentPrice)))throw Error('Pricing unavailable');
    pricing={...pricing,...data.pricing};termData=data.termPricing||localTermPricing();serviceAvailable=true;
  }catch{termData=localTermPricing();}
}
const PUBLIC_PROMOS={niko50:50,niko25:25,andro10:10,andro20:20,avtobest:100};
const normalize=code=>String(code||'').trim().toLowerCase().replace(/\s+/g,'');
function previewPromo(code){const key=normalize(code),percent=PUBLIC_PROMOS[key];if(percent===undefined)return null;const amount=Number(termData?.finalTotal??pricing.currentPrice),total=Math.round(amount*(1-percent/100)*100)/100;return {code:key,percent,total,freeActivation:percent===100&&total===0,label:`${key} • ${percent}% ფასდაკლება`,previewOnly:true};}
async function validate(code){
  const clean=normalize(code);if(!clean)throw Error('ჯერ შეიყვანე პრომო კოდი.');
  if(staticOnly||!serviceAvailable){const preview=previewPromo(clean);if(preview)return preview;throw Error('პრომო კოდის შემოწმება ამჟამად მიუწვდომელია.');}
  const response=await fetch(base+'/api/payments/promo/validate',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({plan,termMonths,code:clean})}),data=await response.json().catch(()=>({}));
  if(!response.ok||!data.valid)throw Error(data.message||'პრომო კოდი არასწორია. შეამოწმე და თავიდან სცადე.');
  if(!Number.isFinite(Number(data.total))||Number(data.total)<0)throw Error('პრომო კოდის ფასი ვერ დადასტურდა.');
  return data;
}
function updatePayButton(){const button=$('bogPayBtn');if(!button)return;button.disabled=!serviceAvailable||Boolean(promo?.previewOnly)||paying;button.textContent=!serviceAvailable||promo?.previewOnly?'გადახდა დროებით მიუწვდომელია':paying?'გადახდის გვერდი მზადდება…':promo?.freeActivation&&Number(promo.total)===0?'Premium-ის უფასოდ გააქტიურება':'BOG-ით გადახდა';}
function renderPrice(){
  const reference=Number(termData?.baseTotal??pricing.currentPrice),total=Number(promo?.total??termData?.finalTotal??pricing.currentPrice),saved=Math.max(0,Math.round((reference-total)*100)/100);
  for(const[id,value]of Object.entries({originalAmount:fmt(reference),discountAmount:'− '+fmt(saved),finalAmount:fmt(total)}))if($(id))$(id).textContent=value;
  const hero=$('payPrice');if(hero){hero.replaceChildren();if(reference>total){const old=document.createElement('s');old.textContent=fmt(reference);hero.append(old,' ');}const amount=document.createElement('strong');amount.textContent=fmt(total);const note=document.createElement('small');note.textContent=' • '+(termData?.label||'1 თვე')+(promo?' • '+promo.percent+'% პრომო':pricing.saleActive?' • ფასდაკლება':'');hero.append(amount,note);}
  updatePayButton();
}
function clearPromo(){promo=null;promoCode='';renderPrice();}
async function apply(code,status,button){
  const token=++promoRequest;button.disabled=true;status.textContent='პრომო კოდი მოწმდება…';
  try{const data=await validate(code);if(token!==promoRequest||normalize($('promoCode')?.value)!==normalize(code))return;promoCode=data.code||normalize(code);promo=data;renderPrice();status.textContent=data.previewOnly?`${data.label} • ${fmt(data.total)} — ფასის წინასწარი გამოთვლა. გააქტიურება ამჟამად მიუწვდომელია.`:data.freeActivation?`${data.label} — გადასახდელია 0.00 ₾. დააჭირე უფასო გააქტიურებას.`:`${data.label||data.percent+'% ფასდაკლება'} გამოყენებულია. გადასახდელია ${fmt(data.total)}.`;}
  catch(error){if(token!==promoRequest)return;clearPromo();status.textContent=error.message;}
  finally{if(token===promoRequest)button.disabled=false;}
}
function checkoutUrl(value){const url=new URL(String(value||''),document.baseURI);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('გადახდის უსაფრთხო მისამართი ვერ დადასტურდა.');return url.href;}
document.addEventListener('DOMContentLoaded',async()=>{
  const status=$('bogStatus'),button=$('bogPayBtn');status?.setAttribute('role','status');status?.setAttribute('aria-live','polite');if(button)button.disabled=true;
  await fetchPricing();const choices=$('termChoices');if(choices){choices.innerHTML=[{m:1,l:'1 თვე',s:'თვიური'},{m:3,l:'3 თვე',s:'10% ფასდაკლება'},{m:6,l:'6 თვე',s:'15% ფასდაკლება'},{m:12,l:'1 წელი',s:'25% ფასდაკლება'}].map(item=>`<button type="button" class="term-choice ${item.m===termMonths?'active':''}" data-term="${item.m}" aria-pressed="${item.m===termMonths}"><b>${item.l}</b><small>${item.s}</small></button>`).join('');choices.querySelectorAll('[data-term]').forEach(item=>item.onclick=()=>location.href=`payment.html?plan=${plan}&term=${item.dataset.term}`);}
  if($('plusSaleBanner'))$('plusSaleBanner').hidden=plan!=='plus'||!pricing.saleActive;if($('proSaleBanner'))$('proSaleBanner').hidden=plan!=='pro'||!pricing.saleActive;
  if($('payPlanTitle'))$('payPlanTitle').textContent=pricing.name;if($('payPlanText'))$('payPlanText').textContent=pricing.name+' • '+termData.label+' • '+fmt(termData.finalTotal);renderPrice();if(!serviceAvailable&&status)status.textContent=unavailable;
  const input=$('promoCode'),promoButton=$('applyPromoBtn'),promoStatus=$('promoStatus');if(promoButton)promoButton.onclick=()=>apply(input?.value,promoStatus,promoButton);
  if(input){input.setAttribute('autocapitalize','off');input.setAttribute('spellcheck','false');input.addEventListener('input',()=>{promoRequest++;if(promoButton)promoButton.disabled=false;if(promo){clearPromo();if(promoStatus)promoStatus.textContent='კოდი შეიცვალა — ხელახლა დააჭირე გამოყენებას.';}});input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();promoButton?.click();}});}
  if($('trialLink'))$('trialLink').href='trial.html?plan='+plan;
  if(button)button.onclick=async()=>{
    if(paying)return;if(!serviceAvailable||promo?.previewOnly){if(status)status.textContent=unavailable;return;}
    paying=true;updatePayButton();if(status)status.textContent=promoCode?'პრომო კოდი სერვერზე მოწმდება…':'გადახდის გვერდი მზადდება…';
    try{const response=await fetch(base+'/api/payments/bog/create-order',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({plan,termMonths,promoCode})}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||'გადახდის გვერდი ვერ შეიქმნა. სცადე მოგვიანებით.');
      if(data.freeActivation){if(!['plus','pro'].includes(data.plan))throw Error('გეგმის გააქტიურება ვერ დადასტურდა.');try{localStorage.setItem('gn_plan',data.plan);localStorage.setItem('gn_plan_updated_at',new Date().toISOString());if(Number(data.planExpiresAt)>Date.now())localStorage.setItem('gn_plan_expires_at',String(data.planExpiresAt));else localStorage.removeItem('gn_plan_expires_at');window.GNPremium?.setPlan?.(data.plan);}catch{throw Error('გააქტიურება სერვერზე დადასტურდა, მაგრამ ამ ბრაუზერში ვერ შეინახა. შენარჩუნებისთვის ანგარიშში შედი.');}if(status)status.textContent=data.accountUpdated?'Premium გააქტიურდა შენს ანგარიშზე.':'Premium გააქტიურდა ამ ბრაუზერში. სხვა მოწყობილობაზე არ გადადის.';button.textContent='Premium გააქტიურებულია';button.disabled=true;return;}
      if(!data.checkoutUrl)throw Error('გადახდის გვერდის მისამართი ვერ მივიღეთ.');location.href=checkoutUrl(data.checkoutUrl);
    }catch(error){if(status)status.textContent=error.message;paying=false;updatePayButton();}
  };
});
})();
