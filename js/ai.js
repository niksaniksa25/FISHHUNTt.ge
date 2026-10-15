/* GeoNature AI — organized question center */
const AI_QUICK = [
  ['რა არის GeoNature?', 'GeoNature აერთიანებს ამინდს, რუკას, სახეობების კატალოგსა და ბუნებაში გასვლის დაგეგმვის ინსტრუმენტებს.'],
  ['როგორ ვნახო მიმდინარე ამინდი?', 'გახსენი „ამინდი“, მოძებნე ადგილი ან გამოიყენე GPS. გადაამოწმე მონაცემების წყარო და განახლების დრო.'],
  ['როგორ ავირჩიო სათევზაო ადგილი?', 'გახსენი „სად წავიდეთ“ ან სათევზაო ადგილების გვერდი, შეადარე წყალსატევი, სახეობები და ამინდის პირობები.'],
  ['სად ვნახო თევზის ინფორმაცია?', 'აირჩიე „თევზები“ ამ კითხვების ცენტრში ან გახსენი თევზაობის გვერდი და კონკრეტული სახეობის პროფილი.'],
  ['ქულა გარანტირებული შედეგია?', 'ქულა პირობების შედარებითი შეფასებაა. ის ვერ იძლევა დაჭერის, ცხოველის ნახვის ან უსაფრთხო გასვლის გარანტიას.'],
  ['სად შევამოწმო თევზაობისა და ნადირობის შეზღუდვები?', 'გახსენი სეზონური კალენდარი და სახეობის შეზღუდვები. მოქმედი თარიღები, ადგილი და გამონაკლისები გადაამოწმე შესაბამის ოფიციალურ წყაროში.']
];
const AI_WEATHER = [
  ['რას ნიშნავს ჰაერის წნევა?', 'ჰაერის წნევა იზომება hPa-ში. მისი ცვლილება სხვა ფაქტორებთან ერთად გეხმარება ამინდის პირობების შედარებაში.'],
  ['ქარი და ქარის პიკი ერთი და იგივეა?', 'საშუალო ქარის სიჩქარე და ძლიერი პიკი (gust) სხვადასხვა მაჩვენებელია. ორივე გაითვალისწინე წყალსა და ღია ადგილებში გასვლისას.'],
  ['რას ნიშნავს ნალექის ალბათობა?', 'ნალექის ალბათობა პროცენტული მაჩვენებელია; ნალექის რაოდენობა კი მილიმეტრებში იზომება. 70% არ ნიშნავს 70 მმ წვიმას.'],
  ['რით განსხვავდება შეგრძნებითი ტემპერატურა?', 'შეგრძნებითი ტემპერატურა ითვალისწინებს ქარისა და სხვა პირობების გავლენას. ის შეიძლება ჰაერის გაზომილი ტემპერატურისგან განსხვავდებოდეს.'],
  ['სად ვნახო კონკრეტული საათის ამინდი?', 'ამინდისა და დაგეგმვის გვერდებზე ნახავ საათობრივ პროგნოზს. ზუსტი საათის არჩევის ხელმისაწვდომობა შენს გეგმაზეა დამოკიდებული.'],
  ['როგორ წავიკითხო Outdoor Score?', 'Outdoor Score აერთიანებს ამინდის რამდენიმე ფაქტორს. შეადარე ქულასთან ერთად ქარი, ნალექი და ხილვადობა; ქულა უსაფრთხოების დამოუკიდებელი გარანტია არ არის.'],
  ['რატომ იცვლება პროგნოზი?', 'პროგნოზი ახლდება ახალი დაკვირვებებისა და მოდელების მიხედვით. გასვლამდე ხელახლა შეამოწმე არჩეული ადგილის მონაცემები.'],
  ['ჰაერისა და წყლის ტემპერატურა ერთია?', 'ჰაერის ტემპერატურა წყლის ტემპერატურას არ უდრის. თევზის პროფილში მოცემული დიაპაზონი შეადარე წყლის რეალურ გაზომვას, როცა ის ხელმისაწვდომია.']
];
const AI_FISHING = [
  ['როგორ გამოვიყენო თევზაობის Planner?', 'აირჩიე თევზი, წყალსატევი და ხელმისაწვდომი დღე. შემდეგ შეადარე პირობები და სახეობის პროფილი.'],
  ['როგორ გავიგო რომელი თევზი ბინადრობს წყალსატევში?', 'აირჩიე „ადგილები“ ამ კითხვების ცენტრში და წყალსატევი, შემდეგ კითხვა „რომელი თევზებია“. ჩანაწერი ცნობარის ინფორმაციაა და ადგილზე არსებობის გარანტია არ არის.'],
  ['კარგი Fishing Score ნიშნავს რომ თევზაობა ნებადართულია?', 'არა. Fishing Score აღწერს პირობებს; სამართლებრივი შეზღუდვები, სახეობა, სეზონი, ადგილი და ნებადართული საშუალებები ცალკე გადაამოწმე.'],
  ['სად ვნახო თევზის აქტიური საათები?', 'აირჩიე კონკრეტული თევზი და კითხვა მისი აქტივობის შესახებ. ეს არის ტიპური საინფორმაციო დრო და არა დაჭერის გარანტია.'],
  ['რა შევამოწმო გასვლამდე?', 'გადაამოწმე მოქმედი შეზღუდვები, ამინდი, წყლის დონე, ნაპირთან მისასვლელი გზა და დაბრუნების დრო.'],
  ['როგორ დავაფიქსირო ჩემი დაჭერა?', 'მენიუში გახსენი „ჩემი დაჭერები“, სადაც შეგიძლია დაჭერის ჩანაწერისა და ფოტოს დამატება. ტელეფონზე გვერდების სათაურებს მარცხნივ-მარჯვნივ გადააცურებ.']
];
const AI_SITE = [
  ['როგორ მოვძებნო სახეობა?', 'გახსენი კატალოგი და გამოიყენე სახელის ძებნა და ფილტრები. ამ კითხვების ცენტრში ცალკეა თევზებისა და ველური ბუნების თემებიც.'],
  ['როგორ გამოვიყენო GPS?', 'ამინდის ან რუკის გვერდზე დააჭირე მდებარეობის ღილაკს და ბრაუზერს მიეცი მდებარეობის ნებართვა.'],
  ['რატომ არის ზოგი ფუნქცია ჩაკეტილი?', 'საიტის ნაწილი ხელმისაწვდომია Free გეგმაში, გაფართოებული ფუნქციები კი Plus ან AI Pro გეგმაში. დეტალები ნახე Premium-ის გვერდზე.'],
  ['რამდენი დღის პროგნოზია ხელმისაწვდომი?', 'Free გეგმა აჩვენებს 1 დღეს, Plus — 3 დღეს, AI Pro — 7 დღეს. ხელმისაწვდომი არჩევანი ნაჩვენებია შესაბამის გვერდზე.'],
  ['სად ვნახო დაცული სახეობები?', 'მენიუში გახსენი „წითელი წიგნი“ და გადაამოწმე კონკრეტული სახეობის სტატუსი და ოფიციალური წყარო.'],
  ['როგორ გავაგზავნო უკუკავშირი?', 'დააჭირე ქვედა მარცხენა კუთხეში 💬 უკუკავშირის ღილაკს და აღწერე პრობლემა. GitHub-ის შევსებულ ფორმაში შესვლის შემდეგ დააჭირე „Create issue“-ს — მაშინ გაიგზავნება საჯარო შეტყობინება. მონახაზი საიტზე ამავე ჩანართში შენარჩუნდება.'],
  ['როგორ მუშაობს ეს კითხვების ცენტრი?', 'ეს ცენტრი პასუხებს საიტში შენახული კითხვებიდან და სახეობების ცნობარიდან არჩევს. მიმდინარე ამინდს შესაბამის ამინდის გვერდზე გადაამოწმე.'],
  ['სად ვნახო ბუნების შესახებ ფაქტები?', 'მენიუში გახსენი „GeoNature ცოდნა“ ან ნახე დღის ფაქტი მთავარ გვერდზე.']
];
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
  return 'კონკრეტული ამინდის სანახავად გახსენი „ამინდი“, მოძებნე ადგილი ან გამოიყენე GPS. პროგნოზის პერიოდი გეგმაზეა დამოკიდებული: Free — 1 დღე, Plus — 3 დღე, AI Pro — 7 დღე.';
}

function findFish(q) {
  const s = q.toLowerCase();
  return [...AI_FISHES].sort((a,b) => b.name.length-a.name.length).find(x => entityNameMatches(s,x.name) || entityNameMatches(s,x.nameEn));
}

function findWild(q) {
  const s = q.toLowerCase();
  return [...AI_WILDLIFE].sort((a,b) => b.name.length-a.name.length).find(x => entityNameMatches(s,x.name) || entityNameMatches(s,x.nameEn));
}

function findPlace(q) {
  const s = q.toLowerCase();
  return [...AI_PLACES].sort((a,b) => b.name.length-a.name.length).find(x => entityNameMatches(s,x.name));
}
function entityNameMatches(text,name) {
  const full=String(name||'').trim().toLowerCase();if(!full)return false;
  const stems=[full];if(full.length>=4&&/[ია]$/u.test(full))stems.push(full.slice(0,-1));
  const escaped=stems.map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  // Match Georgian inflections without mistaking a short name such as “ბუ”
  // for the beginning of an unrelated word such as “ბუნება”.
  return new RegExp('(?:^|[^\\p{L}])(?:'+escaped+')(?:ს|ის|ისთვის|ისათვის|სთვის|ზე|ში|დან|ისგან|ით|თან|ისთან|ები|ების|ებზე|ებს|ისა)?(?=$|[^\\p{L}])','u').test(text);
}

function fishAnswer(f, q) {
  const s = q.toLowerCase();
  if (isRuleQuestion(s)) return ruleAnswer(f, q);
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
  if (isRuleQuestion(s)) return ruleAnswer(w, q);
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
  if (s.includes('ამინდ')) return `არჩეული ლოკაციის პროფილში მიმდინარე ამინდი და შენი გეგმის ხელმისაწვდომი პროგნოზი ჩანს, როცა ზუსტი კოორდინატი ხელმისაწვდომია.`;
  if (s.includes('აღწერ') || s.includes('რა არის')) return `<b>${esc(p.name)}</b> არის ${esc(p.type)} ${esc(p.region)}-ში. აღწერა: ${esc(p.desc)}`;
  return `<b>${esc(p.name)}</b> — ${esc(p.type)}, ${esc(p.region)}. ${esc(p.desc)}`;
}

function buildFishQuestions(f) {
  return [
    [`ეს რა თევზია?`, fishAnswer.bind(null,f)],
    [`რომელი შეზღუდვები მოქმედებს ${f.name}-ზე?`, fishAnswer.bind(null,f)],
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
    [`რომელი შეზღუდვები მოქმედებს ${w.name}-ზე?`, wildAnswer.bind(null,w)],
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
function isRuleQuestion(text) {
  return ['შეზღუდ', 'აკრძალ', 'ნებადართ', 'ნებართ', 'შეიძლება', 'ნადირობ', 'მოპოვებ'].some(word => text.includes(word));
}
function ruleAnswer(species, text) {
  const rules = window.GeoWildlifeRules;
  if (!species || !rules?.evaluate) return 'მოპოვების მოქმედი წესები გახსენი <a href="seasons.html">სეზონურ კალენდარში</a> და გადაამოწმე ოფიციალურ წყაროში.';
  let date = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || rules.today();
  if (text.includes('ხვალ') && !text.match(/\b\d{4}-\d{2}-\d{2}\b/)) {
    const tomorrow = new Date(date + 'T12:00:00Z'); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); date = tomorrow.toISOString().slice(0,10);
  }
  const method = text.includes('გაშვებ') ? 'release' : text.includes('სარეწაო') ? 'commercial' : 'rod';
  const result = rules.evaluate(species, {kind:species.kind, date, method});
  const sources = (result.sources || []).map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a>`).join(' • ');
  return `<b>${esc(result.title)}</b><br>${esc(result.message)}<br><small>${esc(species.name)} • ${esc(date)} • საქართველო</small><br><a href="seasons.html">თარიღის, ადგილისა და მეთოდის შემოწმება →</a>${sources ? '<br>' + sources : ''}`;
}
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
  if (!list || !msgs || !input || !tabs || !entitySelect || !search) return;
  let current = 'quick';
  let activeQs = [];
  const chatHistory = [];
  let pendingAI = false;

  function appendMessage(userText, answerHtml) {
    const safeUser = esc(userText);
    msgs.insertAdjacentHTML('beforeend', `<div class="user">${safeUser}</div><div class="assistant">${answerHtml}</div>`);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function setBusy(busy) {
    if (!status) return;
    status.classList.toggle('busy', busy);
    status.textContent = busy ? 'პასუხი ცნობარიდან…' : '● პასუხები საიტის ცნობარიდან';
  }

  function sendWithFeedback(text, fn) {
    if (!text) return;
    setBusy(true);
    try { appendMessage(text, typeof fn === 'function' ? fn(text) : fn); }
    catch (_) { appendMessage(text, 'პასუხი ვერ მოიძებნა. სცადე თემისა და სახეობის არჩევა.'); }
    finally { setBusy(false); }
  }

  function answer(text) {
    const raw = text.trim();
    const s = raw.toLowerCase();
    if (!raw) return '';
    const known = [...AI_QUICK, ...AI_WEATHER, ...AI_FISHING, ...AI_SITE].find(([question]) => question.toLowerCase() === s);
    if (known) return known[1];
    if (/^(გამარჯობა|სალამი|ჰაი|hello|hi)([!. ]*)$/i.test(raw)) return 'გამარჯობა! 👋 რით დაგეხმარო GeoNature-ზე?';
    if (s.includes('როგორ ხარ')) return 'კარგად ვარ! 😊 მადლობა რომ მკითხე.';
    if (s.includes('მადლობა') || s.includes('გმადლობ')) return 'არაფრის! ❤️ თუ რამე დაგჭირდება, მკითხე.';
    if (s.includes('მუშაობ') || s.includes('მუშაობს') || s.includes('დამეხმარ') || s.includes('რა შეგიძლია')) return 'კი, აქ ვარ და ვმუშაობ. 😊 მკითხე თევზზე, ამინდზე, ლოკაციაზე, დაგეგმვაზე ან თვითონ GeoNature საიტზე.';
    if (s.includes('ნახვამდის') || s === 'bye' || s.includes('კარგად იყავი')) return 'ნახვამდის! წარმატებულ თევზაობას და კარგ გასვლას გისურვებ! 🎣';
    if (s.includes('ვინ ხარ')) return 'ეს არის GeoNature-ის კითხვების ცენტრი — პასუხები საიტში შენახული ცნობარიდან იძებნება.';
    if (s.includes('რა შეგიძლია')) return 'შემიძლია დაგეხმარო თევზებზე, ცხოველებზე, სათევზაო ადგილებზე, ამინდზე, რუკაზე და GeoNature-ის ფუნქციებზე.';
    const f = findFish(raw);
    if (f) return fishAnswer(f, raw);
    const w = findWild(raw);
    if (w) return wildAnswer(w, raw);
    const p = findPlace(raw);
    if (p) return placeAnswer(p, raw);
    if (s.includes('feedback') || s.includes('უკუკავშირ') || s.includes('შეცდომ')) return AI_SITE.find(([question]) => question.includes('უკუკავშირ'))[1];
    if (s.includes('შეტყობინ') || s.includes('notification')) return 'მთავარ ან პირად გვერდზე შეტყობინებებში აირჩიე თევზი და ადგილი, შემდეგ შეინახე და ჩართე. შემოწმება საიტის გახსნისას მუშაობს; დახურულ საიტზე გასაგზავნად Push სერვერია საჭირო.';
    const selected = AI_CATEGORIES[current].entity?.[Number(entitySelect.value)];
    if (entitySelect.value !== '' && selected) return current === 'fish' ? fishAnswer(selected, raw) : current === 'wild' ? wildAnswer(selected, raw) : placeAnswer(selected, raw);
    if (isRuleQuestion(s)) return ruleAnswer(null, raw);
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
      const idx = entitySelect.value === '' ? NaN : Number(entitySelect.value);
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

  function serverUrl(path) {
    const base = String(window.GN_API_BASE_URL || '').trim().replace(/\\/$/, '');
    // GitHub Pages must connect to the separate HTTPS Node API.
    if (location.hostname.endsWith('github.io') && !base) return '';
    return base + path;
  }
  function addChatBubble(kind, content) {
    const bubble = document.createElement('div');
    bubble.className = kind;
    bubble.textContent = content;
    msgs.appendChild(bubble);
    msgs.scrollTop = msgs.scrollHeight;
    return bubble;
  }
  async function askRealAI(text) {
    if (!text || pendingAI) return;
    const endpoint = serverUrl('/api/ai/chat');
    addChatBubble('user', text);
    const responseBubble = addChatBubble('assistant', 'ვფიქრობ…');
    pendingAI = true;
    const sendButton = document.getElementById('aiSend');
    if (sendButton) sendButton.disabled = true;
    if (status) {status.classList.add('busy'); status.textContent = '● FishHunt AI ფიქრობს…';}
    try {
      if (!endpoint) throw new Error('AI სერვერის მისამართი ჯერ არ არის მითითებული.');
      const selected = AI_CATEGORIES[current].entity?.[Number(entitySelect.value)];
      const reply = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: text, history: chatHistory.slice(-8), context: {category: current, entity: selected?.name || ''}})
      });
      let data = {};
      try {data = await reply.json();} catch {}
      if (!reply.ok || !data.ok || !data.answer) throw new Error(data.message || 'AI-სთან კავშირი ვერ შედგა.');
      responseBubble.textContent = data.answer;
      chatHistory.push({role: 'user', content: text}, {role: 'assistant', content: data.answer});
      if (chatHistory.length > 16) chatHistory.splice(0, chatHistory.length - 16);
    } catch (error) {
      responseBubble.textContent = error.message || 'AI-სთან კავშირი ვერ შედგა.';
    } finally {
      pendingAI = false;
      if (sendButton) sendButton.disabled = false;
      if (status) {status.classList.remove('busy'); status.textContent = '● FishHunt AI • რეალური მოდელი';}
    }
  }
  function sendQuestion(q) {
    input.value = '';
    askRealAI(q);
  }

  tabs.querySelectorAll('[data-ai-cat]').forEach(btn => {
    const cfg = AI_CATEGORIES[btn.dataset.aiCat];
    if (!cfg) return;
    btn.textContent = cfg.label + (cfg.entity ? '' : ` ${cfg.count()}`);
    btn.onclick = () => {
      tabs.querySelectorAll('[data-ai-cat]').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      tabs.querySelectorAll('[data-ai-cat]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === btn)));
      current = btn.dataset.aiCat;
      search.value = '';
      populateEntities(current);
      renderQuestions();
    };
  });

  entitySelect.onchange = renderQuestions;
  search.oninput = renderQuestions;
  const sendInput = () => {
    const t = input.value.trim();
    if (t) askRealAI(t);
    input.value = '';
  };
  document.getElementById('aiSend').onclick = sendInput;
  input.onkeydown = e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendInput(); }
  };

  populateEntities('quick');
  renderQuestions();
  if (status) status.textContent = '● FishHunt AI • რეალური მოდელი';
  tabs.querySelectorAll('[data-ai-cat]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.aiCat === current)));
}
