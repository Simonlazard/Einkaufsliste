/* Einkaufsliste – Oberfläche und Speicherung */
(function () {
  'use strict';

  const APP_VERSION = '2.1.0'; // bei jeder Änderung zusammen mit sw.js erhöhen
  const STORAGE_KEY = 'einkaufsliste.v1';
  const EXTRA_PANTRY = ['Öl', 'Olivenöl', 'Essig', 'Paprikapulver', 'Oregano', 'Zimt'];
  const TEST_SIZES = [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]; // mm pro Modul auf der Testkarte

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, props, ...children) => {
    const node = document.createElement(tag);
    if (props) Object.assign(node, props);
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c); });
    return node;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtMm = (x) => String(Math.round(x * 1000) / 1000);
  const deNum = (x, d) => x.toLocaleString('de-DE', { maximumFractionDigits: d === undefined ? 1 : d });

  // ================= Zustand =================
  function defaultPantry() {
    const names = Core.dictionary().filter((e) => e.pantry).map((e) => e.n);
    EXTRA_PANTRY.forEach((n) => { if (!names.includes(n)) names.push(n); });
    return names;
  }

  function defaultState() {
    return {
      ver: 2,
      entries: [],   // Rezepte auf der Liste: {id, name, factor, ingredients}
      manual: [],    // manuelle Einträge: {id, name, amount, unit, note}
      checked: {},   // Zeilen-Schlüssel → Menge beim Abhaken
      pantry: defaultPantry(),
      custom: [],    // eigene Zutaten: {name, unit, liquid, pantry, aliases}
      settings: { quick: true, ec: 'M', mm: 0.5 },
      draft: { name: '', text: '', rows: [] },
    };
  }

  function sanitizeState(s) {
    const d = defaultState();
    if (!s || typeof s !== 'object') return d;
    const pantry = Array.isArray(s.pantry) ? s.pantry.filter((p) => typeof p === 'string') : d.pantry;
    if ((s.ver || 1) < 2) { // ältere Version: neue Standard-Vorratsartikel ergänzen
      Core.dictionary().filter((e) => e.pantry).forEach((e) => {
        const key = Core.normalizeKey(e.n);
        if (!pantry.some((p) => Core.normalizeKey(p) === key)) pantry.push(e.n);
      });
    }
    const entries = (Array.isArray(s.entries) ? s.entries : []).map((e) => ({
      id: e.id || uid(),
      name: String(e.name || 'Rezept'),
      factor: typeof e.factor === 'number' && e.factor > 0 ? e.factor
        : (e.portions && e.target ? e.target / e.portions : 1),
      ingredients: Array.isArray(e.ingredients) ? e.ingredients : [],
    }));
    const draft = s.draft && typeof s.draft === 'object' ? s.draft : {};
    return {
      ver: 2,
      entries,
      manual: Array.isArray(s.manual) ? s.manual : [],
      checked: s.checked && typeof s.checked === 'object' ? s.checked : {},
      pantry,
      custom: Array.isArray(s.custom) ? s.custom.filter((c) => c && typeof c.name === 'string') : [],
      settings: Object.assign(d.settings, s.settings && typeof s.settings === 'object' ? s.settings : {}),
      draft: {
        name: typeof draft.name === 'string' ? draft.name : '',
        text: typeof draft.text === 'string' ? draft.text : '',
        rows: Array.isArray(draft.rows) ? draft.rows.map((r) => ({
          amount: String(r.amount || ''), unit: String(r.unit || ''), name: String(r.name || ''),
        })) : [],
      },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? sanitizeState(JSON.parse(raw)) : defaultState();
    } catch (e) {
      return defaultState();
    }
  }

  let state = loadState();
  Core.setCustom(state.custom);

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Speichern fehlgeschlagen!');
    }
  }

  const pantryKeys = () => new Set(state.pantry.map(Core.pantryKey));
  const isPantry = (name) => pantryKeys().has(Core.pantryKey(name));

  // ================= Toast =================
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ================= Navigation =================
  let currentView = 'view-list';
  const PARENT = { 'view-create': 'view-settings' };

  function showView(id) {
    if (id === currentView) return;
    if (currentView === 'view-scan') stopScan();
    currentView = id;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
    const tabView = PARENT[id] || id;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === tabView));
    $('#view-title').textContent = document.getElementById(id).dataset.title;
    $('#back-btn').hidden = !PARENT[id];
    window.scrollTo(0, 0);
    if (id === 'view-scan') startScan();
    if (id === 'view-list') renderList();
    if (id === 'view-settings') renderSettings();
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.view === currentView) return;
    showView(t.dataset.view);
  }));
  $('#back-btn').addEventListener('click', () => showView(PARENT[currentView]));

  // ================= Liste =================
  function currentRows() {
    const sources = [
      ...state.entries.map((e) => ({ label: e.name, factor: e.factor || 1, ingredients: e.ingredients })),
      ...state.manual.map((m) => ({ label: 'manuell', factor: 1, ingredients: [m], manualId: m.id })),
    ];
    return Core.aggregate(sources);
  }

  function isChecked(row) {
    const c = state.checked[row.key];
    return c !== undefined && row.amountBase <= c + 1e-9;
  }

  function renderList() {
    const rows = currentRows();
    const keys = new Set(rows.map((r) => r.key));
    Object.keys(state.checked).forEach((k) => { if (!keys.has(k)) delete state.checked[k]; });

    const pk = pantryKeys();
    const open = [], done = [], pantry = [];
    rows.forEach((r) => {
      if (pk.has(r.nameKey)) pantry.push(r);
      else if (isChecked(r)) done.push(r);
      else open.push(r);
    });

    // Neu hinzugekommene oder geänderte Zutaten kurz hervorheben (nicht beim ersten Zeichnen)
    const fresh = new Set();
    if (lastSeen) rows.forEach((r) => { if (!lastSeen.has(r.key) || lastSeen.get(r.key) !== r.amountBase) fresh.add(r.key); });
    lastSeen = new Map(rows.map((r) => [r.key, r.amountBase]));

    $('#list-open').replaceChildren(...open.map((r) => renderRow(r, fresh.has(r.key))));
    $('#list-done').replaceChildren(...done.map((r) => renderRow(r, false)));
    $('#list-pantry').replaceChildren(...pantry.map((r) => renderRow(r, fresh.has(r.key))));
    $('#done-heading').hidden = done.length === 0;
    $('#pantry-block').hidden = pantry.length === 0;
    $('#pantry-count').textContent = pantry.length;
    $('#list-empty').hidden = rows.length > 0;

    const hello = $('#list-hello');
    hello.parentElement.hidden = rows.length === 0;
    hello.textContent = open.length === 0
      ? 'Alles im Korb. Guten Appetit! 🎉'
      : (open.length === 1 ? 'Noch 1 Ding fehlt' : `Noch ${open.length} Dinge fehlen`);

    $('#recipe-entries').replaceChildren(...state.entries.map((e) => el('span', { className: 'chip' },
      e.name + (e.factor && e.factor !== 1 ? ` · ${Core.niceNumber(e.factor)}×` : ''),
      el('button', { type: 'button', textContent: '×', ariaLabel: `„${e.name}“ entfernen`, onclick: () => removeEntry(e.id) }),
    )));
    $('#recipes-block').hidden = rows.length === 0 && state.entries.length === 0;
  }

  let lastSeen = null;

  function renderRow(row, isFresh) {
    const li = el('li', { className: 'item' + (isChecked(row) ? ' checked' : '') + (isFresh ? ' fresh' : '') });
    const subParts = [];
    if (row.notes.length) subParts.push(row.notes.join(' · '));
    li.append(
      el('span', { className: 'check', role: 'checkbox', ariaChecked: String(isChecked(row)) }),
      el('span', { className: 'ico', textContent: Icons.forName(row.name), style: `background:${Icons.tintFor(row.name)}` }),
      el('span', { className: 'item-main' },
        el('span', { className: 'item-line', textContent: row.name }),
        subParts.length ? el('span', { className: 'item-sub', textContent: subParts.join(' — ') }) : null),
      row.amountText ? el('span', { className: 'item-amount-txt', textContent: row.amountText }) : null,
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
    $('#item-pantry').textContent = isPantry(row.name) ? 'Nicht mehr als „Hab ich immer da“ markieren' : 'Als „Hab ich immer da“ markieren';
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
    const key = Core.pantryKey(name);
    const label = Core.canonicalName(name);
    if (pantryKeys().has(key)) {
      state.pantry = state.pantry.filter((p) => Core.pantryKey(p) !== key);
      toast(`${label}: kommt wieder auf die Liste`);
    } else {
      state.pantry.push(label);
      toast(`${label}: hab ich immer da`);
    }
    save();
  }

  // ================= Rezept hinzufügen =================
  let pendingRecipe = null;
  let pendingFactor = 1;
  let afterAddDialog = null;

  function addEntry(recipe, factor) {
    state.entries.push({ id: uid(), name: recipe.name, factor, ingredients: recipe.ingredients });
    save();
    renderList();
  }

  function openAddDialog(recipe, onClose) {
    pendingRecipe = recipe;
    pendingFactor = 1;
    afterAddDialog = onClose || null;
    $('#add-title').textContent = recipe.name;
    $('#add-dup').hidden = !state.entries.some((e) => e.name.toLowerCase() === recipe.name.toLowerCase());
    renderAddPreview();
    $('#add-dialog').showModal();
  }

  function renderAddPreview() {
    document.querySelectorAll('#add-factors button').forEach((b) => b.classList.toggle('on', +b.dataset.f === pendingFactor));
    $('#add-preview').replaceChildren(...pendingRecipe.ingredients.map((ing) => {
      const pantry = isPantry(ing.name);
      const amount = Core.formatIngredientAmount(ing, pendingFactor, false);
      return el('li', { className: pantry ? 'p-pantry' : '' },
        el('span', { className: 'pv-ico', textContent: Icons.forName(ing.name) }),
        amount ?el('span', { className: 'p-amt', textContent: amount + ' ' }) : null,
        Core.canonicalName(ing.name),
        pantry ? el('span', { className: 'tag', textContent: 'immer da' }) : null);
    }));
  }

  document.querySelectorAll('#add-factors button').forEach((b) => b.addEventListener('click', () => {
    pendingFactor = +b.dataset.f;
    renderAddPreview();
  }));

  /** Schließt den Vorgang genau einmal ab (egal ob per Knopf, Abbrechen oder Esc). */
  function finishAdd(added) {
    const r = pendingRecipe;
    if (!r) return;
    pendingRecipe = null;
    if (added) {
      addEntry(r, pendingFactor);
      toast(`„${r.name}“ hinzugefügt`);
    }
    const cb = afterAddDialog;
    afterAddDialog = null;
    if (cb) cb(added);
  }

  $('#add-ok').addEventListener('click', (ev) => {
    ev.preventDefault();
    finishAdd(true);
    $('#add-dialog').close();
  });
  $('#add-dialog').addEventListener('close', () => finishAdd(false)); // Abbrechen, Esc usw.

  // ================= Scanner =================
  let stream = null;
  let scanning = false;
  let scanPaused = false;
  let lastScanTime = 0;
  const ignoreUntil = {}; // Code-Schlüssel → Zeitstempel, bis wann er ignoriert wird

  const setScanStatus = (msg) => { $('#scan-status').textContent = msg; };

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
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
    } catch (e) {
      stream = null;
      setScanStatus('Kein Kamerazugriff. Bitte in den Einstellungen erlauben oder ein Foto verwenden.');
      $('#scan-retry').hidden = false;
      return;
    }
    if (currentView !== 'view-scan') { stopScan(); return; }
    try { // wenn möglich dauerhaft scharfstellen
      await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch (e) { /* nicht überall unterstützt */ }
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
    $('#scan-video').srcObject = null;
  }

  const scanCanvas = $('#scan-canvas');
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

  /**
   * jsQR mit Absicherung. "invertFirst" liest zuerst helle Module auf dunklem Grund (deine Karten),
   * danach normale Codes. (Der Modus "onlyInvert" von jsQR 1.4.0 ist fehlerhaft und wird nicht benutzt.)
   */
  function decodeImage(data, w, h) {
    try {
      return jsQR(data, w, h, { inversionAttempts: 'invertFirst' });
    } catch (e) {
      return null;
    }
  }

  function scanTick(ts) {
    if (!scanning) return;
    const video = $('#scan-video');
    if (!scanPaused && video.readyState >= 2 && ts - lastScanTime > 120) {
      lastScanTime = ts;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh) {
        // mittleren Bereich in voller Auflösung auswerten (kleine Codes brauchen jedes Pixel)
        const side = Math.floor(Math.min(vw, vh) * 0.85);
        const out = Math.min(side, 1100);
        scanCanvas.width = out;
        scanCanvas.height = out;
        scanCtx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, out, out);
        const img = scanCtx.getImageData(0, 0, out, out);
        const code = decodeImage(img.data, out, out);
        if (code) handleCode(code, false);
      }
    }
    requestAnimationFrame(scanTick);
  }

  function flashScanner() {
    const s = $('#scanner');
    s.classList.add('ok');
    setTimeout(() => s.classList.remove('ok'), 900);
  }

  function handleCode(code, fromPhoto) {
    const bytes = Array.from(code.binaryData || []);
    const key = bytes.join(',');
    const now = Date.now();
    if (!fromPhoto && ignoreUntil[key] && ignoreUntil[key] > now) return;
    const result = Core.decodeScan(bytes);

    if (result.error === 'unknown-ingredient') {
      ignoreUntil[key] = now + 4000;
      setScanStatus('Diese Karte enthält Zutaten, die diese App-Version nicht kennt. Bitte die App aktualisieren.');
      return;
    }
    if (!result.recipe) {
      ignoreUntil[key] = now + 3000;
      setScanStatus('Das ist kein Rezept-QR-Code dieser App.');
      return;
    }
    const recipe = result.recipe;
    const duplicate = state.entries.some((e) => e.name.toLowerCase() === recipe.name.toLowerCase());

    if (state.settings.quick && !duplicate) { // Schnell-Modus: sofort hinzufügen
      addEntry(recipe, 1);
      ignoreUntil[key] = now + 8000;
      flashScanner();
      const n = state.entries.length;
      setScanStatus(`✓ „${recipe.name}“ hinzugefügt (${n} ${n === 1 ? 'Rezept' : 'Rezepte'} auf der Liste)`);
      toast(`„${recipe.name}“ hinzugefügt`);
      return;
    }

    scanPaused = true;
    setScanStatus(`Gefunden: ${recipe.name}`);
    openAddDialog(recipe, (added) => {
      ignoreUntil[key] = Date.now() + (added ? 8000 : 3000);
      scanPaused = false;
      if (added) flashScanner();
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
      for (const max of [1600, 1000, 2400]) {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        scanCanvas.width = w;
        scanCanvas.height = h;
        scanCtx.drawImage(img, 0, 0, w, h);
        const code = decodeImage(scanCtx.getImageData(0, 0, w, h).data, w, h);
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

  // ================= QR-Code erstellen =================
  $('#unit-list').replaceChildren(...Core.UNIT_NAMES.map((u) => el('option', { value: u })));
  $('#rc-ec').value = state.settings.ec;
  $('#rc-mm').value = state.settings.mm;

  const formatAmountInput = (a) => (a === null || a === undefined ? '' : String(Math.round(a * 1000) / 1000).replace('.', ','));

  function renderDraft() {
    $('#rc-name').value = state.draft.name || '';
    $('#rc-text').value = state.draft.text || '';
    renderDraftRows();
  }

  function statusFor(name) {
    const n = name.trim();
    if (!n) return { cls: '', text: '', add: false };
    const hit = Core.lookup(n);
    if (hit && hit.id !== null) {
      return { cls: 'ok', text: hit.entry.n === n ? '✓ im Wörterbuch' : `✓ im Wörterbuch als „${hit.entry.n}“`, add: false };
    }
    if (hit) return { cls: 'warn', text: `Eigene Zutat „${hit.entry.n}“ – wird als Text gespeichert`, add: false };
    return { cls: 'warn', text: 'Nicht im Wörterbuch – wird als Text gespeichert', add: true };
  }

  function renderStatus(box, row) {
    const st = statusFor(row.name);
    box.className = 'r-status ' + st.cls;
    box.replaceChildren(st.text);
    if (st.add) {
      box.append(el('button', {
        type: 'button', textContent: 'Als neue Zutat anlegen',
        onclick: () => openIngDialog({ name: row.name, unit: row.unit, onSaved: renderDraftRows }),
      }));
    }
  }

  function renderDraftRows() {
    $('#rc-rows').replaceChildren(...state.draft.rows.map((row, i) => {
      const status = el('div', { className: 'r-status' });
      renderStatus(status, row);
      const bind = (field, refresh) => (ev) => {
        state.draft.rows[i][field] = ev.target.value;
        save();
        if (refresh) renderStatus(status, state.draft.rows[i]);
      };
      const unit = el('input', { className: 'r-unit', value: row.unit, placeholder: 'Einheit', oninput: bind('unit') });
      unit.setAttribute('list', 'unit-list');
      return el('div', { className: 'ing-row' },
        el('input', { className: 'r-amt', value: row.amount, placeholder: 'Menge', inputMode: 'decimal', oninput: bind('amount') }),
        unit,
        el('input', { className: 'r-name', value: row.name, placeholder: 'Zutat', oninput: bind('name', true) }),
        status,
        el('button', {
          className: 'r-del', type: 'button', textContent: 'Löschen',
          onclick: () => { state.draft.rows.splice(i, 1); save(); renderDraftRows(); },
        }),
      );
    }));
  }

  $('#rc-name').addEventListener('input', (ev) => { state.draft.name = ev.target.value; save(); });
  $('#rc-text').addEventListener('input', (ev) => { state.draft.text = ev.target.value; save(); });

  $('#rc-parse').addEventListener('click', () => {
    const parsed = Core.parseRecipeText($('#rc-text').value);
    if (!parsed.length) { toast('Keine Zutaten erkannt'); return; }
    if (state.draft.rows.some((r) => r.name) && !confirm('Die vorhandenen Zutaten ersetzen?')) return;
    state.draft.rows = parsed.map((p) => ({
      amount: formatAmountInput(p.amount), unit: p.unit, name: Core.canonicalName(p.name),
    }));
    save();
    renderDraftRows();
    toast(`${parsed.length} Zutaten erkannt`);
  });

  $('#rc-add-row').addEventListener('click', () => {
    state.draft.rows.push({ amount: '', unit: '', name: '' });
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
    lastQr = null;
  });

  /** Formular → Rezeptobjekt; null bei Fehlern (mit Hinweis). */
  function draftToRecipe() {
    const name = $('#rc-name').value.trim();
    if (!name) { toast('Bitte einen Rezeptnamen eingeben'); return null; }
    const ingredients = [];
    for (const r of state.draft.rows) {
      if (!String(r.name || '').trim()) continue;
      let amount = null;
      if (String(r.amount || '').trim()) {
        const a = Core.parseAmount(r.amount);
        if (a.value === null || a.rest.trim()) { toast(`Menge bei „${r.name}“ nicht verständlich`); return null; }
        amount = a.value;
      }
      if (Core.unitCode(r.unit) < 0) { toast(`Einheit „${r.unit}“ bei „${r.name}“ wird nicht unterstützt`); return null; }
      ingredients.push({ name: r.name.trim(), amount, unit: Core.canonicalUnit(r.unit) });
    }
    if (!ingredients.length) { toast('Bitte mindestens eine Zutat eintragen'); return null; }
    return { name, ingredients };
  }

  // ---------- QR bauen ----------
  let lastQr = null; // {recipe, qr, n, byteCount, dictCount, textNames, dataUrl, canvas}

  function buildQr(bytes, level) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['default']; // Binärdaten: 1 Zeichen = 1 Byte
    const q = qrcode(0, level);
    q.addData(String.fromCharCode.apply(null, Array.from(bytes)), 'Byte');
    q.make();
    return q;
  }

  /** Vorschau: helle Module auf schwarzem Grund, so wie auf der gelaserten Karte. */
  function previewCanvas(qr) {
    const n = qr.getModuleCount();
    const cell = Math.max(4, Math.floor(480 / (n + 8)));
    const size = (n + 8) * cell;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
      }
    }
    return canvas;
  }

  // ---------- SVG für den Laser ----------
  const f3 = (x) => String(Math.round(x * 1000) / 1000);

  /** Pfad aller Module (waagerechte Läufe zusammengefasst) mit Ursprung (x0, y0) und Modulgröße s (mm). */
  function modulesPath(qr, x0, y0, s) {
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) { c++; continue; }
        let end = c;
        while (end < n && qr.isDark(r, end)) end++;
        d += `M${f3(x0 + c * s)} ${f3(y0 + r * s)}h${f3((end - c) * s)}v${f3(s)}h${f3(-(end - c) * s)}z`;
        c = end;
      }
    }
    return d;
  }

  function svgDoc(w, h, body) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f3(w)}mm" height="${f3(h)}mm" viewBox="0 0 ${f3(w)} ${f3(h)}">\n${body}\n</svg>\n`;
  }

  function codeSvg(qr, mm) {
    const size = qr.getModuleCount() * mm;
    return svgDoc(size, size, `<path d="${modulesPath(qr, 0, 0, mm)}" fill="#000000" stroke="none"/>`);
  }

  /** Testkarte 85 × 55 mm: derselbe Code in mehreren Modulgrößen. Gibt {svg, placed, skipped} zurück. */
  function testCardSvg(qr, title) {
    const W = 85, H = 55, cols = 3, rows = 2;
    const cw = W / cols, ch = H / rows, labelH = 3.6;
    const n = qr.getModuleCount();
    let body = '';
    const placed = [], skipped = [];
    TEST_SIZES.forEach((s, i) => {
      const side = n * s;
      const margin = 2 * s; // mindestens 2 Module dunkler Rand ringsum
      if (side + 2 * margin > cw - 1 || side + 2 * margin > ch - labelH - 0.5) { skipped.push(s); return; }
      const cx = (i % cols) * cw + cw / 2;
      const cy = Math.floor(i / cols) * ch + (ch - labelH) / 2;
      body += `<path d="${modulesPath(qr, cx - side / 2, cy - side / 2, s)}" fill="#000000" stroke="none"/>\n`;
      body += `<text x="${f3(cx)}" y="${f3(Math.floor(i / cols) * ch + ch - 1.2)}" font-family="Arial, Helvetica, sans-serif" font-size="2.4" text-anchor="middle" fill="#000000">${String(s).replace('.', ',')} mm</text>\n`;
      placed.push(s);
    });
    return { svg: svgDoc(W, H, body.trim()), placed, skipped };
  }

  function renderQrInfo() {
    if (!lastQr) return;
    const mm = parseFloat(String($('#rc-mm').value).replace(',', '.')) || 0.5;
    const n = lastQr.n;
    $('#rc-info').textContent = `${lastQr.recipe.ingredients.length} Zutaten · ${lastQr.byteCount} Byte · ${n}×${n} Module · `
      + `${deNum(n * mm, 1)} mm Kantenlänge bei ${deNum(mm, 2)} mm pro Modul`;
    const warn = $('#rc-warn');
    if (lastQr.textNames.length) {
      warn.hidden = false;
      warn.textContent = `Nicht im Wörterbuch (als Text gespeichert, Code wird größer): ${lastQr.textNames.join(', ')}`;
    } else {
      warn.hidden = true;
    }
  }

  function makeQr() {
    const recipe = draftToRecipe();
    if (!recipe) return false;
    let enc, qr;
    try {
      enc = Core.encodeBinary(recipe);
      qr = buildQr(enc.bytes, state.settings.ec);
    } catch (e) {
      toast(e && e.message ? e.message : 'QR-Code konnte nicht erzeugt werden');
      return false;
    }
    const canvas = previewCanvas(qr);
    lastQr = {
      recipe, qr, n: qr.getModuleCount(), byteCount: enc.bytes.length,
      dictCount: enc.dictCount, textNames: enc.textNames, canvas, dataUrl: canvas.toDataURL('image/png'),
    };
    $('#rc-qr').src = lastQr.dataUrl;
    $('#rc-output').hidden = false;
    renderQrInfo();
    return true;
  }

  $('#rc-make').addEventListener('click', () => {
    if (makeQr()) $('#rc-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#rc-ec').addEventListener('change', (ev) => {
    state.settings.ec = ev.target.value;
    save();
    if (lastQr) makeQr();
  });

  $('#rc-mm').addEventListener('input', (ev) => {
    const mm = parseFloat(String(ev.target.value).replace(',', '.'));
    if (mm >= 0.2 && mm <= 3) { state.settings.mm = mm; save(); }
    renderQrInfo();
  });

  const fileSafe = (s) => s.replace(/[^\wäöüÄÖÜß -]+/g, '').trim().replace(/\s+/g, '-') || 'rezept';

  async function shareOrDownload(blob, filename) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  $('#rc-svg').addEventListener('click', () => {
    if (!lastQr) return;
    const mm = parseFloat(String($('#rc-mm').value).replace(',', '.'));
    if (!(mm >= 0.2 && mm <= 3)) { toast('Bitte eine Modulgröße zwischen 0,2 und 3 mm eintragen'); return; }
    shareOrDownload(new Blob([codeSvg(lastQr.qr, mm)], { type: 'image/svg+xml' }), `${fileSafe(lastQr.recipe.name)}_${fmtMm(mm)}mm.svg`);
  });

  $('#rc-testcard').addEventListener('click', () => {
    if (!lastQr) return;
    const t = testCardSvg(lastQr.qr);
    if (!t.placed.length) { toast('Der Code ist zu groß für die Testkarte'); return; }
    if (t.skipped.length) toast(`Zu groß für die Karte, weggelassen: ${t.skipped.map((s) => String(s).replace('.', ',')).join(', ')} mm`);
    shareOrDownload(new Blob([t.svg], { type: 'image/svg+xml' }), `Testkarte_${fileSafe(lastQr.recipe.name)}.svg`);
  });

  $('#rc-share').addEventListener('click', () => {
    if (!lastQr) return;
    lastQr.canvas.toBlob((blob) => {
      if (blob) shareOrDownload(blob, `QR-${fileSafe(lastQr.recipe.name)}.png`);
    }, 'image/png');
  });

  $('#rc-to-list').addEventListener('click', () => {
    if (!lastQr) return;
    // Wie ein gescannter Code: Zutaten aus dem Wörterbuch
    const decoded = Core.decodeBinary(Core.encodeBinary(lastQr.recipe).bytes);
    if (decoded.recipe) openAddDialog(decoded.recipe);
  });

  // ================= Neue Zutat =================
  let ingOnSaved = null;

  function openIngDialog(opts) {
    opts = opts || {};
    ingOnSaved = opts.onSaved || null;
    $('#ing-name').value = opts.name || '';
    const u = Core.canonicalUnit(opts.unit || '');
    const sel = $('#ing-unit');
    const spoon = Core.unitInfo(u).family === 'spoon' ? 'TL' : u;
    sel.value = [...sel.options].some((o) => o.value === spoon) ? spoon : '';
    $('#ing-alias').value = '';
    $('#ing-liquid').checked = false;
    $('#ing-pantry').checked = false;
    $('#ing-dialog').showModal();
    if (!opts.name) $('#ing-name').focus();
  }

  $('#ing-add').addEventListener('click', () => openIngDialog());
  $('#ing-cancel').addEventListener('click', () => $('#ing-dialog').close());

  $('#ing-ok').addEventListener('click', () => {
    const name = $('#ing-name').value.trim();
    if (!name) { toast('Bitte einen Namen eingeben'); return; }
    const existing = Core.lookup(name);
    if (existing) {
      toast(`„${name}“ gibt es schon als „${existing.entry.n}“`);
      return;
    }
    const aliases = $('#ing-alias').value.split(',').map((a) => a.trim()).filter((a) => a && !Core.lookup(a));
    const entry = {
      name,
      unit: $('#ing-unit').value,
      liquid: $('#ing-liquid').checked,
      pantry: $('#ing-pantry').checked,
      aliases,
    };
    state.custom.push(entry);
    Core.setCustom(state.custom);
    if (entry.pantry && !isPantry(name)) state.pantry.push(name);
    save();
    $('#ing-dialog').close();
    toast(`„${name}“ hinzugefügt`);
    renderSettings();
    renderList();
    if (ingOnSaved) ingOnSaved();
  });

  $('#custom-export').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'einkaufsliste', kind: 'eigene-zutaten', zutaten: state.custom }, null, 2);
    shareOrDownload(new Blob([data], { type: 'application/json' }), 'eigene-zutaten.json');
  });

  // ================= Einstellungen =================
  function renderSettings() {
    $('#app-version').textContent = APP_VERSION;
    $('#set-quick').checked = !!state.settings.quick;
    $('#dict-count').textContent = Core.dictionary().length;
    const sorted = state.pantry.slice().sort((a, b) => a.localeCompare(b, 'de'));
    $('#pantry-chips').replaceChildren(...sorted.map((p) => el('span', { className: 'chip' },
      p,
      el('button', {
        type: 'button', textContent: '×', ariaLabel: `${p} entfernen`,
        onclick: () => { state.pantry = state.pantry.filter((x) => x !== p); save(); renderSettings(); },
      }))));
    $('#custom-block').hidden = state.custom.length === 0;
    $('#custom-count').textContent = state.custom.length;
    $('#custom-list').replaceChildren(...state.custom.map((c, i) => el('li', null,
      el('span', null, c.name, ' ', el('small', null, c.unit ? `(${c.unit})` : '(Stück)')),
      el('button', {
        type: 'button', textContent: 'Löschen',
        onclick: () => {
          if (!confirm(`„${c.name}“ löschen?`)) return;
          state.custom.splice(i, 1);
          Core.setCustom(state.custom);
          save();
          renderSettings();
          renderList();
        },
      }))));
  }

  $('#set-quick').addEventListener('change', (ev) => { state.settings.quick = ev.target.checked; save(); });
  $('#open-create').addEventListener('click', () => showView('view-create'));

  $('#pantry-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $('#pantry-input');
    const name = input.value.trim();
    if (!name) return;
    if (!isPantry(name)) state.pantry.push(Core.canonicalName(name));
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
      Core.setCustom(state.custom);
      save();
      renderDraft();
      renderSettings();
      renderList();
      toast('Backup eingespielt');
    } catch (e) {
      toast('Das ist keine gültige Backup-Datei');
    }
  });

  $('#reset-all').addEventListener('click', () => {
    if (!confirm('Wirklich ALLE Daten löschen (Liste, Vorrat, eigene Zutaten, Entwurf)?')) return;
    state = defaultState();
    Core.setCustom(state.custom);
    save();
    renderDraft();
    renderSettings();
    renderList();
    toast('Alles gelöscht');
  });

  // ================= Start =================
  renderDraft();
  renderList();
  save(); // migrierte Daten sofort im neuen Format ablegen

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
