# NoMercy – Launch-Freigabe: Kontoschutz, Rechtstexte und Backups

**Status: Noch nicht abgenommen.** Keine Kontobestätigung oder Backup-Schlüssel-Speicherung wird durch diese Datei automatisch durchgeführt. Keine geheimen Daten hier eintragen.

## 1. GitHub-Zwei-Faktor-Anmeldung (Betreiberaktion)
Gehe auf https://github.com/settings/security → Two-factor authentication. Falls noch nicht aktiv, TOTP/Passkey einrichten. Wiederherstellungscodes außerhalb des GitHub-Kontos aufbewahren. Danach privat prüfen, dass die zweite Anmeldestufe funktioniert. Niemals Codes, QR-Code oder Screenshots in Issues, Commits, Discord oder Chat posten.

## 2. Railway-Zwei-Faktor-Anmeldung (Betreiberaktion)
Gehe auf https://railway.com/account → Account Security → Set up two-factor authentication. Eigene Authenticator-App/Passkey verwenden, Wiederherstellungscodes außerhalb von Railway sichern und erfolgreichen zweiten Login prüfen. GitHub-2FA allein ersetzt Railway-2FA nicht.

Offizielle Hilfe: https://docs.railway.com/access/multi-factor-authentication

## 3. Betreiberinformationen und Datenschutz vor großem Launch
Die noch NICHT veröffentlichten Entwürfe auf diesem Branch liegen unter public/impressum.html und public/datenschutz.html. Fußzeilen- und Registrierungslinks sind vorbereitet. Keine Freigabe, bis die fehlenden Angaben korrekt ausgefüllt und geprüft sind.

Vor Veröffentlichung ermitteln: Verantwortliche natürliche Person bzw. Organisation und erforderliche Anbieterkennzeichnung; rechtlich tragfähige Kontaktmöglichkeiten und gegebenenfalls ladungsfähige Adresse; tatsächliche Verarbeitungszwecke und DSGVO-Rechtsgrundlagen; Speicherdauer und Löschverfahren; Absprachen mit Railway; externe Google-Fonts-Aufrufe; Drittanbieter/Transfers; Minderjährige; Datenschutz-Anfragen.

**Achtung:** Das GitHub-Repo ist öffentlich. Betreiberinformationen in veröffentlichten HTML-Dateien oder Commits werden allen angezeigt. Persönliche Adressen nicht leichtfertig in GitHub-Issues oder Chat posten. Falls Betreiber minderjährig ist, verantwortliche erwachsene Person/rechtliche Vertretung und Rechtslage klären.

Rechtlicher Ausgangspunkt:
- https://www.die-medienanstalten.de/aufgaben/aufsicht/impressumspflicht/
- https://ao.bundesfinanzministerium.de/ao/2025/Datenschutz-Grundverordnung/inhalt.html

## 4. Backup-Schlüssel unabhängig vom Hosting sichern (Betreiberaktion)
Die App nutzt die Railway-Variable NOMERCY_BACKUP_KEY als AES-256-GCM-Schlüssel (64 hexadezimale Zeichen). In Railway Variables den Wert sicher auf dem eigenen Gerät einsehen und als **NoMercy Backup Encryption Key** in einem geschützten Passwortmanager ablegen. Den exakten Wert nicht ändern, sonst können ältere Backups ohne alten Schlüssel nicht mehr entschlüsselt werden.

Für einen Wiederanlauf sollten außerdem privat gesichert werden: Backup-Bucket, Endpoint, Region, Zugangskennung und Secret Access Key sowie ein aktueller verschlüsselter Backup-Gegenstand (.sqlite.gz.gcm). Ohne Zugang zum Railway-Account ist der Backup-Bucket sonst möglicherweise nicht mehr verfügbar; der Schlüssel allein ist nicht ausreichend. Die S3-Zugangsdaten bei Railway im Bucket-Management einsehen, niemals in GitHub oder Chat speichern.

Das Verschlüsselungs- und Prüfmodul heißt backup.js; es gibt die Restore-Funktion restoreToNewFile(...). Eine Wiederherstellung erfolgt nur auf eine **neue isolierte Datei** – nie blind über /data/hub.sqlite. Die automatische Sicherung läuft zunächst 20 Sekunden nach App-Start und danach alle sechs Stunden. Die Rotation verwendet 42 Slots (zwei pro Kalendertag in einem 21-Tage-Zyklus). Der Server versucht ungefähr alle sechs Stunden eine Sicherung; innerhalb einer Tageshälfte kann ein Slot erneut überschrieben werden. Bei längerer Server-Downtime fallen Sicherungsläufe aus. Die Backups werden durch erneuten Download und Integritätscheck geprüft.

## 5. Startfreigabe – nur nach tatsächlicher Bestätigung
- [ ] GitHub-2FA ist aktiv, Wiederherstellungscodes gesichert
- [ ] Railway-2FA ist aktiv, Wiederherstellungscodes gesichert
- [ ] Betreiberangaben, Datenschutzhinweise und Löschkonzept rechtlich überprüft und veröffentlicht
- [ ] Externe Font-/Bildzugriffe und etwaige Drittlandtransfers überprüft
- [ ] Backup-Schlüssel außerhalb von Railway gesichert
- [ ] Zusätzlich ein aktuelles verschlüsseltes Backup in einem zweiten unabhängigen Speicher abgelegt und Restore isoliert getestet
- [ ] Links auf Impressum/Datenschutz auf Handy und PC geprüft

**Bis zur Freigabe:** Dieser Branch und seine Entwürfe dürfen nicht automatisch in Produktion gemergt werden.
