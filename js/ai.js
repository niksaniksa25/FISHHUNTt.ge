/* GeoNature AI — organized question center */
const AI_FISHES = (window.FISHES || []).map(f => ({
  id:f[0], name:f[1], nameEn:f[2], water:f[3], habitat:f[4], region:f[5],
  weight:f[6], temp:f[7], pressure:f[8], wind:f[9], active:f[10], scientific:f[11], kind:'fish'
}));
const AI_WILDLIFE = (window.HUNTING_WILDLIFE || []).map(x => ({
  kind:x[0], name:x[1], nameEn:x[2], scientific:x[3], classKa:x[4],
  habitat:x[5], region:x[6], season:x[7], active:x[8]
}));
const AI_PLACES = (window.WATERS || []).map(w => ({
  id: w[0], name: w[1], type: w[2], region: w[3], lat: w[4], lon: w[5],
  fishIds: String(w[6] || '').split(',').map(id => id.trim()).filter(Boolean),
  desc: w[7] || ''
}));
const AI_FISH_BY_ID = Object.fromEntries(AI_FISHES.map(x => [x.id, x]));

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function weatherAnswer(q) {
  const s = q.toLowerCase();
  if (s.includes('წყლის ტემპ')) return 'წყლის ტემპერატურა მნიშვნელოვანია, რადგან სხვადასხვა თევზს განსხვავებული საინფორმაციო დიაპაზონი აქვს. კონკრეტული სახეობის პროფილი გამოიყენე შედარებისთვის.';
  if (s.includes('ხვალ') || s.includes('დღეს')) return 'კონკრეტული დღის Live მონაცემები ნახე ამინდის ან თევზაობის Planner-ში — აირჩიე ადგილი და შესაბამისი დღე.';
  return 'კონკრეტული ამინდის სანახავად გახსენი „ამინდი“, მოძებნე ადგილი ან გამოიყენე GPS. იქ ნახავ მიმდინარე მონაცემებს და 7-დღიან პროგნოზს.';
}

function findFish(q) {
  const s = q.toLowerCase();
  return [...AI_FISHES].sort((a,b) => b.name.length-a.name.length).find(x => s.includes(x.name.toLowerCase()) || s.includes(x.nameEn.toLowerCase()));
}

function findWild(q) {
  const s = q.toLowerCase();
  return [...AI_WILDLIFE].sort((a,b) => b.name.length-a.name.length).find(x => s.includes(x.name.toLowerCase()) || s.includes(x.nameEn.toLowerCase()));
}

function findPlace(q) {
  const s = q.toLowerCase();
  return [...AI_PLACES].sort((a,b) => b.name.length-a.name.length).find(x => s.includes(x.name.toLowerCase()));
}

function fishAnswer(f, q) {
  const s = q.toLowerCase();
  if (s.includes('ტემპ') || s.includes('გრადუს')) return `${f.name}-ისთვის საიტის საინფორმაციო სასურველი ტემპერატურაა <b>${esc(f.temp)}</b>.`;
  if (s.includes('წნევ') || s.includes('ქარ')) return `${f.name}-ის პროფილში მითითებული დიაპაზონებია: წნევა <b>${esc(f.pressure)}</b>, ქარი <b>${esc(f.wind)}</b>.`;
  if (s.includes('სად') && (s.includes('საქართველ') || s.includes('გვხვდება'))) return `${f.name} საქართველოში მითითებულია შემდეგ რეგიონში/წყლებში: <b>${esc(f.region)}</b>.`;
  if (s.includes('სად') || s.includes('ცხოვრ') || s.includes('ჰაბიტ')) return `${f.name}-ის ჰაბიტატია: <b>${esc(f.habitat)}</b>.`;
  if (s.includes('როდის') || s.includes('აქტიურ') || s.includes('წონ')) return `${f.name} აქტიურობის საინფორმაციო დროა <b>${esc(f.active)}</b>, წონის დიაპაზონი კი <b>${esc(f.weight)}</b>.`;
  if (s.includes('ისტორი') || s.includes('ცნობა')) return `${f.name}-ის მოკლე ცნობა: ინგლისური სახელია <b>${esc(f.nameEn)}</b>, სამეცნიერო სახელია <i>${esc(f.scientific)}</i>. პროფილი აღწერს მის ჰაბიტატს, გავრცელებასა და თევზაობისთვის გამოსადეგ პირობებს.`;
  return `ეს არის <b>${esc(f.name)}</b> — ${esc(f.nameEn)}. სამეცნიერო სახელია <i>${esc(f.scientific)}</i>.`;
}

function wildLabel(w) {
  return w.kind === 'bird' ? 'ფრინველი' : w.kind === 'reptile' ? 'ქვეწარმავალი' : 'ცხოველი';
}

function wildAnswer(w, q) {
  const s = q.toLowerCase();
  const kind = wildLabel(w);
  if (s.includes('სეზონ') || s.includes('როდის გვხვ')) return `${w.name} ძირითადად გვხვდება: <b>${esc(w.season)}</b>.`;
  if (s.includes('აქტიურ') || s.includes('როდის')) return `${w.name}-ის აქტივობის საინფორმაციო დროა: <b>${esc(w.active)}</b>.`;
  if (s.includes('საქართველ') || s.includes('სად გვხვდება')) return `${w.name} საქართველოში მითითებულია ასე: <b>${esc(w.region)}</b>.`;
  if (s.includes('სად') || s.includes('ცხოვრ') || s.includes('ჰაბიტ')) return `${w.name} ცხოვრობს/გვხვდება ჰაბიტატში: <b>${esc(w.habitat)}</b>.`;
  if (s.includes('ისტორი') || s.includes('ცნობა')) return `${w.name}-ის მოკლე ცნობა: ეს არის ${kind.toLowerCase()}, ინგლისური სახელით <b>${esc(w.nameEn)}</b> და სამეცნიერო სახელით <i>${esc(w.scientific)}</i>.`;
  if (s.includes('რა') || s.includes('რომელი') || s.includes('ეს')) return `ეს არის <b>${esc(w.name)}</b> — ${kind.toLowerCase()}. სამეცნიერო სახელია <i>${esc(w.scientific)}</i>.`;
  return `${w.name} — ${kind}. ჰაბიტატი: ${esc(w.habitat)}; გავრცელება: ${esc(w.region)}.`;
}

function placeFishNames(p) {
  const names = p.fishIds.map(id => AI_FISH_BY_ID[id]?.name).filter(Boolean);
  return names.length ? names.join(', ') : 'მონაცემი არ არის მითითებული';
}

function placeAnswer(p, q) {
  const s = q.toLowerCase();
  if (s.includes('თევზ')) return `${esc(p.name)}-ზე მითითებული თევზებია: <b>${esc(placeFishNames(p))}</b>.`;
  if (s.includes('ტიპ')) return `${esc(p.name)} არის <b>${esc(p.type)}</b>.`;
  if (s.includes('მდებარ') || (s.includes('სად') && !s.includes('თევზ'))) {
    const coords = p.lat != null && p.lon != null ? `კოორდინატები: <b>${p.lat}, ${p.lon}</b>.` : 'ამ ლოკაციას ზუსტი შენახული კოორდინატი ამ ჩანაწერში არ აქვს.';
    return `${esc(p.name)} მდებარეობს რეგიონში <b>${esc(p.region)}</b>. ${coords}`;
  }
  if (s.includes('რუკ')) return `ლოკაციის პროფილიდან გახსენი რუკა/მარშრუტის მოქმედება. კოორდინატიანი ლოკაციები პირდაპირ რუკაზე იძებნება.`;
  if (s.includes('ამინდ')) return `არჩეული ლოკაციის პროფილში შესაძლებელია Live ამინდისა და 7-დღიანი პროგნოზის ნახვა, როცა კოორდინატი ხელმისაწვდომია.`;
  if (s.includes('აღწერ') || s.includes('რა არის')) return `<b>${esc(p.name)}</b> არის ${esc(p.type)} ${esc(p.region)}-ში. აღწერა: ${esc(p.desc)}`;
  return `<b>${esc(p.name)}</b> — ${esc(p.type)}, ${esc(p.region)}. ${esc(p.desc)}`;
}

function buildFishQuestions(f) {
  return [
    [`ეს რა თევზია?`, fishAnswer.bind(null,f)],
    [`რა ისტორია/ცნობა აქვს ${f.name}-ს?`, fishAnswer.bind(null,f)],
    [`სად ცხოვრობს ${f.name}?`, fishAnswer.bind(null,f)],
    [`საქართველოში სად გვხვდება ${f.name}?`, fishAnswer.bind(null,f)],
    [`რა ტემპერატურა უხდება ${f.name}-ს?`, fishAnswer.bind(null,f)],
    [`რა წნევა და ქარი ჯობს ${f.name}-ისთვის?`, fishAnswer.bind(null,f)],
    [`როდის არის აქტიური ${f.name} და რა წონისაა?`, fishAnswer.bind(null,f)]
  ];
}

function buildWildQuestions(w) {
  return [
    [`ეს რა ${wildLabel(w).toLowerCase()} არის?`, wildAnswer.bind(null,w)],
    [`რა ისტორია/ცნობა აქვს ${w.name}-ს?`, wildAnswer.bind(null,w)],
    [`სად ცხოვრობს ${w.name}?`, wildAnswer.bind(null,w)],
    [`საქართველოში სად გვხვდება ${w.name}?`, wildAnswer.bind(null,w)],
    [`რომელ სეზონზე გვხვდება ${w.name}?`, wildAnswer.bind(null,w)],
    [`როდის აქტიურობს ${w.name}?`, wildAnswer.bind(null,w)],
    [`როგორი ჰაბიტატი აქვს ${w.name}-ს?`, wildAnswer.bind(null,w)]
  ];
}

function buildPlaceQuestions(p) {
  return [
    [`რა ადგილია ${p.name}?`, placeAnswer.bind(null,p)],
    [`სად მდებარეობს ${p.name}?`, placeAnswer.bind(null,p)],
    [`რა ტიპის წყალია ${p.name}?`, placeAnswer.bind(null,p)],
    [`რომელი თევზებია ${p.name}-ზე?`, placeAnswer.bind(null,p)],
    [`რა აღწერა აქვს ${p.name}-ს?`, placeAnswer.bind(null,p)],
    [`როგორ ვნახო ${p.name} რუკაზე?`, placeAnswer.bind(null,p)],
    [`რა უნდა გავითვალისწინო ${p.name}-ზე წასვლამდე?`, placeAnswer.bind(null,p)]
  ];
}

const AI_CATEGORIES = {
  quick: {label:'⚡ სწრაფი კითხვები', questions:() => AI_QUICK.map(([q,a]) => [q,() => a]), count:() => AI_QUICK.length},
  weather: {label:'🌦 ამინდი', questions:() => AI_WEATHER.map(([q,a]) => [q,() => a]), count:() => AI_WEATHER.length},
  fishing: {label:'🎣 თევზაობა', questions:() => AI_FISHING.map(([q,a]) => [q,() => a]), count:() => AI_FISHING.length},
  fish: {label:'🐟 თევზები', entity:AI_FISHES, questions:buildFishQuestions, count:() => 7},
  wild: {label:'🐾 ცხოველები / ფრინველები', entity:AI_WILDLIFE, questions:buildWildQuestions, count:() => 7},
  place: {label:'🌊 სათევზაო ადგილები', entity:AI_PLACES, questions:buildPlaceQuestions, count:() => 7},
  site: {label:'🌿 საიტის შესახებ', questions:() => AI_SITE.map(([q,a]) => [q,() => a]), count:() => AI_SITE.length}
};
function initAI() {
  const list = document.getElementById('questionList');
  const msgs = document.getElementById('chatMessages');
  const input = document.getElementById('aiInput');
  const tabs = document.getElementById('aiCategoryTabs');
  const entityBox = document.getElementById('aiEntityBox');
  const entitySelect = document.getElementById('aiEntity');
  const search = document.getElementById('aiQuestionSearch');
  const title = document.getElementById('aiQuestionTitle');
  const meta = document.getElementById('aiQuestionMeta');
  const status = document.getElementById('aiStatus');
  let current = 'quick';
  let activeQs = [];

  function appendMessage(userText, answerHtml) {
    const safeUser = esc(userText);
    msgs.insertAdjacentHTML('beforeend', `<div class="user">${safeUser}</div><div class="assistant">${answerHtml}</div>`);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function setBusy(busy) {
    if (!status) return;
    status.classList.toggle('busy', busy);
    status.textContent = busy ? '⏳ AI ამუშავებს კითხვას…' : '● AI მზადაა პასუხისთვის';
  }

  function sendWithFeedback(text, fn) {
    if (!text) return;
    setBusy(true);
    const typingId = `ai-typing-${Date.now()}`;
    msgs.insertAdjacentHTML('beforeend', `<div id="${typingId}" class="assistant ai-typing"><span>AI ამუშავებს</span><i></i><i></i><i></i></div>`);
    msgs.scrollTop = msgs.scrollHeight;
    window.setTimeout(() => {
      document.getElementById(typingId)?.remove();
      const html = typeof fn === 'function' ? fn(text) : fn;
      appendMessage(text, html);
      setBusy(false);
    }, 280);
  }

  function answer(text) {
    const raw = text.trim();
    const s = raw.toLowerCase();
    if (!raw) return '';
    if (/^(გამარჯობა|სალამი|ჰაი|hello|hi)([!. ]*)$/i.test(raw)) return 'გამარჯობა! 👋 რით დაგეხმარო GeoNature-ზე?';
    if (s.includes('როგორ ხარ')) return 'კარგად ვარ! 😊 მადლობა რომ მკითხე.';
    if (s.includes('მადლობა') || s.includes('გმადლობ')) return 'არაფრის! ❤️ თუ რამე დაგჭირდება, მკითხე.';
    if (s.includes('მუშაობ') || s.includes('მუშაობს') || s.includes('დამეხმარ') || s.includes('რა შეგიძლია')) return 'კი, აქ ვარ და ვმუშაობ. 😊 მკითხე თევზზე, ამინდზე, ლოკაციაზე, დაგეგმვაზე ან თვითონ GeoNature საიტზე.';
    if (s.includes('ნახვამდის') || s === 'bye' || s.includes('კარგად იყავი')) return 'ნახვამდის! წარმატებულ თევზაობას და კარგ გასვლას გისურვებ! 🎣';
    if (s.includes('ვინ ხარ')) return 'მე GeoNature AI ვარ — საიტის კითხვებისა და ბუნების/ამინდის/თევზაობის ინფორმაციის დამხმარე.';
    if (s.includes('რა შეგიძლია')) return 'შემიძლია დაგეხმარო თევზებზე, ცხოველებზე, სათევზაო ადგილებზე, ამინდზე, რუკაზე და GeoNature-ის ფუნქციებზე.';
    const f = findFish(raw);
    if (f) return fishAnswer(f, raw);
    const w = findWild(raw);
    if (w) return wildAnswer(w, raw);
    const p = findPlace(raw);
    if (p) return placeAnswer(p, raw);
    if (s.includes('ამინდ') || s.includes('ტემპერატურ') || s.includes('ქარ') || s.includes('წნევ') || s.includes('წვიმ')) return weatherAnswer(raw);
    if (s.includes('რუკ') || s.includes('სოფელ') || s.includes('gps') || s.includes('მარშრუტ')) return 'რუკის გვერდზე შეგიძლია მოძებნო ქალაქი/სოფელი, გამოიყენო GPS და საჭიროების შემთხვევაში მარშრუტის ფუნქცია.';
    if (s.includes('საიტ') || s.includes('geonature') || s.includes('კატალოგ') || s.includes('თევზაობ')) return 'GeoNature-ის მთავარ მენიუში გაქვს კატალოგი, ამინდი, რუკა, თევზაობა, სათევზაო ადგილები, AI და „ერთად“.';
    if (s.includes('ეს რა ცხოველ') || s.includes('ეს რა თევზ') || s.includes('ეს რა არის')) return 'ზუსტი პასუხისთვის მომწერე სახეობის სახელი ან აირჩიე შესაბამისი სახეობა AI-ის მარცხენა მენიუში.';
    return 'ვერ დავასახელე კითხვა ზუსტად. მკითხე კონკრეტულ თევზზე, ცხოველზე, სათევზაო ადგილზე, ამინდზე ან GeoNature-ის ფუნქციაზე.';
  }

  function populateEntities(cat) {
    const cfg = AI_CATEGORIES[cat];
    entitySelect.innerHTML = '';
    if (!cfg.entity) {
      entityBox.classList.add('hidden');
      return;
    }
    entityBox.classList.remove('hidden');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = cat === 'fish' ? 'აირჩიე თევზი…' : cat === 'wild' ? 'აირჩიე ცხოველი/ფრინველი…' : 'აირჩიე სათევზაო ადგილი…';
    entitySelect.appendChild(placeholder);
    cfg.entity.forEach((x,i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = x.name;
      entitySelect.appendChild(o);
    });
  }

  function renderQuestions() {
    const cfg = AI_CATEGORIES[current];
    const filter = search.value.trim().toLowerCase();
    const total = typeof cfg.count === 'function' ? cfg.count() : cfg.count;
    title.textContent = `${cfg.label} — ${total}`;
    meta.textContent = total + ' კითხვა' + (cfg.entity ? ' არჩეულ ობიექტზე' : '');
    let qs = [];
    if (cfg.entity) {
      const idx = Number(entitySelect.value);
      if (!Number.isFinite(idx) || !cfg.entity[idx]) {
        list.innerHTML = '<div class="ai-empty">ზემოთ აირჩიე კონკრეტული ობიექტი — შემდეგ ზუსტად 7 კითხვა გამოჩნდება.</div>';
        activeQs = [];
        return;
      }
      qs = cfg.questions(cfg.entity[idx]);
    } else {
      qs = cfg.questions();
    }
    activeQs = qs.filter(([q]) => !filter || q.toLowerCase().includes(filter));
    list.innerHTML = activeQs.map(([q]) => `<button type="button">${esc(q)}</button>`).join('') || '<div class="ai-empty">ამ ძებნით კითხვა ვერ მოიძებნა.</div>';
    list.querySelectorAll('button').forEach((b,i) => {
      b.onclick = () => sendQuestion(activeQs[i][0], activeQs[i][1]);
    });
  }

  function sendQuestion(q, fn) {
    input.value = '';
    sendWithFeedback(q, fn);
  }

  tabs.querySelectorAll('[data-ai-cat]').forEach(btn => {
    btn.onclick = () => {
      tabs.querySelectorAll('[data-ai-cat]').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      current = btn.dataset.aiCat;
      search.value = '';
      populateEntities(current);
      renderQuestions();
    };
  });

  entitySelect.onchange = renderQuestions;
  search.oninput = renderQuestions;
  document.getElementById('aiSend').onclick = () => {
    const t = input.value.trim();
    if (t) appendMessage(t, answer(t));
    input.value = '';
  };
  input.onkeydown = e => {
    if (e.key === 'Enter') {
      const t = input.value.trim();
      if (t) sendWithFeedback(t, () => answer(t));
      input.value = '';
    }
  };

  populateEntities('quick');
  renderQuestions();
}
