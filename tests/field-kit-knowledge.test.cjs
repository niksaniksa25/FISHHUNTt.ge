const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page(kind, stored = null) {
  const elements = new Map(), ready = [], all = [], values = new Map(stored === null ? [] : [['gn_fieldkit_v1', stored]]);
  let failRead = false, failWrite = false;
  function node(tag = 'div', id = '') {
    const n = {tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, listeners: {}, className: '', checked: false, disabled: false, value: '', textContent: '', parentElement: null};
    all.push(n);
    Object.defineProperty(n, 'id', {get: () => id, set: value => {id = value; elements.set(value, n);}});
    if (id) elements.set(id, n);
    n.setAttribute = (key, value) => {n.attributes[key] = String(value);};
    n.getAttribute = key => n.attributes[key];
    n.appendChild = child => {child.parentElement = n; n.children.push(child); return child;};
    n.replaceChildren = (...children) => {n.children = []; children.forEach(n.appendChild);};
    n.insertAdjacentElement = (_, child) => {n.parentElement?.appendChild(child);};
    n.closest = selector => n.className.split(' ').includes(selector.slice(1)) ? n : n.parentElement?.closest(selector);
    n.querySelectorAll = selector => {
      const result = [];
      for (const child of n.children) {
        if ((selector === '.fact-filter' && child.className.split(' ').includes('fact-filter')) || (selector === 'input[type="checkbox"]' && child.tagName === 'INPUT' && child.type === 'checkbox') || (selector[0] === '.' && child.className.split(' ').includes(selector.slice(1)))) result.push(child);
        result.push(...child.querySelectorAll(selector));
      }
      return result;
    };
    n.querySelector = selector => selector[0] === '#' ? elements.get(selector.slice(1)) || null : n.querySelectorAll(selector)[0] || null;
    n.addEventListener = (event, fn) => {n.listeners[event] ??= []; n.listeners[event].push(fn);};
    n.dispatch = (event, extra = {}) => {
      const e = {target: n, preventDefault() {this.prevented = true;}, ...extra};
      for (const fn of n.listeners[event] || []) fn(e);
      return e;
    };
    n.click = () => {if (!n.disabled) {n.onclick?.(); n.dispatch('click');}};
    n.focus = () => {document.activeElement = n;};
    n.classList = {toggle(cls, active) {const set = new Set(n.className.split(' ').filter(Boolean)); active ? set.add(cls) : set.delete(cls); n.className = [...set].join(' ');}, contains: cls => n.className.split(' ').includes(cls)};
    let html = '';
    Object.defineProperty(n, 'innerHTML', {get: () => html, set: value => {
      html = value; n.children = [];
      elements.delete('factsReset');
      for (const match of value.matchAll(/<button([^>]*)>(.*?)<\/button>/g)) {
        const button = node('button');
        const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2].replace(/&amp;/g, '&')]));
        if (attrs.id) button.id = attrs.id;
        button.className = attrs.class || '';
        button.dataset.q = attrs['data-q'];
        button.textContent = match[2];
        for (const [key, text] of Object.entries(attrs)) button.setAttribute(key, text);
        n.appendChild(button);
      }
    }});
    return n;
  }
  const root = node('main'), grid = node();
  grid.className = 'field-kit-grid'; root.appendChild(grid);
  if (kind === 'kit') {
    for (const prefix of ['fish', 'hunt']) {
      const card = node('article'); card.className = 'field-kit-card'; grid.appendChild(card);
      card.appendChild(node('div', prefix + 'Kit'));
      card.appendChild(node('span', prefix + 'Count'));
      const actions = node(); actions.className = 'kit-summary'; card.appendChild(actions);
      actions.appendChild(node('span', prefix + 'Summary'));
    }
  } else {
    for (const id of ['factsSearch', 'factsCount', 'factCategories', 'factsGrid']) root.appendChild(node(id === 'factsSearch' ? 'input' : 'div', id));
  }
  const document = {readyState: 'loading', getElementById: id => elements.get(id) || null, createElement: node, querySelector: selector => selector === '.field-kit-grid' ? grid : null, addEventListener: (event, fn) => {if (event === 'DOMContentLoaded') ready.push(fn);}, activeElement: null};
  const localStorage = {getItem(key) {if (failRead) throw new Error('Storage blocked'); return values.get(key) ?? null;}, setItem(key, value) {if (failWrite) throw new Error('Storage full'); values.set(key, value);}};
  const context = vm.createContext({document, localStorage, console, Date, Math, Object, Array, String, JSON});
  context.window = context;
  const run = () => {vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', kind === 'kit' ? 'field-kit.js' : 'geo-knowledge.js'), 'utf8'), context); ready.forEach(fn => fn());};
  return {context, document, run, get: id => elements.get(id), values, readFails: () => {failRead = true;}, writeFails: value => {failWrite = value;}, boxes: () => [...elements.get('fishKit').querySelectorAll('input[type="checkbox"]'), ...elements.get('huntKit').querySelectorAll('input[type="checkbox"]')]};
}

test('corrupt checklist storage cannot remove the twenty usable checklist controls', () => {
  for (const stored of ['null', '[]', '42', '"saved"', '{broken']) {
    const p = page('kit', stored); p.run();
    assert.equal(p.boxes().length, 20, stored);
    assert.equal(p.get('fishCount').textContent, '0 / 10');
    assert.equal(p.get('huntCount').textContent, '0 / 10');
    assert.equal(p.get('fieldKitStatus').dataset.saved, 'false');
    assert.match(p.get('fishKit').children[0].children[1].textContent, /სათევზაო ჯოხი/);
  }
});
test('saved checklist values accept only known boolean fields rather than truthy strings', () => {
  const p = page('kit', JSON.stringify({f0: true, f1: 'false', f2: 1, f3: [], f4: false, h9: true, extra: true})); p.run();
  assert.equal(p.get('fishCount').textContent, '1 / 10');
  assert.equal(p.get('fishSummary').textContent, '10% მზად');
  assert.equal(p.get('huntCount').textContent, '1 / 10');
  assert.equal(p.boxes()[0].checked, true);
  assert.equal(p.boxes()[1].checked, false);
  assert.deepEqual({...p.context.GeoNatureFieldKit.snapshot()}, {f0: true, f4: false, h9: true});
});
test('checklist changes persist across visits and each reset preserves the other list', () => {
  const p = page('kit'); p.run();
  const inputs = p.boxes();
  for (const index of [0, 3, 10]) {inputs[index].checked = true; inputs[index].dispatch('change');}
  assert.equal(p.get('fishCount').textContent, '2 / 10');
  assert.equal(p.get('huntSummary').textContent, '10% მზად');
  p.get('fishKitReset').click();
  assert.equal(p.get('fishCount').textContent, '0 / 10');
  assert.ok(inputs.slice(0, 10).every(x => !x.checked));
  assert.equal(p.get('huntCount').textContent, '1 / 10');
  assert.equal(p.get('fishKitReset').disabled, true);
  const next = page('kit', p.values.get('gn_fieldkit_v1')); next.run();
  assert.equal(next.get('huntCount').textContent, '1 / 10');
  assert.equal(next.boxes()[10].checked, true);
  assert.equal(p.get('fieldKitStatus').dataset.saved, 'true');
});
test('blocked checklist storage leaves controls and counts working with an honest unsaved status', () => {
  const p = page('kit'); p.readFails(); p.writeFails(true); p.run();
  assert.equal(p.boxes().length, 20);
  const input = p.boxes()[0]; input.checked = true; input.dispatch('change');
  assert.equal(p.get('fishCount').textContent, '1 / 10');
  assert.equal(p.get('fishSummary').textContent, '10% მზად');
  assert.match(p.get('fieldKitStatus').textContent, /ცვლილება ვერ შეინახა/);
  assert.equal(p.get('fieldKitStatus').dataset.saved, 'false');
  p.writeFails(false); input.checked = false; input.dispatch('change');
  assert.equal(p.get('fieldKitStatus').dataset.saved, 'true');
  assert.equal(JSON.parse(p.values.get('gn_fieldkit_v1')).f0, false);
});
test('knowledge no-match search explains the empty result and resets both search and category', () => {
  const p = page('knowledge'); p.run();
  const categories = p.get('factCategories').querySelectorAll('.fact-filter');
  assert.equal(categories.length, 9);
  categories[1].click();
  assert.equal(categories[1].getAttribute('aria-pressed'), 'true');
  p.get('factsSearch').value = 'no-such-fact-98423'; p.get('factsSearch').dispatch('input');
  assert.match(p.get('factsGrid').innerHTML, /ინფორმაცია ვერ მოიძებნა/);
  assert.match(p.get('factsCount').textContent, /^0 ინფორმაცია/);
  assert.equal(p.get('factsCount').getAttribute('aria-live'), 'polite');
  p.get('factsReset').click();
  assert.equal(p.get('factsSearch').value, '');
  assert.equal(p.get('factsCount').textContent, '96 ინფორმაცია');
  assert.equal(categories[0].getAttribute('aria-pressed'), 'true');
  assert.equal(categories[1].getAttribute('aria-pressed'), 'false');
  assert.equal(p.document.activeElement, p.get('factsSearch'));
});
test('knowledge text search respects the selected category and Escape restores all facts', () => {
  const p = page('knowledge'); p.run();
  const categories = p.get('factCategories').querySelectorAll('.fact-filter');
  categories[1].click();
  assert.match(p.get('factsCount').textContent, /^12 ინფორმაცია/);
  const search = p.get('factsSearch'); search.value = 'ჟანგბადის'; search.dispatch('input');
  assert.match(p.get('factsCount').textContent, /^1 ინფორმაცია/);
  assert.match(p.get('factsGrid').innerHTML, /🎣 თევზაობა/);
  const e = search.dispatch('keydown', {key: 'Escape'});
  assert.equal(e.prevented, true);
  assert.equal(search.value, '');
  assert.equal(p.get('factsCount').textContent, '96 ინფორმაცია');
  assert.equal(categories[0].getAttribute('aria-pressed'), 'true');
});
