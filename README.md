# ⚔️ NoMercy Hub

**Open-Source-Event-Finder für die HugoSMP-Community – entwickelt von NoMercy (NMRCY).**

> 🚧 **Öffentlich lesbarer MVP / Testbetrieb.** Unabhängiges Fanprojekt, nicht offiziell von HugoSMP betrieben oder unterstützt. Kein Minecraft-Login erforderlich und niemals Minecraft-Passwörter eingeben.

## Warum gibt es den Hub?

Auf HugoSMP werden FFAs und Baseraids häufig nur im Chat mit `/tpa` angekündigt. Solche Nachrichten verschwinden schnell. NoMercy Hub bietet einen gemeinsamen Ort, um Community-Events zu entdecken und zu organisieren.

## Anmeldung

**Lesen ohne Registrierung:** Events, Veranstalterprofile, Kategorien und TPA-Ziele sind öffentlich sichtbar. **Für Aktionen** (Event erstellen, teilnehmen, melden, eigenes Profil bearbeiten) braucht man ein kostenloses Hub-Konto mit Benutzername und einem separaten Passwort (mindestens 10 Zeichen). Keine Verbindung zum Minecraft-Login; Minecraft-Namen sind nicht verifiziert. Niemals das Microsoft- oder Minecraft-Passwort eingeben.

## Funktionen

- ⚔️ **Event-Finder** – FFA, Baseraid, Turnier, Lootdrop, Bauevent und Community.
- 📅 **Event erstellen** – Titel, Beschreibung, Dimension, Zeitpunkt, Spielerlimit und TPA-Ziel.
- 👥 **Interessensbekundungen** – anmelden oder abmelden; die Zahl bedeutet **nicht**, dass Spieler ingame anwesend sind.
- 📋 **TPA-Befehl kopieren** – keine automatische Teleportation.
- 🛡️ **Meldeprozess** – Fake-Events und verdächtige TPA-/Bett-Traps mit Details melden; Moderation entscheidet manuell.
- 🧰 **Moderationsdashboard** – Meldungen prüfen, begründete Entscheidungen, Events aus- und wieder einblenden, Audit-Verlauf, Moderatoren verwalten.
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

### Optional: private Vorschau mit zusätzlichem Passwort

```bash
# PowerShell (Beispielwerte selbst ersetzen)
$env:SITE_PREVIEW_LOCK = '1'
$env:TEST_ACCESS_USER = 'nomercy'
$env:TEST_ACCESS_PASSWORD = 'EIN_EIGENES_LANGES_TESTPASSWORT'
npm start
```

Für öffentlichen Testbetrieb: `NODE_ENV=production`, `HOST=0.0.0.0`, `COOKIE_SECURE=1` und ein eigener dauerhafter `DATA_DIR`. `SITE_PREVIEW_LOCK` standardmäßig nicht setzen bzw. `0` – alle Besucher dürfen lesen. Nur mit `SITE_PREVIEW_LOCK=1` ist zusätzlich `TEST_ACCESS_PASSWORD` (mindestens 16 Zeichen) Pflicht. **Keine echten Secrets in GitHub oder Screenshots speichern.**

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
- `NODE_ENV=production`, `HOST=0.0.0.0`, `COOKIE_SECURE=1`, `DATA_DIR=/data` setzen. Für öffentlich lesbare Events `SITE_PREVIEW_LOCK=0`; für private Tests `SITE_PREVIEW_LOCK=1` und `TEST_ACCESS_PASSWORD` (mindestens 16 Zeichen).
- **Eigene Railway Volume** an `/data` mounten und `DATA_DIR=/data` setzen.
- Startbefehl: `npm start`. Der HTTP-Port kommt automatisch von Railway über `PORT`.
- Für Healthchecks steht `/healthz` zur Verfügung (liefert keine privaten Daten).

**Hinweis:** Die bestehende Online-Handy-Vorschau wurde zunächst als separate Railway Function erstellt. Dieses Repository enthält den umfangreicheren **V0.3-Quellcode**; erst ein bewusstes Deployment verbindet die Online-Seite mit diesem GitHub-Repository.

## Sicherheit und Grenzen

Minecraft-Identitäten und Teleportziele sind nicht geprüft. Events können PvP, Itemverlust oder Fallen beinhalten. Reports führen nicht zu automatischen Sperren. Vor öffentlichem Launch sind zusätzliche Abuse-Tests, Identitätsprüfung, Backup-/Datenschutzkonzept, Rechte- und Moderationsprüfung notwendig. Die öffentliche Testadresse allein ersetzt keine Sicherheitsprüfung.

## Open Source

Dieses Projekt steht unter der **[MIT-Lizenz](LICENSE)**. Beiträge sind willkommen: siehe [CONTRIBUTING.md](CONTRIBUTING.md). Vertrauliche Sicherheitsprobleme bitte gemäß [SECURITY.md](SECURITY.md) melden.

**NoMercy Hub** ist ein inoffizielles Community-Projekt. Minecraft und HugoSMP gehören den jeweiligen Rechteinhabern.

## Moderation sicher einrichten

1. Im eigenen Hosting (z. B. Railway → `nomercy-hub-v03` → Variables) einen zufälligen geheimen **`ADMIN_BOOTSTRAP_TOKEN` mit mindestens 32 Zeichen** setzen. Nicht committen, nicht im Browser oder Chat öffentlich teilen.
2. Ein eigenes Hub-Konto registrieren bzw. anmelden. `/moderation.html` öffnen und den Code **einmalig** eingeben. Danach wird genau dieses bestehende Hub-Konto als Admin freigeschaltet.
3. Nach erfolgreicher Einrichtung **`ADMIN_BOOTSTRAP_TOKEN` aus den Railway-Variablen löschen**. Der Admin bleibt in SQLite bestehen; der Code wird nicht mehr benötigt.
4. Als Admin lassen sich unter **Team** bestehende Hub-Accounts zu Moderatoren ernennen oder die Rechte entziehen.

Die Moderation nutzt danach normale Hub-Sitzungen, keine Admin-Token im Browser. Normale Besucher können keine Reports abrufen; sie werden individuell manuell bewertet. Jedes Ausblenden, Wiederherstellen und jeder Reportabschluss braucht eine begründete Entscheidung im Audit-Verlauf. Niemand wird automatisch gebannt.

**Achtung:** Ohne sichere Minecraft-Verifizierung können Hub-Namen nichts über die echte Minecraft-Identität aussagen. Der erste Admin wird deshalb *nicht* über einen frei registrierbaren Benutzernamen bestimmt.
