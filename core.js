/*
 * Kernlogik der Einkaufsliste (ohne Oberfläche):
 * Einheiten, Zeilen-Parser, Normalisierung von Zutatennamen,
 * QR-Format (kodieren/dekodieren) und das Zusammenrechnen der Liste.
 */
(function (root) {
  'use strict';

  // ---------- Einheiten ----------
  // [kanonisch, Familie, Faktor zur Basiseinheit, Aliase, Plural, zählbar (beim Einkauf aufrunden)]
  const UNIT_DEFS = [
    ['g', 'mass', 1, ['g', 'gr', 'gramm'], null, false],
    ['kg', 'mass', 1000, ['kg', 'kilo', 'kilogramm'], null, false],
    ['ml', 'vol', 1, ['ml', 'milliliter'], null, false],
    ['cl', 'vol', 10, ['cl', 'zentiliter'], null, false],
    ['dl', 'vol', 100, ['dl', 'deziliter'], null, false],
    ['l', 'vol', 1000, ['l', 'liter', 'ltr'], null, false],
    ['EL', 'EL', 1, ['el', 'essl', 'esslöffel', 'eßlöffel'], null, false],
    ['TL', 'TL', 1, ['tl', 'teel', 'teelöffel'], null, false],
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

  const UNIT_BY_ALIAS = {};
  const UNIT_BY_CANON = {};
  UNIT_DEFS.forEach(([canon, family, factor, aliases, plural, countable]) => {
    const def = { canon, family, factor, plural: plural || canon, countable };
    UNIT_BY_CANON[canon] = def;
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

    // Hinweis nach " - " / " – "
    const dash = s.match(/\s+[-–—]\s+/);
    if (dash) {
      dashNote = s.slice(dash.index + dash[0].length).trim();
      s = s.slice(0, dash.index).trim();
    }
    // Klammern → Hinweis
    s = s.replace(/\(([^)]*)\)/g, (_, inner) => {
      if (inner.trim()) parenNotes.push(inner.trim());
      return ' ';
    }).replace(/\s+/g, ' ').trim();

    // Menge
    const { value, rest } = parseAmount(s);
    let amount = value;
    let unit = '';
    s = rest.trim();

    // Einheit (nur direkt nach einer Menge)
    if (amount !== null) {
      const um = s.match(/^([A-Za-zÄÖÜäöüß]+)\.?(?=\s|$)/);
      if (um && UNIT_BY_ALIAS[um[1].toLowerCase()] && s.length > um[0].length) {
        unit = canonicalUnit(um[1]);
        s = s.slice(um[0].length).trim();
      }
    } else {
      // "etwas Butter" → Name Butter, Hinweis "etwas"
      const em = s.match(/^(etwas|evtl\.?|ggf\.?|n\.\s?b\.?)\s+/i);
      if (em) {
        descNotes.push(em[1]);
        s = s.slice(em[0].length);
      }
    }

    // Komma → Rest ist Hinweis
    const comma = s.indexOf(',');
    if (comma > 0) {
      descNotes.push(s.slice(comma + 1).trim());
      s = s.slice(0, comma).trim();
    }

    // Beschreibende Zusätze am Ende abtrennen
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
  // Ganze Namen (nach Kleinschreibung), die gleich behandelt werden
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
    // "Emmentaler Käse" → "emmentaler"
    k = k.replace(/^(.+) käse$/, '$1');
    if (SYNONYMS[k]) k = SYNONYMS[k];
    const words = k.split(' ');
    const last = words.pop();
    words.push(SYNONYMS[last] ? SYNONYMS[last] : stem(last));
    return words.join(' ');
  }

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
   * Formatiert Menge + Einheit.
   * amountBase ist in der Basiseinheit der Familie (g bzw. ml) bzw. in der Einheit selbst.
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
  // {"v":1,"n":"Name","p":4,"z":[["Zutat",Menge|null,"Einheit","Hinweis"], ...]}
  const FORMAT_VERSION = 1;

  function encodeRecipe(recipe) {
    const z = recipe.ingredients.map((ing) => {
      const amount = ing.amount !== null && ing.amount !== undefined && ing.amount > 0
        ? Math.round(ing.amount * 1000) / 1000 : null;
      const arr = [ing.name.trim(), amount, canonicalUnit(ing.unit), (ing.note || '').trim()];
      while (arr.length > 1 && (arr[arr.length - 1] === '' || arr[arr.length - 1] === null)) arr.pop();
      return arr;
    });
    const o = { v: FORMAT_VERSION, n: recipe.name.trim() };
    if (recipe.portions > 0) o.p = recipe.portions;
    o.z = z;
    return JSON.stringify(o);
  }

  /** Liest den QR-Inhalt. Gibt null zurück, wenn es kein Rezept dieser App ist. */
  function decodeRecipe(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || o.v !== FORMAT_VERSION || typeof o.n !== 'string' || !Array.isArray(o.z)) return null;
    const ingredients = o.z.map((a) => {
      if (!Array.isArray(a) || typeof a[0] !== 'string' || !a[0].trim()) return null;
      return {
        name: a[0].trim(),
        amount: typeof a[1] === 'number' && a[1] > 0 ? a[1] : null,
        unit: typeof a[2] === 'string' ? canonicalUnit(a[2]) : '',
        note: typeof a[3] === 'string' ? a[3].trim() : '',
      };
    }).filter(Boolean);
    if (!ingredients.length) return null;
    return {
      name: o.n.trim() || 'Rezept',
      portions: typeof o.p === 'number' && o.p > 0 ? o.p : null,
      ingredients,
    };
  }

  // ---------- Liste zusammenrechnen ----------
  /**
   * sources: [{label, factor, ingredients, manualId?}]
   * Ergebnis: Zeilen mit gleicher Zutat und gleicher Einheitenfamilie werden addiert.
   */
  function aggregate(sources) {
    const rows = new Map();
    sources.forEach((src) => {
      src.ingredients.forEach((ing) => {
        const nameKey = normalizeKey(ing.name);
        if (!nameKey) return;
        const info = unitInfo(ing.unit);
        const hasAmount = ing.amount !== null && ing.amount !== undefined && ing.amount > 0;
        const family = hasAmount ? info.family : 'none';
        const key = nameKey + '|' + family;
        let row = rows.get(key);
        if (!row) {
          row = { key, nameKey, name: ing.name, family, info, amountBase: 0, notes: [], sources: [], manualIds: [] };
          rows.set(key, row);
        }
        if (hasAmount) row.amountBase += ing.amount * info.factor * (src.factor || 1);
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
    unitInfo, canonicalUnit, parseAmount, parseLine, parseRecipeText,
    normalizeKey, formatQuantity, formatIngredientAmount, niceNumber,
    encodeRecipe, decodeRecipe, aggregate,
    UNIT_NAMES: UNIT_DEFS.map((d) => d[0]),
    FORMAT_VERSION,
  };
  root.Core = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof window !== 'undefined' ? window : globalThis);
