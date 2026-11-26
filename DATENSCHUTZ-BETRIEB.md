# Datenschutz- und Meldeverfahren – laufender NoMercy-Betrieb

**Stand 26.11.2026 · interner Arbeitsablauf, keine Rechtsberatung.** Dieser öffentliche Code enthält absichtlich keine echte Wohnadresse. Die Betreiberangaben werden ausschließlich zur Laufzeit aus privaten Hosting-Variablen angezeigt.

## Täglich / regelmäßig

- Öffentlich angegebene Projekt-Mail abrufen; auch Spamordner auf DSGVO-Anfragen, Meldungen und offizielle Behördenkontakte kontrollieren.
- Offene Inhaltsmeldungen im internen Clan-Team-Bereich zeitnah und nachvollziehbar behandeln. Den gemeldeten Beitrag prüfen; bei Marktverstößen über bestehende Moderationsfunktion ausblenden. Die Bearbeitung einer Meldung **entfernt keinen Inhalt automatisch**.
- Meldende und betroffene Nutzer ggf. **manuell per E-Mail** über die Entscheidung und die Gründe informieren; soweit die DSGVO greift, keine fremden persönlichen Daten weitergeben. Entscheidungen und etwaige Beschwerden dokumentieren.
- Regelmäßig sicherstellen, dass der private Railway-Backup-Bucket Sicherungen erfolgreich bestätigt und der externe Recovery-Schlüssel plus eine **zusätzliche verschlüsselte Kopie außerhalb Railway** vorhanden sind.

## Bei Datenschutzanfragen (Art. 12–22 DSGVO)

1. Eingangstag in einem **privaten** Fallprotokoll notieren, Anfrage konkretisieren (z. B. Hub-Handle und gewünschte Auskunft/Löschung).
2. Nicht bloß auf Basis eines frei wählbaren Hub-Namens Daten an Dritte senden oder löschen. Identität mit minimal notwendigen Mitteln prüfen, z. B. über eingeloggte Hub-Session.
3. Die zuständigen Informationen aus Konten, Clanmitgliedschaft, Clan-Bewerbungen, Profil, Marktplatz, Event-/Giveaway-Teilnahme, Clanbank, Monatssteuern, Missions und Moderations-/Audit-Daten zusammenstellen. Daten Dritter und vertrauliche Ermittlungsdetails gesondert bewerten.
4. **Auskunft** übersichtlich und sicher erteilen. **Berichtigung/Löschung** für die Daten vornehmen, bei denen der Anspruch besteht; mögliche Gründe zur zulässigen Aufbewahrung bei historischen Bank- oder Audit-Daten dokumentieren. Es gibt aktuell **keinen vollautomatischen Löschknopf**; niemals blind SQL löschen, um abhängige Daten nicht zu zerstören.
5. Verschlüsselte Backups dürfen bei der regulären Rotation auslaufen; bei einem Restore nach einer erfolgten Löschung müssen die gelöschten/anonymisierten Datensätze erneut entsprechend behandelt werden.
6. Grundsätzlich innerhalb **eines Monats** antworten (Art. 12 Abs. 3 DSGVO). Eine rechtmäßige Verlängerung ist unter den gesetzlichen Voraussetzungen möglich und innerhalb des ersten Monats anzukündigen.
7. Anfrage, Prüfgrundlage, Entscheidung und Bearbeitungsdatum im **privaten** Vorgangsprotokoll festhalten. Keine Kontakt- oder Gesundheitsdaten in GitHub Issues oder den öffentlichen Discord schreiben.

## Bei Inhaltsmeldungen / Beschwerden

- Öffentliches Formular: /melden.html – ohne Registrierung, speichert Name, E-Mail, interne Seitenfundstelle und Gründe.
- Moderation: Clan-Team, Bereich „Rechtliche Inhaltsmeldungen“. Nur Admin, Co-Leader, Moderatoren haben Zugriff.
- Keine automatischen Banns oder Löschungen. Jede Entscheidung begründen und ggf. separaten Moderationsschritt durchführen.
- Das System schickt **keine automatischen E-Mails**. Rückmeldungen per Projekt-Mail selbst schreiben. Eine Vorgangsnummer allein ist keine garantierte endgültige Entscheidung.
- Handelt es sich um eine DSA-relevante Meldung, die Anforderungen an Meldung, Begründung, Rückmeldung und Überprüfung anhand Art. 16 und 17 DSA und der konkreten Anbieter-Einstufung beurteilen.

## Bei Datenschutzvorfällen

- Zugangsdaten sperren/rotieren, betroffene Daten und Zeitraum ermitteln, technische Beweise sicher dokumentieren.
- Risiko für betroffene Personen beurteilen; ggf. Meldung an zuständige Aufsichtsbehörde nach Art. 33 DSGVO **binnen 72 Stunden ab Bekanntwerden**, soweit meldepflichtig, sowie Information Betroffener nach Art. 34.
- Kein Ersatz für einen professionell begleiteten Datenschutzvorfall.

## Hostingvertrag / Sicherheitsaufgaben

- Railway-DPA https://railway.com/legal/dpa, Abschnitt „Execution of this DPA“: schriftlich per DocuSign abschließen und ausgefertigtes Exemplar außerhalb des öffentlichen GitHub-Repos sichern.
- Railway nennt als **primären** Verarbeitungsort die USA; regionales EU-Volume allein ist keine Garantie für ausschließlich europäische Verarbeitung. Rechtsgrundlage und ggf. Drittlandgarantien prüfen.
- Verantwortlichkeit der Betreiberperson und konkrete Fristen im Verzeichnis der Verarbeitungstätigkeiten dokumentieren, soweit nach Art. 30 DSGVO erforderlich.
- 2FA getrennt für GitHub und Railway aktivieren und Recovery-Codes geschützt extern lagern.
- Fehlende Rechtsberatung: Bei wachsender Nutzerzahl, Minderjährigen, wirtschaftlichen Funktionen oder Konflikten Fachanwalt/Datenschutzberatung einschalten.

## Freigabe / Prüfliste

Die Tatsache, dass Seiten technisch live sind, ist kein Nachweis vollständiger DSGVO-/DSA-Konformität. Entscheidend ist auch der **tatsächlich gelebte** organisatorische Ablauf. Stand des rechtlichen Grundlagendokuments: RECHTSGRUNDLAGEN-2026.md.
