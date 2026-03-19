# Deployment-Guide (GitHub → Hestia/IONOS)

Dieser Guide beschreibt den **funktionierenden Deploy-Prozess** für dieses Projekt über GitHub Actions.

## Ziel-Setup

- Repository: `norim-lab/story`
- Branch für Auto-Deploy: `main`
- Zielserver: `story.zeitblytz.media`
- Webroot: `/home/miron777/web/story.zeitblytz.media/public_html`
- Workflow-Datei: `.github/workflows/deploy.yml`

## Prinzip

Bei jedem Push auf `main` läuft der Workflow automatisch:

1. Build der App (`npm ci`, `npm run build`)
2. PHP-Dateien in `dist` kopieren (`track.php`, `debug.php`, `anthropic.php`)
3. Zielverzeichnisse vorbereiten (inkl. `data/images`, `data/projects`)
4. Schreibrechte per SSH prüfen
5. Deploy per **nativem SCP mit Retry**
6. Verify-Schritt auf dem Server (`index.html` und `track.php` vorhanden)

## Einmalige Einrichtung in GitHub

In GitHub Repository → **Settings → Secrets and variables → Actions** diese Secrets setzen:

- `SSH_HOST` (z. B. `mail.zeitblytz.media`)
- `SSH_USERNAME` (z. B. `miron777`)
- `SSH_PASSWORD` (SSH-Passwort des Users)

Wichtig:

- Keine FTP-Secrets für diesen Workflow verwenden.
- Der User muss Schreibrechte auf `public_html` haben.

## Lokaler Ablauf: korrekt deployen per Push

### 1) Änderungen prüfen

```bash
git status
```

### 2) Commit erstellen

```bash
git add .
git commit -m "Deine Änderung"
```

### 3) Auf `main` pushen

```bash
git push origin main
```

Das triggert den Deploy-Workflow automatisch.

## Manuelles Triggern ohne neuen Commit

Wenn du nur neu deployen willst:

1. GitHub → **Actions**
2. Workflow **Build and Deploy to story.zeitblytz.media**
3. **Run workflow** klicken
4. Branch `main` wählen

## Was der aktuelle Workflow konkret macht

- Installiert `sshpass` auf dem Runner
- Baut das Frontend
- Ergänzt Backend-PHP-Dateien in `dist`
- Erstellt sicherheitshalber `dist/data/images` und `dist/data/projects`
- Führt per SSH einen Preflight aus:
  - Zielpfad anlegen
  - Datenordner anlegen
  - Rechte setzen (`chmod 0777 ... || true`)
  - Schreibtest per `touch`/`rm`
- Lädt per SCP `dist/*` in das Webroot hoch
  - 3 Retries mit 5 Sekunden Pause
- Prüft anschließend per SSH:
  - `index.html` existiert
  - `track.php` existiert

## Erfolgs-Kriterien

Ein Deploy ist erfolgreich, wenn:

- GitHub Actions Run grün ist
- SCP-Step ohne Fehler endet
- Verify-Step nicht fehlschlägt
- Die Seite unter `story.zeitblytz.media` aktuell ist

## Troubleshooting (in deinem Setup)

### Fehler: `error copy file to dest: Process exited with status 1`

Bedeutung: SCP-Upload konnte nicht sauber auf den Zielpfad schreiben.

Prüfen:

1. Stimmen `SSH_HOST`, `SSH_USERNAME`, `SSH_PASSWORD`?
2. Ist der Zielpfad korrekt?  
   `/home/miron777/web/story.zeitblytz.media/public_html`
3. Hat der User Schreibrechte?
4. Ist genug Speicherplatz auf dem Account?
5. Blockt der Host temporär Verbindungen (kurz warten, Workflow neu starten)?

### Preflight grün, SCP rot

Dann ist häufig die Übertragung selbst das Problem (transient).  
Der aktuelle Workflow hat deshalb Retry-Logik.

### Verify rot

Dann wurden Dateien nicht korrekt entpackt/kopiert.  
Log prüfen, ob `dist/index.html` und `dist/track.php` im Build vorhanden waren.

## Wichtige Praxis-Regeln

- Deploy nur über `main` oder manuell per `workflow_dispatch`
- Keine Secrets im Code oder Commit speichern
- Vor größeren Änderungen einmal lokal `npm run build` testen
- Bei roten Runs immer zuerst den Step-Log des fehlgeschlagenen Schritts prüfen

