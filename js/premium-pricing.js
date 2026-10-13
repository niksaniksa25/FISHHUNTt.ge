(function(){
'use strict';
document.addEventListener('DOMContentLoaded',async()=>{
  const price=document.getElementById('plusPrice'),note=document.getElementById('plusSaleText');if(!price)return;
  const base=String(window.GN_API_BASE_URL||document.querySelector('meta[name="gn-api-base"]')?.content||'').replace(/\/+$/,'');
  if(!base&&(location.protocol==='file:'||String(location.hostname||'').toLowerCase().endsWith('.github.io'))){if(note)note.textContent='ფასის წინასწარი ჩვენება • გააქტიურება ჯერ მიუწვდომელია';return;}
  try{const response=await fetch(base+'/api/payments/pricing?plan=plus',{cache:'no-store'});if(!response.ok)return;const data=(await response.json()).pricing;if(!data||!Number.isFinite(Number(data.currentPrice)))return;
    price.replaceChildren();if(data.saleActive&&Number(data.regularPrice)>Number(data.currentPrice)){const old=document.createElement('s');old.className='old-price';old.textContent=Number(data.regularPrice).toFixed(2)+' ₾';price.append(old,' ');}const current=document.createElement('strong');current.textContent=Number(data.currentPrice).toFixed(2)+' ₾';const period=document.createElement('small');period.textContent=' / თვე';price.append(current,period);
    if(note)note.textContent=data.saleActive?'მოქმედი სპეციალური ფასი':'სტანდარტული ფასი';
  }catch{if(note)note.textContent='ფასის გადამოწმება დროებით მიუწვდომელია';}
});
})();
