# NoMercy Hub V1.0 – sicherer Live-Rollout

Stand: 2026-11-13. Projekt: `bygarfi3ld-source/nomercy-hub`, Railway `nomercy-hub-v03`.

**Nicht in Supabase oder die separate private Vorschau eingreifen.** Bestehendes Railway-Volume `/data` beibehalten. Keine echte Zahlungen oder Minecraft-Account-Passwörter.

## 1. VOR dem Update: Backup des produktiven SQLite-Volumes

1. Railway: Projekt `nomercy-hub-test` → Service `nomercy-hub-v03` → **Backups**.
2. Unter **Backups** auf **Create Backup** klicken und die erfolgreiche Erstellung prüfen.
3. Optional **Edit schedule** → Daily (und Weekly) einschalten.
4. Wenn kein Backup erstellt werden kann: **nicht auf dem produktiven Volume deployen**. Erst Problem lösen.
5. Beim Rollback gegebenenfalls den Snapshot über **Restore** wiederherstellen – Railway stellt dabei einen neuen Volume-Stand zur Überprüfung bereit.

Quelle: https://docs.railway.com/volumes/backups

## 2. Code-Review und Tests

- `npm test` → mindestens **15 bestandene Tests**, inkl. Migration von V0.4 und rollenbasierter Clanbank.
- GitHub-Release-Code aus diesem Paket committen, idealerweise erst auf einem separaten Release-Branch und mit Pull Request.
- Darauf achten, dass `main` nicht schon vor dem Backup automatisch in Railway live aktualisiert.
- `Dockerfile` kopiert alle drei Backend-Dateien (`server.js`, `clan-hq.js`, `clan-bank.js`) und `/public`.
- Alte Accounts, Meldungen und Events müssen erhalten bleiben; alte Events sind unter `/legacy.html` sichtbar.

## 3. Admin-Aktivierung

1. Ausschließlich in den **Railway Service Variables** `ADMIN_BOOTSTRAP_TOKEN` auf mindestens 32 zufällige Zeichen setzen.
2. Nach dem Deployment im NoMercy Hub mit **eigenem** Hub-Konto anmelden und `/moderation.html` öffnen.
3. Den einmaligen Freischaltcode eingeben. Solange ein Admin bereits existiert, kann kein weiterer Account so zum Admin werden.
4. **Danach die Variable wieder löschen.** Niemals den Code per Discord, GitHub oder hier im Chat teilen.
5. Erst danach im Clan-Team Beitrittsanfragen genehmigen.

## 4. Konfiguration

`NODE_ENV=production`, `HOST=0.0.0.0`, `DATA_DIR=/data`, `COOKIE_SECURE=1`, `SITE_PREVIEW_LOCK=0`.
**Kein vorhandenes Volume ersetzen, verschieben oder löschen.**

## 5. Nach dem Deploy prüfen

- `GET /healthz` = HTTP 200
- Homepage und Marktplatz für Gäste sichtbar
- Öffentliches Giveaway sichtbar, Teilnahme nur mit Hub-Konto
- Privates Giveaway/Clan-Event/Clanbank ohne Freischaltung gesperrt
- Bewerbungen nur durch Admin freischaltbar
- Bankbuchungen: nur Admin; Anträge nur Clan; Ausgaben erst nach tatsächlicher Übergabe
- Giveaway: Ziehung einmalig, Gewinnerliste stabil nach Neuladen; Sound lässt sich ein-/ausschalten
- Browser-Navigation auf Handy einschließlich **Marktplatz**, **Giveaways**, **Clan-Events**, **Clanbank**
- Alte Accounts und gemeldete Events weiterhin vorhanden

## 6. Grenzen

Tests garantieren keinen vollständig sicheren Produktivbetrieb. Echte Handy-/Audio-Tests, Backup-Restore-Probe, Abuse-Schutz, Datenschutz-/Impressumsprüfung und gegebenenfalls Passwort-Wiederherstellung fehlen noch oder sollten vor breiter Werbung geprüft werden. Minecraft-Namen sind nicht verifiziert; Mehrfachkonten und Social Engineering bleiben möglich.
