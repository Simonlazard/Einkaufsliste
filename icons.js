/*
 * Symbole (Emojis) für die Einkaufsliste.
 * Die Zuordnung läuft über Stichwörter im Zutatennamen, deshalb brauchen neue Zutaten
 * keinen Eintrag; was nicht passt, bekommt das Korb-Symbol.
 * Reihenfolge zählt: die ersten Treffer gewinnen (spezielles vor allgemeinem).
 */
(function (root) {
  'use strict';
  const RULES = [
    [/\bei(er|gelb|weiß|weiss)?\b/, '🥚'],
    [/butterschmalz|margarine|\bbutter\b/, '🧈'],
    [/hafer.*milch|soja.*milch|mandel.*milch|milch|buttermilch|kefir/, '🥛'],
    [/sahne|schmand|creme fra[iî]che|schlagobers|rahm/, '🥛'],
    [/joghurt|quark|skyr/, '🥣'],
    [/k[äa]se|emmentaler|gouda|parmesan|mozzarella|feta|gruy|cheddar|mascarpone|ricotta|halloumi|camembert|pecorino|raclette/, '🧀'],
    [/speck|schinken|salami|wurst|bacon|w[üu]rstchen|hack|fleisch|schnitzel|bratwurst/, '🥓'],
    [/h[äa]hnchen|huhn|pute|gefl[üu]gel/, '🍗'],
    [/lachs|thunfisch|fisch|garnele|forelle|kabeljau|sardine|hering|shrimp/, '🐟'],
    [/tomate|passata|ketchup/, '🍅'],
    [/kartoffel|süßkartoffel|suesskartoffel/, '🥔'],
    [/zwiebel|schalotte|fr[üu]hlingszwiebel/, '🧅'],
    [/knoblauch/, '🧄'],
    [/basilikum|petersilie|schnittlauch|dill|koriander|minze|salbei|kräuter|kraeuter/, '🌿'],
    [/lauch|porree/, '🥬'],
    [/salat|spinat|mangold|kohl|wirsing|rucola|p[ak]ak/, '🥬'],
    [/brokkoli|broccoli/, '🥦'],
    [/karotte|m[öo]hre|rübe|ruebe|sellerie|pastinake/, '🥕'],
    [/paprika|peperoni|chili/, '🫑'],
    [/gurke|zucchini/, '🥒'],
    [/aubergine/, '🍆'],
    [/mais/, '🌽'],
    [/pilz|champignon|pfifferling|steinpilz/, '🍄'],
    [/erbse|bohne|linse|kichererbse/, '🫘'],
    [/apfel/, '🍎'],
    [/birne/, '🍐'],
    [/banane/, '🍌'],
    [/zitrone|limette/, '🍋'],
    [/orange|mandarine|clementine/, '🍊'],
    [/erdbeere|himbeere|heidelbeere|blaubeere|kirsche|beere|traube/, '🍓'],
    [/avocado/, '🥑'],
    [/n[üu]ss|mandel|walnuss|haselnuss|erdnuss|cashew|pistazie|pinienkern|kokos/, '🥜'],
    [/mehl|stärke|staerke|gries|grieß|backpulver|hefe|natron/, '🌾'],
    [/nudel|pasta|spaghetti|penne|tagliatelle|fusilli|lasagne/, '🍝'],
    [/reis/, '🍚'],
    [/brot|brötchen|broetchen|toast|baguette|semmel/, '🍞'],
    [/haferflocken|müsli|muesli|cornflakes/, '🥣'],
    [/zucker|honig|sirup|vanille|schokolade|kakao|marmelade/, '🍯'],
    [/salz/, '🧂'],
    [/pfeffer|muskat|paprikapulver|oregano|zimt|curry|kümmel|kuemmel|thymian|rosmarin|majoran|gew[üu]rz|kurkuma|ingwer|nelke/, '🌶️'],
    [/basilikum|petersilie|schnittlauch|dill|koriander|minze|salbei|kräuter|kraeuter/, '🌿'],
    [/öl\b|oel\b|olivenöl|olivenoel|essig/, '🫒'],
    [/wasser|brühe|bruehe|fond/, '💧'],
    [/wein|bier|sekt|rum|likör|likoer/, '🍷'],
    [/saft|limonade|cola/, '🧃'],
    [/kaffee|tee\b/, '☕'],
    [/tofu|tempeh/, '🥡'],
    [/senf|mayo|sauce|soße|sosse|pesto/, '🥫'],
    [/dose|konserve/, '🥫'],
  ];

  const cache = new Map();
  function forName(name) {
    const k = String(name || '').toLowerCase().trim();
    if (cache.has(k)) return cache.get(k);
    let icon = '🧺';
    for (const [re, emoji] of RULES) {
      if (re.test(k)) { icon = emoji; break; }
    }
    cache.set(k, icon);
    return icon;
  }

  /** Pastellfarbe für die Symbol-Blase, passend zum Namen (immer gleiche Farbe pro Zutat). */
  const TINTS = ['#fde3d3', '#e3f0d4', '#e6e0f5', '#fdf0c4', '#d9ecf5', '#fbdde6'];
  function tintFor(name) {
    let h = 0;
    const s = String(name || '').toLowerCase();
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return TINTS[h % TINTS.length];
  }

  root.Icons = { forName, tintFor };
})(window);
