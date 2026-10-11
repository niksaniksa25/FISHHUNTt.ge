/* GeoNature analytics + feedback widget. When no API is configured, offers a no-backend GitHub Issues fallback. */
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
  const queryParams = new URLSearchParams(location.search || '');
  const referralCode = String(queryParams.get('ref') || queryParams.get('invite') || '').trim().slice(0,140);
  if (referralCode) { try { localStorage.setItem('gn_referral_code', referralCode); } catch (_) {} }
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
        body: JSON.stringify({ visitorId, path: currentPath, title: document.title || 'GeoNature', referralCode }), keepalive: true
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
  .gn-feedback-note{font-size:12px;color:#9bb6b1;margin:10px 0}.gn-feedback-submit{width:100%;border:0;border-radius:12px;padding:13px 16px;background:linear-gradient(135deg,#3dd989,#25b8a4);color:#032018;font-weight:900;font-size:14px;cursor:pointer}.gn-feedback-submit:disabled{opacity:.55;cursor:wait}.gn-feedback-status{min-height:20px;font-size:13px;margin-top:10px;color:#baf7d0}.gn-feedback-status.error{color:#ffaaa8}.gn-feedback-status.fallback{color:#ffdca8}.gn-feedback-fallback-link{display:inline-block;margin:8px 0;padding:10px 13px;border-radius:10px;background:#3dd989;color:#032018;font-weight:900;text-decoration:none}.gn-feedback-fallback-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.gn-feedback-copy{border:1px solid #526f64;border-radius:10px;padding:9px 12px;background:#102a25;color:#e7fff4;font:700 12px system-ui,sans-serif;cursor:pointer
  @media(max-width:600px){.gn-feedback-fab{left:12px;bottom:12px;padding:10px 13px;font-size:12px}.gn-feedback-dialog{padding:17px;border-radius:17px}.gn-feedback-head h2{font-size:19px}}
  `;
  document.head.appendChild(style);
  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'gn-feedback-fab'; fab.setAttribute('aria-haspopup', 'dialog');
  fab.innerHTML = '<span aria-hidden="true">💬</span><span>Feedback / შეცდომა</span>';
  const overlay = document.createElement('div'); overlay.className = 'gn-feedback-overlay'; overlay.hidden = true;
  overlay.innerHTML = `
    <section class="gn-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="gnFeedbackTitle">
      <div class="gn-feedback-head"><div><h2 id="gnFeedbackTitle">შეტყობინება GeoNature-ს</h2><p>იპოვე შეცდომა ან გაქვს იდეა? დაწერე აქ. როცა სერვერი მიბმულია, შეტყობინება ადმინ პანელში შეინახება.</p></div><button type="button" class="gn-feedback-close" aria-label="დახურვა">×</button></div>
      <form id="gnFeedbackForm"><label for="gnFeedbackCategory">ტიპი</label><select id="gnFeedbackCategory" name="category"><option value="bug">🐛 შეცდომა / არ მუშაობს</option><option value="idea">💡 ახალი იდეა</option><option value="question">❓ კითხვა</option><option value="other">💬 სხვა</option></select>
      <label for="gnFeedbackMessage">რა მოხდა? / რას შევცვლიდი?</label><textarea id="gnFeedbackMessage" name="message" minlength="1" maxlength="4000" required placeholder="აღწერე ნაბიჯები, გვერდი ან შეცდომა…"></textarea>
      <label for="gnFeedbackEmail">ელფოსტა პასუხისთვის (არასავალდებულო)</label><input id="gnFeedbackEmail" name="email" type="email" maxlength="160" placeholder="name@example.com">
      <p class="gn-feedback-note">გვერდი ავტომატურად მიეთითება. პაროლი ან ბარათის მონაცემები არ ჩაწერო. თუ სერვერი მიუწვდომელია, გამოჩნდება GitHub-ზე შეტყობინების შექმნის ბმული; GitHub-ზე შექმნილი შეტყობინება საჯაროა და ადმინ პანელში ავტომატურად არ ინახება.</p>
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
  const feedbackCategoryLabels = { bug: 'შეცდომა / არ მუშაობს', idea: 'ახალი იდეა', question: 'კითხვა', other: 'სხვა' };
  function offerGitHubFallback(category, message) {
    const pageUrl = String(location.href || '').split('#')[0];
    const maxPrefillChars = 500;
    const clipped = message.length > maxPrefillChars;
    const body = [
      '### GeoNature feedback',
      '',
      '**ტიპი:** ' + (feedbackCategoryLabels[category] || 'სხვა'),
      '**გვერდი:** ' + pageUrl,
      '',
      '### შეტყობინება',
      message.slice(0, maxPrefillChars) + (clipped ? '\n\n[შეტყობინება გრძელია და აქ პირველი 500 სიმბოლოა ჩასმული. სრული ტექსტის ჩასასმელად გამოიყენე გვერდზე არსებული „შეტყობინების კოპირება“ ღილაკი.]' : ''),
      '',
      '---',
      '_შეტყობინება შექმნილია GeoNature-ის საიტის Feedback ვიჯეტიდან._'
    ].join('\n');
    const title = '[GeoNature feedback] ' + (feedbackCategoryLabels[category] || 'შეტყობინება') + ' — ' + (location.pathname || '/');
    const url = 'https://github.com/niksaniksa25/FISHHUNTt.ge/issues/new?' + new URLSearchParams({ title, body }).toString();

    status.replaceChildren();
    status.className = 'gn-feedback-status fallback';
    const explanation = document.createElement('div');
    explanation.textContent = 'სერვერთან დაკავშირება ვერ მოხერხდა, ამიტომ შეტყობინება ჯერ არ გაგზავნილა. GitHub-ზე გახსნილ გვერდზე დააჭირე „Create issue“-ს. იქ შეტყობინება საჯარო იქნება; ელფოსტა კონფიდენციალურობისთვის არ გადაგზავნილა.';
    status.appendChild(explanation);
    const actions = document.createElement('div');
    actions.className = 'gn-feedback-fallback-actions';
    const link = document.createElement('a');
    link.className = 'gn-feedback-fallback-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'GitHub-ზე შეტყობინების გაგზავნა ↗';
    actions.appendChild(link);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'gn-feedback-copy';
    copy.textContent = 'შეტყობინების კოპირება';
    copy.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(message);
        } else {
          const temp = document.createElement('textarea');
          temp.value = message;
          temp.style.position = 'fixed';
          temp.style.opacity = '0';
          document.body.appendChild(temp);
          temp.select();
          const copied = document.execCommand('copy');
          temp.remove();
          if (!copied) throw new Error('COPY_FAILED');
        }
        copy.textContent = 'კოპირებულია ✓';
      } catch (_) {
        copy.textContent = 'კოპირება ვერ მოხერხდა';
      }
    });
    actions.appendChild(copy);
    status.appendChild(actions);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; status.textContent = 'იგზავნება…'; status.className = 'gn-feedback-status';
    const message = String(form.message.value||'').trim();
    if (!message) {
      status.textContent = 'ერთი ასოც საკმარისია — ჩაწერე მინიმუმ ერთი სიმბოლო.';
      status.className = 'gn-feedback-status error';
      submit.disabled = false;
      form.message.focus();
      return;
    }
    try {
      await apiConfigReady;
      const endpoint = apiEndpoint('/api/feedback');
      if (!endpoint) {
        offerGitHubFallback(form.category.value, message);
        return;
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
      console.warn('GeoNature feedback API failed; offering the no-backend fallback.', err);
      offerGitHubFallback(form.category.value, message);
    } finally { submit.disabled = false; }
  });
})();
