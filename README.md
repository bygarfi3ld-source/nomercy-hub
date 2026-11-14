# ⚔️ NoMercy Hub – Clan HQ (V1.0.0)

**Inoffizielles, eigenständiges Open-Source-Projekt für NoMercy und die HugoSMP-Community.** Nicht von HugoSMP, Mojang oder Microsoft betrieben. Kein Plugin und keine Verbindung zu einem Minecraft- oder Microsoft-Konto erforderlich.

## V1.0 – Clan Hub, Bewerbungen und Giveaway-Feuerwerk

- **Marktplatz** ist ohne Anmeldung lesbar; Inserate, Kontaktdetails und Markt-Meldungen funktionieren mit Hub-Konto.
- **Öffentliche Giveaways** sind für alle sichtbar, die Teilnahme erfordert ein Hub-Konto. **Private Giveaways und Clan-Events** benötigen eine persönliche Freischaltung der Clanleitung. Nicht freigeschaltete Spieler können eine **Beitrittsanfrage** mit Wunschclan, unverifiziertem Minecraft-Namen und Begründung stellen. Nur der Admin (nicht Moderatoren) kann freigeben. Admin-Entscheidungen werden protokolliert.
- **Clanbank** mit gemeinsamer, manuell verwalteter Ingame-Kasse, nachvollziehbarem Ledger und Verwendungsanträgen. Genehmigung und tatsächlich bestätigte Auszahlung sind getrennt; keine echten Zahlungen.
- **Gewinner-Reveal mit Sound**: ruhiger Namenslauf, progressives Enthüllen und ein selbst synthetisierter, kurzer Pixel-Feuerwerksklang. Start erst nach Benutzertipp, Ein-/Aus-Schalter vorhanden; keinerlei originale Minecraft-Audiodatei. Auf Wunsch reduzierte Bewegung und Überspringen.
- **Design**: eigenes NM-Wappen, kleine selbst gezeichnete Pixel-Items auf jeder Hauptseite, weiche Karten und echte Skeleton-Ladezustände; mobil optimiert.
- **Sicherheit**: Server zieht Gewinner mit CSPRNG einmalig und speichert sie persistent. Der Name-Reel samt Audio visualisiert nur das gespeicherte Ergebnis, nie die Auswahl. Keine Verifizierung der Minecraft-Identität oder Zugriff auf HugoSMP-Plugins.

**Wichtig für neue Installationen:** Solange kein Administrator über `ADMIN_BOOTSTRAP_TOKEN` auf `/moderation.html` freigeschaltet ist, kann niemand Clan-Beitrittsanfragen genehmigen, Giveaways anlegen oder Buchungen vornehmen. Niemals einen Admin anhand eines allein behaupteten Spielernamens zuweisen. Alle neuen Daten bleiben im eigenen SQLite-Volume (`DATA_DIR`). Vor Produktion bestehendes Volume sichern.

## Frühere Updates

### V0.8 – Giveaway-Sichtbarkeit

- Die Clanleitung/Moderation wählt **bei jedem Giveaway**: `🌍 Öffentlich` (öffentlich sichtbar, Teilnahme mit Hub-Konto) oder `🔒 Privat` (nur freigeschaltete NoMercy-Mitglieder). Standard ist privat.
- Alte Giveaways bleiben durch sichere SQLite-Migration **privat**, auch nach dem Upgrade; historische Accounts und Events bleiben erhalten.
- Öffentliche Giveaways sind für jeden sichtbar; der Giveaway-Eintritt selbst benötigt einen Hub-Account. Private Giveaways werden auch über direkte API-URLs nicht für Nichtmitglieder angezeigt.
- Die Zufallsziehung verwendet serverseitiges `crypto.randomInt`, berücksichtigt die zur Ziehung berechtigten Teilnehmer und speichert alle Gewinner unveränderlich ab. Öffentliche Teilnehmer müssen kein Clanmitglied sein. Kein Echtgeld und keine automatische Auszahlung.
- Der **Marktplatz** bleibt für alle öffentlich sichtbar; **Clan-Events** benötigen Login plus Admin-Freischaltung (Main, Clan 2, Clan 3).
- `preview/NoMercy-Hub-v0.8-Handy-Demo.html` ist eine eigenständige Demo mit umschaltbaren Rollen (Gast / Hub-Konto / Clan / Admin) und klar markierten Beispieldaten, ohne Änderungen an der Live-Website.

## Visuelles Update V0.7

- Neu gestaltete **mobile-first** Oberfläche mit abgerundeten Panels und Karten, zurückhaltendem NoMercy-Schwarz/Rot, deutlicheren Abständen und lesbarer Schrift-Hierarchie.
- Unterscheidbare Unterbereiche: Marktplatz (klar/leicht), Giveaways (editoriale Serif-Akzente) und Clan-Events (runde moderne Headline).
- **Echte Loading-Skeletons** bei Markt- und internen Datenabrufen statt kurzfristig leerer Karten; bei API-Fehlern gibt es eine Fehlermeldung und die bestehende Seite bleibt benutzbar.
- Sanfte Karten-/Tabwechsel-, Button- und Gewinner-Reveal-Animationen mit `prefers-reduced-motion` für barrierearme Nutzung.
- Eine **eigenständige, rein lokale Design-Demo** mit deutlich als Beispiel markierten Daten liegt separat unter `NoMercy-Hub-v0.7-Handy-Vorschau.html`; diese Demo schreibt keine Daten und kontaktiert die echte Hub-API nicht.
- V0.7 ließ Login und Ziehungsalgorithmus unverändert; V0.8 erweitert den Zugriff differenziert um öffentliche Giveaways, ohne bestehende Daten zu entfernen.

## Neues Clan HQ

Der Hub hat jetzt drei Schwerpunkte:

- **🎁 Öffentliche oder interne Giveaways**: öffentliche Drops für alle mit Hub-Konto, private Drops nur für von der Leitung freigeschaltete Mitglieder (Main, Clan 2, Clan 3). Nur die Hub-Moderation/Leitung kann Giveaways erstellen. Es gibt ein Enddatum mit Uhrzeit, Geld- oder Item-Gewinn, Menge **pro Gewinner**, bis zu 20 Gewinnern sowie eine animierte, cleane Namens-Enthüllung mit sanft auslaufendem Ticker und Gewinnerkarten (kein Roulette-Rad). Die Gewinner werden **ausschließlich serverseitig** mit `crypto.randomInt()` aus gültigen, eindeutigen Teilnehmerkonten ausgelost und persistent in SQLite gespeichert. Eine erneute Animation ändert kein Ergebnis. Die Animation lässt sich überspringen und respektiert die Einstellung für reduzierte Bewegung. Auch nach Neustarts bleiben die Gewinner bestehen. Wenn kein gültiger Teilnehmer vorhanden ist, gibt es keinen Gewinner. Die Auszahlung/Übergabe erfolgt **nicht automatisch** im Spiel, sondern wird danach von der Moderation als erledigt markiert.
- **⚔️ Interne Clan-Events** für freigeschaltete Clan-Mitglieder. Die Leitung organisiert Trainings, Clan-Wars, FFAs, Baseraids, Community-Treffen mit Beginn, Dauer, Teilnehmerlimit und An-/Abmeldung.
- **💰 Öffentlicher HugoSMP-Marktplatz**, der Angebote, Suchanzeigen und Dienstleistungen für Ingame-Items/Spielwährung unterstützt. Jeder darf lesen, für ein Inserat oder eine Meldung braucht man ein Hub-Konto. Ersteller können Anzeigen schließen. Moderatoren können Markt-Meldungen prüfen und unseriöse Anzeigen ausblenden.

**Anmeldung:** Hub-Benutzername + separates Passwort (mindestens zehn Zeichen). **Niemals** das Minecraft- oder Microsoft-Passwort eingeben. Ein gewählter Minecraft-Name ist **nicht verifiziert**.

**Clan-Freischaltung:** Ein Hub-Konto allein erlaubt nicht die Teilnahme an Clan-Events oder **privaten** Giveaways. Ein Administrator muss unter **Clan-Team** das Hub-Konto einem Clan zuordnen. Moderatoren/Admins haben zur Verwaltung Zugriff auf die internen Bereiche. Die Main-Mitgliedschaft kann nicht einfach von Nutzern selbst beansprucht werden.

## Sicherheit und Fairness

- Das Ziehungsergebnis wird nach Ablauf der Endzeit serverseitig automatisch berechnet; der Prozess versucht das regelmäßig und bei der nächsten Anfrage bzw. nach Serverneustart. Falls der Server zur Endzeit offline ist, erfolgt die Ziehung nach dem nächsten Start oder Zugriff.
- Gewinner werden ohne Zurücklegen ausgelost: höchstens ein Gewinn pro teilnehmendem Hub-Konto. Verschiedene Hub-Konten können grundsätzlich derselben echten Person gehören; mangels Minecraft-Verifizierung kann der Hub das derzeit **nicht** verhindern. Clan-Freischaltungen und transparente Regeln helfen gegen Missbrauch.
- Ein Giveaway kann **vor** der Ziehung von der Leitung mit Begründung abgebrochen werden; keine manuelle Neuauslosung. Alle Giveaway-Ergebnisse bleiben nachvollziehbar.
- Ingame-Geld und Items werden **nicht** vom Server übertragen oder verifiziert. Die Moderation dokumentiert die manuelle Übergabe separat.
- Nutzer melden verdächtige Inserate, jedoch keine automatischen Bans. Nur Ingame-Angebote, **kein Echtgeldhandel** über diese Plattform. Echte Gegenstände, Accounts, Echtgeld oder Zahlungsmethoden nicht anbieten.
- Alle alten Nutzerkonten, alten Eventdaten und Moderationsdaten bleiben unverändert in ihren bisherigen SQLite-Tabellen erhalten. Alte Community-Event-Frontendseite liegt bei Bedarf unter `/legacy.html` (nicht in der neuen Navigation). Das bestehende Moderationsdashboard bleibt unter `/moderation.html` erreichbar.

## Installation

Node.js **22.13.0 oder neuer**, wegen `node:sqlite`. Ohne externe Abhängigkeiten:

```bash
npm install
npm test
npm start
```

Standardmäßig unter `http://localhost:3030`. SQLite-Datei unter `data/hub.sqlite`, sofern kein eigener `DATA_DIR` gesetzt ist.

### Railway / Produktion

Die bestehende NoMercy-Railway-Installation verwendet eine dedizierte Volume unter `/data` und bleibt getrennt von Supabase und anderen Apps:

- `NODE_ENV=production`, `HOST=0.0.0.0`, `COOKIE_SECURE=1`, `DATA_DIR=/data`, `SITE_PREVIEW_LOCK=0`.
- Eine **einmalige Admin-Freischaltung** ist über `/moderation.html` vorgesehen. Dafür **nur in Railway Variables** `ADMIN_BOOTSTRAP_TOKEN` auf mindestens 32 kryptografisch zufällige Zeichen setzen, dann mit deinem eigenen Hub-Konto anmelden, den Code dort einmal eingeben und die Variable **danach entfernen**. Code nie in GitHub speichern. Der Code ist kein allgemeiner Login.
- Nach erfolgreicher Admin-Freischaltung im Clan HQ unter **Clan-Team** Mitglieder freischalten. Moderatoren für die Verwaltung ggf. unter `/moderation.html` ernennen.
- Backups des eigenen SQLite-Volumes einrichten. Vor großen Updates einen Snapshot sichern.
- Den alten privaten Vorschaudienst und externe Datenbanken nicht anfassen.

## Entwicklung

```text
server.js          Authentifizierung, altes Event-/Moderations-API
clan-hq.js         neue Clan-, Giveaway- und Marktplatz-API
public/index.html  neuer Einstieg (Clan HQ)
public/hq.js       neue Oberfläche + Gewinner-Reveal
public/hq.css      responsives Design
public/legacy.html alte Eventfinder-Oberfläche (ohne Navigation)
public/moderation.* bisheriger Moderationsbereich
tests/             Integrationstests inkl. Gewinner-Stabilität und Zugangsschutz
```

MIT-Lizenz. Unabhängiges Fanprojekt von NoMercy. Keine Demonutzer und keine erfundenen Angebote/Gewinner im Produktivbetrieb.


## V0.8.1 Design-Preview (nicht live)

- Eigenständiges NoMercy-Schildmonogramm und eine ruhige Equipment-Illustration ersetzen das generische Raster in der Hero-Karte.
- Original gezeichnete, kleine Pixel-Item-Symbole für Schwert, Diamant, Chest, Apfel und Ender-Perle in Navigation, Hero und Abschnittsüberschriften. Kein fremdes Bildmaterial, keine externen Icons.
- Sanftes Schweben, Hover-Effekte, Responsive-Anpassungen, `prefers-reduced-motion`.
- Funktionalität und Datenbank unverändert; dies ist zunächst ein lokales Designpaket.
- Offline-Handy-Vorschau: `preview/NoMercy-Hub-v0.8.1-Handy-Demo.html` (JavaScript und CSS eingebettet).

## Clanbank (V0.9, intern)

**Eine gemeinsame manuell geführte Ingame-Kasse** für Main, Clan 2 und Clan 3. Sie hat **keine Verbindung zu Echtgeld oder HugoSMP** und beginnt ohne Demo-Bestand mit **0 Mio.**

- Die Kontostand-/Antrags-/Buchungsansicht unter `/#bank` ist nur für vom Hub-Admin freigeschaltete Clanmitglieder und den Admin sichtbar. Moderatoren ohne Clan-Freigabe haben keinen Bankzugriff.
- Freigeschaltete Mitglieder können Anträge mit Zweck, Betrag und Begründung stellen; nur der **Hub-Admin** kann genehmigen, ablehnen, Zahlungen bestätigen und Buchungen erfassen.
- Eine Genehmigung bucht **noch keine Auszahlung**. Erst nach tatsächlicher Ingame-Übergabe führt der Admin die Auszahlung aus. Mehrfachauszahlungen sind blockiert.
- Der Admin kann Einzahlungen, Auszahlungen und Bestandskorrekturen mit Notiz erfassen. Jede Änderung ist im **unveränderlichen Buchungsverlauf** protokolliert (Aktionsdaten, vorheriger und neuer Kontostand).
- Beträge werden intern als Ganzzahlen mit **0,001 Mio.** Auflösung gespeichert; Auszahlungen dürfen kein negatives Guthaben verursachen.
- Keine vorgefertigten Fake-Mitglieder, Anträge oder Kontobewegungen. Alle Kontodaten bleiben in der bestehenden dedizierten SQLite-Datei dieses Hubs.


## Sicherer Release-Prozess

Siehe [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md), inklusive manuellem Railway-Volume-Backup, Admin-Aktivierung und Rollback.

