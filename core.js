/*
 * Kernlogik der Einkaufsliste (ohne Oberfläche):
 * Einheiten, Zeilen-Parser, Zutaten-Wörterbuch, QR-Format (binär) und Zusammenrechnen der Liste.
 */
(function (root) {
  'use strict';

  // ---------- Einheiten ----------
  // [kanonisch, Familie, Faktor zur Basiseinheit, Aliase, Plural, zählbar (beim Einkauf aufrunden)]
  // Basiseinheiten: mass = g, vol = ml, spoon = TL (1 EL = 3 TL)
  const UNIT_DEFS = [
    ['g', 'mass', 1, ['g', 'gr', 'gramm'], null, false],
    ['kg', 'mass', 1000, ['kg', 'kilo', 'kilogramm'], null, false],
    ['ml', 'vol', 1, ['ml', 'milliliter'], null, false],
    ['cl', 'vol', 10, ['cl', 'zentiliter'], null, false],
    ['dl', 'vol', 100, ['dl', 'deziliter'], null, false],
    ['l', 'vol', 1000, ['l', 'liter', 'ltr'], null, false],
    ['EL', 'spoon', 3, ['el', 'essl', 'esslöffel', 'eßlöffel'], null, false],
    ['TL', 'spoon', 1, ['tl', 'teel', 'teelöffel'], null, false],
    ['Prise', 'Prise', 1, ['prise', 'prisen'], 'Prisen', false],
    ['Msp', 'Msp', 1, ['msp', 'messerspitze', 'messerspitzen'], null, false],
    ['Stk', 'Stk', 1, ['stk', 'stück', 'st'], null, true],
    ['Stange', 'Stange', 1, ['stange', 'stangen'], 'Stangen', true],
    ['Bund', 'Bund', 1, ['bund', 'bd'], null, true],
    ['Dose', 'Dose', 1, ['dose', 'dosen'], 'Dosen', true],
    ['Pck', 'Pck', 1, ['pck', 'pkg', 'päckchen', 'packung', 'packungen', 'pack', 'pk'], null, true],
    ['Becher', 'Becher', 1, ['becher'], null, true],
    ['Zehe', 'Zehe', 1, ['zehe', 'zehen'], 'Zehen', true],
    ['Scheibe', 'Scheibe', 1, ['scheibe', 'scheiben'], 'Scheiben', false],
    ['Tasse', 'Tasse', 1, ['tasse', 'tassen'], 'Tassen', false],
    ['Glas', 'Glas', 1, ['glas', 'gläser'], 'Gläser', true],
    ['Handvoll', 'Handvoll', 1, ['handvoll'], null, false],
    ['Zweig', 'Zweig', 1, ['zweig', 'zweige'], 'Zweige', false],
    ['Blatt', 'Blatt', 1, ['blatt', 'blätter'], 'Blätter', false],
    ['Kopf', 'Kopf', 1, ['kopf', 'köpfe'], 'Köpfe', true],
    ['Knolle', 'Knolle', 1, ['knolle', 'knollen'], 'Knollen', true],
    ['Flasche', 'Flasche', 1, ['flasche', 'flaschen'], 'Flaschen', true],
    ['Beutel', 'Beutel', 1, ['beutel', 'tüte', 'tüten'], null, true],
    ['Würfel', 'Würfel', 1, ['würfel'], null, true],
    ['Spritzer', 'Spritzer', 1, ['spritzer'], null, false],
    ['Schuss', 'Schuss', 1, ['schuss'], null, false],
  ];

  /**
   * Feste Einheiten-Nummern für den QR-Code. NUR AM ENDE ERWEITERN (max. 32 Einträge)!
   * Nummer 0 = Stück (leere Einheit).
   */
  const UNIT_CODES = ['', 'g', 'kg', 'ml', 'l', 'cl', 'dl', 'EL', 'TL', 'Prise', 'Msp', 'Stange', 'Bund', 'Dose',
    'Pck', 'Becher', 'Zehe', 'Scheibe', 'Tasse', 'Glas', 'Handvoll', 'Zweig', 'Blatt', 'Kopf', 'Knolle',
    'Flasche', 'Beutel', 'Würfel', 'Spritzer', 'Schuss'];

  const UNIT_BY_ALIAS = {};
  UNIT_DEFS.forEach(([canon, family, factor, aliases, plural, countable]) => {
    const def = { canon, family, factor, plural: plural || canon, countable };
    aliases.forEach((a) => { UNIT_BY_ALIAS[a] = def; });
  });

  /** Liefert Infos zu einer Einheit. Leere Einheit = Stückzahl. Unbekannte Einheiten bleiben eigenständig. */
  function unitInfo(unit) {
    const u = String(unit || '').trim().replace(/\.$/, '');
    if (!u) return { canon: '', family: 'Stk', factor: 1, plural: '', countable: true };
    const def = UNIT_BY_ALIAS[u.toLowerCase()];
    if (def) return def;
    return { canon: u, family: 'x:' + u.toLowerCase(), factor: 1, plural: u, countable: false };
  }

  /** Einheit auf die kanonische Schreibweise bringen ("Stangen" → "Stange", "stück" → ""). */
  function canonicalUnit(unit) {
    const info = unitInfo(unit);
    return info.canon === 'Stk' ? '' : info.canon;
  }

  function unitCode(unit) { return UNIT_CODES.indexOf(canonicalUnit(unit)); }

  // ---------- Mengen ----------
  const UNICODE_FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  const num = (s) => parseFloat(String(s).replace(',', '.'));

  /** Liest eine Menge am Anfang eines Textes. Gibt {value, rest} zurück (value = null, wenn keine Menge). */
  function parseAmount(str) {
    const s = String(str || '').trim();
    let m;
    if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)(?![\d.,])/))) {            // 1 1/2
      return { value: +m[1] + +m[2] / +m[3], rest: s.slice(m[0].length) };
    }
    if ((m = s.match(/^(\d+)\s*\/\s*(\d+)(?![\d.,])/))) {                    // 1/2
      return { value: +m[1] / +m[2], rest: s.slice(m[0].length) };
    }
    if ((m = s.match(/^(\d+)?\s*([½¼¾⅓⅔⅛])/))) {                              // 1½ oder ½
      return { value: (m[1] ? +m[1] : 0) + UNICODE_FRAC[m[2]], rest: s.slice(m[0].length) };
    }
    if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)/))) {     // 2-3 → obere Grenze
      return { value: num(m[2]), rest: s.slice(m[0].length) };
    }
    if ((m = s.match(/^(\d+(?:[.,]\d+)?)/))) {                                // 200 oder 0,5
      return { value: num(m[1]), rest: s.slice(m[0].length) };
    }
    return { value: null, rest: s };
  }

  // Beschreibende Zusätze am Ende eines Zutatennamens, die in den Hinweis wandern
  const TRAILING_DESCRIPTORS = [
    'frisch gerieben', 'frisch gemahlen', 'frisch gehackt', 'fein gehackt', 'grob gehackt',
    'am stück', 'selbstgemacht', 'selbst gemacht', 'in scheiben', 'in würfeln',
    'nach belieben', 'nach geschmack', 'zum bestreuen', 'zum garnieren', 'zum braten',
    'gerieben', 'gemahlen', 'gehackt', 'gewürfelt', 'geschält', 'zimmerwarm',
    'weich', 'kalt', 'geschmolzen', 'tiefgekühlt', 'tk', 'frisch',
  ].sort((a, b) => b.length - a.length);

  /**
   * Zerlegt eine Rezeptzeile wie "2 Stangen Lauch (ungeputzt) - ca. 300 g"
   * in {name, amount, unit, note}. Gibt null für leere Zeilen zurück.
   */
  function parseLine(line) {
    let s = String(line || '')
      .replace(/^[\s▢☐□■●•·*✓✔☑-]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return null;

    const parenNotes = [];
    const descNotes = [];
    let dashNote = '';

    const dash = s.match(/\s+[-–—]\s+/);
    if (dash) {
      dashNote = s.slice(dash.index + dash[0].length).trim();
      s = s.slice(0, dash.index).trim();
    }
    s = s.replace(/\(([^)]*)\)/g, (_, inner) => {
      if (inner.trim()) parenNotes.push(inner.trim());
      return ' ';
    }).replace(/\s+/g, ' ').trim();

    const { value, rest } = parseAmount(s);
    let amount = value;
    let unit = '';
    s = rest.trim();

    if (amount !== null) {
      const um = s.match(/^([A-Za-zÄÖÜäöüß]+)\.?(?=\s|$)/);
      if (um && UNIT_BY_ALIAS[um[1].toLowerCase()] && s.length > um[0].length) {
        unit = canonicalUnit(um[1]);
        s = s.slice(um[0].length).trim();
      }
    } else {
      const em = s.match(/^(etwas|evtl\.?|ggf\.?|n\.\s?b\.?)\s+/i);
      if (em) {
        descNotes.push(em[1]);
        s = s.slice(em[0].length);
      }
    }

    const comma = s.indexOf(',');
    if (comma > 0) {
      descNotes.push(s.slice(comma + 1).trim());
      s = s.slice(0, comma).trim();
    }

    let changed = true;
    const trailing = [];
    while (changed) {
      changed = false;
      const lower = s.toLowerCase();
      for (const d of TRAILING_DESCRIPTORS) {
        if (lower.endsWith(' ' + d) && s.length > d.length + 2) {
          trailing.unshift(s.slice(s.length - d.length));
          s = s.slice(0, s.length - d.length - 1).trim();
          changed = true;
          break;
        }
      }
    }
    if (trailing.length) descNotes.unshift(trailing.join(' '));

    const name = s.replace(/[,;:]+$/, '').trim();
    if (!name) return null;
    if (amount !== null && !(amount > 0)) amount = null;

    const note = [...parenNotes, ...descNotes, dashNote].filter(Boolean).join('; ');
    return { name, amount, unit, note };
  }

  function parseRecipeText(text) {
    return String(text || '').split(/\r?\n/).map(parseLine).filter(Boolean);
  }

  // ---------- Normalisierung von Namen ----------
  const SYNONYMS = {
    'eier': 'ei',
    'äpfel': 'apfel',
    'nüsse': 'nuss',
    'karotte': 'möhre', 'karotten': 'möhre', 'mohrrübe': 'möhre', 'mohrrüben': 'möhre', 'möhren': 'möhre',
    'schlagsahne': 'sahne', 'süße sahne': 'sahne',
    'muskat': 'muskatnuss',
    'knoblauchzehe': 'knoblauch', 'knoblauchzehen': 'knoblauch',
    'lauchstange': 'lauch', 'lauchstangen': 'lauch', 'porree': 'lauch',
    'speck': 'bauchspeck', 'frühstücksspeck': 'bauchspeck',
    'pfeffer schwarz': 'pfeffer', 'schwarzer pfeffer': 'pfeffer',
    'speiseöl': 'öl', 'pflanzenöl': 'öl', 'sonnenblumenöl': 'öl', 'rapsöl': 'öl',
  };

  function stem(word) {
    let w = word;
    if (w.length > 4 && w.endsWith('n') && !w.endsWith('nn')) w = w.slice(0, -1);
    else if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
    return w;
  }

  /** Schlüssel zum Vergleichen von Zutaten: "Zwiebeln" == "Zwiebel", "Emmentaler-Käse" == "Emmentaler". */
  function normalizeKey(name) {
    let k = String(name || '').toLowerCase()
      .replace(/[-_/]+/g, ' ')
      .replace(/[^a-zäöüß0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (SYNONYMS[k]) k = SYNONYMS[k];
    k = k.replace(/^(.+) käse$/, '$1');
    if (SYNONYMS[k]) k = SYNONYMS[k];
    const words = k.split(' ');
    const last = words.pop();
    words.push(SYNONYMS[last] ? SYNONYMS[last] : stem(last));
    return words.join(' ');
  }

  // ---------- Zutaten-Wörterbuch ----------
  // Fest eingebaut: window.ZUTATEN (zutaten.js). Eigene Zutaten kommen aus der App (setCustom).
  let idxDirty = true;
  let shippedEntries = [];
  let shippedIndex = new Map();
  let customRaw = [];
  let customIndex = new Map();

  const entryFromArray = (a) => ({
    n: a[0], u: canonicalUnit(a[1]), liquid: /f/.test(a[2] || ''), pantry: /v/.test(a[2] || ''), aliases: a[3] || [],
  });
  const entryFromCustom = (c) => ({
    n: c.name, u: canonicalUnit(c.unit || ''), liquid: !!c.liquid, pantry: !!c.pantry,
    aliases: Array.isArray(c.aliases) ? c.aliases : [], custom: true,
  });

  function buildIndex() {
    shippedEntries = (root.ZUTATEN || []).map(entryFromArray);
    shippedIndex = new Map();
    shippedEntries.forEach((e, id) => {
      [e.n, ...e.aliases].forEach((a) => {
        const k = normalizeKey(a);
        if (k && !shippedIndex.has(k)) shippedIndex.set(k, id);
      });
    });
    customIndex = new Map();
    customRaw.map(entryFromCustom).forEach((e) => {
      [e.n, ...e.aliases].forEach((a) => {
        const k = normalizeKey(a);
        if (k && !customIndex.has(k)) customIndex.set(k, e);
      });
    });
    idxDirty = false;
  }

  function setCustom(list) {
    customRaw = Array.isArray(list) ? list : [];
    idxDirty = true;
  }

  function dictionary() {
    if (idxDirty) buildIndex();
    return shippedEntries;
  }

  /** Sucht eine Zutat. Ergebnis: {id, entry} (id = Nummer im festen Wörterbuch, null bei eigenen Zutaten) oder null. */
  function lookup(name) {
    if (idxDirty) buildIndex();
    const k = normalizeKey(name);
    if (!k) return null;
    if (shippedIndex.has(k)) {
      const id = shippedIndex.get(k);
      return { id, entry: shippedEntries[id] };
    }
    const c = customIndex.get(k);
    return c ? { id: null, entry: c } : null;
  }

  function canonicalName(name) {
    const hit = lookup(name);
    return hit ? hit.entry.n : String(name || '').trim();
  }

  /** Vergleichsschlüssel für die Vorratsliste (gleiche Zutat → gleicher Schlüssel). */
  function pantryKey(name) { return normalizeKey(canonicalName(name)); }

  // ---------- Zahlen formatieren ----------
  const NICE_FRACS = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

  function formatDecimal(x, maxDigits) {
    return x.toLocaleString('de-DE', { maximumFractionDigits: maxDigits === undefined ? 2 : maxDigits });
  }

  function niceNumber(x) {
    const whole = Math.floor(x + 1e-9);
    const frac = x - whole;
    if (frac < 0.02) return String(whole);
    if (frac > 0.98) return String(whole + 1);
    for (const [v, sym] of NICE_FRACS) {
      if (Math.abs(frac - v) < 0.03) return (whole ? whole : '') + sym;
    }
    return formatDecimal(x, 2);
  }

  /**
   * Formatiert Menge + Einheit. amountBase ist in der Basiseinheit der Familie (g, ml bzw. TL).
   * shopping = true: zählbare Dinge werden aufgerundet (½ Zwiebel → 1 Zwiebel).
   */
  function formatQuantity(amountBase, info, shopping) {
    if (amountBase === null || amountBase === undefined || !(amountBase > 0)) return '';
    if (info.family === 'mass') {
      return amountBase >= 1000 ? formatDecimal(amountBase / 1000, 2) + ' kg' : formatDecimal(Math.round(amountBase), 0) + ' g';
    }
    if (info.family === 'vol') {
      return amountBase >= 1000 ? formatDecimal(amountBase / 1000, 2) + ' l' : formatDecimal(Math.round(amountBase), 0) + ' ml';
    }
    if (info.family === 'spoon') {
      return amountBase >= 3 - 1e-9 ? niceNumber(amountBase / 3) + ' EL' : niceNumber(amountBase) + ' TL';
    }
    let value = amountBase;
    if (shopping && info.countable) value = Math.ceil(value - 1e-9);
    const text = niceNumber(value);
    const unitLabel = info.canon === '' || info.canon === 'Stk' ? '' : (value > 1 ? info.plural : info.canon);
    return unitLabel ? text + ' ' + unitLabel : text;
  }

  /** Menge einer einzelnen Zutat formatieren (z. B. für die Vorschau). */
  function formatIngredientAmount(ing, factor, shopping) {
    if (ing.amount === null || ing.amount === undefined) return '';
    const info = unitInfo(ing.unit);
    return formatQuantity(ing.amount * info.factor * (factor || 1), info, shopping);
  }

  // ---------- QR-Format ----------
  /*
   * Version 2 (binär, kompakt):
   *   Byte 0      0xB1 (Kennung)
   *   Byte 1      Anzahl Zutaten
   *   Byte 2      Länge des Titels in Bytes
   *   Titel       UTF-8
   *   je Zutat:   Zutaten-Nummer + 1 als Varint (Wörterbuch)   ODER   0, Länge, Name in UTF-8 (Text-Rückfall)
   *               1 Byte: Bits 5-7 Nenner-Code, Bits 0-4 Einheiten-Nummer
   *               Varint: Zähler (Menge = Zähler / Nenner; 0 = keine Menge)
   * Version 1 (JSON) wird beim Einlesen weiter unterstützt.
   */
  const MAGIC = 0xB1;
  const DENOMS = [1, 2, 4, 3, 8, 10, 100, 12];

  function writeVarint(out, n) {
    while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); }
    out.push(n);
  }

  function pickFraction(amount) {
    for (let i = 0; i < DENOMS.length; i++) {
      const n = amount * DENOMS[i];
      const r = Math.round(n);
      if (r >= 1 && Math.abs(n - r) < 1e-6) return { n: r, d: i };
    }
    return { n: Math.max(1, Math.round(amount * 100)), d: DENOMS.indexOf(100) };
  }

  /** Rezept → Bytes für den QR-Code. recipe = {name, ingredients:[{name, amount, unit}]} */
  function encodeBinary(recipe) {
    if (idxDirty) buildIndex();
    const te = new TextEncoder();
    const title = te.encode(String(recipe.name || '').trim());
    if (!title.length) throw new Error('Der Rezeptname fehlt.');
    if (title.length > 255) throw new Error('Der Rezeptname ist zu lang.');
    if (!recipe.ingredients.length || recipe.ingredients.length > 255) throw new Error('Ungültige Zutatenzahl.');
    const out = [MAGIC, recipe.ingredients.length, title.length, ...title];
    let dictCount = 0;
    const textNames = [];
    recipe.ingredients.forEach((ing) => {
      const hit = lookup(ing.name);
      if (hit && hit.id !== null) {
        writeVarint(out, hit.id + 1);
        dictCount++;
      } else {
        const nm = String(hit ? hit.entry.n : ing.name).trim();
        const bytes = te.encode(nm);
        if (!bytes.length || bytes.length > 255) throw new Error(`Zutatenname „${nm}“ ist ungültig.`);
        out.push(0, bytes.length, ...bytes);
        textNames.push(nm);
      }
      const uc = unitCode(ing.unit);
      if (uc < 0) throw new Error(`Die Einheit „${ing.unit}“ wird nicht unterstützt.`);
      const has = ing.amount !== null && ing.amount !== undefined && ing.amount > 0;
      const frac = has ? pickFraction(ing.amount) : { n: 0, d: 0 };
      out.push((frac.d << 5) | uc);
      writeVarint(out, frac.n);
    });
    return { bytes: Uint8Array.from(out), dictCount, textNames };
  }

  /** Bytes → {recipe} oder {error}. Fehler: 'not-recipe', 'unknown-ingredient'. */
  function decodeBinary(bytes) {
    if (idxDirty) buildIndex();
    const bad = { error: 'not-recipe' };
    if (!bytes || bytes[0] !== MAGIC || bytes.length < 4) return bad;
    bytes = Uint8Array.from(bytes); // jsQR liefert ein normales Array
    let p = 1;
    const readByte = () => (p < bytes.length ? bytes[p++] : -1);
    const readVarint = () => {
      let v = 0, mul = 1;
      for (let i = 0; i < 5; i++) {
        const b = readByte();
        if (b < 0) return -1;
        v += (b & 127) * mul;
        if (b < 128) return v;
        mul *= 128;
      }
      return -1;
    };
    const readText = (len) => {
      if (p + len > bytes.length) return null;
      const s = new TextDecoder('utf-8').decode(bytes.slice(p, p + len));
      p += len;
      return s;
    };
    const count = readByte();
    const titleLen = readByte();
    if (count < 1 || titleLen < 1) return bad;
    const name = readText(titleLen);
    if (name === null) return bad;
    const ingredients = [];
    for (let i = 0; i < count; i++) {
      const idPlus = readVarint();
      if (idPlus < 0) return bad;
      let ingName;
      if (idPlus === 0) {
        const len = readByte();
        if (len < 1) return bad;
        ingName = readText(len);
        if (ingName === null) return bad;
      } else {
        if (idPlus - 1 >= shippedEntries.length) return { error: 'unknown-ingredient', id: idPlus - 1 };
        ingName = shippedEntries[idPlus - 1].n;
      }
      const ub = readByte();
      const n = readVarint();
      if (ub < 0 || n < 0) return bad;
      const unit = UNIT_CODES[ub & 31];
      if (unit === undefined) return bad;
      ingredients.push({ name: ingName, amount: n > 0 ? n / DENOMS[ub >> 5] : null, unit });
    }
    return { recipe: { name: name.trim() || 'Rezept', ingredients } };
  }

  /** Version 1 (JSON), nur zum Einlesen alter Test-Codes. */
  function decodeRecipe(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || o.v !== 1 || typeof o.n !== 'string' || !Array.isArray(o.z)) return null;
    const ingredients = o.z.map((a) => {
      if (!Array.isArray(a) || typeof a[0] !== 'string' || !a[0].trim()) return null;
      return {
        name: a[0].trim(),
        amount: typeof a[1] === 'number' && a[1] > 0 ? a[1] : null,
        unit: typeof a[2] === 'string' ? canonicalUnit(a[2]) : '',
      };
    }).filter(Boolean);
    if (!ingredients.length) return null;
    return { name: o.n.trim() || 'Rezept', ingredients };
  }

  /** Gescannte Bytes auswerten (neues Binärformat oder alter JSON-Code). */
  function decodeScan(bytes) {
    if (bytes && bytes[0] === MAGIC) return decodeBinary(bytes);
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes || []));
      const r = decodeRecipe(text);
      if (r) return { recipe: r };
    } catch (e) { /* kein Text */ }
    return { error: 'not-recipe' };
  }

  // ---------- Liste zusammenrechnen ----------
  /**
   * sources: [{label, factor, ingredients, manualId?}]
   * Gleiche Zutat (laut Wörterbuch) mit gleicher Einheitenfamilie wird addiert.
   * Flüssigkeiten: 1 g = 1 ml. Löffel: 1 EL = 3 TL.
   */
  function aggregate(sources) {
    if (idxDirty) buildIndex();
    const rows = new Map();
    sources.forEach((src) => {
      src.ingredients.forEach((ing) => {
        const hit = lookup(ing.name);
        const name = hit ? hit.entry.n : String(ing.name).trim();
        const nameKey = normalizeKey(name);
        if (!nameKey) return;
        const hasAmount = ing.amount !== null && ing.amount !== undefined && ing.amount > 0;
        let info = unitInfo(ing.unit);
        const base = hasAmount ? ing.amount * info.factor * (src.factor || 1) : 0;
        if (hasAmount && hit && hit.entry.liquid) {
          const target = unitInfo(hit.entry.u);
          const flip = (info.family === 'mass' && target.family === 'vol') || (info.family === 'vol' && target.family === 'mass');
          if (flip) info = target;
        }
        const family = hasAmount ? info.family : 'none';
        const key = nameKey + '|' + family;
        let row = rows.get(key);
        if (!row) {
          row = { key, nameKey, name, family, info, amountBase: 0, notes: [], sources: [], manualIds: [] };
          rows.set(key, row);
        }
        if (hasAmount) row.amountBase += base;
        if (ing.note && !row.notes.includes(ing.note)) row.notes.push(ing.note);
        if (src.label && !row.sources.includes(src.label)) row.sources.push(src.label);
        if (src.manualId) row.manualIds.push(src.manualId);
      });
    });
    return Array.from(rows.values()).map((row) => {
      row.amountText = row.family === 'none' ? '' : formatQuantity(row.amountBase, row.info, true);
      return row;
    }).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  const Core = {
    unitInfo, canonicalUnit, unitCode, parseAmount, parseLine, parseRecipeText,
    normalizeKey, lookup, canonicalName, pantryKey, setCustom, dictionary,
    formatQuantity, formatIngredientAmount, niceNumber,
    encodeBinary, decodeBinary, decodeRecipe, decodeScan, aggregate,
    UNIT_NAMES: UNIT_CODES.filter(Boolean),
  };
  root.Core = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof window !== 'undefined' ? window : globalThis);
