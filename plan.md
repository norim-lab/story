# Fortsetzungsplan – Zeitblitz Studio (KI-Einstellungen & Stabilität)

Dieser Plan fasst den aktuellen Stand zusammen und definiert klare nächste Schritte, damit wir im neuen Gespräch nahtlos weitermachen können.

## Status Quo
- Deployment: GitHub Actions deployt `dist/*` direkt ins Webroot; läuft stabil.
- Backend: `server/track.php` lädt Projekte robust (ID aus Dateiname, `lastModified` aus Datei).
- Frontend:
  - Tailwind auf PostCSS umgestellt; Content-Globs eingegrenzt (keine `node_modules`-Warnung).
  - Legacy-Projekte: Null-/Undefined-Guards ergänzt (Startseite/Editor laden stabil).
  - Offene KI-Integration: Fehler „An API Key must be set when running in a browser“ entsteht, weil noch kein Key gesetzt ist.
- Neue Dateien:
  - `services/settings.ts` – lokale Speicherung von API-Keys und Modellauswahl (LocalStorage).
  - `components/SettingsModal.tsx` – Modal zum Eintragen der Keys und Modelldefaults (Google, OpenAI, Anthropic).

## Ziel der nächsten Iteration
Eine nutzerfreundliche Einstellungsfläche mit:
- Google: „Flash 2.5“ (schnell) und „Gemini Pro 2.5“ (qualitativ) konfigurierbar
- OpenAI: ein schnelles und ein sehr gutes Modell (z. B. `gpt-4o-mini`, `gpt-4.1`)
- Anthropic: ein günstiges schnelles und ein sehr gutes LLM (z. B. `claude-3-haiku`, `claude-3-opus`)
- API-Keys im Browser sicher erfassen (LocalStorage), niemals an den Server senden
- Aktiver Provider wählbar; Editor nutzt die gewählte Schnell-/Pro-Variante

## Architekturentscheidungen
- Model-ID Typ: Freier String (`TextModelId`) statt fixem Enum – erleichtert neue Modelle (z. B. „gemini-2.5-*“).
- Settings-Quelle: `services/settings.ts` liest/schreibt ein JSON im LocalStorage.
- Adapter-Schicht: Kurzfristig nutzen wir weiterhin Google direkt; mittelfristig bauen wir optionale Adapter für OpenAI/Anthropic, damit `generate*`-Funktionen provider-neutral werden.

## Konkrete Schritte
1) Einstellungen-UI fertig integrieren
   - „Settings“-Button sichtbar im Header
   - `SettingsModal` öffnen/schließen; `saveSettings` triggert Persistenz
   - Aktiver Provider + Modelle im UI anzeigen

2) Google‑Schlüssel nutzen
   - `@google/genai` überall über `getGoogleKey()` initialisieren
   - Fallback: Wenn Key fehlt → klare UI‑Hinweise (keine stillen Fehler)

3) Editor‑Modelle anbinden
   - Wechselbuttons: „Flash“ → `settings.googleFastModel`, „Pro“ → `settings.googleProModel`
   - Mobile Anzeige anpassen (Model-Label aus `selectedModel`)

4) OpenAI/Anthropic vorbereiten
   - Settings-Felder für Keys/Modelle sind vorhanden
   - Next: Adapter‑Funktionen definieren (OpenAI/Anthropic) inkl. Minimal-Implementierung
   - Umschaltung: Wenn aktiver Provider ≠ Google, Editor nutzt die entsprechenden IDs

5) Sicherheit & UX
   - Keine Speicherung von API‑Keys im Backend oder Repository
   - Warnung/Badge, falls kein Key gesetzt ist
   - Fehlerbehandlung: Lesbare Meldungen bei API‑Fehlern

6) Cleanup/Refactor
   - Harte Keys entfernen (z. B. `services/perplexity.ts`): Key via Settings/Server-Proxy ersetzen
   - Optional: Server‑Proxy für kostenpflichtige Anbieter evaluieren (besseres Key‑Handling, Ratelimits)

## Akzeptanzkriterien
- Settings‑Modal erlaubt das Setzen von Keys/Modellen; Auswahl wird persistiert.
- Editor zeigt zwei Google‑Buttons (Flash/Pro) und setzt die `selectedModel` entsprechend.
- Kein „API Key must be set…“ mehr bei vorhandenen Settings.
- Projekte laden stabil; Editor bricht nicht bei fehlenden Feldern.

## Bekannte Konsolenmeldungen
- „Attempting to use a disconnected port object“: typischerweise von Browser‑Extensions, kann ignoriert werden.
- Tailwind‑Warnung: behoben durch eingegrenzte Globs.

## Nächste Session – Checkliste
- [x] Settings‑Button final einbauen und testen
- [x] Google‑Key setzen, „Flash/Pro“-Umschaltung prüfen
- [x] Perplexity‑Key entkoppeln
- [ ] Roadmap abstimmen: OpenAI/Anthropic‑Adapter

Hinweis: API‑Keys verbleiben ausschließlich im Browser (LocalStorage). Für Team‑Use und Rate‑Limits kann mittelfristig ein kleiner Server‑Proxy sinnvoll sein.

