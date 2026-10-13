const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/analytics-feedback.js'), 'utf8');

function fixture({ github = true, reply, blockedNavigation = false, clipboard, draft } = {}) {
  const events = {}, requests = [], navigations = [], storage = new Map();
  if (draft) storage.set('gn_feedback_draft_v1', JSON.stringify(draft));
  let active;
  function element(tag = 'div') {
    return {
      tagName: tag, value: '', textContent: '', className: '', hidden: false, disabled: false,
      isConnected: true, inert: false, style: {}, children: [], listeners: {}, attributes: {},
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren(...children) { this.children = children; this.textContent = ''; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      focus() { active = this; }, select() { this.selected = true; }, remove() {},
      getClientRects() { return this.hidden ? [] : [{}]; },
    };
  }
  const message = element('textarea'), email = element('input'), category = element('select');
  category.value = 'bug';
  const submit = element('button'), form = element('form'), status = element(), close = element('button');
  const help = element('p'), emailLabel = element('label'), dialog = element('section');
  form.elements = { namedItem: name => ({ message, email, category })[name] };
  form.reportValidity = () => !!message.value && (email.disabled || !email.value || email.value.includes('@'));
  form.reset = () => { message.value = ''; email.value = ''; category.value = 'bug'; };
  form.querySelector = selector => selector === '#gnFeedbackEmailLabel' ? emailLabel : submit;
  const selectors = { '.gn-feedback-close': close, '#gnFeedbackForm': form, '.gn-feedback-status': status, '#gnFeedbackHelp': help, '.gn-feedback-dialog': dialog };
  const background = element('main'), body = element('body'), head = element('head');
  body.appendChild(background);
  const document = {
    body, head, title: 'Feedback fixture', baseURI: 'https://niksaniksa25.github.io/FISHHUNTt.ge/',
    get activeElement() { return active; }, querySelector() { return null; },
    addEventListener(type, listener) { events[type] = listener; }, execCommand() { return false; },
    createElement(tag) {
      const created = element(tag);
      if (tag === 'div') {
        created.querySelector = selector => selectors[selector];
        created.querySelectorAll = () => [close, category, message, email, submit].filter(node => !node.disabled);
        created.contains = node => [close, category, message, email, submit].includes(node);
      }
      return created;
    },
  };
  const context = {
    document, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    navigator: { clipboard }, crypto: { randomUUID: () => 'feedback-visitor-fixture-123456' },
    __GN_API_CONFIG_LOADED: true, GN_API_BASE_URL: '',
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: {
      hostname: github ? 'niksaniksa25.github.io' : 'localhost', protocol: 'https:',
      origin: github ? 'https://niksaniksa25.github.io' : 'https://localhost',
      pathname: '/FISHHUNTt.ge/fishing.html', search: '?token=private#private',
      assign(url) { if (blockedNavigation) throw Error('Navigation blocked by fixture'); navigations.push(url); },
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/analytics/visit')) return { ok: true };
      if (reply) return reply(url, options);
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const fab = body.children[1], overlay = body.children[2];
  return {
    message, email, emailLabel, category, submit, status, form, fab, overlay, background, help,
    requests, navigations, storage, events,
    async ready() { await Promise.resolve(); await Promise.resolve(); },
    async send(text = 'ტელეფონზე ღილაკი არ იხსნება') { message.value = text; await form.listeners.submit({ preventDefault() {} }); },
    get link() { return status.children[1]?.children[0]; },
    get copy() { return status.children[1]?.children[1]; },
    get active() { return active; },
  };
}

test('static feedback opens a prefilled issue in one action and retains the unsent draft', async () => {
  const app = fixture(); await app.ready(); app.email.value = 'private@example.test';
  await app.send();
  assert.equal(app.navigations.length, 1);
  const url = new URL(app.navigations[0]);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/niksaniksa25/FISHHUNTt.ge/issues/new');
  assert.ok(url.searchParams.get('body').includes(app.message.value));
  assert.ok(!url.search.includes('private'));
  assert.equal(app.requests.length, 0);
  assert.equal(JSON.parse(app.storage.get('gn_feedback_draft_v1')).message, app.message.value);
  assert.ok(app.status.children[0].textContent.includes('ჯერ არ გაგზავნილა'));
});

test('public GitHub delivery explains its final submit step and does not validate an unused email', async () => {
  const app = fixture({ draft: { message: 'saved', email: 'invalid-unused-email', category: 'idea' } });
  await app.ready();
  assert.equal(app.email.hidden, true); assert.equal(app.email.disabled, true); assert.equal(app.emailLabel.hidden, true);
  assert.ok(app.help.textContent.includes('Create issue'));
  assert.ok(app.help.textContent.includes('საჯაროა'));
  await app.send('saved'); assert.equal(app.navigations.length, 1);
});

test('blocked same-tab navigation keeps a usable link and full text copy without claiming delivery', async () => {
  const copied = [], app = fixture({ blockedNavigation: true, clipboard: { writeText: async text => copied.push(text) } });
  await app.ready(); const full = 'სრული შეტყობინება '.repeat(100).trim(); await app.send(full);
  assert.equal(app.navigations.length, 0);
  assert.ok(app.link.href.startsWith('https://github.com/niksaniksa25/FISHHUNTt.ge/issues/new?'));
  assert.equal(app.link.target, undefined);
  assert.ok(new URL(app.link.href).searchParams.get('body').includes('პირველი 500'));
  assert.deepEqual(copied, [full]);
  await app.copy.listeners.click(); assert.deepEqual(copied, [full, full]);
  assert.equal(app.message.value, full);
});

test('a long report waits for manual copying when clipboard access is unavailable', async () => {
  const app = fixture(); await app.ready(); const full = 'გრძელი ტექსტი '.repeat(100).trim(); await app.send(full);
  assert.equal(app.navigations.length, 0); assert.equal(app.message.selected, true);
  assert.ok(app.status.children[0].textContent.includes('დააკოპირე'));
  assert.equal(JSON.parse(app.storage.get('gn_feedback_draft_v1')).message, full);
  assert.ok(app.link.href); assert.equal(app.message.value, full);
});

test('denied or unavailable clipboard selects the message for manual copying', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw Error('Denied'); } }]) {
    const app = fixture({ blockedNavigation: true, clipboard }); await app.ready(); await app.send();
    await app.copy.listeners.click();
    assert.equal(app.message.selected, true); assert.equal(app.active, app.message);
    assert.ok(app.copy.textContent.includes('მონიშნულია'));
  }
});

test('API validation and throttling remain errors without navigation or public fallback', async () => {
  for (const code of [400, 429]) {
    const app = fixture({ github: false, reply: async () => ({ ok: false, status: code, json: async () => ({ message: 'API rejected' }) }) });
    await app.ready(); await app.send();
    assert.equal(app.status.className, 'gn-feedback-status error');
    assert.equal(app.link, undefined); assert.equal(app.navigations.length, 0);
    assert.ok(app.storage.has('gn_feedback_draft_v1')); assert.equal(app.submit.disabled, false);
  }
});

test('only an acknowledged API record clears the draft', async () => {
  const app = fixture({ github: false, reply: async () => ({ ok: true, status: 201, json: async () => ({ ok: true, id: 'stored-123' }) }) });
  await app.ready(); await app.send();
  assert.equal(app.message.value, ''); assert.equal(app.storage.has('gn_feedback_draft_v1'), false);
  assert.ok(app.status.textContent.includes('✅')); assert.equal(app.navigations.length, 0);
});

test('HTML, missing record acknowledgement and network errors preserve the draft', async () => {
  for (const reply of [
    async () => ({ ok: true, status: 200, json: async () => { throw Error('HTML response'); } }),
    async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    async () => { throw Error('Offline'); },
  ]) {
    const app = fixture({ github: false, reply }); await app.ready(); await app.send();
    assert.ok(app.status.children[0].textContent.includes('დადასტურება ვერ მივიღეთ'));
    assert.ok(app.link); assert.ok(app.storage.has('gn_feedback_draft_v1'));
    assert.equal(app.navigations.length, 0); assert.equal(app.form.attributes['aria-busy'], undefined);
  }
});

test('dialog restores background interactivity and focus on Escape', async () => {
  const app = fixture(); await app.ready(); app.fab.focus(); app.fab.listeners.click();
  assert.equal(app.overlay.hidden, false); assert.equal(app.background.inert, true); assert.equal(app.active, app.message);
  app.events.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(app.overlay.hidden, true); assert.equal(app.background.inert, false); assert.equal(app.active, app.fab);
});

test('double taps during a pending clipboard operation open only one GitHub draft', async () => {
  let release;
  const app = fixture({ clipboard: { writeText: () => new Promise(resolve => { release = resolve; }) } });
  await app.ready(); app.message.value = 'დიდი შეტყობინება '.repeat(50);
  const pending = app.form.listeners.submit({ preventDefault() {} });
  assert.equal(app.submit.disabled, true);
  await app.form.listeners.submit({ preventDefault() {} });
  release(); await pending;
  assert.equal(app.navigations.length, 1); assert.equal(app.submit.disabled, false);
});

test('double submits during an API request save only one record', async () => {
  let release;
  const app = fixture({ github: false, reply: () => new Promise(resolve => { release = resolve; }) });
  await app.ready(); app.message.value = 'one stored report';
  const pending = app.form.listeners.submit({ preventDefault() {} });
  assert.equal(app.message.readOnly, true); assert.equal(app.category.disabled, true);
  await app.form.listeners.submit({ preventDefault() {} });
  assert.equal(app.requests.filter(request => request.url.endsWith('/feedback')).length, 1);
  release({ ok: true, status: 201, json: async () => ({ ok: true, id: 'saved-once' }) }); await pending;
  assert.equal(app.message.value, ''); assert.equal(app.message.readOnly, false); assert.equal(app.category.disabled, false);
});

test('editing an unsent draft removes the old public issue link and keeps the new text', async () => {
  const app = fixture({ blockedNavigation: true }); await app.ready(); await app.send(); assert.ok(app.link);
  app.message.value = 'a revised report'; app.form.listeners.input();
  assert.equal(app.link, undefined); assert.equal(JSON.parse(app.storage.get('gn_feedback_draft_v1')).message, 'a revised report');
});
