(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) {
    root.FishHuntTripBudget = api;
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', api.init);
    else api.init();
  }
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const KEY = 'fishhunt_trip_budget_v1', MAX_BYTES = 18000;
  const LABELS = Object.freeze({distance:'მანძილი',consumption:'წვა',fuelPrice:'საწვავის ფასი',bait:'სატყუარა',food:'საკვები',other:'სხვა ხარჯი',participants:'მონაწილეების რაოდენობა'});
  const NUMERIC = ['distance','consumption','fuelPrice','bait','food','other','participants'];
  function defaultInput() {
    return {title:'',place:'',date:'',distance:'',returnTrip:false,consumption:'',fuelPrice:'',noFuel:false,bait:'',food:'',other:'',participants:'1'};
  }
  function error(message, field) { const result = new Error(message); if (field) result.field = field; return result; }
  function parseDecimal(value, {scale = 2, max = 1000000, integer = false} = {}) {
    if (integer) scale = 0;
    if (typeof value !== 'string' && typeof value !== 'number') throw error('მიუთითე დადებითი რიცხვი ან ნული.');
    if (typeof value === 'number' && !Number.isFinite(value)) throw error('რიცხვი არასწორია.');
    const raw = String(value).trim();
    if (!raw) return null;
    if (!Number.isInteger(scale) || scale < 0 || scale > 4 || !Number.isFinite(max) || max < 0) throw error('რიცხვის საზღვარი არასწორია.');
    if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)) throw error('გამოიყენე რიცხვი; ათწილადი გამოყავი წერტილით ან მძიმით.');
    const parts = raw.replace(',','.').split('.'), fraction = parts[1] || '';
    if (fraction.length > scale) throw error(scale ? 'მიუთითე მაქსიმუმ '+scale+' ათწილადი ნიშანი.' : 'მიუთითე მთელი რიცხვი.');
    const unit = 10 ** scale, whole = Number(parts[0] || 0), scaled = whole * unit + Number(fraction.padEnd(scale,'0') || 0);
    if (!Number.isSafeInteger(scaled) || scaled < 0 || scaled > max * unit) throw error('რიცხვი დაშვებულ საზღვარს სცდება.');
    return scaled;
  }
  function validDate(value) { return !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value; }
  function sanitizeInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw error('ბიუჯეტის მონაცემები არასწორია.');
    const output = defaultInput();
    for (const [key, max] of [['title',80],['place',120],['date',10]]) {
      if (value[key] === undefined) continue;
      if (typeof value[key] !== 'string' || value[key].length > max || /[\u0000-\u001f\u007f]/.test(value[key])) throw error('გადაამოწმე გასვლის სახელი, ადგილი და თარიღი.',key);
      output[key] = value[key].trim();
    }
    if (!validDate(output.date)) throw error('თარიღი არასწორია.','date');
    for (const key of ['returnTrip','noFuel']) {
      if (value[key] !== undefined && typeof value[key] !== 'boolean') throw error('ბიუჯეტის არჩევანი არასწორია.',key);
      if (value[key] !== undefined) output[key] = value[key];
    }
    for (const key of NUMERIC) {
      if (value[key] === undefined) continue;
      if (!['string','number'].includes(typeof value[key]) || String(value[key]).length > 24) throw error('გადაამოწმე: '+LABELS[key]+'.',key);
      output[key] = String(value[key]).trim();
    }
    return output;
  }
  function calculate(value = defaultInput()) {
    const input = sanitizeInput(value), missing = [];
    const read = (key, options) => {
      try { const result = parseDecimal(input[key],options); if (result === null) missing.push(key); return result; }
      catch (cause) { throw error(LABELS[key]+': '+cause.message,key); }
    };
    const participants = read('participants',{integer:true,max:50});
    if (participants === 0) throw error('მონაწილეების რაოდენობა უნდა იყოს 1–50.','participants');
    let knownTotalCents = 0;
    for (const key of ['bait','food','other']) { const cost = read(key); if (cost !== null) knownTotalCents += cost; }
    let fuelCents = 0, fuelDistanceHundredths = null;
    if (!input.noFuel) {
      const distance = read('distance',{max:100000}), consumption = read('consumption',{max:100}), price = read('fuelPrice',{max:100});
      fuelCents = null;
      if ([distance,consumption,price].every(item => item !== null)) {
        fuelDistanceHundredths = distance * (input.returnTrip ? 2 : 1);
        // Inputs are scaled integers. Round the final fuel cost once, in cents.
        const numerator = BigInt(fuelDistanceHundredths) * BigInt(consumption) * BigInt(price);
        fuelCents = Number((numerator + 500000n) / 1000000n);
      }
    }
    if (fuelCents !== null) knownTotalCents += fuelCents;
    const complete = missing.length === 0, totalCents = complete ? knownTotalCents : null;
    let shares = null;
    if (complete) {
      const lowCents = Math.floor(totalCents / participants), highCount = totalCents % participants;
      shares = {lowCents,highCents:lowCents+(highCount ? 1 : 0),highCount,lowCount:participants-highCount};
    }
    return {complete,knownTotalCents,totalCents,missing,fuelCents,fuelDistanceHundredths,participants,shares};
  }
  function formatMoney(cents) { return Number.isSafeInteger(cents) && cents >= 0 ? Math.floor(cents/100)+'.'+String(cents%100).padStart(2,'0')+' ₾' : '—'; }
  function splitText(result) {
    if (!result.shares) return 'გაყოფა გამოჩნდება სრული ბიუჯეტისა და მონაწილეების მითითების შემდეგ.';
    const share = result.shares;
    return share.highCount ? share.highCount+' მონაწილე × '+formatMoney(share.highCents)+' + '+share.lowCount+' მონაწილე × '+formatMoney(share.lowCents) : result.participants+' მონაწილე × '+formatMoney(share.lowCents);
  }
  function summaryText(value) {
    const input = sanitizeInput(value), result = calculate(input);
    const rows = ['FishHunt · '+(input.title || 'გასვლის ბიუჯეტი')];
    if (input.place) rows.push('ადგილი: '+input.place);
    if (input.date) rows.push('თარიღი: '+input.date);
    if (input.noFuel) rows.push('საწვავი: არ შედის');
    else rows.push('საწვავი: '+formatMoney(result.fuelCents)+(result.fuelDistanceHundredths === null ? '' : ' · '+(result.fuelDistanceHundredths/100)+' კმ, '+(input.returnTrip?'ორმხრივი გზა':'სრული მარშრუტი')));
    for (const key of ['bait','food','other']) rows.push(LABELS[key]+': '+(input[key] === ''?'არ არის მითითებული':formatMoney(parseDecimal(input[key]))));
    rows.push((result.complete?'სულ: ':'მითითებული ხარჯების ჯამი: ')+formatMoney(result.knownTotalCents));
    if (result.complete) rows.push(splitText(result));
    else rows.push('ბიუჯეტი არასრულია · შესავსებია: '+result.missing.map(key=>LABELS[key]).join(', '));
    rows.push('ხარჯების პირადი შეფასება; ფაქტობრივი ფასები შეიძლება შეიცვალოს.');
    return rows.join('\n');
  }
  function load(storage) {
    let raw;
    try { raw = (storage || root.localStorage).getItem(KEY); }
    catch { throw error('შენახული ბიუჯეტი ვერ წაიკითხა ბრაუზერმა.'); }
    if (raw === null) return null;
    try {
      if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error();
      const value = JSON.parse(raw);
      if (!value || value.version !== 1 || typeof value.savedAt !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(value.savedAt)) throw new Error();
      const time = Date.parse(value.savedAt);
      if (!Number.isFinite(time) || time <= 0 || time > Date.now()+600000) throw new Error();
      const input = sanitizeInput(value.input); calculate(input);
      return {input,savedAt:new Date(time).toISOString()};
    } catch { throw error('შენახული ბიუჯეტის ფორმატი არასწორია. წინა მონაცემი არ შეცვლილა; გასუფთავება ცალკე შეგიძლია.'); }
  }
  function save(value, storage, now = Date.now()) {
    const input = sanitizeInput(value); calculate(input);
    if (!Number.isFinite(now) || now <= 0 || now > Date.now()+600000) throw error('შენახვის დრო არასწორია.');
    const area = storage || root.localStorage;
    load(area);
    const stored = {version:1,input,savedAt:new Date(now).toISOString()}, serialized = JSON.stringify(stored);
    if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES) throw error('ბიუჯეტის ჩანაწერი ძალიან დიდია.');
    try { area.setItem(KEY,serialized); }
    catch { throw error('შენახვა ვერ მოხერხდა. გადაამოწმე ბრაუზერის საცავი; ძველი ბიუჯეტი შენარჩუნებულია.'); }
    return {input,savedAt:stored.savedAt};
  }
  function remove(storage) {
    try { (storage || root.localStorage).removeItem(KEY); }
    catch { throw error('ბიუჯეტი ვერ წაიშალა. სცადე ხელახლა.'); }
  }
  function element(tag, className, content) { const node=root.document.createElement(tag); if(className)node.className=className;if(content)node.textContent=content;return node; }
  function currentContext() {
    let place = '', date = '';
    if (root.document.getElementById('planner')) {
      const field = root.document.getElementById('waterSelect'), water = (root.WATERS||[]).find(item=>item[0]===field?.value) || root.selectedWater;
      place = water?.[1] || ''; date = root.document.getElementById('startDate')?.value || '';
    } else if (root.location.pathname.endsWith('/place-details.html')) {
      const id = new URLSearchParams(root.location.search).get('id');place=(root.WATERS||[]).find(item=>item[0]===id)?.[1] || '';
    } else {
      const plan = root.FishHuntDayPlan?.current?.();place=plan?.placeName || '';date=plan?.date || '';
    }
    return {place:typeof place==='string'?place.slice(0,120):'',date:validDate(date)?date:''};
  }
  function mount() {
    if (!root.document || root.document.getElementById('fhTripBudget')) return;
    const planner=root.document.getElementById('planner'),home=root.document.getElementById('homeLive'),day=root.document.querySelector('#fhDayPlan .fh-day-plan-content'),place=root.location.pathname.endsWith('/place-details.html'),dashboard=root.document.getElementById('gnDashboard');
    let target = planner || (home ? day : null) || (place ? root.document.getElementById('fhPlaceTools') || root.document.getElementById('placeLead') : null) || (!home ? dashboard : null);
    if (!target) return;
    const host=element('details','fh-trip-budget');host.id='fhTripBudget';
    host.innerHTML='<summary><span>გასვლის ბიუჯეტი</span><small>ხარჯები და მეგობრებზე გაყოფა</small></summary><div class="fh-budget-body"><p class="fh-budget-help">შეავსე დაგეგმილი ხარჯები ლარში. თუ ხარჯი არ გაქვს, ჩაწერე 0; ცარიელი ველი უცნობია. ეს პირადი შეფასებაა — ფული არ ჩამოიჭრება.</p><form class="fh-budget-form" novalidate><div class="fh-budget-context"><label>გასვლის სახელი<input name="title" maxlength="80" placeholder="მაგ. კვირის გასვლა"></label><label>ადგილი<input name="place" maxlength="120" placeholder="ადგილის სახელი"></label><label>თარიღი<input name="date" type="date"></label><button type="button" class="btn ghost" data-budget-action="context">არჩეული ადგილის გამოყენება</button></div><fieldset class="fh-budget-fuel"><legend>საწვავის შეფასება</legend><label class="fh-budget-checkbox"><input type="checkbox" name="noFuel">საწვავის ხარჯი არ შედის</label><div class="fh-budget-grid"><label>მარშრუტის მანძილი, კმ<input name="distance" inputmode="decimal" maxlength="24" placeholder="მაგ. 120"></label><label class="fh-budget-checkbox"><input type="checkbox" name="returnTrip">ეს ცალმხრივი მანძილია — დაბრუნებაც ჩავთვალოთ ×2</label><label>წვა, ლ / 100 კმ<input name="consumption" inputmode="decimal" maxlength="24" placeholder="მაგ. 8"></label><label>საწვავის ფასი, ₾ / ლ<input name="fuelPrice" inputmode="decimal" maxlength="24" placeholder="მაგ. 3,10"></label></div><p class="fh-budget-help">მანძილი თავად მიუთითე რუკის მარშრუტიდან. ფასსა და გზის მანძილს საიტი ავტომატურად არ ვარაუდობს. დაბრუნების მონიშვნის გარეშე ჩაიწერება შენ მიერ მითითებული სრული გზა.</p></fieldset><div class="fh-budget-grid"><label>სატყუარა, ₾<input name="bait" inputmode="decimal" maxlength="24" placeholder="0 თუ არ გჭირდება"></label><label>საკვები, ₾<input name="food" inputmode="decimal" maxlength="24" placeholder="0 თუ არ გჭირდება"></label><label>სხვა ხარჯი, ₾<input name="other" inputmode="decimal" maxlength="24" placeholder="0 თუ არ გაქვს"></label><label>მონაწილეები, 1–50<input name="participants" inputmode="numeric" maxlength="2" value="1"></label></div><div class="fh-budget-result" aria-live="polite"><p class="fh-budget-fuel-total"></p><strong class="fh-budget-total"></strong><p class="fh-budget-split"></p><p class="fh-budget-missing"></p></div><div class="fh-budget-actions"><button type="submit" class="btn primary" data-budget-action="save">ბიუჯეტის შენახვა</button><button type="button" class="btn ghost" data-budget-action="copy">შეჯამების კოპირება</button><button type="button" class="btn ghost" data-budget-action="reset">გასუფთავება</button></div><p class="fh-budget-status" role="status" aria-live="polite"></p><p class="fh-budget-help fh-budget-storage">ერთი ბიუჯეტი ინახება მხოლოდ ამ ბრაუზერში. ანგარიშთან არ სინქრონიზდება. შემდეგი შენახვა წინა ბიუჯეტს შეცვლის.</p><textarea class="fh-budget-copy" readonly hidden aria-label="ბიუჯეტის შეჯამება ხელით დასაკოპირებლად"></textarea></form></div>';
    if (target===planner || target===day) target.appendChild(host);
    else { target.after(host); if(target===dashboard)host.classList.add('container'); }
    bind(host);
  }
  function bind(host) {
    const form=host.querySelector('form'),status=host.querySelector('.fh-budget-status'),summary=host.querySelector('summary small'),copyField=host.querySelector('.fh-budget-copy');
    let lastSignature='null',dirty=false,externalChange=false;
    const fields = () => Object.fromEntries(Object.keys(defaultInput()).map(key=>{const field=form.elements.namedItem(key);return [key,field.type==='checkbox'?field.checked:field.value];}));
    const feedback = (message, bad=false) => {status.textContent=message;status.classList.toggle('is-error',bad);};
    function fill(input) { for(const [key,value] of Object.entries(input)){const field=form.elements.namedItem(key);if(field)field.type==='checkbox'?field.checked=value:field.value=value;} }
    function update(showError=false) {
      const input=fields();
      for(const key of ['distance','returnTrip','consumption','fuelPrice'])form.elements.namedItem(key).disabled=input.noFuel;
      form.querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
      try {
        const result=calculate(input);
        host.querySelector('.fh-budget-fuel-total').textContent=input.noFuel?'საწვავი ბიუჯეტში არ შედის.':'საწვავი: '+formatMoney(result.fuelCents)+(result.fuelDistanceHundredths===null?'':' · '+(result.fuelDistanceHundredths/100)+' კმ');
        host.querySelector('.fh-budget-total').textContent=(result.complete?'სულ: ':'მითითებული ხარჯები: ')+formatMoney(result.knownTotalCents);
        host.querySelector('.fh-budget-split').textContent=splitText(result);
        host.querySelector('.fh-budget-missing').textContent=result.complete?'თანხა ზუსტად იყოფა; სხვაობა მაქსიმუმ 1 თეთრია.':'არასრული ბიუჯეტი · შესავსებია: '+result.missing.map(key=>LABELS[key]).join(', ');
        summary.textContent=result.complete?formatMoney(result.totalCents)+' · '+result.participants+' მონაწილე':'ხარჯები და მეგობრებზე გაყოფა';
        return result;
      } catch(cause) {
        host.querySelector('.fh-budget-fuel-total').textContent='';host.querySelector('.fh-budget-total').textContent='გადაამოწმე მონაცემები';host.querySelector('.fh-budget-split').textContent='';host.querySelector('.fh-budget-missing').textContent=cause.message;summary.textContent='მონაცემი შესასწორებელია';
        const field=form.elements.namedItem(cause.field);if(field)field.setAttribute('aria-invalid','true');
        if(showError){feedback(cause.message,true);field?.focus({preventScroll:true});field?.scrollIntoView({block:'nearest',inline:'nearest'});}
        return null;
      }
    }
    try {
      const stored=load();lastSignature=JSON.stringify(stored);if(stored){fill(stored.input);feedback('შენახული ბიუჯეტი ჩაიტვირთა.');}
    } catch(cause){feedback(cause.message,true);}
    update();
    const changed=()=>{dirty=true;copyField.hidden=true;feedback(externalChange?'სხვა ჩანართში ბიუჯეტი შეიცვალა. მიმდინარე ფორმა შენარჩუნებულია; შენახვამდე განაახლე გვერდი.':'ცვლილებები ჯერ არ შენახულა.',externalChange);update();};
    form.addEventListener('input',changed);
    form.addEventListener('change',changed);
    form.addEventListener('submit',event=>{
      event.preventDefault();if(!update(true))return;
      if(externalChange){feedback('სხვა ჩანართში შენახული ბიუჯეტი შეიცვალა. განაახლე გვერდი წინა ჩანაწერის სანახავად; ამ ფორმის ცვლილებები ჯერ არ შენახულა.',true);return;}
      try {
        const stored=load();if(JSON.stringify(stored)!==lastSignature){externalChange=true;feedback('სხვა ჩანართში შენახული ბიუჯეტი შეიცვალა. განაახლე გვერდი; მიმდინარე ფორმა ჯერ არ შენახულა.',true);return;}
        const result=save(fields());lastSignature=JSON.stringify(result);dirty=false;feedback(calculate(result.input).complete?'ბიუჯეტი შენახულია ამ ბრაუზერში.':'არასრული ბიუჯეტის მონახაზი შენახულია ამ ბრაუზერში.');
      }
      catch(cause){feedback(cause.message,true);}
    });
    host.querySelector('[data-budget-action="context"]').addEventListener('click',()=>{
      const context=currentContext();if(!context.place&&!context.date){feedback('ჯერ დაგეგმვის გვერდზე აირჩიე ადგილი და თარიღი, ან აქ თავად ჩაწერე.',true);return;}
      if(context.place)form.elements.namedItem('place').value=context.place;
      if(context.date)form.elements.namedItem('date').value=context.date;
      dirty=true;feedback('არჩეული ადგილი და თარიღი გადმოვიდა. მანძილი თავად მიუთითე.');update();
    });
    host.querySelector('[data-budget-action="copy"]').addEventListener('click',async()=>{
      if(!update(true))return;
      const text=summaryText(fields());
      try {if(!root.navigator?.clipboard?.writeText)throw new Error();await root.navigator.clipboard.writeText(text);feedback('შეჯამება დაკოპირებულია. შეგიძლია მეგობარს თავად გაუზიარო.');}
      catch {copyField.value=text;copyField.hidden=false;copyField.focus();copyField.select();feedback('შეჯამება მონიშნულია. გამოიყენე მოწყობილობის „კოპირება“.');}
    });
    host.querySelector('[data-budget-action="reset"]').addEventListener('click',()=>{
      if(!root.confirm('გასუფთავდეს ამ ბრაუზერში შენახული ბიუჯეტი და მიმდინარე ფორმა?'))return;
      try {remove();fill(defaultInput());lastSignature='null';dirty=false;externalChange=false;copyField.value='';copyField.hidden=true;update();feedback('ბიუჯეტი გასუფთავებულია. სხვა ჩანაწერები არ შეცვლილა.');}
      catch(cause){feedback(cause.message,true);}
    });
    root.addEventListener('storage',event=>{
      if(event.key!==KEY&&event.key!==null)return;
      try {
        const stored=load();if(JSON.stringify(stored)===lastSignature)return;
        if(dirty){externalChange=true;feedback('სხვა ჩანართში ბიუჯეტი შეიცვალა. მიმდინარე ფორმა შენარჩუნებულია; შენახვამდე განაახლე გვერდი.',true);return;}
        fill(stored?.input||defaultInput());lastSignature=JSON.stringify(stored);update();feedback(stored?'სხვა ჩანართის შენახული ბიუჯეტი ჩაიტვირთა.':'შენახული ბიუჯეტი სხვა ჩანართში გასუფთავდა.');
      }catch(cause){externalChange=true;feedback(cause.message,true);}
    });
  }
  function init() {
    mount();
    root.document.addEventListener('fishhunt:day-plan',mount);
    root.document.addEventListener('fishhunt:place-context',mount);
  }
  return Object.freeze({storageKey:KEY,maxBytes:MAX_BYTES,defaultInput,parseDecimal,sanitizeInput,calculate,formatMoney,splitText,summaryText,load,save,remove,mount,init});
});
