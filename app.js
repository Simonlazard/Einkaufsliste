/* Einkaufsliste – Oberfläche und Speicherung */
(function () {
  'use strict';

  const APP_VERSION = '1.0.0'; // bei jeder Änderung zusammen mit sw.js erhöhen
  const STORAGE_KEY = 'einkaufsliste.v1';
  const DEFAULT_PANTRY = ['Salz', 'Pfeffer', 'Muskatnuss', 'Zucker', 'Öl', 'Olivenöl', 'Essig', 'Paprikapulver', 'Oregano', 'Zimt'];

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, props, ...children) => {
    const node = document.createElement(tag);
    if (props) Object.assign(node, props);
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c); });
    return node;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ================= Zustand =================
  function defaultState() {
    return {
      v: 1,
      entries: [],   // Rezepte auf der Liste: {id, name, portions, target, ingredients}
      manual: [],    // manuelle Einträge: {id, name, amount, unit, note}
      checked: {},   // Zeilen-Schlüssel → Menge beim Abhaken
      pantry: DEFAULT_PANTRY.slice(),
      draft: { name: '', portions: 4, text: '', rows: [] },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return sanitizeState(JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  function sanitizeState(s) {
    const d = defaultState();
    if (!s || typeof s !== 'object') return d;
    return {
      v: 1,
      entries: Array.isArray(s.entries) ? s.entries : d.entries,
      manual: Array.isArray(s.manual) ? s.manual : d.manual,
      checked: s.checked && typeof s.checked === 'object' ? s.checked : d.checked,
      pantry: Array.isArray(s.pantry) ? s.pantry.filter((p) => typeof p === 'string') : d.pantry,
      draft: s.draft && typeof s.draft === 'object' ? Object.assign(d.draft, s.draft) : d.draft,
    };
  }

  let state = loadState();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Speichern fehlgeschlagen!');
    }
  }

  const pantryKeys = () => new Set(state.pantry.map(Core.normalizeKey));
  const isPantry = (name) => pantryKeys().has(Core.normalizeKey(name));

  // ================= Toast =================
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ================= Tabs =================
  let currentView = 'view-list';
  function showView(id) {
    if (id === currentView) return;
    if (currentView === 'view-scan') stopScan();
    currentView = id;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === id));
    $('#view-title').textContent = document.getElementById(id).dataset.title;
    window.scrollTo(0, 0);
    if (id === 'view-scan') startScan();
    if (id === 'view-list') renderList();
    if (id === 'view-settings') renderSettings();
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

  // ================= Liste =================
  function currentRows() {
    const sources = [
      ...state.entries.map((e) => ({
        label: e.name,
        factor: e.portions && e.target ? e.target / e.portions : 1,
        ingredients: e.ingredients,
      })),
      ...state.manual.map((m) => ({ label: 'manuell', factor: 1, ingredients: [m], manualId: m.id })),
    ];
    return Core.aggregate(sources);
  }

  function isChecked(row) {
    const c = state.checked[row.key];
    return c !== undefined && row.amountBase <= c + 1e-9;
  }

  let lastRows = [];
  function renderList() {
    const rows = currentRows();
    lastRows = rows;

    // veraltete Haken entfernen
    const keys = new Set(rows.map((r) => r.key));
    Object.keys(state.checked).forEach((k) => { if (!keys.has(k)) delete state.checked[k]; });

    const pk = pantryKeys();
    const open = [], done = [], pantry = [];
    rows.forEach((r) => {
      if (pk.has(r.nameKey)) pantry.push(r);
      else if (isChecked(r)) done.push(r);
      else open.push(r);
    });

    $('#list-open').replaceChildren(...open.map(renderRow));
    $('#list-done').replaceChildren(...done.map(renderRow));
    $('#list-pantry').replaceChildren(...pantry.map(renderRow));
    $('#done-heading').hidden = done.length === 0;
    $('#pantry-block').hidden = pantry.length === 0;
    $('#pantry-count').textContent = pantry.length;
    $('#list-empty').hidden = rows.length > 0;

    const entriesList = $('#recipe-entries');
    entriesList.replaceChildren(...state.entries.map((e) => el('li', { className: 'entry' },
      el('span', null, e.name, ' ', el('small', null, e.target ? `(${e.target} ${e.target === 1 ? 'Portion' : 'Portionen'})` : '')),
      el('button', { type: 'button', textContent: 'Entfernen', onclick: () => removeEntry(e.id) }),
    )));
    $('#recipes-block').hidden = rows.length === 0 && state.entries.length === 0;
  }

  function renderRow(row) {
    const li = el('li', { className: 'item' + (isChecked(row) ? ' checked' : '') });
    const subParts = [];
    if (row.notes.length) subParts.push(row.notes.join(' · '));
    if (row.sources.length) subParts.push(row.sources.join(', '));
    li.append(
      el('span', { className: 'check', role: 'checkbox', ariaChecked: String(isChecked(row)) }),
      el('span', { className: 'item-main' },
        el('span', { className: 'item-line' },
          row.amountText ? el('span', { className: 'item-amount-txt', textContent: row.amountText }) : null,
          row.name),
        subParts.length ? el('span', { className: 'item-sub', textContent: subParts.join(' — ') }) : null),
      el('button', {
        className: 'more', type: 'button', textContent: '⋯', ariaLabel: 'Details',
        onclick: (ev) => { ev.stopPropagation(); openItemDialog(row); },
      }),
    );
    li.addEventListener('click', () => toggleCheck(row));
    return li;
  }

  function toggleCheck(row) {
    if (isChecked(row)) delete state.checked[row.key];
    else state.checked[row.key] = row.amountBase;
    save();
    renderList();
  }

  function removeEntry(id) {
    const e = state.entries.find((x) => x.id === id);
    if (!e || !confirm(`„${e.name}“ von der Liste entfernen?`)) return;
    state.entries = state.entries.filter((x) => x.id !== id);
    save();
    renderList();
  }

  $('#clear-list').addEventListener('click', () => {
    if (!confirm('Die ganze Liste leeren?')) return;
    state.entries = [];
    state.manual = [];
    state.checked = {};
    save();
    renderList();
  });

  $('#manual-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $('#manual-input');
    const parsed = Core.parseLine(input.value);
    if (!parsed) return;
    state.manual.push(Object.assign({ id: uid() }, parsed));
    input.value = '';
    save();
    renderList();
  });

  // ---------- Zutat-Details ----------
  let dialogRow = null;
  function openItemDialog(row) {
    dialogRow = row;
    $('#item-title').textContent = row.name;
    $('#item-amount').textContent = row.amountText || '';
    $('#item-amount').hidden = !row.amountText;
    $('#item-notes').replaceChildren(...row.notes.map((n) => el('p', { textContent: n })));
    $('#item-sources').textContent = row.sources.length ? 'Aus: ' + row.sources.join(', ') : '';
    const pantry = isPantry(row.name);
    $('#item-pantry').textContent = pantry ? 'Nicht mehr als „Hab ich immer da“ markieren' : 'Als „Hab ich immer da“ markieren';
    $('#item-remove-manual').hidden = row.manualIds.length === 0;
    $('#item-dialog').showModal();
  }

  $('#item-pantry').addEventListener('click', () => {
    if (!dialogRow) return;
    togglePantry(dialogRow.name);
    $('#item-dialog').close();
    renderList();
  });

  $('#item-remove-manual').addEventListener('click', () => {
    if (!dialogRow) return;
    const ids = new Set(dialogRow.manualIds);
    state.manual = state.manual.filter((m) => !ids.has(m.id));
    save();
    $('#item-dialog').close();
    renderList();
  });

  function togglePantry(name) {
    const key = Core.normalizeKey(name);
    if (pantryKeys().has(key)) {
      state.pantry = state.pantry.filter((p) => Core.normalizeKey(p) !== key);
      toast(`${name}: kommt wieder auf die Liste`);
    } else {
      state.pantry.push(name);
      toast(`${name}: hab ich immer da`);
    }
    save();
  }

  // ================= Rezept hinzufügen (Dialog) =================
  let pendingRecipe = null;
  let pendingTarget = 1;
  let afterAddDialog = null;

  function openAddDialog(recipe, onClose) {
    pendingRecipe = recipe;
    pendingTarget = recipe.portions || 1;
    afterAddDialog = onClose || null;
    $('#add-title').textContent = recipe.name;
    $('#add-dup').hidden = !state.entries.some((e) => e.name.toLowerCase() === recipe.name.toLowerCase());
    $('#add-portions-row').hidden = !recipe.portions;
    renderAddPreview();
    $('#add-dialog').showModal();
  }

  function renderAddPreview() {
    const r = pendingRecipe;
    const factor = r.portions ? pendingTarget / r.portions : 1;
    $('#add-portions').textContent = pendingTarget;
    $('#add-preview').replaceChildren(...r.ingredients.map((ing) => {
      const pantry = isPantry(ing.name);
      const amount = Core.formatIngredientAmount(ing, factor, false);
      return el('li', { className: pantry ? 'p-pantry' : '' },
        amount ? el('span', { className: 'p-amt', textContent: amount + ' ' }) : null,
        ing.name,
        pantry ? el('span', { className: 'tag', textContent: 'immer da' }) : null);
    }));
  }

  $('#add-minus').addEventListener('click', () => { if (pendingTarget > 1) { pendingTarget--; renderAddPreview(); } });
  $('#add-plus').addEventListener('click', () => { if (pendingTarget < 99) { pendingTarget++; renderAddPreview(); } });

  $('#add-dialog').addEventListener('close', () => {
    const dlg = $('#add-dialog');
    const added = dlg.returnValue === 'ok' && pendingRecipe;
    if (added) {
      const r = pendingRecipe;
      state.entries.push({
        id: uid(),
        name: r.name,
        portions: r.portions,
        target: r.portions ? pendingTarget : null,
        ingredients: r.ingredients,
      });
      save();
      renderList();
      toast(`„${r.name}“ hinzugefügt`);
    }
    dlg.returnValue = '';
    pendingRecipe = null;
    const cb = afterAddDialog;
    afterAddDialog = null;
    if (cb) cb(!!added);
  });

  // ================= Scanner =================
  let stream = null;
  let scanning = false;
  let scanPaused = false;
  let lastScanTime = 0;
  const ignoreUntil = {}; // QR-Text → Zeitstempel, bis wann er ignoriert wird

  function setScanStatus(msg) { $('#scan-status').textContent = msg; }

  async function startScan() {
    if (stream) return;
    $('#scan-retry').hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanStatus('Die Kamera ist hier nicht verfügbar. Nutze „QR-Code aus Foto lesen“.');
      return;
    }
    setScanStatus('Kamera wird gestartet …');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      });
    } catch (e) {
      stream = null;
      setScanStatus('Kein Kamerazugriff. Bitte in den Einstellungen erlauben oder ein Foto verwenden.');
      $('#scan-retry').hidden = false;
      return;
    }
    if (currentView !== 'view-scan') { stopScan(); return; }
    const video = $('#scan-video');
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* iOS startet trotzdem */ }
    scanning = true;
    scanPaused = false;
    setScanStatus('Halte die Kamera auf einen Rezept-QR-Code.');
    requestAnimationFrame(scanTick);
  }

  function stopScan() {
    scanning = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const video = $('#scan-video');
    video.srcObject = null;
  }

  const scanCanvas = $('#scan-canvas');
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

  function scanTick(ts) {
    if (!scanning) return;
    const video = $('#scan-video');
    if (!scanPaused && video.readyState >= 2 && ts - lastScanTime > 120) {
      lastScanTime = ts;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh) {
        const scale = Math.min(1, 1280 / Math.max(vw, vh));
        const w = Math.round(vw * scale), h = Math.round(vh * scale);
        scanCanvas.width = w;
        scanCanvas.height = h;
        scanCtx.drawImage(video, 0, 0, w, h);
        const img = scanCtx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
        if (code) handleCode(code);
      }
    }
    requestAnimationFrame(scanTick);
  }

  function codeText(code) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(code.binaryData));
    } catch (e) {
      return code.data;
    }
  }

  function handleCode(code, fromPhoto) {
    const text = codeText(code);
    const now = Date.now();
    if (!fromPhoto && ignoreUntil[text] && ignoreUntil[text] > now) return;
    const recipe = Core.decodeRecipe(text);
    if (!recipe) {
      ignoreUntil[text] = now + 3000;
      setScanStatus('Das ist kein Rezept-QR-Code dieser App.');
      return;
    }
    scanPaused = true;
    setScanStatus(`Gefunden: ${recipe.name}`);
    openAddDialog(recipe, (added) => {
      ignoreUntil[text] = Date.now() + (added ? 10000 : 3000);
      scanPaused = false;
      setScanStatus(added ? 'Hinzugefügt. Nächstes Rezept scannen oder zur Liste wechseln.' : 'Halte die Kamera auf einen Rezept-QR-Code.');
    });
  }

  $('#scan-retry').addEventListener('click', startScan);

  $('#scan-file').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // in mehreren Größen probieren (große Fotos sind langsam, kleine verlieren Details)
      for (const max of [1600, 1000, 2400]) {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        scanCanvas.width = w;
        scanCanvas.height = h;
        scanCtx.drawImage(img, 0, 0, w, h);
        const code = jsQR(scanCtx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code) { handleCode(code, true); return; }
      }
      toast('Kein QR-Code im Bild gefunden');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Bild konnte nicht geladen werden'); };
    img.src = url;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopScan();
    else if (currentView === 'view-scan') startScan();
  });

  // ================= Rezept erstellen =================
  $('#unit-list').replaceChildren(...Core.UNIT_NAMES.map((u) => el('option', { value: u })));

  function formatAmountInput(a) {
    return a === null || a === undefined ? '' : String(Math.round(a * 1000) / 1000).replace('.', ',');
  }

  function renderDraft() {
    const d = state.draft;
    $('#rc-name').value = d.name || '';
    $('#rc-portions').value = d.portions || '';
    $('#rc-text').value = d.text || '';
    renderDraftRows();
  }

  function renderDraftRows() {
    const container = $('#rc-rows');
    container.replaceChildren(...state.draft.rows.map((row, i) => {
      const bind = (field) => (ev) => { state.draft.rows[i][field] = ev.target.value; save(); };
      return el('div', { className: 'ing-row' },
        el('input', { className: 'r-amt', value: row.amount, placeholder: 'Menge', inputMode: 'decimal', oninput: bind('amount') }),
        (() => { const u = el('input', { className: 'r-unit', value: row.unit, placeholder: 'Einheit', oninput: bind('unit') }); u.setAttribute('list', 'unit-list'); return u; })(),
        el('input', { className: 'r-name', value: row.name, placeholder: 'Zutat', oninput: bind('name') }),
        el('input', { className: 'r-note', value: row.note, placeholder: 'Hinweis (optional)', oninput: bind('note') }),
        el('button', {
          className: 'r-del', type: 'button', textContent: 'Löschen',
          onclick: () => { state.draft.rows.splice(i, 1); save(); renderDraftRows(); },
        }),
      );
    }));
  }

  $('#rc-name').addEventListener('input', (ev) => { state.draft.name = ev.target.value; save(); });
  $('#rc-portions').addEventListener('input', (ev) => { state.draft.portions = parseInt(ev.target.value, 10) || ''; save(); });
  $('#rc-text').addEventListener('input', (ev) => { state.draft.text = ev.target.value; save(); });

  $('#rc-parse').addEventListener('click', () => {
    const parsed = Core.parseRecipeText($('#rc-text').value);
    if (!parsed.length) { toast('Keine Zutaten erkannt'); return; }
    if (state.draft.rows.some((r) => r.name) && !confirm('Die vorhandenen Zutaten ersetzen?')) return;
    state.draft.rows = parsed.map((p) => ({
      amount: formatAmountInput(p.amount), unit: p.unit, name: p.name, note: p.note,
    }));
    save();
    renderDraftRows();
    toast(`${parsed.length} Zutaten erkannt`);
  });

  $('#rc-add-row').addEventListener('click', () => {
    state.draft.rows.push({ amount: '', unit: '', name: '', note: '' });
    save();
    renderDraftRows();
    const inputs = document.querySelectorAll('#rc-rows .r-amt');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  $('#rc-reset').addEventListener('click', () => {
    if (!confirm('Formular leeren?')) return;
    state.draft = defaultState().draft;
    save();
    renderDraft();
    $('#rc-output').hidden = true;
  });

  /** Formular → Rezeptobjekt; null bei Fehlern (mit Hinweis). */
  function draftToRecipe() {
    const name = $('#rc-name').value.trim();
    if (!name) { toast('Bitte einen Rezeptnamen eingeben'); return null; }
    const portions = parseInt($('#rc-portions').value, 10);
    const ingredients = [];
    for (const r of state.draft.rows) {
      if (!String(r.name || '').trim()) continue;
      let amount = null;
      if (String(r.amount || '').trim()) {
        const a = Core.parseAmount(r.amount);
        if (a.value === null || a.rest.trim()) { toast(`Menge bei „${r.name}“ nicht verständlich`); return null; }
        amount = a.value;
      }
      ingredients.push({ name: r.name.trim(), amount, unit: Core.canonicalUnit(r.unit), note: String(r.note || '').trim() });
    }
    if (!ingredients.length) { toast('Bitte mindestens eine Zutat eintragen'); return null; }
    return { name, portions: portions > 0 ? portions : null, ingredients };
  }

  let lastQr = null; // {recipe, dataUrl, blob}

  function makeQrCanvas(text, title, subtitle) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    let qr = null;
    for (const level of ['M', 'L']) {
      try {
        const q = qrcode(0, level);
        q.addData(text, 'Byte');
        q.make();
        qr = q;
        break;
      } catch (e) { /* zu lang für diese Stufe */ }
    }
    if (!qr) return null;
    const n = qr.getModuleCount();
    const cell = Math.max(6, Math.floor(900 / (n + 8)));
    const margin = cell * 4;
    const qrSize = n * cell + margin * 2;
    const textH = title ? 110 : 0;
    const canvas = document.createElement('canvas');
    canvas.width = qrSize;
    canvas.height = qrSize + textH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
      }
    }
    if (title) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const fit = (str, font) => {
        ctx.font = font;
        let s = str;
        while (ctx.measureText(s).width > qrSize - 40 && s.length > 3) s = s.slice(0, -2) + '…';
        return s;
      };
      ctx.fillText(fit(title, 'bold 44px -apple-system, "Segoe UI", sans-serif'), qrSize / 2, qrSize + 10);
      if (subtitle) {
        ctx.fillStyle = '#555555';
        ctx.fillText(fit(subtitle, '30px -apple-system, "Segoe UI", sans-serif'), qrSize / 2, qrSize + 56);
      }
    }
    return canvas;
  }

  $('#rc-make').addEventListener('click', () => {
    const recipe = draftToRecipe();
    if (!recipe) return;
    const text = Core.encodeRecipe(recipe);
    const subtitle = recipe.portions ? `${recipe.portions} ${recipe.portions === 1 ? 'Portion' : 'Portionen'}` : '';
    const canvas = makeQrCanvas(text, recipe.name, subtitle);
    if (!canvas) { toast('Rezept ist zu lang für einen QR-Code – Hinweise kürzen'); return; }
    const dataUrl = canvas.toDataURL('image/png');
    lastQr = { recipe, dataUrl, canvas };
    $('#rc-qr').src = dataUrl;
    const bytes = new TextEncoder().encode(text).length;
    $('#rc-info').textContent = `${recipe.ingredients.length} Zutaten · ${bytes} Zeichen im QR-Code`;
    $('#rc-output').hidden = false;
    $('#rc-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const fileSafe = (s) => s.replace(/[^\wäöüÄÖÜß -]+/g, '').trim().replace(/\s+/g, '-') || 'rezept';

  async function shareOrDownload(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  $('#rc-share').addEventListener('click', () => {
    if (!lastQr) return;
    lastQr.canvas.toBlob((blob) => {
      if (blob) shareOrDownload(blob, `QR-${fileSafe(lastQr.recipe.name)}.png`);
    }, 'image/png');
  });

  $('#rc-print').addEventListener('click', () => {
    if (!lastQr) return;
    const r = lastQr.recipe;
    const area = $('#print-area');
    area.replaceChildren(
      el('h1', { textContent: r.name }),
      r.portions ? el('p', { textContent: `${r.portions} ${r.portions === 1 ? 'Portion' : 'Portionen'}` }) : null,
      el('div', { className: 'pa-grid' },
        el('img', { src: lastQr.dataUrl, alt: '' }),
        el('ul', null, ...r.ingredients.map((ing) => {
          const amt = Core.formatIngredientAmount(ing, 1, false);
          return el('li', { textContent: (amt ? amt + ' ' : '') + ing.name + (ing.note ? ' (' + ing.note + ')' : '') });
        }))),
    );
    setTimeout(() => window.print(), 50);
  });

  $('#rc-to-list').addEventListener('click', () => {
    if (!lastQr) return;
    openAddDialog(lastQr.recipe);
  });

  // ================= Einstellungen =================
  function renderSettings() {
    $('#app-version').textContent = APP_VERSION;
    const sorted = state.pantry.slice().sort((a, b) => a.localeCompare(b, 'de'));
    $('#pantry-chips').replaceChildren(...sorted.map((p) => el('span', { className: 'chip' },
      p,
      el('button', {
        type: 'button', textContent: '×', ariaLabel: `${p} entfernen`,
        onclick: () => { state.pantry = state.pantry.filter((x) => x !== p); save(); renderSettings(); },
      }))));
  }

  $('#pantry-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $('#pantry-input');
    const name = input.value.trim();
    if (!name) return;
    if (!isPantry(name)) state.pantry.push(name);
    input.value = '';
    save();
    renderSettings();
  });

  $('#backup-export').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'einkaufsliste', exportedAt: new Date().toISOString(), state }, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    shareOrDownload(new Blob([data], { type: 'application/json' }), `einkaufsliste-backup-${date}.json`);
  });

  $('#backup-import').addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'einkaufsliste' || !data.state) throw new Error('kein Backup');
      if (!confirm('Backup einspielen? Die aktuellen Daten werden ersetzt.')) return;
      state = sanitizeState(data.state);
      save();
      renderDraft();
      renderSettings();
      toast('Backup eingespielt');
    } catch (e) {
      toast('Das ist keine gültige Backup-Datei');
    }
  });

  $('#reset-all').addEventListener('click', () => {
    if (!confirm('Wirklich ALLE Daten löschen (Liste, Vorrat, Entwurf)?')) return;
    state = defaultState();
    save();
    renderDraft();
    renderSettings();
    toast('Alles gelöscht');
  });

  // ================= Start =================
  renderDraft();
  renderList();

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
  }
})();
