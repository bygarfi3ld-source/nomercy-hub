# Sicherheitsrichtlinie

NoMercy Hub ist noch ein MVP und ausdrücklich **nicht** für einen ungeprüften öffentlichen Betrieb gedacht.

## Sicherheitslücken melden

Bitte keine unveröffentlichten Schwachstellen, Zugangsdaten oder personenbezogene Informationen in öffentlichen GitHub Issues posten. Nutze, sobald im neuen Repository aktiviert, **GitHub → Security → Report a vulnerability** (private Vulnerability Reporting). Falls das noch nicht eingerichtet ist, kontaktiere die Maintainer über einen nicht öffentlichen Kanal, bevor du technische Details teilst.

## Was der MVP noch nicht leistet

- Keine Überprüfung der Minecraft-Identität oder der Sicherheit eines `/tpa`-Ziels.
- Keine automatische Prüfung von TPA-/Bett-Traps.
- Keine Sicherheitssiegel für Veranstalter.
- Keine umfassenden Anti-Missbrauchsmaßnahmen, E-Mail-Verifizierung oder Einspruchsverfahren.
- Report-Beweismaterial darf nur an berechtigte Moderatorinnen und Moderatoren gehen.

## Betrieb

- Testseite nur über HTTPS veröffentlichen und durch `TEST_ACCESS_PASSWORD` schützen.
- Starke und getrennte Geheimnisse für Testzugang und `ADMIN_TOKEN` setzen.
- `NODE_ENV=production` und `COOKIE_SECURE=1` konfigurieren.
- `DATA_DIR` auf ein **dauerhaftes, eigenes Volume** setzen; niemals eine SQLite-Datenbank in Git hochladen.
- Updates und regelmäßige Backups einplanen; nur vertrauenswürdige Maintainer bekommen Hosting-Zugriff.
