(function () {
  'use strict';
  const KEY = 'gn_fieldkit_v1';
  const fish = ['სათევზაო ჯოხი', 'კოჭა და ძუა', 'კაუჭები', 'ტივტივა / სიმძიმე', 'სათევზაო სატყუარები', 'სათადარიგო ძუა', 'თევზის ამოსაყვანი ბადე', 'წყლის თერმომეტრი / თევზის საზომი', 'ფანარი', 'პირველადი დახმარება'];
  const hunt = ['ტანსაცმელი ამინდისთვის', 'ფეხსაცმელი / ჩექმები', 'ბინოკლი', 'ფანარი', 'პირველადი დახმარება', 'წყალი და საკვები', 'რუკა / GPS', 'ტელეფონის დამტენი', 'თბილი ფენა', 'ნარჩენების ჩანთა'];
  const keys = [...fish.map((_, i) => 'f' + i), ...hunt.map((_, i) => 'h' + i)];
  let state = {}, initialized = false, status;

  function message(text, saved) {
    if (!status) return;
    status.textContent = text;
    status.dataset.saved = String(saved);
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === null) return;
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid checklist');
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] === 'boolean') state[key] = value[key];
      }
    } catch (_) {
      message('შენახული სია ვერ აღდგა. შეგიძლია თავიდან მონიშნო ნივთები.', false);
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      message('მონიშვნები შენახულია ამ ბრაუზერში.', true);
    } catch (_) {
      message('მონიშვნები მუშაობს, მაგრამ ცვლილება ვერ შეინახა. გვერდის განახლებისას ის დაიკარგება.', false);
    }
  }
  function render(items, id, countId, summaryId, prefix) {
    const box = document.getElementById(id);
    if (!box) return;
    const count = document.getElementById(countId), summary = document.getElementById(summaryId);
    const nodes = items.map((text, i) => {
      const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
      label.className = 'kit-item';
      input.type = 'checkbox';
      input.id = 'fieldkit-' + prefix + i;
      input.dataset.k = prefix + i;
      input.checked = state[prefix + i] === true;
      span.textContent = text;
      label.appendChild(input);
      label.appendChild(span);
      input.addEventListener('change', () => {
        state[input.dataset.k] = input.checked;
        update();
        save();
      });
      return label;
    });
    box.replaceChildren(...nodes);
    const actions = box.closest('.field-kit-card')?.querySelector('.kit-summary');
    let reset = document.getElementById(id + 'Reset');
    if (actions && !reset) {
      reset = document.createElement('button');
      reset.type = 'button';
      reset.id = id + 'Reset';
      reset.className = 'btn ghost kit-reset';
      reset.textContent = 'მონიშვნების მოხსნა';
      reset.setAttribute('aria-label', (prefix === 'f' ? 'თევზაობის' : 'ნადირობის') + ' სიის მონიშვნების მოხსნა');
      actions.appendChild(reset);
    }
    if (count) {
      count.setAttribute('role', 'status');
      count.setAttribute('aria-live', 'polite');
      count.setAttribute('aria-atomic', 'true');
    }
    function update() {
      const checked = items.reduce((total, _, i) => total + (state[prefix + i] === true ? 1 : 0), 0);
      if (count) count.textContent = checked + ' / ' + items.length;
      if (summary) summary.textContent = Math.round(checked / items.length * 100) + '% მზად';
      if (reset) reset.disabled = checked === 0;
    }
    if (reset) reset.addEventListener('click', () => {
      items.forEach((_, i) => { delete state[prefix + i]; });
      box.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
      update();
      save();
    });
    update();
  }
  function init() {
    if (initialized || (!document.getElementById('fishKit') && !document.getElementById('huntKit'))) return;
    initialized = true;
    status = document.getElementById('fieldKitStatus');
    if (!status) {
      status = document.createElement('p');
      status.id = 'fieldKitStatus';
      status.className = 'field-note kit-save-status';
      document.querySelector('.field-kit-grid')?.insertAdjacentElement('afterend', status);
    }
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    message('მონიშვნები ინახება მხოლოდ ამ ბრაუზერში.', true);
    load();
    render(fish, 'fishKit', 'fishCount', 'fishSummary', 'f');
    render(hunt, 'huntKit', 'huntCount', 'huntSummary', 'h');
  }
  window.GeoNatureFieldKit = {init, snapshot: () => ({...state})};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
