# Einkaufsliste

Web-App (PWA) fürs iPhone: Rezept-QR-Codes scannen, Zutaten landen auf der Einkaufsliste und werden addiert.

## Dateien
| Datei | Zweck |
|---|---|
| `index.html` | Seitengerüst |
| `style.css` | Aussehen (hell/dunkel) |
| `core.js` | Logik: Zeilen erkennen, Einheiten, Addieren, QR-Format |
| `app.js` | Oberfläche, Scanner, QR-Erstellung, Speicherung |
| `sw.js` | Offline-Cache |
| `manifest.webmanifest`, `icons/` | Installation auf dem Home-Bildschirm |
| `lib/` | QR-Bibliotheken (jsQR 1.4.0, qrcode-generator 1.4.4) |

## Update veröffentlichen
1. Version in `sw.js` (`VERSION`) **und** `app.js` (`APP_VERSION`) erhöhen, z. B. `1.0.0` → `1.0.1`.
2. Geänderte Dateien bei GitHub hochladen (Add file → Upload files).
3. App auf dem iPhone zweimal schließen/öffnen; danach läuft die neue Version.

## QR-Format (Version 1)
```json
{"v":1,"n":"Quiche Lorraine","p":4,"z":[["Eier",4,"","Größe M"],["Sahne",200,"g"]]}
```
`z` = Zutaten als `[Name, Menge|null, Einheit, Hinweis]`; leere Einheit = Stück.
