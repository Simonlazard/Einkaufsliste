/*
 * Festes Zutaten-Wörterbuch.
 *
 * WICHTIG: Nur am ENDE erweitern. Niemals Einträge löschen, umsortieren oder einfügen!
 * Die Position in dieser Liste (0, 1, 2, …) ist die Nummer, die in den QR-Codes steht.
 * Würde sich eine Position ändern, wären alle bereits gelaserten Karten falsch.
 *
 * Eintrag: [Name, Einheit auf der Liste, Flags, Weitere Schreibweisen]
 *   Einheit: '' = Stück, sonst g, ml, TL (Löffel), Stange, Prise, Msp, Bund, …
 *   Flags:   'v' = "Hab ich immer da" (Startbelegung), 'f' = Flüssigkeit (1 g = 1 ml)
 */
window.ZUTATEN = [
  /*  0 */ ['Eier', '', '', ['Ei', 'Eigelb']],
  /*  1 */ ['Lauch', 'Stange', '', ['Porree', 'Lauchstange']],
  /*  2 */ ['Sahne', 'g', 'f', ['Schlagsahne']],
  /*  3 */ ['Emmentaler', 'g', '', ['Emmentaler-Käse', 'Emmentaler Käse']],
  /*  4 */ ['Bauchspeck', 'g', '', ['Speck', 'Frühstücksspeck']],
  /*  5 */ ['Butter', 'g', '', []],
  /*  6 */ ['Salz', 'TL', 'v', []],
  /*  7 */ ['Pfeffer', 'Prise', 'v', ['Schwarzer Pfeffer']],
  /*  8 */ ['Muskatnuss', 'Msp', 'v', ['Muskat']],
  /*  9 */ ['Milch', 'ml', 'f', ['Vollmilch']],
  /* 10 */ ['Zucker', 'TL', 'v', []],
  /* 11 */ ['Speisestärke', 'TL', '', ['Stärke']],
  /* 12 */ ['Vanilleextrakt', 'TL', '', ['Vanille-Extrakt']],
  /* 13 */ ['Hefe', 'g', '', ['Frischhefe']],
  /* 14 */ ['Wasser', 'ml', 'fv', []],
  /* 15 */ ['Mehl', 'g', '', ['Weizenmehl']],
];
