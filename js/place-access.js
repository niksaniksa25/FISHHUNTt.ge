(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.FishHuntPlaceAccess = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const KEY = 'fishhunt_place_access_v1', MAX_RECORDS = 100, MAX_BYTES = 200000;
  const ROADS = Object.freeze({unknown:'არ არის მითითებული',paved:'ასფალტიანი გზა',gravel:'გრუნტის გზა',rough:'რთული მონაკვეთი', 'foot-only':'მხოლოდ ფეხით მისვლა'});
  const PARKING = Object.freeze({unknown:'არ არის მითითებული',available:'არის გასაჩერებელი ადგილი',limited:'ადგილი შეზღუდულია',none:'გასაჩერებელი ადგილი არ არის'});
  const idOf = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value) ? value : '';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const cleanText = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim() : '';
  function minutes(value) {
    if (value === null || value === undefined || value === '') return null;
    if ((typeof value !== 'number' && typeof value !== 'string') || typeof value === 'string' && !/^\d{1,3}$/.test(value)) return undefined;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 720 ? number : undefined;
  }
  function cleanSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const road = typeof value.road === 'string' && own(ROADS,value.road) ? value.road : 'unknown';
    const parking = typeof value.parking === 'string' && own(PARKING,value.parking) ? value.parking : 'unknown';
    const walkingMinutes = minutes(value.walkingMinutes), notes = cleanText(value.notes);
    const updatedAt = typeof value.updatedAt === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value.updatedAt) ? Date.parse(value.updatedAt) : NaN;
    if (walkingMinutes === undefined || notes.length > 600 || !Number.isFinite(updatedAt) || updatedAt <= 0 || updatedAt > Date.now() + 600000) return null;
    if (road === 'unknown' && parking === 'unknown' && walkingMinutes === null && !notes) return null;
    return {road,parking,walkingMinutes,notes,updatedAt:new Date(updatedAt).toISOString(),personal:true};
  }
  function read(storage, strict = false) {
    try {
      const raw = (storage || root.localStorage).getItem(KEY) || '{}';
      if (raw.length > MAX_BYTES) throw new Error('oversized');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > MAX_RECORDS) throw new Error('invalid');
      const result = {};
      for (const [id,value] of Object.entries(parsed).slice(0,MAX_RECORDS)) {
        const snapshot = cleanSnapshot(value);
        if (idOf(id) && !['__proto__','constructor','prototype'].includes(id) && snapshot) result[id] = snapshot;
        else if (strict) throw new Error('invalid record');
      }
      return result;
    } catch { if (strict) throw new Error('წინა ჩანაწერები ვერ წაიკითხა ბრაუზერმა. მონაცემები არ შეცვლილა.'); return {}; }
  }
  function snapshot(id, storage) { const records=read(storage);return own(records,idOf(id)) ? records[id] : null; }
  function persist(records, storage) {
    const serialized = JSON.stringify(records);
    if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES) throw new Error('ჩანაწერებისთვის ადგილი აღარ არის. წაშალე ძველი ჩანაწერი და სცადე ხელახლა.');
    try { (storage || root.localStorage).setItem(KEY,serialized); }
    catch { throw new Error('შენახვა ვერ მოხერხდა. გადაამოწმე ბრაუზერის საცავი და სცადე ხელახლა.'); }
  }
  function announce(placeId, access) {
    if (root.document && typeof root.CustomEvent === 'function') root.document.dispatchEvent(new root.CustomEvent('fishhunt:place-access',{detail:{placeId,access},bubbles:true}));
  }
  function save(id, input, storage, now = Date.now()) {
    if (!idOf(id) || ['__proto__','constructor','prototype'].includes(id)) throw new Error('ადგილი ვერ მოიძებნა.');
    const raw = input && typeof input === 'object' ? input : {};
    if (typeof raw.road !== 'string' || !own(ROADS,raw.road) || typeof raw.parking !== 'string' || !own(PARKING,raw.parking) || minutes(raw.walkingMinutes) === undefined) throw new Error('გადაამოწმე გზა, პარკინგი და დრო (0–720 წუთი).');
    if (typeof raw.notes !== 'string' || raw.notes.length > 600) throw new Error('შენიშვნა უნდა იყოს მაქსიმუმ 600 სიმბოლო.');
    if (!Number.isFinite(now) || now <= 0 || now > Date.now() + 600000) throw new Error('ჩანაწერის თარიღი არასწორია.');
    const access = cleanSnapshot({...raw,updatedAt:new Date(now).toISOString()});
    if (!access) throw new Error('ჯერ ჩაწერე გზის, პარკინგის ან ფეხით მისვლის შესახებ ინფორმაცია.');
    const records = read(storage,true);
    if (!own(records,id) && Object.keys(records).length >= MAX_RECORDS) throw new Error('ინახება მაქსიმუმ 100 ადგილის ჩანაწერი. ჯერ წაშალე ძველი ჩანაწერი.');
    records[id] = access;
    persist(records,storage); announce(id,access); return access;
  }
  function remove(id, storage) {
    if (!idOf(id)) throw new Error('ადგილი ვერ მოიძებნა.');
    const records = read(storage,true); delete records[id]; persist(records,storage); announce(id,null);
  }
  function coordinates(lat,lon) {
    const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
    return numeric(lat) && numeric(lon) && Number(lat) >= -90 && Number(lat) <= 90 && Number(lon) >= -180 && Number(lon) <= 180 && !(Number(lat) === 0 && Number(lon) === 0);
  }
  function routeLinks(lat,lon) {
    if (!coordinates(lat,lon)) return null;
    const point = Number(lat) + ',' + Number(lon), base = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(point);
    return {driving:base+'&travelmode=driving',walking:base+'&travelmode=walking',map:'https://www.openstreetmap.org/?mlat='+Number(lat)+'&mlon='+Number(lon)+'#map=15/'+Number(lat)+'/'+Number(lon)};
  }
  function element(tag,className,text) { const node=root.document.createElement(tag); if(className)node.className=className;if(text)node.textContent=text;return node; }
  function roadLabel(value) { return own(ROADS,value) ? ROADS[value] : ROADS.unknown; }
  function parkingLabel(value) { return own(PARKING,value) ? PARKING[value] : PARKING.unknown; }
  function render(water, host = root.document?.getElementById('placeAccess')) {
    if (!host) return;
    host.replaceChildren();
    if (!Array.isArray(water) || !idOf(water[0])) { host.hidden=true;return; }
    host.hidden=false;
    const id=water[0], details=element('details','fh-place-access panel'),summary=element('summary','fh-access-summary');
    summary.append(element('span','','მისვლა და პარკინგი'),element('small','','გზა • ფეხით მისვლა • ჩემი ჩანაწერი'));details.append(summary);
    const body=element('div','fh-access-body'); details.append(body);host.append(details);
    body.append(element('p','fh-access-caveat','მარშრუტი მიდის წყალსატევის საორიენტაციო წერტილამდე. შესასვლელი და პარკინგი ჯერ გადამოწმებული არ არის.'));
    const links=routeLinks(water[4],water[5]);
    if(links){
      const actions=element('div','fh-access-routes');
      for(const [key,label] of [['driving','მანქანით მარშრუტი ↗'],['walking','ფეხით მარშრუტი ↗'],['map','წერტილი რუკაზე ↗']]){
        const anchor=element('a','btn ghost',label);anchor.href=links[key];anchor.target='_blank';anchor.rel='noopener noreferrer';actions.append(anchor);
      }
      body.append(actions,element('p','fh-access-help','მარშრუტი იხსნება გარე რუკაში; დრო და მანძილი იქ გამოითვლება.'));
    }else body.append(element('p','fh-access-caveat','ამ ადგილის კოორდინატები მიუწვდომელია. მისასვლელი მონაკვეთი რუკაში ადგილის სახელით მოძებნე.'));
    const facts=element('dl','fh-access-facts'),savedAt=element('p','fh-access-date');body.append(facts,savedAt);
    const editor=element('details','fh-access-editor'),editSummary=element('summary','','ჩემი მისასვლელი ჩანაწერი');editor.append(editSummary);
    editor.append(element('p','fh-access-help','შეინახე შენი დაკვირვება ამ მოწყობილობის ბრაუზერში. ეს პირადი ჩანაწერია, საჯაროდ არ ქვეყნდება და სხვა მოწყობილობაზე არ გადადის. ამ ბრაუზერით მოსარგებლეს მისი ნახვა შეუძლია. ადგილის ოფლაინ შენახვისას ჩანაწერის ასლიც შენარჩუნდება. ცვლილების ან წაშლის შემდეგ ძველი ოფლაინ ასლი განაახლე ან წაშალე.'));
    const form=element('form','fh-access-form');editor.append(form);body.append(editor);
    function field(labelText,node){const label=element('label','fh-access-field'+(node.tagName==='TEXTAREA'?' fh-access-field-wide':''));label.append(element('span','',labelText),node);form.append(label);return node;}
    function select(name,values){const node=element('select');node.name=name;for(const [key,label] of Object.entries(values)){const option=element('option','',label);option.value=key;node.append(option);}return node;}
    const road=field('მისასვლელი გზა',select('road',ROADS)),parking=field('პარკინგი',select('parking',PARKING));
    const walking=element('input');walking.name='walkingMinutes';walking.type='number';walking.inputMode='numeric';walking.min='0';walking.max='720';walking.step='1';walking.placeholder='უცნობია';field('ფეხით მისვლის დრო — ჩემი შეფასება (წუთი)',walking);
    const notes=element('textarea');notes.name='notes';notes.maxLength=600;notes.rows=3;notes.placeholder='მაგ.: რომელ ნაპირზე შევუხვიე, რა შევამჩნიე გზაზე…';field('ჩემი შენიშვნა (მაქსიმუმ 600 სიმბოლო)',notes);
    const actions=element('div','fh-access-form-actions'),submit=element('button','btn primary','ჩანაწერის შენახვა'),cancel=element('button','btn ghost','გაუქმება'),removeButton=element('button','btn ghost','ჩანაწერის წაშლა');submit.type='submit';cancel.type=removeButton.type='button';actions.append(submit,cancel,removeButton);form.append(actions);
    const status=element('p','fh-access-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(status);
    function feedback(message,error=false){status.textContent=message;status.classList.toggle('is-error',error);}
    function show(saved){
      facts.replaceChildren();
      for(const [label,value] of [['გზა',saved?roadLabel(saved.road):'დადასტურებული ინფორმაცია ჯერ არ არის'],['პარკინგი',saved?parkingLabel(saved.parking):'დადასტურებული ინფორმაცია ჯერ არ არის'],['ფეხით მისვლა',saved?.walkingMinutes!==null&&saved?.walkingMinutes!==undefined?saved.walkingMinutes+' წუთი — ჩემი შეფასება':'დრო უცნობია']]){
        const row=element('div');row.append(element('dt','',label),element('dd','',value));facts.append(row);
      }
      if(saved?.notes){const row=element('div','fh-access-personal-note');row.append(element('dt','','ჩემი შენიშვნა'),element('dd','',saved.notes));facts.append(row);}
      savedAt.hidden=!saved;savedAt.textContent=saved?'ჩემი ჩანაწერი • '+new Intl.DateTimeFormat('ka-GE',{timeZone:'Asia/Tbilisi',year:'numeric',month:'short',day:'numeric'}).format(new Date(saved.updatedAt))+'. გზის მდგომარეობა შეიძლება შეიცვალოს.':'';
      road.value=saved?.road||'unknown';parking.value=saved?.parking||'unknown';walking.value=saved?.walkingMinutes??'';notes.value=saved?.notes||'';removeButton.hidden=!saved;
    }
    show(snapshot(id));
    form.addEventListener('submit',event=>{event.preventDefault();try{const saved=save(id,{road:road.value,parking:parking.value,walkingMinutes:walking.value,notes:notes.value});show(saved);feedback('ჩანაწერი შენახულია ამ მოწყობილობაზე.');}catch(error){feedback(error.message||'შენახვა ვერ მოხერხდა. გადაამოწმე ბრაუზერის საცავი.',true);}});
    form.addEventListener('invalid',event=>{const input=event.target;feedback(input===walking?'დრო მიუთითე მთელ წუთებში, 0-დან 720-მდე.':'გადაამოწმე მონიშნული ველი.',true);},true);
    cancel.addEventListener('click',()=>{show(snapshot(id));feedback('');editor.open=false;editSummary.focus();});
    removeButton.addEventListener('click',()=>{try{remove(id);show(null);feedback('ამ გვერდის პირადი ჩანაწერი წაშლილია. თუ ადგილი ოფლაინაც შეინახე, განაახლე ან წაშალე ძველი ოფლაინ ასლი.');}catch(error){feedback(error.message||'წაშლა ვერ მოხერხდა.',true);}});
  }
  return Object.freeze({storageKey:KEY,maxRecords:MAX_RECORDS,maxBytes:MAX_BYTES,cleanSnapshot,snapshot,save,remove,routeLinks,roadLabel,parkingLabel,render});
});
