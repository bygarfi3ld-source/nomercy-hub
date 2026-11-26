# NoMercy Clan-HQ – Rechtsquellen & Datenschutz-Freigabe

**Prüfstand: 26.11.2026.** Versionierte Rechtsgrundlagen und technische Bestandsaufnahme zum kostenlosen Community-Hub. Diese Datei ersetzt keine individuelle Rechtsberatung und belegt keine vollständige Freigabe. Betreiberangaben bleiben außerhalb des GitHub-Repos.

## 1. Offizielle Rechtsquellen

- **§ 18 Abs. 1 Medienstaatsvertrag** (nicht ausschließlich privat/familiär: Name, Anschrift, ständig unmittelbar erreichbar): https://www.gesetze-bayern.de/Content/Document/MStV-18
- **§ 5 DDG** (falls geschäftsmäßig: ggf. E-Mail und weitere Anbieterangaben): https://www.gesetze-im-internet.de/ddg/__5.html
- **DSGVO** (Art. 5 Grundsätze, Art. 6 Rechtsgrundlagen, Art. 12–14 Information, Art. 15–22 Betroffenenrechte, Art. 24/25 Rechenschaft/Datenschutzgestaltung, Art. 28 Auftragsverarbeitung, Art. 32–34 Datensicherheit/Vorfälle, Art. 44 ff. Drittlandtransfers, Art. 77 Beschwerde): https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679
- **§ 25 TDDDG** (Endgerätezugriff/Cookies; technisch notwendiger Login: Abs. 2 Nr. 2): https://www.gesetze-im-internet.de/ttdsg/__25.html
- **DSGVO Art. 8** (bei tatsächlich einwilligungsbasierter Verarbeitung bei Kindern im Zusammenhang mit Diensten der Informationsgesellschaft; Nutzerkreis/Jugendschutz gesondert prüfen): DSGVO-Link oben
- **EU Digital Services Act (VO EU 2022/2065)**: https://eur-lex.europa.eu/eli/reg/2022/2065/oj/deu ; wegen nutzergenerierter Marktangebote Einstufung und mögliche Verpflichtungen gemäß Art. 11–18 DSA prüfen; Kleinstanbieter haben nur teilweise Ausnahmen.
- **Bundesnetzagentur DSA-Leitfaden**: https://www.bundesnetzagentur.de/DE/Fachthemen/DSC/1_Themen/PflichtenVermittlunggsdienste/start.html
- **Railway Auftragsverarbeitungsbedingungen (DPA)**: https://railway.com/legal/dpa ; Einbeziehung, Unterauftragsverarbeiter, USA-Verarbeitung und Garantien für Drittlandtransfer prüfen.

## 2. Tatsächliche NoMercy-Datenflüsse und vorläufige Rechtsgrundlagen

| Funktion | Personenbezogene Daten | Vorläufig zu prüfende Grundlage |
|---|---|---|
| Konto und Login | Hub-Name, PBKDF2-Hash/Salt, Sitzungen 7 Tage | Art. 6(1)(b) DSGVO; Sicherheit Art. 6(1)(f) |
| Öffentliche Profile / bestätigte Clans | freiwillige Minecraft-/Profilangabe, bestätigter Hub-Name/Clan | Art. 6(1)(b)/(f); Interessenabwägung erforderlich |
| Bewerbungen | Hub-Name, Minecraft-Name, optional Discord, Nachrichten, Bearbeitung | Art. 6(1)(b)/(f) |
| Markt / Events / Giveaways | Nutzerbeiträge, Teilnahmen, Gewinner und Report-Verläufe | Art. 6(1)(b)/(f) |
| Clanbank / Steuerstatus / Clan-Aufträge | Ingame-Vorgänge, Prüfer, Kommentare, Audit | Art. 6(1)(b)/(f); rollenbeschränkt |
| HTTP-/Sicherheitslogs | IP/Anfragedaten beim Hoster; IP-Rate-Limits im Server-RAM | Art. 6(1)(f), Art. 32 |
| Session-Cookie sid | sichere Anmeldung, nur für Sitzung notwendig | Art. 6(1)(b), §25(2)2 TDDDG |
| System-Schriftarten | keine externe Google-Fonts-Abfrage auf der Hauptseite | kein Webfont-Dritttransfer |
| Verschlüsselte SQLite-Backups | vollständige Datenbank, 42 rotierende Slots im 21-Tage-Zyklus | Art. 6(1)(f), Art. 32; Löschkonzept |
| Datenschutzanfragen | später an die offizielle Kontaktadresse | Art. 6(1)(c)/(f), Art. 12–22 |

**Hinweis:** Die Rechtsgrundlagen sind ein nachvollziehbarer Entwurf, keine abschließend geprüfte Rechtsauskunft. Insbesondere die öffentliche Anzeige der Clannamen, Minderjährige und freiwillige Profilinhalte benötigen eine dokumentierte Rechtsprüfung. Kein vermeintliches Einwilligungshäkchen als Ersatz für eine passende Rechtsgrundlage erfinden.

## 3. Harte Bedingungen für die Freigabe

- [ ] Projekt-E-Mail-Adresse vom Betreiber festgelegt und in privater Railway-Variable NOMERCY_LEGAL_EMAIL hinterlegt. Keine Adresse erfinden.
- [ ] Name/Anschrift und alle Angaben vor Veröffentlichung vom Betreiber kontrolliert und bewusst freigegeben.
- [ ] DDG-/MStV-Pflichtangaben nach tatsächlichem Rechtsstatus geprüft.
- [ ] Betroffenenrechte: Kontakt, Identitätskontrolle, Auskunft/Löschung, Ausnahmen bei historischen Bank-/Audit-Daten, angemessene Bearbeitungsfrist festgelegt.
- [ ] Löschfristen und ein praktikabler Löschweg schriftlich definiert; aktuell keine pauschale automatische Kontolöschung vorhanden.
- [ ] Railway-DPA und eventuelle US-Verarbeitung sowie konkrete Log-Aufbewahrung geprüft; DPA kann international verarbeitete Betriebs-/Diagnosedaten umfassen.
- [ ] Minderjährige und ggf. Anwendung des EU-DSA auf nutzergenerierte Marktplatzangebote geprüft; bestehendes Meldeformular nur für eingeloggte Nutzer ist nicht automatisch ausreichendes DSA-Verfahren.
- [ ] Weitere externe Netzwerkressourcen (falls vorhanden) geprüft; keine ungefragten Google Fonts.
- [ ] GitHub- und Railway-2FA vom Betreiber aktiviert und Wiederherstellungscodes getrennt aufbewahrt.
- [ ] Backup-Schlüssel sowie verschlüsselte Sicherung außerhalb des Railway-Kontos vorhanden; isolierter Restore überprüft.
- [ ] Webseiten und mobile Footer-Links getestet; CI und Docker-Build erfolgreich.

**Bis dahin: nicht veröffentlichen.** Nur wenn die Texte abgenommen sind und alle privaten Werte vollständig vorliegen, darf NOMERCY_LEGAL_PUBLISH=1 gesetzt werden. Der Server verweigert sonst die Seiten. Ein noindex-Tag schützt keine Privatanschrift vor öffentlichem Zugriff.

## 4. Sicherer Umgang mit personenbezogenen Informationen

Betreibername, Wohnanschrift und Kontakt nicht in das öffentliche GitHub-Repository, Commits oder Tests schreiben. Die Platzhalter LEGAL_NAME/STREET/CITY/EMAIL werden beim Abruf serverseitig aus den privaten Railway-Variablen gefüllt. Sobald das Impressum öffentlich live ist, kann jeder Besucher diese Angaben lesen; die Footerlinks müssen dauerhaft leicht auffindbar bleiben.

Für Datenschutzanfragen ist grundsätzlich eine Antwort innerhalb eines Monats nach Art. 12 Abs. 3 DSGVO vorzusehen, mit Verlängerung nur unter den gesetzlichen Voraussetzungen. Bei Datenpannen die Risikobeurteilung sowie Art. 33/34 DSGVO prüfen (ggf. Benachrichtigung der Behörde binnen 72 Stunden nach Bekanntwerden).
