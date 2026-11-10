# Mitmachen beim NoMercy Hub 🤝

Danke für dein Interesse! Das Projekt ist ein inoffizieller Open-Source-Event-Finder für die HugoSMP-Community.

## So kannst du beitragen

1. Erstelle ein GitHub Issue für Bugs, Ideen oder kleine Verbesserungen.
2. Forke dieses Repository und erstelle einen Branch (`fix/...` oder `feature/...`).
3. Ändere nur, was für deinen Beitrag nötig ist. Entferne keine bestehenden Schutzmechanismen.
4. Starte `npm test` und teste die mobilen Ansichten.
5. Erstelle einen Pull Request mit kurzer Beschreibung und optionalen Screenshots.

## Besonders wichtige Regeln

- **Keine echten Minecraft-/Hub-Passwörter, API-Tokens, `.env`-Dateien oder SQLite-Datenbanken committen.**
- Keine Fake-Events in die Live-Datenbank oder als voreingestellte aktive Events einbauen.
- Report-Zahlen sind kein automatischer Bann-Grund. Beweise und manuelle Prüfung sind Pflicht.
- Minecraft-Namen sind unverifiziert, solange keine echte Nachweismethode implementiert ist.
- Barrierefreiheit berücksichtigen (`prefers-reduced-motion`, Tastaturnavigation, Kontrast).
- Bestehende Apps und fremde Supabase-Projekte sind **nicht** Teil dieses Repositories.

## Starten

Node.js 22.13+ installieren, `npm start` aufrufen und `http://localhost:3030` öffnen. Keine zusätzlichen npm-Abhängigkeiten notwendig.

## Feedback

Für normale Bugs bitte ein öffentliches Issue erstellen. Sicherheitslücken **nicht** öffentlich veröffentlichen; siehe `SECURITY.md`.
