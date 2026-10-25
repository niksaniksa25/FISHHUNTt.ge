(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) {
    root.FishHuntTripTools = api;
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', api.init);
    else api.init();
  }
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const KEY = 'fishhunt_offline_places_v1', MAX_PLACES = 24, MAX_BYTES = 180000;
  const SAFETY = Object.freeze([
    'საგანგებო დახმარება: 112. გასვლამდე ახლობელს უთხარი სად მიდიხარ და როდის დაბრუნდები.',
    'ჭექა-ქუხილისას დატოვე ღია წყალი და მაღალი ადგილი; მოერიდე ლითონსა და ცალკე მდგომ მაღალ ხეს.',
    'უცნობ დინებასა და სიღრმეში არ შეხვიდე. სველი ქვები სრიალაა; წყლის დონე შეიძლება სწრაფად შეიცვალოს.',
    'გქონდეს სასმელი წყალი, თბილი ტანსაცმელი, დამუხტული ტელეფონი და ენერგიის მარაგი.',
    'ტერიტორიისა და სახეობის მოქმედი წესები გასვლამდე ოფიციალურ წყაროში გადაამოწმე. შენახული ინფორმაცია ნებართვა არ არის.'
  ]);
  const text = (value, max = 200) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
  const number = (value, min, max) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
  function stamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value !== 'string' || !/T/.test(value)) return null;
    const explicit = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + '+04:00';
    const parsed = Date.parse(explicit);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function cleanAccess(input) {
    if (!input || typeof input !== 'object' || input.personal !== true) return null;
    const updated = stamp(input.updatedAt);
    if (updated === null || updated <= 0 || updated > Date.now() + 600000) return null;
    const road = ['unknown', 'paved', 'gravel', 'rough', 'foot-only'].includes(input.road) ? input.road : 'unknown';
    const parking = ['unknown', 'available', 'limited', 'none'].includes(input.parking) ? input.parking : 'unknown';
    const minutes = number(input.walkingMinutes, 0, 720);
    return { road, parking, walkingMinutes: minutes !== null && Number.isInteger(minutes) ? minutes : null, notes: text(input.notes, 600), updatedAt: new Date(updated).toISOString(), personal: true };
  }
  function cleanSnapshot(input, now = Date.now()) {
    const source = input && typeof input === 'object' ? input : {}, weather = source.weather || {};
    const observation = stamp(source.sourceTime), live = source.status === 'live' && observation !== null && now - observation <= 3 * 3600000 && observation <= now + 600000;
    const status = live ? 'live' : source.status === 'saved' ? 'saved' : source.status === 'stale' || observation !== null ? 'stale' : 'unavailable';
    return {
      placeId: text(source.placeId, 80), placeName: text(source.placeName, 120) || 'არჩეული ადგილი',
      locationName: text(source.locationName, 120), region: text(source.region, 100), kind: text(source.kind, 80), description: text(source.description, 1600),
      lat: number(source.lat, -90, 90), lon: number(source.lon, -180, 180),
      fishId: text(source.fishId, 80), fishName: text(source.fishName, 120), fishNames: Array.isArray(source.fishNames) ? source.fishNames.slice(0, 30).map(item => text(item, 100)).filter(Boolean) : [],
      weather: { temperature: observation === null ? null : number(weather.temperature, -90, 65), wind: observation === null ? null : number(weather.wind, 0, 450), precip: observation === null ? null : number(weather.precip, 0, 2000), pressure: observation === null ? null : number(weather.pressure, 800, 1200), humidity: observation === null ? null : number(weather.humidity, 0, 100) },
      index: live ? number(source.index, 0, 100) : null,
      bestHour: live ? text(source.bestHour, 5) : '', sourceTime: observation === null ? null : new Date(observation).toISOString(),
      at: new Date(now).toISOString(), timezone: 'Asia/Tbilisi', status,
      legalSummary: text(source.legalSummary, 900) || 'კონკრეტული ადგილისა და სახეობის მოქმედი შეზღუდვები გასვლამდე გადაამოწმე.',
      legalStatus: text(source.legalStatus, 30), savedAt: stamp(source.savedAt) === null ? null : new Date(stamp(source.savedAt)).toISOString(),
      access: cleanAccess(source.access)
    };
  }
  function placeSnapshot(id) {
    const water = (root.WATERS || []).find(item => String(item[0]) === String(id));
    if (!water) return null;
    const ids = String(water[6] || '').split(',').filter(Boolean), species = ids.map(key => (root.FISHES || []).find(item => item[0] === key)).filter(Boolean);
    let legalSummary = 'ანკესით თევზაობის მეთოდი, ტერიტორიის რეჟიმი და სახეობის შეზღუდვა გასვლამდე გადაამოწმე. ინფორმაცია ნებართვა არ არის.';
    if (root.GeoWildlifeRules?.evaluate && species.length) {
      const rules = species.map(item => root.GeoWildlifeRules.evaluate(item, { kind: 'fish', waterId: water[0], method: 'rod', date: root.GeoWildlifeRules.today() }));
      const prohibited = rules.filter(rule => rule.status === 'prohibited').map(rule => rule.species.name);
      if (prohibited.length) legalSummary = 'აკრძალული მოპოვება: ' + prohibited.join(', ') + '. სხვა სახეობისთვისაც მოქმედი მეთოდი და ტერიტორიის რეჟიმი გადაამოწმე.';
    }
    return cleanSnapshot({ placeId: water[0], placeName: water[1], kind: water[2], region: water[3], lat: water[4], lon: water[5], description: water[7], fishNames: species.map(item => item[1]), legalSummary, status: 'unavailable' });
  }
  function readPlaces(storage) {
    try {
      const raw = (storage || root.localStorage).getItem(KEY) || '[]';
      if (raw.length > MAX_BYTES * 2) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const unique = new Map();
      for (const value of parsed.slice(0, MAX_PLACES * 2)) {
        if (!value || typeof value !== 'object' || !text(value.placeId, 80) || stamp(value.savedAt) === null) continue;
        const clean = cleanSnapshot({ ...value, status: 'saved', index: null });
        unique.set(clean.placeId, clean);
      }
      return [...unique.values()].slice(0, MAX_PLACES);
    } catch { return []; }
  }
  function persistPlaces(places, storage) {
    const serialized = JSON.stringify(places);
    if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES) throw new Error('შენახული ინფორმაციის ზომა დიდია. წაშალე ძველი ადგილი და სცადე ხელახლა.');
    (storage || root.localStorage).setItem(KEY, serialized);
    return places;
  }
  function savePlace(input, storage, now = Date.now()) {
    const snapshot = cleanSnapshot(input, now);
    if (!snapshot.placeId || snapshot.lat === null || snapshot.lon === null) throw new Error('ჯერ ცნობარიდან აირჩიე ადგილი ზუსტი კოორდინატებით.');
    const saved = { ...snapshot, status: 'saved', index: null, bestHour: '', savedAt: new Date(now).toISOString() };
    const previous = readPlaces(storage), rest = previous.filter(item => item.placeId !== saved.placeId);
    if (rest.length >= MAX_PLACES) throw new Error('ოფლაინ ინახება მაქსიმუმ 24 ადგილი. ჯერ წაშალე ძველი ადგილი.');
    persistPlaces([saved, ...rest], storage);
    return saved;
  }
  function removePlace(id, storage) { return persistPlaces(readPlaces(storage).filter(item => item.placeId !== id), storage); }
  function clearPlaces(storage) { (storage || root.localStorage).removeItem(KEY); }
  function formatTime(value) {
    const time = stamp(value);
    if (time === null) return 'დრო უცნობია';
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(time));
    const get = type => parts.find(part => part.type === type)?.value || '';
    return get('year') + '-' + get('month') + '-' + get('day') + ' ' + get('hour') + ':' + get('minute');
  }
  function snapshotText(value) {
    const item = cleanSnapshot(value), parts = ['FishHunt · ' + item.placeName];
    if (item.fishName) parts.push(item.fishName);
    if (item.status === 'live') parts.push('ამინდის მოდელის მონაცემი · ' + formatTime(item.sourceTime));
    else parts.push(item.sourceTime ? 'ბოლო შენახული ამინდი · ' + formatTime(item.sourceTime) : 'მიმდინარე ამინდი მიუწვდომელია');
    if (item.weather.temperature !== null) parts.push('ტემპერატურა ' + item.weather.temperature + '°C');
    if (item.weather.wind !== null) parts.push('ქარი ' + item.weather.wind + ' კმ/სთ');
    if (item.index !== null) parts.push('პირობების ინდექსი ' + Math.round(item.index) + '/100 · დაჭერის ალბათობა არ არის');
    if (item.bestHour) parts.push('დღეს რეკომენდებული საათი: ' + item.bestHour);
    parts.push(item.legalSummary);
    if (item.placeId) parts.push(new URL('place-details.html?id=' + encodeURIComponent(item.placeId), root.document?.baseURI || 'https://niksaniksa25.github.io/FISHHUNTt.ge/').href);
    return parts.join('\n');
  }
  function wrapLines(context, value, width, maximum = 3) {
    const lines = [], words = String(value || '').split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (context.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      let piece = '';
      for (const letter of Array.from(word)) {
        if (piece && context.measureText(piece + letter).width > width) { lines.push(piece); piece = letter; }
        else piece += letter;
      }
      line = piece;
    }
    if (line) lines.push(line);
    if (lines.length > maximum) {
      lines.length = maximum;
      let last = lines[maximum - 1];
      while (last && context.measureText(last + '…').width > width) last = Array.from(last).slice(0, -1).join('');
      lines[maximum - 1] = last + '…';
    }
    return lines;
  }
  async function renderCard(value, doc = root.document) {
    const item = cleanSnapshot(value), canvas = doc.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    if (doc.fonts?.ready) await doc.fonts.ready;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ამ ბრაუზერში სურათის შექმნა ვერ მოხერხდა.');
    const background = ctx.createLinearGradient(0, 0, 1080, 1350); background.addColorStop(0, '#163c31'); background.addColorStop(1, '#061a19');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#213f31'; ctx.beginPath(); ctx.moveTo(0, 320); ctx.lineTo(210, 120); ctx.lineTo(460, 400); ctx.lineTo(720, 160); ctx.lineTo(1080, 390); ctx.lineTo(1080, 750); ctx.lineTo(0, 750); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c7df9a'; ctx.lineWidth = 3; ctx.strokeRect(40, 40, 1000, 1270);
    function draw(value, x, y, size, color, width, lines = 2, weight = 500) {
      ctx.font = weight + ' ' + size + 'px system-ui, sans-serif'; ctx.fillStyle = color; ctx.textBaseline = 'top';
      const wrapped = wrapLines(ctx, value, width, lines); wrapped.forEach((line, index) => ctx.fillText(line, x, y + index * size * 1.48));
      return y + wrapped.length * size * 1.48;
    }
    draw('FISHHUNT', 86, 85, 42, '#d5e9b5', 850, 1, 800);
    draw('შენი გასვლა ბუნებაში', 86, 145, 25, '#a7c7b6', 850, 1);
    draw(item.placeName, 86, 250, 58, '#f2f5e8', 900, 2, 750);
    draw(item.fishName || item.region || 'სათევზაო ადგილის ბარათი', 86, 445, 30, '#d4dfc8', 900, 2);
    ctx.fillStyle = '#0c2725'; ctx.fillRect(76, 570, 928, 225);
    draw('ამინდი', 106, 596, 24, '#a6c4b3', 460, 1);
    draw(item.weather.temperature === null ? '—' : item.weather.temperature + '°C', 106, 642, 66, '#f0f1da', 460, 1, 750);
    draw(item.weather.wind === null ? 'ქარი: უცნობია' : 'ქარი: ' + item.weather.wind + ' კმ/სთ', 106, 737, 24, '#c1d5c4', 480, 1);
    draw('პირობების ინდექსი', 620, 603, 23, '#b8d4b5', 350, 1);
    draw(item.index === null ? '—' : Math.round(item.index) + '/100', 620, 649, 64, '#e6d69a', 350, 1, 750);
    draw('დაჭერის ალბათობა არ არის', 620, 744, 16, '#a7b9aa', 350, 1);
    const status = item.status === 'live' ? 'მოდელის მონაცემი · ' : 'ბოლო შენახული ამინდი · ';
    draw(item.sourceTime ? status + formatTime(item.sourceTime) : 'მიმდინარე ამინდის მონაცემი მიუწვდომელია', 86, 838, 24, '#b3caba', 900, 2);
    if (item.bestHour) draw('დღეს რეკომენდებული საათი: ' + item.bestHour, 86, 930, 29, '#dfdbab', 900, 1, 650);
    draw(item.legalSummary, 86, 1010, 25, '#d3ddcf', 900, 4);
    draw('ინფორმაცია გადაამოწმე გასვლამდე · 112', 86, 1236, 22, '#a9c1b1', 900, 1);
    draw('niksaniksa25.github.io/FISHHUNTt.ge', 86, 1280, 17, '#9fb9a9', 900, 1);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve({ canvas, blob, snapshot: item }) : reject(new Error('სურათის შენახვა ვერ მოხერხდა.')), 'image/png'));
  }
  async function shareFile(blob, snapshot, nav = root.navigator, download = downloadBlob) {
    const file = new File([blob], 'FishHunt-' + (snapshot.placeId || 'trip') + '.png', { type: 'image/png' });
    if (nav?.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
      try { await nav.share({ files: [file], title: 'FishHunt · ' + snapshot.placeName }); return 'shared'; }
      catch (error) { if (error.name === 'AbortError') return 'cancelled'; throw error; }
    }
    await download(file); return 'downloaded';
  }
  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob), anchor = root.document.createElement('a'); anchor.href = url; anchor.download = blob.name || 'FishHunt-trip.png'; root.document.body.appendChild(anchor); anchor.click(); anchor.remove(); root.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function element(tag, className, content) { const node = root.document.createElement(tag); if (className) node.className = className; if (content) node.textContent = content; return node; }
  function note(host, message, error = false) { host.textContent = message; host.classList.toggle('is-error', error); }
  async function prepareOffline() {
    if (!root.isSecureContext || !root.navigator?.serviceWorker) return false;
    const directory = new URL('./', root.document.baseURI), worker = new URL('push-sw.js', directory);
    const registration = await root.navigator.serviceWorker.register(worker.pathname, { scope: directory.pathname, updateViaCache: 'none' });
    // register() can resolve with the previous push-only worker before its
    // asynchronous update starts. Observe updatefound before checking again;
    // otherwise a preparation message sent to that old worker has no handler.
    let newest = registration.installing || registration.waiting;
    const found = () => { newest = registration.installing || registration.waiting || newest; };
    registration.addEventListener('updatefound', found);
    try { await registration.update(); } catch { /* An already prepared worker remains usable offline. */ }
    found(); registration.removeEventListener('updatefound', found);
    const active = newest || registration.installing || registration.waiting || registration.active;
    if (!active) throw new Error('ოფლაინ გვერდის მომზადება ვერ დაიწყო.');
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel(); let sent = false;
      const finish = (success, error) => { root.clearTimeout(timer); active.removeEventListener('statechange', changed); channel.port1.close(); success ? resolve(true) : reject(error); };
      const timer = root.setTimeout(() => finish(false, new Error('ადგილი შენახულია, მაგრამ ოფლაინ გვერდი ჯერ ვერ მომზადდა. ინტერნეტით სცადე ისევ.')), 15000);
      channel.port1.onmessage = event => finish(Boolean(event.data?.ok), new Error('ოფლაინ გვერდის მომზადება ვერ დასრულდა. სცადე ისევ.'));
      const changed = () => {
        if (active.state === 'activated' && !sent) { sent = true; active.postMessage({ type: 'FISHHUNT_PREPARE_OFFLINE' }, [channel.port2]); }
        else if (active.state === 'redundant') finish(false, new Error('ოფლაინ გვერდის განახლება ვერ დასრულდა. სცადე ისევ.'));
      };
      active.addEventListener('statechange', changed); changed();
    });
  }
  async function saveForOffline(input) {
    const canonical = placeSnapshot(input?.placeId), merged = canonical ? { ...canonical, ...input, description: canonical.description, fishNames: canonical.fishNames, region: canonical.region, kind: canonical.kind } : input;
    const access = root.FishHuntPlaceAccess?.snapshot?.(input?.placeId);
    const saved = savePlace(access ? { ...merged, access } : merged);
    refreshLibraries(); root.dispatchEvent(new CustomEvent('fishhunt:offline-places', { detail: readPlaces() }));
    let ready;
    try { ready = await prepareOffline(); }
    catch { throw new Error('ინფორმაცია შეინახა, მაგრამ ოფლაინ გვერდი ვერ მომზადდა. ინტერნეტით დააჭირე „შენახულის განახლება“.'); }
    return { saved, ready };
  }
  async function openShare(value, trigger) {
    const snapshot = cleanSnapshot(value), dialog = element('dialog', 'fh-trip-dialog'); dialog.setAttribute('aria-label', 'გასაზიარებელი ბარათი');
    const header = element('div', 'fh-trip-dialog-head'), title = element('h2', '', 'გასაზიარებელი ბარათი'), close = element('button', 'btn ghost', 'დახურვა'); close.type = 'button'; header.append(title, close);
    const preview = element('div', 'fh-trip-preview'), status = element('p', 'fh-trip-note', 'სურათი მზადდება…'); status.setAttribute('role', 'status');
    const actions = element('div', 'fh-trip-dialog-actions'), share = element('button', 'btn primary', 'გაზიარება / შენახვა'), copy = element('button', 'btn ghost', 'ტექსტის კოპირება'); share.type = copy.type = 'button'; share.disabled = true; actions.append(share, copy); dialog.append(header, preview, actions, status); root.document.body.appendChild(dialog);
    let url = '', rendered = null;
    const cleanup = () => { if (url) URL.revokeObjectURL(url); dialog.remove(); trigger?.focus?.({ preventScroll: true }); };
    close.onclick = () => { if (dialog.close) dialog.close(); else { dialog.removeAttribute('open'); cleanup(); } }; dialog.addEventListener('close', cleanup, { once: true });
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    copy.onclick = async () => { try { if (!root.navigator?.clipboard?.writeText) throw new Error(); await root.navigator.clipboard.writeText(snapshotText(snapshot)); note(status, 'ტექსტი დაკოპირდა.'); } catch { const field = element('textarea', 'fh-trip-copy'); field.value = snapshotText(snapshot); field.setAttribute('aria-label', 'გასაზიარებელი ტექსტი'); preview.appendChild(field); field.focus(); field.select(); note(status, 'ტექსტი მონიშნულია — გამოიყენე ბრაუზერის „კოპირება“.'); } };
    try {
      rendered = await renderCard(snapshot); if (!dialog.isConnected) return;
      url = URL.createObjectURL(rendered.blob); const image = element('img'); image.src = url; image.alt = 'FishHunt · ' + snapshot.placeName + ' · გასაზიარებელი ბარათი'; image.width = 1080; image.height = 1350; preview.appendChild(image); share.disabled = false;
      note(status, snapshot.status === 'live' ? 'ბარათზე მითითებულია მონაცემის დრო. ინდექსი დაჭერის ალბათობას არ წარმოადგენს.' : 'ბარათს მიმდინარე შეფასება არ აქვს; შენახული ამინდი ცალკე არის მონიშნული.');
    } catch (error) { note(status, error.message || 'სურათი ვერ შეიქმნა. შეგიძლია ტექსტი დააკოპირო.', true); }
    share.onclick = async () => { if (!rendered) return; share.disabled = true; try { const result = await shareFile(rendered.blob, snapshot); note(status, result === 'shared' ? 'გაზიარება დასრულდა.' : result === 'downloaded' ? 'PNG ფაილის ჩამოტვირთვა დაიწყო.' : 'გაზიარება გაუქმდა.'); } catch { note(status, 'გაზიარება ვერ დასრულდა. სცადე ხელახლა ან დააკოპირე ტექსტი.', true); } finally { share.disabled = false; } };
  }
  function toolbar(host, getter) {
    if (!host || host.querySelector('.fh-trip-tools')) return;
    const row = element('div', 'fh-trip-tools'), share = element('button', 'btn ghost', 'ბარათის გაზიარება'), save = element('button', 'btn ghost', 'ოფლაინ შენახვა'), message = element('small', 'fh-trip-note'); share.type = save.type = 'button'; message.setAttribute('role', 'status');
    const update = () => { const value = getter(); share.disabled = !value?.placeId; save.disabled = !value?.placeId; save.textContent = readPlaces().some(item => item.placeId === value?.placeId) ? 'შენახულის განახლება' : 'ოფლაინ შენახვა'; };
    share.onclick = () => openShare(getter(), share);
    save.onclick = async () => { save.disabled = true; note(message, 'ადგილი ინახება…'); try { const result = await saveForOffline(getter()); note(message, result.ready ? 'ადგილი და უსაფრთხოების ინფორმაცია ოფლაინ მზადაა.' : 'ინფორმაცია ამ ბრაუზერში შეინახა. ოფლაინ გვერდისთვის HTTPS და მხარდაჭერილი ბრაუზერია საჭირო.'); } catch (error) { note(message, error.message || 'შენახვა ვერ დასრულდა. შეამოწმე თავისუფალი მეხსიერება.', true); } finally { update(); } };
    row.append(share, save, message); host.appendChild(row); update(); row.fhUpdate = update;
  }
  function savedCard(item, rootNode) {
    const article = element('article', 'fh-offline-place'), heading = element('h3', '', item.placeName), metadata = element('p', 'fh-trip-muted', [item.kind, item.region].filter(Boolean).join(' · ')); article.append(heading, metadata);
    if (item.description) article.appendChild(element('p', '', item.description));
    article.appendChild(element('small', 'fh-trip-muted', 'შენახულია: ' + formatTime(item.savedAt)));
    if (item.lat !== null && item.lon !== null) article.appendChild(element('p', 'fh-trip-coordinates', item.lat.toFixed(4) + ', ' + item.lon.toFixed(4)));
    if (item.fishNames.length) article.appendChild(element('p', '', 'სახეობები: ' + item.fishNames.join(', ')));
    if (item.sourceTime && item.weather.temperature !== null) article.appendChild(element('p', 'fh-offline-weather', 'ბოლო შენახული ამინდი · ' + formatTime(item.sourceTime) + ': ' + item.weather.temperature + '°C' + (item.weather.wind === null ? '' : ', ქარი ' + item.weather.wind + ' კმ/სთ') + '. მიმდინარე პირობები ინტერნეტით გადაამოწმე.'));
    if (item.access) {
      const access = item.access, details = element('details', 'fh-offline-access'), title = element('summary', '', 'მისასვლელი · ჩემი შენიშვნები');
      const roads = { unknown: 'არ არის მითითებული', paved: 'ასფალტიანი გზა', gravel: 'გრუნტის გზა', rough: 'რთული მონაკვეთი', 'foot-only': 'მხოლოდ ფეხით მისვლა' }, parking = { unknown: 'არ არის მითითებული', available: 'არის გასაჩერებელი ადგილი', limited: 'ადგილი შეზღუდულია', none: 'გასაჩერებელი ადგილი არ არის' };
      details.append(title, element('p', 'fh-trip-muted', 'პირადი ჩანაწერი ამ ბრაუზერიდან · ' + formatTime(access.updatedAt) + '. მისასვლელისა და პარკინგის მდგომარეობა გასვლამდე გადაამოწმე.'));
      details.appendChild(element('p', '', 'გზა: ' + roads[access.road] + ' · პარკინგი: ' + parking[access.parking]));
      if (access.walkingMinutes !== null) details.appendChild(element('p', '', 'ფეხით: ' + access.walkingMinutes + ' წთ · შენი ჩანაწერი'));
      if (access.notes) details.appendChild(element('p', '', access.notes));
      article.appendChild(details);
    }
    article.appendChild(element('p', 'fh-offline-legal', item.legalSummary));
    const actions = element('div', 'fh-trip-tools'), open = element('a', 'btn ghost', 'ადგილზე გადასვლა'), remove = element('button', 'btn ghost', 'წაშლა'), share = element('button', 'btn ghost', 'გაზიარება'); open.href = 'place-details.html?id=' + encodeURIComponent(item.placeId); remove.type = share.type = 'button';
    remove.onclick = () => { try { removePlace(item.placeId); refreshLibraries(); } catch { rootNode.querySelector('[role="status"]').textContent = 'წაშლა ვერ მოხერხდა. სცადე ისევ.'; } };
    share.onclick = () => openShare(item, share); actions.append(open, share, remove); article.appendChild(actions); return article;
  }
  function renderLibrary(host) {
    const items = readPlaces(), searchId = new URLSearchParams(root.location.search).get('id'); host.replaceChildren();
    const summary = element('p', 'fh-trip-muted', items.length ? items.length + '/24 ადგილი ინახება მხოლოდ ამ ბრაუზერში. რუკის ფენები და ახალი ამინდი ინტერნეტს საჭიროებს.' : 'ჯერ ადგილი არ შეგინახავს. გახსენი ადგილის გვერდი ან დღის გეგმა და აირჩიე „ოფლაინ შენახვა“.');
    const status = element('p', 'fh-trip-note'); status.setAttribute('role', 'status'); host.append(summary, status);
    const ordered = searchId ? [...items.filter(item => item.placeId === searchId), ...items.filter(item => item.placeId !== searchId)] : items;
    ordered.forEach(item => host.appendChild(savedCard(item, host)));
    const safety = element('details', 'fh-offline-safety'), safetyTitle = element('summary', '', 'უსაფრთხოება ინტერნეტის გარეშეც'), list = element('ul'); SAFETY.forEach(value => list.appendChild(element('li', '', value))); safety.append(safetyTitle, list); host.appendChild(safety);
    if (items.length) { const clear = element('button', 'btn ghost fh-offline-clear', 'ყველა შენახული ადგილის წაშლა'); clear.type = 'button'; clear.onclick = () => { if (!root.confirm('წაიშალოს ამ ბრაუზერში შენახული ყველა ოფლაინ ადგილი?')) return; try { clearPlaces(); refreshLibraries(); note(status, 'შენახული ადგილები წაიშალა.'); } catch { note(status, 'წაშლა ვერ დასრულდა.', true); } }; host.appendChild(clear); }
  }
  function refreshLibraries() { root.document?.querySelectorAll('[data-fh-offline-library]').forEach(renderLibrary); root.document?.querySelectorAll('.fh-trip-tools').forEach(row => row.fhUpdate?.()); }
  function mount() {
    const day = root.document.querySelector('#fhDayPlan .fh-day-plan-content'); if (day) toolbar(day, () => root.FishHuntDayPlan?.current?.());
    if (root.location.pathname.endsWith('/place-details.html')) {
      const id = new URLSearchParams(root.location.search).get('id'), place = placeSnapshot(id), target = root.document.getElementById('placeLead');
      if (place && target && !root.document.getElementById('fhPlaceTools')) { const host = element('div', 'fh-place-tools'); host.id = 'fhPlaceTools'; target.after(host); toolbar(host, () => root.FishHuntPlaceContext?.current?.() || placeSnapshot(id)); }
    }
    const dashboard = root.document.getElementById('gnDashboard');
    if (dashboard && !root.document.getElementById('fhOfflineLibrary')) { const details = element('details', 'fh-offline-library container'); details.id = 'fhOfflineLibrary'; const title = element('summary', '', 'ოფლაინ შენახული ადგილები'), content = element('div'); content.setAttribute('data-fh-offline-library', ''); details.append(title, content); dashboard.after(details); }
    refreshLibraries();
  }
  function init() {
    if (!root.document || root.document.documentElement.dataset.fhTripTools) return;
    root.document.documentElement.dataset.fhTripTools = '1'; mount();
    root.addEventListener('fishhunt:day-plan', () => { mount(); root.document.querySelector('#fhDayPlan .fh-trip-tools')?.fhUpdate?.(); });
    root.addEventListener('fishhunt:place-context', () => { mount(); root.document.querySelector('#fhPlaceTools .fh-trip-tools')?.fhUpdate?.(); });
    root.addEventListener('storage', event => { if (event.key === KEY) refreshLibraries(); });
    root.addEventListener('online', () => { root.document.querySelectorAll('[data-fh-offline-connection]').forEach(node => { node.textContent = 'კავშირი აღდგა. მიმდინარე ინფორმაცია ადგილის გვერდზე გადაამოწმე.'; }); });
  }
  return { init, mount, share: openShare, save: saveForOffline, list: readPlaces, remove: removePlace, refresh: refreshLibraries, cleanSnapshot, cleanAccess, placeSnapshot, savePlace, clearPlaces, persistPlaces, stamp, wrapLines, snapshotText, renderCard, shareFile, prepareOffline, safety: SAFETY, storageKey: KEY };
});
