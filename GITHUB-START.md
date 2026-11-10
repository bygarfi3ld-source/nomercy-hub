# NoMercy Hub in euer bestehendes GitHub-Repository hochladen

Repository: https://github.com/bygarfi3ld-source/nomercy-hub

Das Repository ist bereits erstellt. **Kein weiteres Repository anlegen.**

## In Windows (einfach)

1. Dieses ZIP entpacken.
2. [Git for Windows](https://git-scm.com/downloads/win) installieren, falls `git` noch nicht installiert ist.
3. In GitHub/Git Credential Manager mit dem **GitHub-Konto `bygarfi3ld-source`** anmelden (oder einem Konto mit Push-Zugriff auf das Repo).
4. `UPLOAD-ZU-GITHUB.bat` doppelklicken. Falls Git nach Name und E-Mail fragt, einmal deine eigene Git-Konfiguration hinterlegen.
5. Nach erfolgreichem Upload https://github.com/bygarfi3ld-source/nomercy-hub aktualisieren.

Das Skript prüft das Ziel, erstellt beim ersten Mal einen Commit und lädt nur diesen entpackten Projektordner hoch. Es fordert **keine** Token-/Passworteingabe in ChatGPT.

## Alternativ per PowerShell (im entpackten Ordner)

```powershell
git init -b main
git add .
git status
git commit -m "Initial open-source release of NoMercy Hub"
git remote add origin https://github.com/bygarfi3ld-source/nomercy-hub.git
git push -u origin main
```

Falls du vorher ein anderes Repository in diesem Ordner eingerichtet hast, stoppe vor `git push` und prüfe `git remote -v`.

## Hinweis zu Online-Hosting

Das Pushen veröffentlicht **nur den Quellcode auf GitHub**. Die laufende passwortgeschützte Railway-Testseite wird nicht automatisch verändert. Supabase wird nicht verwendet.

Es gehören keine Zugangsdaten (`.env`), SQLite-Datenbanken (`*.sqlite`) oder API-Tokens ins öffentliche Repository. Die `.gitignore` ignoriert diese Dateien.