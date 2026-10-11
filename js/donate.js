(() => {
  'use strict';

  // If the static GitHub Pages frontend is separate from Node hosting, set
  // window.GN_API_BASE_URL to the deployed HTTPS backend origin before this script.
  const API_BASE = String(window.GN_API_BASE_URL || document.querySelector('meta[name="gn-api-base"]')?.content || '').replace(/\/+$/, '');
  const apiUrl = (path) => API_BASE + path;
  const presetAmounts = [1, 2, 5, 10, 25];
  let selectedAmount = 5;
  let customSelected = false;
  let leaderboardBusy = false;

  const $ = (id) => document.getElementById(id);
  const form = $('donationForm');
  const customToggle = $('customAmountToggle');
  const customWrap = $('customAmountWrap');
  const customAmount = $('customAmount');
  const amountButtons = Array.from(document.querySelectorAll('[data-amount]'));
  const totalEl = $('donationTotal');
  const submitAmount = $('submitAmount');
  const submitButton = $('donationSubmit');
  const statusEl = $('donationStatus');
  const listEl = $('leaderboardList');
  const countEl = $('confirmedDonationCount');
  const totalDonationsEl = $('confirmedDonationTotal');
  const refreshButton = $('refreshLeaderboard');
  const formatMoney = (value) => Number(value || 0).toLocaleString('ka-GE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₾';

  function setStatus(message, type = '') {
    if (!statusEl) return;
    statusEl.textContent = message;
    if (type) statusEl.dataset.type = type;
    else statusEl.removeAttribute('data-type');
  }

  function getAmount() {
    if (customSelected) return Number(String(customAmount?.value || '').replace(',', '.'));
    return selectedAmount;
  }

  function updateAmountUI() {
    const amount = getAmount();
    const valid = Number.isFinite(amount) && amount >= 1 && amount <= 5000 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
    const display = valid ? formatMoney(amount) : '—';
    if (totalEl) totalEl.textContent = display;
    if (submitAmount) submitAmount.textContent = display;
    amountButtons.forEach((button) => {
      const active = !customSelected && Number(button.dataset.amount) === selectedAmount;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (customToggle) {
      customToggle.classList.toggle('is-selected', customSelected);
      customToggle.setAttribute('aria-expanded', customSelected ? 'true' : 'false');
      customToggle.querySelector('span').textContent = customSelected ? '✓' : '＋';
    }
    if (customWrap) customWrap.hidden = !customSelected;
    return valid;
  }

  amountButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const amount = Number(button.dataset.amount);
      if (!presetAmounts.includes(amount)) return;
      selectedAmount = amount;
      customSelected = false;
      updateAmountUI();
      setStatus('');
    });
  });

  customToggle?.addEventListener('click', () => {
    customSelected = !customSelected;
    if (customSelected) customAmount?.focus();
    updateAmountUI();
    setStatus('');
  });

  customAmount?.addEventListener('input', () => {
    updateAmountUI();
    setStatus('');
  });

  function renderEmpty(title, message, icon = '♡') {
    if (!listEl) return;
    listEl.replaceChildren();
    const box = document.createElement('div');
    box.className = 'leaderboard-empty';
    const mark = document.createElement('span');
    mark.textContent = icon;
    const b = document.createElement('b');
    b.textContent = title;
    const p = document.createElement('p');
    p.textContent = message;
    box.append(mark, b, p);
    listEl.appendChild(box);
  }

  function renderLeaderboard(payload) {
    const rows = Array.isArray(payload?.donations) ? payload.donations : [];
    const rowTotal = rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
    const rowCount = rows.reduce((sum, row) => sum + Number(row.donationCount || 0), 0);
    const total = Number.isFinite(Number(payload?.totalAmount)) ? Number(payload.totalAmount) : rowTotal;
    const count = Number.isFinite(Number(payload?.donationCount)) ? Number(payload.donationCount) : rowCount;
    if (countEl) countEl.textContent = String(count);
    if (totalDonationsEl) totalDonationsEl.textContent = formatMoney(total);
    if (!rows.length) {
      renderEmpty('ჯერ დადასტურებული დონაცია არ არის', 'შენი რეალური გადახდა გამოჩნდება აქ BOG-ის დადასტურების შემდეგ.', '♡');
      return;
    }

    listEl.replaceChildren();
    rows.forEach((row, index) => {
      const entry = document.createElement('article');
      entry.className = 'leaderboard-entry';
      const rank = document.createElement('span');
      rank.className = 'leaderboard-rank';
      rank.textContent = String(row.rank || index + 1);
      const person = document.createElement('div');
      person.className = 'leaderboard-person';
      const name = document.createElement('strong');
      name.textContent = String(row.name || 'ანონიმური მხარდამჭერი');
      const small = document.createElement('small');
      const date = Number(row.lastDonatedAt);
      const dateText = Number.isFinite(date) && date > 0
        ? new Intl.DateTimeFormat('ka-GE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
        : 'დადასტურებული დონაცია';
      small.textContent = (Number(row.donationCount || 1) > 1 ? Number(row.donationCount) + ' დონაცია • ' : '') + dateText;
      const money = document.createElement('b');
      money.className = 'leaderboard-money';
      money.textContent = formatMoney(row.totalAmount);
      person.append(name, small);
      entry.append(rank, person, money);
      listEl.appendChild(entry);
    });
  }

  async function loadLeaderboard() {
    if (leaderboardBusy) return;
    leaderboardBusy = true;
    try {
      const response = await fetch(apiUrl('/api/donations/leaderboard'), { method: 'GET', cache: 'no-store', credentials: 'omit' });
      const data = await response.json();
      if (!response.ok || data.ok !== true || !Array.isArray(data.donations)) throw new Error('leaderboard unavailable');
      renderLeaderboard(data);
    } catch (_) {
      if (countEl) countEl.textContent = '—';
      if (totalDonationsEl) totalDonationsEl.textContent = '—';
      renderEmpty('ლიდერბორდი მიუწვდომელია', 'გადახდების სერვერი ჯერ არ არის დაკავშირებული ან დროებით მიუწვდომელია.', '↻');
    } finally {
      leaderboardBusy = false;
    }
  }

  refreshButton?.addEventListener('click', () => loadLeaderboard());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadLeaderboard();
  });
  setInterval(() => {
    if (!document.hidden) loadLeaderboard();
  }, 20000);

  async function checkReturnedOrder(orderId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(apiUrl('/api/donations/status?order=' + encodeURIComponent(orderId)), { cache: 'no-store', credentials: 'omit' });
        const data = await response.json();
        if (response.ok && data.paid === true) {
          setStatus('გმადლობთ! დონაცია ბანკის მიერ დადასტურდა და ლიდერბორდი განახლდა. ❤️', 'success');
          await loadLeaderboard();
          return;
        }
        if (data.status === 'rejected' || data.status === 'expired' || data.status === 'refunded') {
          setStatus('გადახდა არ დადასტურდა. ლიდერბორდში ჩანაწერი არ დამატებულა.', 'error');
          return;
        }
      } catch (_) {
        // Leave the donation pending until the API becomes available.
      }
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    setStatus('გადახდა მოწმდება. ლიდერბორდში ჩანაწერი გამოჩნდება მხოლოდ მას შემდეგ, რაც ბანკისგან წარმატებული გადახდა დადასტურდება.');
    await loadLeaderboard();
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = getAmount();
    if (!Number.isFinite(amount) || amount < 1 || amount > 5000 || Math.abs(amount * 100 - Math.round(amount * 100)) >= 0.000001) {
      setStatus('აირჩიე თანხა 1 ₾-დან 5,000 ₾-მდე (მაქსიმუმ ორი ათწილადი).', 'error');
      if (customSelected) customAmount?.focus();
      return;
    }
    const displayName = String($('donorName')?.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    submitButton.disabled = true;
    const oldLabel = submitButton.innerHTML;
    submitButton.textContent = 'გადახდის გვერდი მზადდება…';
    setStatus('ვუკავშირდებით საქართველოს ბანკს…');
    try {
      const response = await fetch(apiUrl('/api/donations/create-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ amount, displayName })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.message || 'დონაციის სისტემა ჯერ არ არის სრულად კონფიგურირებული.');
      }
      setStatus('ახლა გადაგიყვანთ ბანკის უსაფრთხო გადახდის გვერდზე…');
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setStatus(error.message || 'დონაციის შექმნა ვერ მოხერხდა. სცადე მოგვიანებით.', 'error');
      submitButton.innerHTML = oldLabel;
      submitButton.disabled = false;
    }
  });

  updateAmountUI();
  loadLeaderboard();

  const query = new URLSearchParams(window.location.search);
  if (query.get('status') === 'failed') {
    setStatus('გადახდა გაუქმდა ან ვერ დასრულდა. ლიდერბორდში ჩანაწერი არ დამატებულა.', 'error');
  } else if (query.get('status') === 'return' && query.get('order')) {
    setStatus('ვერიფიკაციას ველოდებით — ვამოწმებთ ბანკის გადახდის სტატუსს.');
    checkReturnedOrder(query.get('order'));
  }
})();