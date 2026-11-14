# Einkaufsliste

Web-App (PWA) fürs iPhone: Rezept-QR-Codes scannen, Zutaten landen auf der Einkaufsliste und werden addiert.

## Dateien
| Datei | Zweck |
|---|---|
| `index.html` | Seitengerüst |
| `style.css` | Aussehen (hell/dunkel) |
| `zutaten.js` | **Festes Zutaten-Wörterbuch** (Position = Nummer im QR-Code, nur am Ende erweitern!) |
| `icons.js` | Symbole (Emojis) pro Zutat, per Stichwort im Namen; ändert nichts am QR-Format |
| `ocr.js` | Foto-Texterkennung: Kamera mit Rahmen, liest nur den Rahmen (Tesseract, Deutsch, offline) |
| `lib/tesseract/` | Erkennungsdateien (ca. 9,6 MB). Werden beim ersten Foto auf dem iPhone zwischengespeichert |
| `core.js` | Logik: Zeilen erkennen, Einheiten, Addieren, QR-Format |
| `app.js` | Oberfläche, Scanner, QR-Erstellung, SVG-Export, Speicherung |
| `sw.js` | Offline-Cache |
| `manifest.webmanifest`, `icons/` | Installation auf dem Home-Bildschirm |
| `lib/` | QR-Bibliotheken (jsQR 1.4.0, qrcode-generator 1.4.4) |

## Update veröffentlichen
1. Version in `sw.js` (`VERSION`) **und** `app.js` (`APP_VERSION`) erhöhen.
2. Geänderte und neue Dateien bei GitHub hochladen (Add file → Upload files).
3. App auf dem iPhone zweimal schließen/öffnen.

## Zutaten-Wörterbuch (`zutaten.js`)
- Jeder Eintrag: `[Name, Einheit, Flags, Synonyme]`. Flags: `v` = Hab ich immer da, `f` = Flüssigkeit (1 g = 1 ml).
- **Niemals** Einträge löschen, umsortieren oder mittendrin einfügen. Die Listenposition steckt in den gelaserten Karten.
- Neue Zutaten: am Ende anhängen, Version erhöhen, hochladen.
- Eigene Zutaten aus der App („Neue Zutat hinzufügen“) stehen in QR-Codes als Text. Über „Eigene Zutaten exportieren“ lassen sie sich später hier übernehmen.

## QR-Format (Version 2, binär)
```
B1 | Anzahl Zutaten | Titellänge | Titel (UTF-8)
je Zutat: Zutaten-Nr+1 (Varint)  ODER  0, Länge, Name (UTF-8)
          1 Byte  = Nenner-Code (Bits 5-7) + Einheiten-Nr (Bits 0-4)
          Varint  = Zähler (Menge = Zähler / Nenner, 0 = keine Menge)
```
Keine Hinweise, keine Portionen: Der Rezeptname enthält die Mengenangabe („Dampfnudeln 8 Stück“), beim Scannen wird ein Faktor (½×–4×) gewählt.
Alte JSON-Codes (Version 1) werden weiter gelesen.

## Laser
- Karte schwarz, Module hell (graviert), der schwarze Grund bleibt stehen. Der Scanner liest „hell auf dunkel“ zuerst.
- Einstellungen → QR-Code erstellen → „SVG für den Laser“ (nur die Module, Größe in mm) oder „Testkarte“ (6 Modulgrößen, 85 × 55 mm).
