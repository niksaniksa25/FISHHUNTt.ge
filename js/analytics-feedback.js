/* GeoNature analytics + feedback widget. When no API is configured, offers a no-backend GitHub Issues fallback. */
(function () {
  'use strict';
  if (document.querySelector('.gn-feedback-fab')) return;
  const STORAGE_KEY = 'gn_analytics_visitor_v1';
  const DRAFT_KEY = 'gn_feedback_draft_v1';
  function getVisitorId() {
    try {
      let id = localStorage.getItem(STORAGE_KEY);
      if (!id || !/^[A-Za-z0-9_-]{16,80}$/.test(id)) {
        id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : ('gn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch (_) {
      return 'gn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
  }
  const visitorId = getVisitorId();
  const currentPath = location.pathname || '/';
  const queryParams = new URLSearchParams(location.search || '');
  const referralCode = String(queryParams.get('ref') || queryParams.get('invite') || '').trim().slice(0,140);
  if (referralCode) { try { localStorage.setItem('gn_referral_code', referralCode); } catch (_) {} }
  const apiConfigReady = new Promise(resolve => {
    if (window.__GN_API_CONFIG_LOADED) { resolve(); return; }
    const script = document.createElement('script');
    script.src = new URL('js/api-config.js', document.baseURI).href;
    const timer = setTimeout(resolve, 7000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); resolve(); };
    document.head.appendChild(script);
  });
  function apiBase() { let base = String(window.GN_API_BASE_URL || '').trim(); while (base.endsWith('/')) base = base.slice(0, -1); return base; }
  function apiEndpoint(route) {
    const base = apiBase();
    if (base) return base + route;
    // GitHub Pages serves only static files: /api/* exists only on the Node backend.
    if (location.protocol === 'file:' || String(location.hostname || '').toLowerCase().endsWith('.github.io')) return '';
    return route;
  }
  let apiConfigSettled = false;
  if (!String(currentPath).toLowerCase().endsWith('/admin.html')) {
    apiConfigReady.then(() => {
      const endpoint = apiEndpoint('/api/analytics/visit');
      if (!endpoint) return;
      return fetch(endpoint, {
        method: 'POST', credentials: apiBase() ? 'include' : 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, path: currentPath, title: document.title || 'GeoNature', referralCode }), keepalive: true
      });
    }).catch(() => {});
  }

  const style = document.createElement('style');
  style.textContent = `
  .gn-feedback-fab{position:fixed;z-index:9000;left:18px;bottom:18px;display:flex;align-items:center;gap:8px;border:1px solid rgba(118,235,170,.5);border-radius:999px;padding:11px 16px;background:linear-gradient(135deg,#0c2b22,#102b40);color:#e7fff4;font:700 13px/1.2 system-ui,sans-serif;box-shadow:0 8px 30px #0005;cursor:pointer;transition:transform .18s,box-shadow .18s}
  .gn-feedback-fab:hover{transform:translateY(-2px);box-shadow:0 12px 32px #0007}.gn-feedback-overlay[hidden]{display:none!important}.gn-feedback-overlay{position:fixed;inset:0;top:var(--gn-visual-top,0px);bottom:auto;height:var(--gn-visible-height,100vh);height:var(--gn-visible-height,100dvh);box-sizing:border-box;z-index:9001;display:grid;place-items:center;padding:16px;background:rgba(2,8,14,.72);backdrop-filter:blur(7px)}
  .gn-feedback-dialog{width:min(510px,100%);min-width:0;box-sizing:border-box;max-height:min(760px,calc(var(--gn-visible-height,100vh) - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)));max-height:min(760px,calc(var(--gn-visible-height,100dvh) - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)));overflow:auto;overscroll-behavior:contain;border:1px solid rgba(105,222,163,.35);border-radius:22px;padding:22px;background:linear-gradient(160deg,#10231f,#0b1725 75%);color:#edf8f3;box-shadow:0 24px 80px #0008;font:14px/1.55 system-ui,sans-serif}
  .gn-feedback-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}.gn-feedback-head h2{font-size:22px;margin:0 0 5px}.gn-feedback-head p{margin:0;color:#a6bdba;font-size:13px}.gn-feedback-close{border:1px solid #426258;background:#142d28;color:#eafff4;border-radius:10px;font-size:20px;width:38px;height:38px;cursor:pointer}
  .gn-feedback-dialog [hidden]{display:none!important}.gn-feedback-close{flex:0 0 44px;width:44px;height:44px}
  .gn-feedback-dialog label{display:block;font-weight:700;margin:13px 0 6px;color:#d5e8e1}.gn-feedback-dialog select,.gn-feedback-dialog textarea,.gn-feedback-dialog input{width:100%;box-sizing:border-box;border:1px solid #344e4c;border-radius:11px;padding:11px 12px;background:#07141b;color:#effff8;font:inherit;outline:none}.gn-feedback-dialog textarea{min-height:130px;resize:vertical}.gn-feedback-dialog select:focus,.gn-feedback-dialog textarea:focus,.gn-feedback-dialog input:focus{border-color:#57d99a;box-shadow:0 0 0 3px #57d99a20}
  .gn-feedback-note{font-size:12px;color:#9bb6b1;margin:10px 0}.gn-feedback-submit{width:100%;border:0;border-radius:12px;padding:13px 16px;background:linear-gradient(135deg,#3dd989,#25b8a4);color:#032018;font-weight:900;font-size:14px;cursor:pointer}.gn-feedback-submit:disabled{opacity:.55;cursor:wait}.gn-feedback-status{min-height:20px;font-size:13px;margin-top:10px;color:#baf7d0;overflow-wrap:anywhere}.gn-feedback-status.error{color:#ffaaa8}.gn-feedback-status.fallback{color:#ffdca8}.gn-feedback-fallback-link{display:inline-block;margin:8px 0;padding:10px 13px;border-radius:10px;background:#3dd989;color:#032018;font-weight:900;text-decoration:none}.gn-feedback-fallback-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.gn-feedback-copy{border:1px solid #526f64;border-radius:10px;padding:9px 12px;background:#102a25;color:#e7fff4;font:700 12px system-ui,sans-serif;cursor:pointer}
  .gn-feedback-dialog :focus-visible,.gn-feedback-fab:focus-visible{outline:3px solid #93e9c0;outline-offset:3px}.gn-feedback-close,.gn-feedback-copy,.gn-feedback-fallback-link{min-height:44px}.gn-feedback-fab{bottom:calc(18px + env(safe-area-inset-bottom,0px))}.gn-feedback-overlay{padding: max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
  @media(max-width:600px){.gn-feedback-fab{left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));padding:10px 13px;font-size:12px}.gn-feedback-dialog{padding:17px;border-radius:17px}.gn-feedback-dialog select,.gn-feedback-dialog textarea,.gn-feedback-dialog input{font-size:16px}.gn-feedback-head h2{font-size:19px}}
  @media(prefers-reduced-motion:reduce){.gn-feedback-fab{transition:none}}
  `;
  document.head.appendChild(style);
  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'gn-feedback-fab'; fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-controls', 'gnFeedbackDialog'); fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = '<span aria-hidden="true">💬</span><span>Feedback / შეცდომა</span>';
  const overlay = document.createElement('div'); overlay.className = 'gn-feedback-overlay'; overlay.hidden = true;
  overlay.innerHTML = `
    <section id="gnFeedbackDialog" class="gn-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="gnFeedbackTitle" aria-describedby="gnFeedbackHelp">
      <div class="gn-feedback-head"><div><h2 id="gnFeedbackTitle">შეტყობინება GeoNature-ს</h2><p>იპოვე შეცდომა ან გაქვს იდეა? მოგვწერე, რა მოხდა და როგორ გავიმეოროთ.</p></div><button type="button" class="gn-feedback-close" aria-label="დახურვა">×</button></div>
      <form id="gnFeedbackForm"><label for="gnFeedbackCategory">ტიპი</label><select id="gnFeedbackCategory" name="category"><option value="bug">🐛 შეცდომა / არ მუშაობს</option><option value="idea">💡 ახალი იდეა</option><option value="question">❓ კითხვა</option><option value="other">💬 სხვა</option></select>
      <label for="gnFeedbackMessage">რა მოხდა? / რას შევცვლიდი?</label><textarea id="gnFeedbackMessage" name="message" minlength="1" maxlength="4000" required placeholder="აღწერე ნაბიჯები, გვერდი ან შეცდომა…"></textarea>
      <label id="gnFeedbackEmailLabel" for="gnFeedbackEmail">ელფოსტა პასუხისთვის (არასავალდებულო)</label><input id="gnFeedbackEmail" name="email" type="email" maxlength="160" placeholder="name@example.com">
      <p id="gnFeedbackHelp" class="gn-feedback-note">გვერდი ავტომატურად მიეთითება. პაროლი ან ბარათის მონაცემები არ ჩაწერო. თუ პირდაპირი გაგზავნა მიუწვდომელია, შეგიძლია GitHub-ზე შექმნა საჯარო შეტყობინება. ამისთვის GitHub-ის ანგარიში დაგჭირდება; ელფოსტა იქ არ გადაგზავნება.</p>
      <button type="submit" class="gn-feedback-submit">შეტყობინების გაგზავნა</button><div class="gn-feedback-status" role="status" aria-live="polite"></div></form>
    </section>`;
  document.body.appendChild(fab); document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector('.gn-feedback-close');
  const form = overlay.querySelector('#gnFeedbackForm');
  const status = overlay.querySelector('.gn-feedback-status');
  const messageField = form.elements.namedItem('message');
  const categoryField = form.elements.namedItem('category');
  const emailField = form.elements.namedItem('email');
  const submit = form.querySelector('button[type="submit"]');
  let previousFocus = null;
  let previousOverflow = '';
  let background = [];
  let sending = false;
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (draft && typeof draft === 'object') {
      messageField.value = String(draft.message || '').slice(0,4000);
      emailField.value = String(draft.email || '').slice(0,160);
      if (['bug','idea','question','other'].includes(draft.category)) categoryField.value = draft.category;
    }
  } catch (_) {}
  function saveDraft() {
    try {
      if (!messageField.value && !emailField.value) sessionStorage.removeItem(DRAFT_KEY);
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ message: messageField.value, category: categoryField.value, email: emailField.value }));
    } catch (_) {}
  }
  form.addEventListener('input', () => {
    saveDraft();
    // Edited text is a new draft: remove stale links and previous confirmations.
    if (!sending) { status.replaceChildren(); status.className = 'gn-feedback-status'; }
  });
  form.addEventListener('change', saveDraft);
  function close() {
    if (overlay.hidden) return;
    saveDraft();
    overlay.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    background.forEach(([element, inert]) => { element.inert = inert; });
    background = [];
    document.body.style.overflow = previousOverflow;
    if (previousFocus && previousFocus.isConnected) previousFocus.focus(); else fab.focus();
  }
  fab.addEventListener('click', () => {
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    background = Array.from(document.body.children).filter(element => element !== overlay).map(element => [element, element.inert]);
    background.forEach(([element]) => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    overlay.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    messageField.focus();
  });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(overlay.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(element => element.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });
  function updateDeliveryMode() {
    const githubOnly = !apiEndpoint('/api/feedback');
    emailField.hidden = githubOnly;
    emailField.disabled = githubOnly;
    form.querySelector('#gnFeedbackEmailLabel').hidden = githubOnly;
    submit.textContent = githubOnly ? 'GitHub-ზე შეტყობინების გახსნა ↗' : 'შეტყობინების გაგზავნა';
    overlay.querySelector('#gnFeedbackHelp').textContent = githubOnly
      ? 'ღილაკი გახსნის GitHub-ის შევსებულ ფორმას ამავე ჩანართში. შედი GitHub-ის ანგარიშით და დააჭირე „Create issue“-ს — მხოლოდ მაშინ გაიგზავნება. შეტყობინება საჯაროა; პაროლი, ელფოსტა ან ბარათის მონაცემები ტექსტში არ ჩაწერო. მონახაზი ამ ჩანართში შეინახება.'
      : 'გვერდი ავტომატურად მიეთითება. პაროლი ან ბარათის მონაცემები არ ჩაწერო. თუ პირდაპირი გაგზავნა მიუწვდომელია, შეგიძლია GitHub-ზე შექმნა საჯარო შეტყობინება. ამისთვის GitHub-ის ანგარიში დაგჭირდება; ელფოსტა იქ არ გადაგზავნება.';
  }
  apiConfigReady.then(() => { apiConfigSettled = true; updateDeliveryMode(); });
  const feedbackCategoryLabels = { bug: 'შეცდომა / არ მუშაობს', idea: 'ახალი იდეა', question: 'კითხვა', other: 'სხვა' };
  function offerGitHubFallback(category, message, unavailable = false) {
    const pageUrl = location.protocol === 'file:' ? currentPath : location.origin + currentPath;
    const maxPrefillChars = 500;
    const clipped = message.length > maxPrefillChars;
    const body = [
      '### GeoNature feedback',
      '',
      '**ტიპი:** ' + (feedbackCategoryLabels[category] || 'სხვა'),
      '**გვერდი:** ' + pageUrl,
      '',
      '### შეტყობინება',
      message.slice(0, maxPrefillChars) + (clipped ? '\n\n[აქ პირველი 500 სიმბოლოა. ჩასვი დაკოპირებული სრული ტექსტი ამ ველში. სრული შეტყობინება ასევე შენახულია საიტის მონახაზში — საჭიროებისას დაბრუნდი უკან და დააკოპირე.]' : ''),
      '',
      '---',
      '_შეტყობინება შექმნილია GeoNature-ის საიტის Feedback ვიჯეტიდან._'
    ].join('\n');
    const title = '[GeoNature feedback] ' + (feedbackCategoryLabels[category] || 'შეტყობინება') + ' — ' + (location.pathname || '/');
    const url = 'https://github.com/niksaniksa25/FISHHUNTt.ge/issues/new?' + new URLSearchParams({ title, body }).toString();

    status.replaceChildren();
    status.className = 'gn-feedback-status fallback';
    const explanation = document.createElement('div');
    explanation.textContent = (unavailable ? 'იხსნება GitHub-ის შევსებული ფორმა; შეტყობინება ჯერ არ გაგზავნილა. ' : 'გაგზავნის დადასტურება ვერ მივიღეთ. ტექსტი შენახულია ამ ჩანართში — შეგიძლია ხელახლა სცადო ან GitHub-ზე მოგვწერო. ') + 'GitHub-ზე შესვლის შემდეგ დააჭირე „Create issue“-ს. შეტყობინება საჯარო იქნება; ელფოსტა არ გადაგზავნილა.';
    status.appendChild(explanation);
    const actions = document.createElement('div');
    actions.className = 'gn-feedback-fallback-actions';
    const link = document.createElement('a');
    link.className = 'gn-feedback-fallback-link';
    link.href = url;
    link.rel = 'noreferrer';
    link.textContent = 'GitHub-ზე შეტყობინების გახსნა ↗';
    actions.appendChild(link);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'gn-feedback-copy';
    copy.textContent = 'შეტყობინების კოპირება';
    copy.addEventListener('click', async () => {
      if (await copyMessage(message)) {
        copy.textContent = 'კოპირებულია ✓'; copy.focus();
      } else {
        copy.textContent = 'მონიშნულია — დააკოპირე ტექსტი';
        messageField.focus();
        messageField.select();
      }
    });
    actions.appendChild(copy);
    status.appendChild(actions);
    return { url, clipped, copy, explanation };
  }
  async function copyMessage(message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(message); return true; } catch (_) {}
    }
    const temp = document.createElement('textarea');
    temp.value = message;
    temp.readOnly = true;
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    overlay.querySelector('.gn-feedback-dialog').appendChild(temp);
    try { temp.select(); return document.execCommand('copy') === true; }
    catch (_) { return false; }
    finally { temp.remove(); }
  }
  async function openGitHubDraft(category, message) {
    const draft = offerGitHubFallback(category, message, true);
    if (draft.clipped) {
      // Avoid losing long reports to browser/server URL limits. The full draft
      // stays in this tab and is copied before the visitor opens GitHub.
      if (!await copyMessage(message)) {
        draft.explanation.textContent = 'შეტყობინება გრძელია. სრული ტექსტი მონიშნულია — დააკოპირე, შემდეგ გახსენი ქვემოთ GitHub-ის ფორმა და ჩასვი ტექსტი. მონახაზი შენახულია; შეტყობინება ჯერ არ გაგზავნილა.';
        draft.copy.textContent = 'მონიშნულია — დააკოპირე ტექსტი';
        messageField.focus(); messageField.select();
        return;
      }
      draft.copy.textContent = 'სრული ტექსტი კოპირებულია ✓';
      draft.copy.focus();
    }
    // Same-tab navigation works on mobile even when popup windows are blocked.
    // Preserve the form until the visitor completes GitHub's own Create issue action.
    try { location.assign(draft.url); } catch (_) { /* The visible link is a navigation fallback. */ }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (sending || !form.reportValidity()) return;
    const message = String(messageField.value||'').trim();
    if (!message) {
      status.textContent = 'ერთი ასოც საკმარისია — ჩაწერე მინიმუმ ერთი სიმბოლო.';
      status.className = 'gn-feedback-status error';
      messageField.focus();
      return;
    }
    const category = categoryField.value;
    const email = emailField.value.trim();
    saveDraft();
    sending = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    // Keep the submitted draft stable while the request is in flight.
    [messageField, emailField].forEach(field => { field.readOnly = true; });
    categoryField.disabled = true;
    saveDraft();
    status.textContent = apiConfigSettled && !apiEndpoint('/api/feedback') ? 'იხსნება GitHub-ის ფორმა…' : 'იგზავნება…'; status.className = 'gn-feedback-status';
    let timer;
    try {
      if (!apiConfigSettled) await apiConfigReady;
      const endpoint = apiEndpoint('/api/feedback');
      if (!endpoint) {
        await openGitHubDraft(category, message);
        return;
      }
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(endpoint, {
        method: 'POST', credentials: apiBase() ? 'include' : 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, category, message, email, page: currentPath }), signal: controller.signal
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status >= 400 && response.status < 500 && ![404,405].includes(response.status)) {
        status.textContent = result.message || (response.status === 429 ? 'ძალიან ბევრი შეტყობინება გაიგზავნა. მოგვიანებით სცადე.' : 'შეტყობინება ვერ გაიგზავნა. შეამოწმე შეყვანილი მონაცემები და სცადე ხელახლა.');
        status.className = 'gn-feedback-status error';
        return;
      }
      if (!response.ok || result.ok !== true || !result.id) throw new Error('FEEDBACK_NOT_CONFIRMED');
      status.textContent = '✅ ' + (result.message || 'შეტყობინება გაიგზავნა.');
      form.reset();
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
    } catch (_) {
      offerGitHubFallback(category, message);
    } finally {
      clearTimeout(timer);
      sending = false;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      [messageField, emailField].forEach(field => { field.readOnly = false; });
      categoryField.disabled = false;
    }
  });
})();
