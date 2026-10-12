(function (global) {
  'use strict';
  const CHECKED = '2026-10-12';
  const SOURCES = Object.freeze({
    hunting: { label: 'DES · ნადირობის სეზონი 2026', url: 'https://des.gov.ge/Ge/HuntingSeason' },
    fish: { label: '№423 · თევზჭერის რეგლამენტი (DES)', url: 'https://des.gov.ge/Ge/Files/Download/1056', edition: 'DES-ის PDF, 2018 წლის რედაქცია' },
    red: { label: '№190 · საქართველოს წითელი ნუსხა', url: 'https://des.gov.ge/Ge/Files/Download/1065' },
    redLaw: { label: 'წითელი ნუსხის კანონი · მუხლები 10, 22', url: 'https://des.gov.ge/Ge/Files/Download/1012' },
    huntingLaw: { label: '№95 · ნადირობის წესები (DES)', url: 'https://des.gov.ge/Ge/Files/Download/1091', edition: 'DES-ის PDF, 2018 წლის რედაქცია' },
    faq: { label: 'DES · სამოყვარულო ჭერის პირობები', url: 'https://des.gov.ge/Ge/Faq' },
    matsne: { label: 'მოქმედი რედაქცია · მაცნე', url: 'https://matsne.gov.ge/ka' }
  });
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Scientific identity controls matches. Georgian common names in the catalog
  // are not a reliable legal identity (e.g. Testudo hermanni != T. graeca).
  const PROTECTED = new Set([
    'ursusarctos', 'lynxlynx', 'cervuselaphus', 'capracylindricornis',
    'capracaucasica', 'lutralutra', 'sciurusanomalus', 'aquilaheliaca',
    'aquilachrysaetos', 'aquilachrysaetus', 'gypsfulvus', 'gypaetusbarbatus',
    'aegypiusmonachus', 'ciconianigra', 'ciconiaciconia', 'viperakaznakovi',
    'testudograeca', 'tetraogalluscaspius', 'tetraomlokosiewiczi', 'lyrurusmlokosiewiczi'
  ]);
  const BIRDS = Object.freeze({
    coturnixcoturnix: { limit: 20, start: 'opening', end: '02-15', until: true },
    columbalivia: { limit: 10, start: 'opening', end: '02-15', until: true },
    columbapalumbus: { limit: 10, start: 'opening', end: '02-15', until: true },
    columbaoenas: { limit: 10, start: 'opening', end: '02-15', until: true },
    gallinagogallinago: { limit: 5, start: 'opening', end: '02-15', until: true },
    streptopeliadecaocto: { limit: 5, start: 'opening', end: '02-15', until: true },
    crexcrex: { limit: 5, start: 'opening', end: '02-15', until: true },
    lymnocryptesminimus: { limit: 5, start: 'opening', end: '02-15', until: true },
    scolopaxrusticola: { limit: 5, start: '10-01', end: '03-01', until: true },
    anasplatyrhynchos: { limit: 6, start: '11-01', end: '03-01', until: true, highland: { limit: 5, start: '09-10', end: '12-31' } }
  });
  const OPENINGS = Object.freeze({ 2025: '08-23', 2026: '08-22' });
  const WATER_WINDOWS = Object.freeze({
    mtaqvari: { start: '05-01', end: '08-31', label: 'მტკვარი და შენაკადები' },
    alazani: { start: '05-01', end: '08-31', label: 'ალაზანი და შენაკადები' },
    iory: { start: '05-01', end: '08-31', label: 'იორი' },
    'tbilisi-sea': { start: '04-15', end: '08-31', label: 'თბილისის წყალსაცავი' },
    shaori: { start: '11-15', end: '12-31', label: 'შაორის წყალსაცავი' },
    tabatskuri: { start: '11-15', end: '12-31', label: 'ტაბაწყურის ტბა' },
    paravani: { start: '11-15', end: '12-31', label: 'ფარავნის ტბა' }
  });
  function today(now) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now || new Date());
    const value = key => parts.find(p => p.type === key).value;
    return value('year') + '-' + value('month') + '-' + value('day');
  }
  function validDate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
  }
  function normaliseSpecies(value, kind) {
    if (Array.isArray(value)) {
      const wildlifeKinds = ['bird', 'mammal', 'reptile', 'amphibian', 'insect', 'invertebrate', 'animal', 'wildlife'];
      const fish = kind === 'fish' || (value.length >= 12 && !wildlifeKinds.includes(value[0]));
      return fish ? { id: value[0], name: value[1], scientific: value[11] || '', kind: 'fish', habitat: value[4] || '' }
        : { id: value[1], name: value[1], scientific: value[3] || '', kind: value[0], habitat: value[5] || '' };
    }
    return Object.assign({ id: '', name: '', scientific: '', kind: kind || 'wildlife', habitat: '' }, value || {});
  }
  function identity(species) { return String(species.scientific).toLowerCase().replace(/[^a-z]/g, ''); }
  function birdWindow(rule, date, area) {
    const month = Number(date.slice(5, 7)), year = Number(date.slice(0, 4));
    const seasonYear = month < 8 ? year - 1 : year;
    if (!OPENINGS[seasonYear]) return null;
    const row = area === 'highland' && rule.highland ? rule.highland : rule;
    const start = seasonYear + '-' + (row.start === 'opening' ? OPENINGS[seasonYear] : row.start);
    const end = (row.end < '08-01' ? seasonYear + 1 : seasonYear) + '-' + row.end;
    return { start, end, limit: row.limit, until: !!row.until };
  }
  function inWindow(date, start, end, until) { return date >= start && (until ? date < end : date <= end); }
  function evaluate(value, options) {
    const species = normaliseSpecies(value, options && options.kind);
    const context = Object.assign({ date: today(), method: 'rod', area: 'unknown', location: '', waterId: '' }, options || {});
    const dateValid = validDate(context.date), key = identity(species);
    const result = { species, date: context.date, dateValid, method: context.method, area: context.area, location: context.location, status: 'unverified', title: 'სახეობის სრული წესი გადასამოწმებელია', message: 'არჩეულ დღეს მოპოვების ნებართვა აქ დადასტურებული არ არის. გადაამოწმე სახეობის ზუსტი იდენტიფიკაცია, მოქმედი რედაქცია და კონკრეტული ტერიტორია.', details: [], sources: [SOURCES.matsne], checked: CHECKED };
    if (!dateValid) return Object.assign(result, { title: 'აირჩიე სწორი თარიღი', message: 'თარიღი უნდა იყოს რეალური კალენდარული დღე.' });
    if (species.kind === 'fish') {
      result.sources = [SOURCES.fish, SOURCES.matsne];
      result.details.push('№423-ის მუხლი 4(3): წყალსატევების ზოგადი სეზონური აკრძალვებისაგან სამოყვარულო/სპორტული ჭერა გამონაკლისია. ეს გამონაკლისი სახეობის, მეთოდის და ადგილის სხვა აკრძალვებს არ აუქმებს.');
      result.details.push('კაშხლებთან/რაბებთან 500-მეტრიანი დაშორება, ელექტროსადგურის არხები და თევზსავალი არხები ცალკე შეზღუდულია. დაცულ ტერიტორიაზე მენეჯმენტის გეგმის ნებადართული ზონა გადაამოწმე.');
      if (species.id === 'sturgeon' || key === 'acipenseridae' || key.startsWith('acipenser') || key === 'husohuso') {
        result.status = 'prohibited'; result.title = 'ზუთხისებრთა ჭერა აკრძალულია მთელი წელი';
        result.message = '№423, მუხლი 5(1)(ა): აკრძალვა მოიცავს სამოყვარულო/სპორტულ ჭერას და თანჭერილსაც. შემთხვევით დაჭერისას დაუყოვნებლივ გაუშვი საბინადრო გარემოში. განსაკუთრებული წერილობითი თანხმობის შემთხვევები ცალკე რეგულირდება.';
      } else if (species.id === 'salmon' || key === 'salmolabrax' || key === 'salmofariolabrax') {
        result.status = 'prohibited'; result.title = 'შავი ზღვის ორაგულის ჭერა აკრძალულია მთელი წელი';
        result.message = '№423, მუხლი 5(1)(გ): აკრძალვა ვრცელდება სამოყვარულო/სპორტულ ჭერაზეც. შემთხვევით დაჭერილი ინდივიდი დაუყოვნებლივ დააბრუნე წყალში; განსაკუთრებული წერილობითი თანხმობა ჩვეულებრივი თევზაობის ნებართვა არ არის.';
      } else if (species.id === 'browntrout' || key === 'salmofario' || key === 'salmotrutta') {
        result.status = context.method === 'release' ? 'conditional' : 'prohibited';
        result.title = context.method === 'release' ? 'კალმახზე გაშვებით ჭერას ცალკე პირობები აქვს' : 'ველური მდინარის/ტბის კალმახის შენახვა აკრძალულია მთელი წელი';
        result.message = '№423, მუხლი 5(1)(დ),(თ): ჩვეულებრივი მოპოვება აკრძალულია; რეკრეაციული ჭერა, გარემოდან ამოღების გარეშე, ცალკე გამონაკლისია და მასაც აქვს დახურული პერიოდი და სპეციალური ინსტრუქცია. აქ მისი ზუსტი სეზონი დადასტურებული არ არის — გაშვებით ჭერა ავტომატურად ნებადართული არ ჩათვალო.';
        result.details.push('გაშვებით რეკრეაციული ჭერისას ბუნებრივი სატყუარა, ენის მქონე/ორეული/სამეული ნემსკავი და თევზზე მშრალი ხელით შეხება შეზღუდულია (მუხლი 13). ცისარტყელა კალმახი სხვა სახეობაა; მეურნეობის პირობები ცალკე მოწმდება.');
      } else if (species.id === 'blackseaturbot' || key === 'scophthalmusmaximus') {
        const md = context.date.slice(5), closed = md >= '05-01' && md < '07-01';
        result.status = closed ? 'prohibited' : 'conditional';
        result.title = closed ? 'კალკანის ჭერის დახურული პერიოდია' : 'კალკანი: სეზონური აკრძალვის ფარგლებს გარეთ';
        result.message = '№423, მუხლი 5(1)(ე): ქამბალა-კალკანის ჭერა აკრძალულია 1 მაისიდან 1 ივლისამდე, მათ შორის სამოყვარულო/სპორტული ჭერისას. სხვა თვეში ადგილობრივი რეჟიმი და მინიმალური ზომა მაინც გადაამოწმე.';
      } else {
        result.status = 'conditional'; result.title = 'სამოყვარულო ჭერა: მეთოდი და ადგილი გადაამოწმე';
        result.message = 'ამ სახეობაზე ცალკე სეზონური აკრძალვა აქ დადასტურებული არ არის. №423-ის წყალსატევების ზოგადი ქვირითობის ვადები ანკესით სამოყვარულო ჭერის ავტომატურ აკრძალვას არ ნიშნავს; დარჩენილი პირობები მაინც მოქმედებს.';
      }
      result.details.push('წყარო: DES-ის გამოქვეყნებული №423 PDF შეიცავს 2018 წლამდე ცვლილებებს. უახლესი რედაქცია და შესაძლო ახალი ტერიტორიული გადაწყვეტილება გასვლამდე გადაამოწმე მაცნეში ან 153-ზე.');
      const waterWindow = WATER_WINDOWS[context.waterId];
      if (waterWindow) {
        result.details.push('მუხლი 4(3), ' + waterWindow.label + ': ' + waterWindow.start.split('-').reverse().join('.') + '–' + waterWindow.end.split('-').reverse().join('.') + ' წყალსატევის აკრძალვის პერიოდია, სამოყვარულო/სპორტული და სამეცნიერო-კვლევითი ჭერის გამონაკლისით. სარეწაო ჭერას შესაბამისი ლიცენზია სჭირდება.');
        if (context.method === 'commercial' && result.status !== 'prohibited') {
          const md = context.date.slice(5), closed = md >= waterWindow.start && md <= waterWindow.end;
          result.status = closed ? 'prohibited' : 'permit';
          result.title = closed ? 'წყალსატევის სარეწაო ჭერის დახურული პერიოდია' : 'სარეწაო ჭერა: მოქმედი ლიცენზია აუცილებელია';
          result.message = 'ეს წყალსატევის ვადა ვრცელდება სარეწაო ჭერაზე. ანკესით სამოყვარულო/სპორტული ჭერა მუხლი 4(3)-ის გამონაკლისია; სხვა აკრძალვები კვლავ მოქმედებს. საბოლოო რეჟიმი მოქმედ რედაქციაში გადაამოწმე.';
        }
      } else if (context.method === 'commercial' && result.status !== 'prohibited') {
        result.status = 'permit'; result.title = 'სარეწაო ჭერა: ლიცენზია და წყალსატევის ვადა';
        result.message = 'სარეწაო ჭერისათვის მოქმედი ლიცენზია და კონკრეტული წყალსატევის რეჟიმია საჭირო. ამ ადგილას ზუსტი აკრძალვის პერიოდი აქ არ არის დადასტურებული.';
      }
      if (!['rod', 'release', 'commercial'].includes(context.method) && result.status !== 'prohibited') {
        result.status = 'unverified'; result.title = 'ამ მეთოდის დაშვება ჯერ არ არის დადასტურებული';
        result.message = 'დაუზუსტებელ მეთოდზე სამოყვარულო ანკესის გამონაკლისი ავტომატურად არ გამოიყენება. მეთოდის ზუსტი სახე, შესაბამისი ნებართვა და ტერიტორიის რეჟიმი ოფიციალურ წყაროში გადაამოწმე.';
      }
      return result;
    }
    if (PROTECTED.has(key)) {
      result.status = 'prohibited'; result.title = 'წითელი ნუსხის სახეობა — ნადირობა აკრძალულია';
      result.message = '№190-ის ნუსხაშია. ჩვეულებრივი ნადირობა და ბუნებრივი გარემოდან მოპოვება აკრძალულია მთელი წლის განმავლობაში. კანონით გათვალისწინებულ განსაკუთრებულ შემთხვევებს სამინისტროს წერილობითი თანხმობა სჭირდება; ეს სეზონური სანადირო ნებართვა არ არის.';
      result.sources = [SOURCES.red, SOURCES.redLaw, SOURCES.matsne];
      return result;
    }
    result.sources = [SOURCES.hunting, SOURCES.huntingLaw, SOURCES.matsne];
    result.details.push('ნადირობა აკრძალულია ქალაქის ადმინისტრაციულ საზღვრებში, ნაკრძალში/ეროვნულ პარკში, ნაკრძალთან 500-მეტრიან და ეროვნულ პარკთან 250-მეტრიან ზონებში. სამუხის ტერიტორია და სააგენტოს საშენი მეურნეობები შეზღუდულია (DES, 2026).');
    if (species.kind === 'mammal') {
      result.status = 'permit'; result.title = 'ძუძუმწოვარი: ცალკე ტერიტორია და მოპოვების უფლება';
      result.message = 'გადამფრენ ფრინველებზე 10-ლარიანი მოსაკრებელი ამ ცხოველზე ნადირობის უფლებას არ იძლევა. ნადირობა დაიშვება სპეციალურად გამოყოფილ ტერიტორიაზე, კანონით დადგენილ შემთხვევაში; კონკრეტული მეურნეობის მართვის გეგმა, სახეობის დაშვება, ლიმიტი და ნებართვა გადაამოწმე.';
      return result;
    }
    if (species.kind !== 'bird') {
      result.title = 'ამ სახეობის მოპოვების დაშვება დადასტურებული არ არის';
      result.message = 'გამოიყენე დაკვირვების ცნობარად. ამ სახეობისთვის მოპოვების დაშვება და დაცული სტატუსი ცალკე გადაამოწმე; გადამფრენი ფრინველების სეზონი მასზე არ ვრცელდება.';
      return result;
    }
    const rule = BIRDS[key];
    if (!rule) {
      result.title = 'გადამფრენი ფრინველების საერთო დაშვება აქ არ დასტურდება';
      result.message = '2026 წლის სამონადირეო მეურნეობის გარეთ დაშვებული გადამფრენი ფრინველების ნუსხაში ამ სამეცნიერო სახელზე ჩანაწერი აქ არ არის. ეს დაცულ სტატუსს ავტომატურად არ ნიშნავს. სხვა დაშვება, მეურნეობა და მოქმედი ნუსხა ცალკე გადაამოწმე; გამოიყენე დაკვირვების ცნობარად.';
      return result;
    }
    if (rule.highland && context.area === 'unknown') {
      const standard = birdWindow(rule, context.date, 'standard'), highland = birdWindow(rule, context.date, 'highland');
      const hasSource = !!(standard && highland);
      const anyOpen = hasSource && [standard, highland].some(period => inWindow(context.date, period.start, period.end, period.until));
      result.status = hasSource ? (anyOpen ? 'conditional' : 'prohibited') : 'unverified';
      result.title = !hasSource ? 'ამ წლის სანადირო სეზონი ჯერ არ არის გადამოწმებული' : anyOpen ? 'იხვის ვადა მუნიციპალიტეტზეა დამოკიდებული' : 'ამ დღეს იხვის ორივე ტერიტორიული ვადა დახურულია';
      result.message = !hasSource
        ? 'აქ დადასტურებულია მხოლოდ 2025 და 2026 წლებში გახსნილი სეზონების მონაცემები. მომავალი წლის გახსნის დღე ავტომატურად არ გამოითვლება.'
        : 'გარეული იხვი: ახალქალაქი, ნინოწმინდა, წალკა, დმანისი — 10.09–31.12, 5 ცალი/დღე. საქართველოს სხვა ტერიტორიები — 01.11–01.03-მდე, 6 ცალი/დღე. აირჩიე მუნიციპალიტეტის ჯგუფი ზუსტი დღის შესამოწმებლად.';
    } else {
      const period = birdWindow(rule, context.date, context.area);
      if (!period) {
        result.title = 'ამ წლის სანადირო სეზონი ჯერ არ არის გადამოწმებული';
        result.message = 'აქ დადასტურებულია მხოლოდ 2025 და 2026 წლებში გახსნილი სეზონების მონაცემები. მომავალი წლის გახსნის დღე ავტომატურად არ გამოითვლება.';
      } else {
        result.period = period; result.limit = period.limit;
        const boundary = period.until && period.end.endsWith('02-15') && context.date === period.end;
        const active = inWindow(context.date, period.start, period.end, period.until);
        result.status = boundary ? 'conditional' : active ? 'conditional' : 'prohibited';
        result.title = boundary ? 'სეზონის დახურვის საზღვრის დღე — გადაამოწმე 153-ზე' : active ? 'თარიღი სახეობის მითითებულ ვადაშია' : 'ამ დღეს სახეობის სანადირო ვადა დახურულია';
        result.message = 'ოფიციალური ვადა: ' + period.start.split('-').reverse().join('.') + ' — ' + period.end.split('-').reverse().join('.') + (period.until ? '-მდე' : '') + '. დღიური ლიმიტი: ' + period.limit + ' ცალი. ვადა ეხება სამონადირეო მეურნეობის გარეთ ნადირობას; დაშვებული ტერიტორია და პირადი დოკუმენტები აუცილებელია.';
      }
    }
    result.details.push('გადამფრენ ფრინველებზე: 10-ლარიანი მოსაკრებლის ქვითარი და შესაბამისი სანადირო იარაღის შენახვა/ტარების დოკუმენტი თან იქონიე. აკრძალულია ელექტრონული ხმოვანი მიმზიდველები და მასობრივი მოპოვების აკრძალული მეთოდები.');
    return result;
  }
  function markup(value, options) {
    const result = evaluate(value, options), compact = options && options.compact;
    const date = result.dateValid ? result.date.split('-').reverse().join('.') : result.date;
    const method = ({ rod: 'სამოყვარულო ჭერა', release: 'გაშვებით რეკრეაციული ჭერა', commercial: 'სარეწაო ჭერა', other: 'სხვა მეთოდი', unknown: 'მეთოდი დაუზუსტებელია' }[result.method] || 'მეთოდი დაუზუსტებელია');
    return '<section class="wildlife-rule wildlife-rule--' + esc(result.status) + (compact ? ' wildlife-rule--compact' : '') + '" aria-label="მოპოვების წესები">'
      + '<div class="wildlife-rule-heading"><span aria-hidden="true">⚖️</span><strong>' + esc(result.title) + '</strong></div>'
      + '<p class="wildlife-rule-context">' + esc(result.species.name) + ' · ' + esc(date) + ' · საქართველო' + (result.species.kind === 'fish' ? ' · ' + esc(method) : '') + '</p>'
      + (result.location ? '<p class="wildlife-rule-context">ადგილი: ' + esc(result.location) + '</p>' : '')
      + '<p>' + esc(result.message) + '</p>'
      + (result.details.length ? '<details' + (compact ? '' : ' open') + '><summary>ადგილი, მეთოდი და დამატებითი პირობები</summary><ul>' + result.details.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul></details>' : '')
      + '<div class="wildlife-rule-sources">' + result.sources.map(source => '<a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.label) + ' ↗</a>').join('') + '</div>'
      + '<small class="wildlife-rule-note">წყარო შემოწმებულია: 12.10.2026. დრო: საქართველო (Asia/Tbilisi). აქტივობის ქულა მოპოვების ნებართვას არ ადასტურებს.</small></section>';
  }
  function mount(container, value, options) { if (container) container.innerHTML = markup(value, options); }
  global.GeoWildlifeRules = Object.freeze({ today, validDate, normaliseSpecies, evaluate, markup, mount, sources: SOURCES });
})(typeof window === 'undefined' ? globalThis : window);
