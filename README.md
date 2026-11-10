# ⚔️ NoMercy Hub

**Open-Source-Event-Finder für die HugoSMP-Community – entwickelt von NoMercy (NMRCY).**

> 🚧 **MVP / private Testversion.** Unabhängiges Fanprojekt, nicht offiziell von HugoSMP betrieben oder unterstützt. Kein Minecraft-Login erforderlich und niemals Minecraft-Passwörter eingeben.

## Warum gibt es den Hub?

Auf HugoSMP werden FFAs und Baseraids häufig nur im Chat mit `/tpa` angekündigt. Solche Nachrichten verschwinden schnell. NoMercy Hub bietet einen gemeinsamen Ort, um Community-Events zu entdecken und zu organisieren.

## Funktionen

- ⚔️ **Event-Finder** – FFA, Baseraid, Turnier, Lootdrop, Bauevent und Community.
- 📅 **Event erstellen** – Titel, Beschreibung, Dimension, Zeitpunkt, Spielerlimit und TPA-Ziel.
- 👥 **Interessensbekundungen** – anmelden oder abmelden; die Zahl bedeutet **nicht**, dass Spieler ingame anwesend sind.
- 📋 **TPA-Befehl kopieren** – keine automatische Teleportation.
- 🛡️ **Meldeprozess** – Fake-Events und verdächtige TPA-/Bett-Traps mit Details melden; Moderation entscheidet manuell.
- 🧑 **Hub-Profile** – freiwillige Angaben und optionaler Skinabruf, **keine** Verifizierung der Minecraft-Identität.
- 🎨 **Mobile Oberfläche** – Kategorie-Kacheln, Lade-Skeletons, dezente Animationen, Live-Eventvorschau.
- 🌱 **Keine künstlichen aktiven Events** – die Datenbank beginnt leer.

## Schnellstart am PC

**Voraussetzung:** Node.js **22.13.0 oder neuer** (mit `node:sqlite`).

```bash
# Im Projektordner
npm start
```

Im Browser öffnen: **http://localhost:3030**.

Unter Windows geht alternativ `start-windows.bat`. Beim ersten Start erzeugt die Anwendung ihre **eigene** SQLite-Datenbank unter `data/hub.sqlite`. Es werden **keine** externen Datenbanken oder Supabase-Dienste benutzt.

### Lokal mit Zugriffsschutz testen

```bash
# PowerShell (Beispielwerte selbst ersetzen)
$env:TEST_ACCESS_USER = 'nomercy'
$env:TEST_ACCESS_PASSWORD = 'EIN_EIGENES_LANGES_TESTPASSWORT'
npm start
```

Zum Schutz einer online gehosteten Instanz müssen `NODE_ENV=production`, `TEST_ACCESS_PASSWORD` (mindestens 16 Zeichen), `HOST=0.0.0.0` und ein eigener dauerhafter `DATA_DIR` gesetzt sein. **Keine echten Secrets in GitHub oder Screenshots speichern.**

### Tests

```bash
npm test
```

Die Tests verwenden temporäre SQLite-Datenbanken und ändern keine bestehenden Daten.

## Verzeichnisstruktur

```text
public/                 HTML, CSS und Frontend-JavaScript
server.js               HTTP-API, Accounts, Events, SQLite
start-windows.bat       Windows-Schnellstart
Dockerfile              Eigenständiger Containerbetrieb
data/.gitkeep           Platzhalter; Datenbank bleibt lokal
.github/workflows/       Automatischer Test bei Pull Requests
tests/                  Integrationstests
LICENSE                 MIT-Lizenz
CONTRIBUTING.md         Beitragshinweise
SECURITY.md             Sicherheitshinweise
```

## Hosting / Railway

Das Repository kann als **eigenständiger Node.js-Service** auf Railway veröffentlicht werden, sobald ein eigenes GitHub-Repository angelegt ist.

- **Neues Railway-Projekt oder eigener Service**; nicht in fremde Apps deployen.
- `NODE_ENV=production`, `TEST_ACCESS_USER`, `TEST_ACCESS_PASSWORD`, `COOKIE_SECURE=1` setzen.
- **Eigene Railway Volume** an `/data` mounten und `DATA_DIR=/data` setzen.
- Startbefehl: `npm start`. Der HTTP-Port kommt automatisch von Railway über `PORT`.
- Für Healthchecks steht `/healthz` zur Verfügung (liefert keine privaten Daten).

**Hinweis:** Die bestehende Online-Handy-Vorschau wurde zunächst als separate Railway Function erstellt. Dieses Repository enthält den umfangreicheren **V0.3-Quellcode**; erst ein bewusstes Deployment verbindet die Online-Seite mit diesem GitHub-Repository.

## Sicherheit und Grenzen

Minecraft-Identitäten und Teleportziele sind nicht geprüft. Events können PvP, Itemverlust oder Fallen beinhalten. Reports führen nicht zu automatischen Sperren. Vor öffentlichem Launch sind zusätzliche Abuse-Tests, Identitätsprüfung, Backup-/Datenschutzkonzept, Rechte- und Moderationsprüfung notwendig. Die öffentliche Testadresse allein ersetzt keine Sicherheitsprüfung.

## Open Source

Dieses Projekt steht unter der **[MIT-Lizenz](LICENSE)**. Beiträge sind willkommen: siehe [CONTRIBUTING.md](CONTRIBUTING.md). Vertrauliche Sicherheitsprobleme bitte gemäß [SECURITY.md](SECURITY.md) melden.

**NoMercy Hub** ist ein inoffizielles Community-Projekt. Minecraft und HugoSMP gehören den jeweiligen Rechteinhabern.
