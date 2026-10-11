/* GeoNature anonymous visit analytics + site-wide feedback widget. Requires server.js APIs. */
(function () {
  'use strict';
  const STORAGE_KEY = 'gn_analytics_visitor_v1';
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
  const apiConfigReady = new Promise(resolve => {
    if (window.__GN_API_CONFIG_LOADED) { resolve(); return; }
    const script = document.createElement('script');
    script.src = new URL('js/api-config.js', document.baseURI).href;
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
  function apiBase() { let base = String(window.GN_API_BASE_URL || '').trim(); while (base.endsWith('/')) base = base.slice(0, -1); return base; }
  function apiEndpoint(route) {
    const base = apiBase();
    if (base) return base + route;
    // GitHub Pages serves only static files: /api/* exists only on the Node backend.
    if (String(location.hostname || '').toLowerCase().endsWith('.github.io')) return '';
    return route;
  }
  if (!String(currentPath).toLowerCase().endsWith('/admin.html')) {
    apiConfigReady.then(() => {
      const endpoint = apiEndpoint('/api/analytics/visit');
      if (!endpoint) return;
      return fetch(endpoint, {
        method: 'POST', credentials: apiBase() ? 'include' : 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, path: currentPath, title: document.title || 'GeoNature' }), keepalive: true
      });
    }).catch(() => {});
  }

  const style = document.createElement('style');
  style.textContent = `
  .gn-feedback-fab{position:fixed;z-index:9000;left:18px;bottom:18px;display:flex;align-items:center;gap:8px;border:1px solid rgba(118,235,170,.5);border-radius:999px;padding:11px 16px;background:linear-gradient(135deg,#0c2b22,#102b40);color:#e7fff4;font:700 13px/1.2 system-ui,sans-serif;box-shadow:0 8px 30px #0005;cursor:pointer;transition:transform .18s,box-shadow .18s}
  .gn-feedback-fab:hover{transform:translateY(-2px);box-shadow:0 12px 32px #0007}.gn-feedback-overlay[hidden]{display:none!important}.gn-feedback-overlay{position:fixed;inset:0;z-index:9001;display:grid;place-items:center;padding:16px;background:rgba(2,8,14,.72);backdrop-filter:blur(7px)}
  .gn-feedback-dialog{width:min(510px,100%);max-height:min(88vh,760px);overflow:auto;border:1px solid rgba(105,222,163,.35);border-radius:22px;padding:22px;background:linear-gradient(160deg,#10231f,#0b1725 75%);color:#edf8f3;box-shadow:0 24px 80px #0008;font:14px/1.55 system-ui,sans-serif}
  .gn-feedback-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}.gn-feedback-head h2{font-size:22px;margin:0 0 5px}.gn-feedback-head p{margin:0;color:#a6bdba;font-size:13px}.gn-feedback-close{border:1px solid #426258;background:#142d28;color:#eafff4;border-radius:10px;font-size:20px;width:38px;height:38px;cursor:pointer}
  .gn-feedback-dialog label{display:block;font-weight:700;margin:13px 0 6px;color:#d5e8e1}.gn-feedback-dialog select,.gn-feedback-dialog textarea,.gn-feedback-dialog input{width:100%;box-sizing:border-box;border:1px solid #344e4c;border-radius:11px;padding:11px 12px;background:#07141b;color:#effff8;font:inherit;outline:none}.gn-feedback-dialog textarea{min-height:130px;resize:vertical}.gn-feedback-dialog select:focus,.gn-feedback-dialog textarea:focus,.gn-feedback-dialog input:focus{border-color:#57d99a;box-shadow:0 0 0 3px #57d99a20}
  .gn-feedback-note{font-size:12px;color:#9bb6b1;margin:10px 0}.gn-feedback-submit{width:100%;border:0;border-radius:12px;padding:13px 16px;background:linear-gradient(135deg,#3dd989,#25b8a4);color:#032018;font-weight:900;font-size:14px;cursor:pointer}.gn-feedback-submit:disabled{opacity:.55;cursor:wait}.gn-feedback-status{min-height:20px;font-size:13px;margin-top:10px;color:#baf7d0}.gn-feedback-status.error{color:#ffaaa8}
  @media(max-width:600px){.gn-feedback-fab{left:12px;bottom:12px;padding:10px 13px;font-size:12px}.gn-feedback-dialog{padding:17px;border-radius:17px}.gn-feedback-head h2{font-size:19px}}
  `;
  document.head.appendChild(style);
  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'gn-feedback-fab'; fab.setAttribute('aria-haspopup', 'dialog');
  fab.innerHTML = '<span aria-hidden="true">💬</span><span>Feedback / შეცდომა</span>';
  const overlay = document.createElement('div'); overlay.className = 'gn-feedback-overlay'; overlay.hidden = true;
  overlay.innerHTML = `
    <section class="gn-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="gnFeedbackTitle">
      <div class="gn-feedback-head"><div><h2 id="gnFeedbackTitle">შეტყობინება GeoNature-ს</h2><p>იპოვე შეცდომა ან გაქვს იდეა? მომწერე აქ — შეტყობინება ადმინ პანელში გამოჩნდება.</p></div><button type="button" class="gn-feedback-close" aria-label="დახურვა">×</button></div>
      <form id="gnFeedbackForm"><label for="gnFeedbackCategory">ტიპი</label><select id="gnFeedbackCategory" name="category"><option value="bug">🐛 შეცდომა / არ მუშაობს</option><option value="idea">💡 ახალი იდეა</option><option value="question">❓ კითხვა</option><option value="other">💬 სხვა</option></select>
      <label for="gnFeedbackMessage">რა მოხდა? / რას შევცვლიდი?</label><textarea id="gnFeedbackMessage" name="message" minlength="8" maxlength="4000" required placeholder="აღწერე ნაბიჯები, გვერდი ან შეცდომა…"></textarea>
      <label for="gnFeedbackEmail">ელფოსტა პასუხისთვის (არასავალდებულო)</label><input id="gnFeedbackEmail" name="email" type="email" maxlength="160" placeholder="name@example.com">
      <p class="gn-feedback-note">გვერდი ავტომატურად მიეთითება. შეტყობინება ადმინ პანელში ჩაიწერება; ვიზიტები ითვლება ანონიმური ბრაუზერის ID-ით. პაროლი ან ბარათის მონაცემები არ ჩაწერო.</p>
      <button type="submit" class="gn-feedback-submit">შეტყობინების გაგზავნა</button><div class="gn-feedback-status" role="status" aria-live="polite"></div></form>
    </section>`;
  document.body.appendChild(fab); document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector('.gn-feedback-close');
  const form = overlay.querySelector('#gnFeedbackForm');
  const status = overlay.querySelector('.gn-feedback-status');
  function close() { overlay.hidden = true; fab.focus(); }
  fab.addEventListener('click', () => { overlay.hidden = false; status.textContent = ''; status.className = 'gn-feedback-status'; setTimeout(() => overlay.querySelector('textarea').focus(), 0); });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) close(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; status.textContent = 'იგზავნება…'; status.className = 'gn-feedback-status';
    const message = form.message.value.trim();
    try {
      await apiConfigReady;
      const endpoint = apiEndpoint('/api/feedback');
      if (!endpoint) {
        const configError = new Error('API_NOT_CONFIGURED');
        configError.code = 'API_NOT_CONFIGURED';
        throw configError;
      }
      const response = await fetch(endpoint, {
        method: 'POST', credentials: apiBase() ? 'include' : 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, category: form.category.value, message, email: form.email.value.trim(), page: location.pathname })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'შეტყობინების გაგზავნა ვერ მოხერხდა.');
      status.textContent = '✅ ' + (result.message || 'შეტყობინება გაიგზავნა.'); form.reset();
      setTimeout(() => { if (!overlay.hidden) close(); }, 1800);
    } catch (err) {
      if (err && err.code === 'API_NOT_CONFIGURED') {
        status.textContent = 'Feedback ვერ შეინახება: GitHub Pages-ზე API სერვერი არ მუშაობს. js/api-config.js-ში ჩაწერე Node სერვერის HTTPS მისამართი და განათავსე server.js.';
      } else if (err && err.message && err.message.includes('Failed to fetch')) {
        status.textContent = 'სერვერთან კავშირი ვერ შედგა. გადაამოწმე js/api-config.js-ში API მისამართი, სერვერის გაშვება და CORS-ის პარამეტრები.';
      } else {
        status.textContent = (err && err.message) || 'შეტყობინება ვერ გაიგზავნა.';
      }
      status.className = 'gn-feedback-status error';
    } finally { submit.disabled = false; }
  });
})();
