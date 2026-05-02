import { getSettings } from "./settings";

export const getStyleInstruction = (val: number): string => {
  if (val <= 3) return "Ruhig, sachlich, zurückhaltend. Sehr seriöser journalistischer Ton.";
  if (val <= 6) return "Gewitzt, leicht zugespitzt, pointiert.";
  return "Stark sarkastisch, beißend, sehr pointiert und angriffslustig.";
};

export const getMetaphorInstruction = (val: number): string => {
  if (val <= 3) return "Klartext. Keine Metaphern, keine Sprachbilder.";
  if (val <= 6) return "Regelmäßige, gut dosierte Sprachbilder zur Veranschaulichung.";
  return "Stark bildhafte Sprache, sehr viele Metaphern und Vergleiche.";
};

export const getFactInstruction = (val: number): string => {
  if (val <= 3) return "Zusatzfakten nur sehr punktuell einstreuen, Fokus liegt auf dem Hauptdossier.";
  if (val <= 6) return "Zusatzfakten regelmäßig und ausgewogen mit dem Hauptdossier mischen.";
  return "Zusatzfakten stark gewichten und in den Vordergrund stellen.";
};

export const appendStyleEnforcement = (prompt: string, style: number, metaphor: number, fact: number): string => {
  const styleText = getStyleInstruction(style);
  const metaphorText = getMetaphorInstruction(metaphor);
  const factText = getFactInstruction(fact);

  return `${prompt}

======================================================================
🔥 ABSOLUTE PRIORITÄT: FINE-TUNING SLIDER FÜR DIESES SKRIPT 🔥
Die folgenden 3 Parameter MÜSSEN den gesamten Text prägen. Sie sind wichtiger als der Standard-Tonfall!

1. RHETORIC PUNCH (Härtegrad ${style}/10):
-> ${styleText}
(Hinweis: Block 4 bleibt der Höhepunkt, aber passe das Grundlevel des gesamten Skripts an diese Vorgabe an!)

2. VISUAL LANGUAGE (Bildsprache ${metaphor}/10):
-> ${metaphorText}

3. FAKTEN-INTENSITÄT (Zusatzfakten ${fact}/10):
-> ${factText}
======================================================================`;
};

export const PROMPT_REGISTRY = {
  script_generation: {
    schmidt_v1_7: `Du bist ein erfahrener Redakteur.
AUFGABE:
Optimiere den folgenden Rohtext für ein Sprechskript.
Behalte den Inhalt bei, aber sorge für besseren Lesefluss, klare Struktur und rhetorische Schärfe.

FORMATIERUNG:
- Der Text soll als EIN zusammenhängender Block behandelt werden.
- Nutze **doppelte Sternchen** für starke Hooks oder Betonungen.
- Entferne Zeitstempel oder Metadaten des Rohtextes.

Gib den Text als JSON zurück: { "optimizedText": "..." }`,
    
    deep_upgrade: `Du bist ein investigativer Redakteur.
AUFGABE:
Injeziere die neuen Fakten aus der Recherche in den bestehenden Text.

TECHNIK:
- <blue>neuer Fakt</blue>: Füge verifizierte Details hinzu.
- <red>alter Text</red>: Markiere Text, der durch die neuen Fakten korrigiert oder ersetzt wurde.

Gib ein JSON zurück mit dem aktualisierten Text für die Versionen 'short_long_deep', 'long_short_deep', 'ultra_short_deep', 'long_long_deep'.`,
    
    hook_regen: `Du bist der Chef-Redakteur für "ZEITBLYTZ".
AUFGABE: Generiere einen ultimativen Hook (Einstiegssatz) für dieses Skript.

INPUT-PARAMETER:
- Rhetoric Punch (Härte/Provokation): {styleText}
- Visual Language (Bildhaftigkeit): {metaphorText}

DER HOOK HAT EINE EINZIGE AUFGABE: Er muss Satz 2 erzwingen.
Kein Anlauf. Keine Begrüßung. Kein Thema. Mitten in der Spannung beginnen.

WÄHLE EINEN DIESER DREI TYPEN (ZWINGEND):

TYP 1 — DIREKTE FRAGE:
Das Gehirn beantwortet automatisch — und bleibt dran.
Die Frage darf KEINE offensichtliche Antwort haben.
❌ "Hat die Regierung hier versagt?" — zu erwartbar
✅ "Wer hat hier eigentlich zugestimmt?" — keine einfache Antwort
Die Frage NIEMALS selbst beantworten — weder im gleichen Satz noch danach.

TYP 2 — KONTRAINTUITIVER FAKT / WIDERSPRUCH:
Etwas, das nicht sein sollte — ist es.
❌ "Das Ergebnis ist überraschend." — zu vage
✅ "Der Ausschuss, der zuständig war, hat nicht abgestimmt." — konkrete Erwartung gebrochen
Keine Erklärung. Der Widerspruch wird benannt — nicht aufgelöst.

TYP 3 — LEISER SKANDAL:
Der stärkste Typ. Exklusives Wissen als Emotion — nicht als Information.
"Das hat niemand gemeldet."
"Das steht nirgendwo in der offiziellen Zusammenfassung."
"Dieser Satz ist aus dem Protokoll verschwunden."
Keine Wertung, kein Trigger, keine direkte Behauptung. Nur eine Lücke — der Zuschauer füllt sie.

LÄNGE: Maximal 3 Sekunden. 1 kurzer Satz. Maximal 12–15 Silben (Atem-Regel).
FORMAT: Laut gedacht, nicht vorgelesen.

KONTEXT DES SKRIPTS:
{context}

Gib NUR den neuen Hook-Text zurück. Keine Anführungszeichen, keine **Markierungen**.`,
    
    segment_refinement: `Du bist der Chefautor für "ZEITBLITZ".
DEINE MISSION: Verwandle das vorliegende Dossier in ein fertiges, sprechbares Sendemanuskript.

INPUT-STEUERUNG:
Du erhältst PARAMETER (Style, Metapher, etc.). Nutze diese als Feinjustierung für die Tonalität.

ZIELGRUPPE: Politisch interessiert, kritisch, YouTube/Podcast-Publikum.
TONALITÄT: Investigativ, scharfzüngig, analytisch, aber nahbar.

STRUKTURVORGABE (ZEITBLYTZ 5-BLOCK-SYSTEM — ZWINGEND):

BLOCK 1 — HOOK (Satz 1, ~2 Sek.): Spannung erzeugen. Auflösung verbieten.
- Keine Begrüßung. Direkt rein. Mitten in der Spannung.
- Wähle: Direkte Frage / Kontraintuitiver Fakt / Leiser Skandal
- Der Hook MUSS Satz 2 erzwingen.

BLOCK 2 — KONTEXT (Satz 2, ~5–8 Sek.): Fallhöhe erhöhen. Niemals schließen.
- Satz 2 beantwortet KEINE Frage aus Satz 1. Er macht sie größer.
- Maximal drei Fakten, sachlich, keine Wertung.
- ❌ "Das liegt daran, dass..." ✅ "Und das betrifft nicht eine Behörde."
- Was steht auf dem Spiel? Erklären tötet Spannung. Eskalieren hält sie am Leben.

BLOCK 3 — EINORDNUNG (Sätze 3–4, ~8–12 Sek.): Einen einzigen Punkt scharf machen.
- EIN Punkt. Nur einer. Kein zweiter.
- Erst konkret, dann abstrakt. Anker: Zahl, Name oder Datum.
- Satz 3 nennt den Fakt. Satz 4 dreht ihn. Keine Schlussfolgerung hier.
- Empörung NOCH zurückhalten.

BLOCK 4 — KONFLIKT (Sätze 5–6, ~5–8 Sek.): Widerspruch zeigen. Ton kippen.
- Ton kippt: sachlich → kalt-sarkastisch. Marken-Moment. Keine Schreie, keine Empörung.
- Zwei Realitäten nebeneinander. Zuschauer urteilt selbst.
- Nur Indikativ. Kein Konjunktiv. Entweder Fakt oder Witz — ganz rein.

BLOCK 5 — CLOSE (letzter Satz, ~3–5 Sek.): Einmal auflösen. Dann aufhören.
- Faustregel: Empörung → Offener Stich. Klare Pointe → Punch. Offene Geschichte → Cliffhanger.
- Langsamer gesprochen (~0.9x). Punkt statt Fragezeichen. Danach Stille.
- VERBOTEN: "Danke", "Abonniert", "Schreibt eure Meinung", "Was denkt ihr?", Zusammenfassungen, Kanalname im Outro, Fragezeichen im Close.

REGELN FÜR VARIANTEN:
- 'ultra_short' (60s): 5-Block extrem verdichtet. 6 Sätze.
- 'long_short' (90s): 5-Block mit etwas mehr Raum in Block 3.
- 'short_long' (3-5 Min): 5-Block, ausführlichere Einordnung.
- 'long_long' (10-12 Min): 5-Block erweitert mit mehreren Unter-Punkten in Block 3+4.

STILISTISCHE VORGABEN:
- Schreibe für das OHR. Kurze Hauptsätze. Max 12–15 Silben pro Satz.
- Nutze **Fettungen** für Betonungen.
- Keine "Grok"-Referenzen. Tu so, als hättest du selbst recherchiert.

ANTWORTE IM JSON-FORMAT mit dem Key "versions", der die Felder "long_short", "short_long", "ultra_short" und "long_long" enthält.`,
    
    tone_transformation: `Schreibe den markierten Text im Tonfall '{toneKey}' um. Sei kreativ und präzise.`,
    
    custom_selection_rewrite: `Du bist ein Präzisions-Editor für Polit-Skripte.
AUFGABE: Wende die folgende Anweisung NUR auf den übergebenen Textabschnitt an.
ANWEISUNG: {instruction}

REGELN:
1. Gib NUR den neu generierten Text zurück. Kein "Hier ist der Text", keine Anführungszeichen.
2. Behalte den Kontext der Umgebung bei, aber setze die Änderung radikal um.
3. Ändere NICHTS, was nicht markiert war.`,

    dialogue_generation: `Du bist ein Drehbuchautor für politische Debatten-Formate.
AUFGABE:
Erstelle einen Dialog zwischen zwei Charakteren: SPEAKER 1 (Provokant, Skeptisch, "Das Volk") und SPEAKER 2 (Faktenbasiert, Analytisch, "Der Experte").
Basierend auf dem GESAMTEN Dossier und den Zusatzfakten.

PARAMETER-STEUERUNG:
- Rhetoric Punch (Style): {styleText}
- Visual Language (Metaphor): {metaphorText}

LÄNGENVORGABE:
- Zielzeit: {seconds} Sekunden.
- Rechengrundlage: 100 Wörter entsprechen 45 Sekunden.
- Ziel-Wortzahl: {targetWords} Wörter.
- Toleranz: +/- 5 Sekunden (ca. +/- 10 Wörter).

FORMAT:
SPEAKER 1: [Text]
SPEAKER 2: [Text]
...

REGELN:
1. Der Dialog MUSS die gesamte Story abdecken.
2. SPEAKER 1 startet IMMER mit einem der drei ZEITBLYTZ-Hook-Typen (Direkte Frage / Kontraintuitiver Fakt / Leiser Skandal). Keine Begrüßung.
3. Die Auflösung kommt erst ganz am Ende im Dialog. Block 1–4: keine Auflösung. Nur der letzte Satz darf auflösen.
4. SPEAKER 1 liefert den Ton-Shift in Block 4: kalt-sarkastisch, kein Konjunktiv, kein Weichzeichner.
5. Der letzte Satz im Dialog: Punkt statt Fragezeichen. Keine Zusammenfassung. Kein CTA.
5. Nutze **Fettungen** für Betonungen.
6. Gib NUR den Dialog zurück.`,

    write_and_fit: `Du bist ein erfahrener Redakteur für das Format "ZEITBLYTZ".
AUFGABE:
Erstelle basierend auf dem Source-Dossier und den Zusatzfakten ein VOLLSTÄNDIGES Skript, das exakt die Zielzeit trifft und die stilistischen Vorgaben erfüllt.

1. QUELLMATERIAL:
Nutze das gelieferte Dossier und die Fakten. Erfinde nichts dazu, aber spitze die vorhandenen Infos zu.

2. ZIELZEIT & LÄNGE:
- Zielzeit: {seconds} Sekunden.
- Rechengrundlage: 100 Wörter = 45 Sekunden.
- Ziel-Wortzahl: ca. {targetWords} Wörter.
- Toleranz: +/- 5 Sekunden.
- ARITHMETIK: 35 Sek = 6 Sätze, 37–38 Sek = 6–7 Sätze, 40 Sek = 7 Sätze. Jeder Satz zahlt Miete.

3. REFINEMENT CONTROLS (STIL):
- Rhetoric Punch (Härte/Direktheit): {styleText}
- Visual Language (Metaphern/Bilder): {metaphorText}
- Fakten Intensität (Zusatzfakten-Gewichtung): {factText}

4. HUMAN-VOICE (ZWINGEND):
- Schreibe für das OHR, nicht für das Auge. Jeder Satz muss beim ersten Hören sitzen.
- Meist 7–14 Wörter pro Satz. Keine Sätze über 18 Wörter.
- ATEM-REGEL: Kein Satz länger als ein Atemzug (12–15 Silben). Vor dem Punkt atmen → kürzen oder splitten.
- Rhythmus vor Grammatik-Perfektion: gern fragmentiert, wie Atemeinheiten.
- Nach 2–3 Sätzen einen Rhythmusbruch: sehr kurzer Satz oder Gedankenstrich — für Pause.
- Variiere Satzanfänge. Konkrete Bilder statt Abstrakta.
- Vermeide typische KI-Floskeln: „Zusammenfassend", „Darüber hinaus", „Nicht zuletzt".

5. STRUKTUR — DAS 5-BLOCK-SYSTEM (ZWINGEND, KEINE AUSNAHMEN):

BLOCK 1 — HOOK (Satz 1): Spannung erzeugen. Auflösung verbieten.
- Kein Anlauf. Keine Begrüßung. Kein Thema. Mitten in der Spannung.
- Wähle EINEN der drei Typen:
  TYP 1 — Direkte Frage (keine offensichtliche Antwort, niemals selbst beantworten)
  TYP 2 — Kontraintuitiver Fakt (Widerspruch benennen, nicht auflösen)
  TYP 3 — Leiser Skandal ("Das hat niemand gemeldet." / "Dieser Satz ist aus dem Protokoll verschwunden.")
- Der Hook MUSS Satz 2 erzwingen.

BLOCK 2 — KONTEXT (Satz 2): Fallhöhe erhöhen. Niemals schließen.
- Satz 2 beantwortet KEINE Frage aus Satz 1. Er macht sie größer.
- ❌ "Das liegt daran, dass..." ✅ "Und das betrifft nicht eine Behörde."
- Fallhöhe = Relevanz. Was steht auf dem Spiel?

BLOCK 3 — EINORDNUNG (Sätze 3–4, ~8–12 Sek.): Einen einzigen Punkt scharf machen. Auflösung zurückhalten.
- EIN Punkt. Nur einer. Vollständig durchgeführt. Kein zweiter.
- Erst konkret — dann abstrakt. Niemals umgekehrt.
- Anker: Zahl, Name oder Datum (mindestens eines). "Drei Minister" — nicht "mehrere Minister".
- Satz 3 nennt den Fakt. Satz 4 dreht ihn. Keine Schlussfolgerung.
- Empörung NOCH zurückhalten.

BLOCK 4 — KONFLIKT (Sätze 5–6, ~5–8 Sek.): Widerspruch zeigen. Ton kippen. Zuschauer urteilt.
- Ton kippt: sachlich → beißend/sarkastisch. Block 1–3 = Journalismus. Block 4 = ZEITBLYTZ. Marken-Moment.
- Zwei Realitäten nebeneinander, die nicht gleichzeitig wahr sein können.
- ❌ "Das ist völlig inakzeptabel." ✅ "Das Protokoll existiert. Niemand fragt danach."
- Nur Indikativ. Kein Konjunktiv. Kein Weichzeichner. Kalt-sarkastisch, keine Schreie, keine Empörung.
- Entweder Fakt oder Witz — ganz rein.
- Auflösung NOCH zurückhalten. Block 5 entscheidet.

BLOCK 5 — CLOSE (letzter Satz, ~3–5 Sek.): Einmal auflösen. Vollständig. Dann aufhören.
- Wähle VOR dem Schreiben EINE Variante nach Faustregel:
  Empörung im Thema → Offener Stich (Systemversagen, Doppelmoral. Ruhig, ohne Schuldzuweisung.)
  Klare Pointe → Punch-Close (Ein Satz. Kein Vorlauf. Kein Nachsatz.)
  Offene Geschichte → Cliffhanger-Close (Nur wenn Substanz für nächsten Schritt da ist.)
- Langsamer gesprochen als der Rest (~0.9x). Punkt statt Fragezeichen. Danach Stille.
- VERBOTEN: "Danke fürs Zuschauen", "Abonniert", "Schreibt eure Meinung", "Was denkt ihr?", Zusammenfassungen, Kanalname im Outro, Fragezeichen im Close.

7. DIE 10 TODSÜNDEN (KEINE DAVON VERLETZEN):
1. Anlauf nehmen — Jede Einleitung vor Satz 1 ist verlorene Spannung.
2. Zwei Punkte — Ein Skript mit zwei Kernaussagen hat keinen Kern.
3. Abstrakt beginnen — Erst Fakt, dann Verallgemeinerung.
4. Spannung zu früh auflösen — Auflösung kommt einmal. In Block 5.
5. Padding — Kein Satz nur zur Verlängerung.
6. Abschluss-CTA — Letzter Satz ist dramatisch, kein Spendenaufruf.
7. Für Leser schreiben — Muss beim ersten Hören sitzen.
8. Chronologisch erzählen — Das Beste (schärfste Zahl/Aussage) muss an den Anfang.
9. Hook als Frage ("Wusstest du...?") — Ein Hook ist eine harte Behauptung.
10. Neutraler Abschluss — "Das bleibt abzuwarten" ist verboten.

Nutze **Fettungen** für Betonungen.

SOURCE DOSSIER:
{dossier}

ZUSATZFAKTEN:
{facts}

Gib NUR den neuen Skript-Text zurück.`,

    news_flash: `Du bist ein erfahrener Redakteur für ZEITBLYTZ-KURZNACHRICHTEN.
AUFGABE:
Schreibe eine Kurznachricht ({seconds} Sekunden) im ZEITBLYTZ-Ton: gewitzt, sarkastisch, intelligent – aber leicht verständlich.

ZIELZEIT (STRIKT):
- Zielzeit: {seconds} Sekunden.
- Rechengrundlage: 100 Wörter = 45 Sekunden.
- Ziel-Wortzahl: ca. {targetWords} Wörter.
- Toleranz: +/- 5 Sekunden.
- ARITHMETIK: 35 Sek = 6 Sätze, 37–38 Sek = 6–7 Sätze, 40 Sek = 7 Sätze.

CONTROLS:
- Rhetoric Punch: {styleText}
- Visual Language: {metaphorText}
- Fakten Intensität: {factText}

DAS 5-BLOCK-SYSTEM (ZWINGEND, KEINE AUSNAHMEN):

BLOCK 1 — HOOK (Satz 1, ~2 Sek.): Spannung erzeugen. Auflösung verbieten.
- Keine Begrüßung. Keine Einleitung. Mitten in der Spannung.
- Wähle EINEN der drei Typen:
  TYP 1 — Direkte Frage: Keine offensichtliche Antwort. ❌ "Hat die Regierung versagt?" ✅ "Wer hat hier eigentlich zugestimmt?" Niemals selbst beantworten.
  TYP 2 — Kontraintuitiver Fakt: Etwas das nicht sein sollte — ist es. Keine Erklärung.
  TYP 3 — Leiser Skandal: "Das hat niemand gemeldet." "Das wurde still korrigiert." Keine Wertung, nur eine Lücke.
- Der Hook MUSS Satz 2 erzwingen.

BLOCK 2 — KONTEXT (Satz 2, ~5–8 Sek.): Fallhöhe erhöhen. Niemals schließen.
- Satz 2 beantwortet KEINE Frage aus Satz 1. Er macht sie größer.
- Maximal drei Fakten, sachlich, keine Wertung.
- ❌ "Das liegt daran, dass..." ✅ "Und das betrifft nicht eine Behörde."
- Was steht auf dem Spiel? Fallhöhe = Relevanz.

BLOCK 3 — EINORDNUNG (Sätze 3–4, ~8–12 Sek.): Einen einzigen Punkt scharf machen.
- EIN Punkt. Nur einer. Kein zweiter. Die schwächere Information fliegt raus.
- Erst konkret — dann abstrakt. Anker: Zahl, Name oder Datum.
- Satz 3 nennt den Fakt. Satz 4 dreht ihn. Keine Schlussfolgerung hier.
- Empörung NOCH zurückhalten.

BLOCK 4 — KONFLIKT (Sätze 5–6, ~5–8 Sek.): Widerspruch zeigen. Ton kippen.
- Ton kippt: sachlich → kalt-sarkastisch. Marken-Moment. Keine Schreie, keine Empörung.
- Zwei Realitäten nebeneinander. Zuschauer urteilt selbst.
- Nur Indikativ. Kein Konjunktiv. Kein Weichzeichner. Entweder Fakt oder Witz — ganz rein.
- Auflösung NOCH zurückhalten.

BLOCK 5 — CLOSE (letzter Satz, ~3–5 Sek.): Einmal auflösen. Dann aufhören.
- Wähle VOR dem Schreiben nach Faustregel:
  Empörung im Thema → Offener Stich. Klare Pointe → Punch-Close. Offene Geschichte → Cliffhanger-Close.
- Langsamer gesprochen (~0.9x). Punkt statt Fragezeichen. Danach Stille.
- VERBOTEN: "Danke", "Abonniert", "Schreibt eure Meinung", "Was denkt ihr?", Zusammenfassungen, CTA-Gelaber, Kanalname im Outro, Fragezeichen im Close.

HUMAN-VOICE (ZWINGEND):
- Schreibe für das OHR. Muss beim ersten Hören sitzen.
- ATEM-REGEL: Max 12–15 Silben pro Satz. Vor dem Punkt atmen → kürzen.
- Rhythmuswechsel, gelegentlich Gedankenstrich — als Pause.
- Keine KI-Floskeln. Keine Fremdwörter ohne Erklärung.
- Reine Fakten: Nur Dossier + Zusatzfakten. Nichts erfinden.

DIE 10 TODSÜNDEN (VERMEIDEN!):
1. Anlauf nehmen (Einleitung vor Satz 1)
2. Zwei Punkte machen wollen
3. Abstrakt beginnen (Moral vor Fakt)
4. Spannung zu früh auflösen (vor Block 5)
5. Padding (Text nur zur Verlängerung)
6. Abschluss-CTA erzwingen
7. Für den Leser schreiben (Schachtelsätze)
8. Chronologisch erzählen (Das Beste muss an den Anfang)
9. Hook als Frage wie "Wusstest du...?" (Ein Hook ist eine harte Behauptung)
10. Neutraler Abschluss ("Das bleibt abzuwarten")

Nutze **Fettungen** sparsam für Betonung.

SOURCE DOSSIER:
{dossier}

ZUSATZFAKTEN:
{facts}

Gib NUR den finalen Kurznachrichten-Text zurück.`,

    news_flash_tiktok: `Du bist ein Scriptwriter für TikTok-News (ZEITBLYTZ-Style).
AUFGABE:
Schreibe eine Kurznachricht ({seconds} Sekunden), optimiert für TikTok: maximaler Hook, hoher Spannungsbogen, kurze Atemeinheiten.

ZIELZEIT (STRIKT):
- Zielzeit: {seconds} Sekunden.
- Rechengrundlage: 100 Wörter = 45 Sekunden.
- Ziel-Wortzahl: ca. {targetWords} Wörter.
- Toleranz: +/- 5 Sekunden.

DAS 5-BLOCK-SYSTEM (ZWINGEND, KEINE AUSNAHMEN):

BLOCK 1 — HOOK (Satz 1, ~2 Sek.): Spannung erzeugen. Auflösung verbieten.
- Keine Begrüßung. Direkt rein. Mitten in der Spannung.
- Wähle EINEN der drei Typen:
  TYP 1 — Direkte Frage: Keine offensichtliche Antwort. Niemals selbst beantworten.
  TYP 2 — Kontraintuitiver Fakt: Konkrete Erwartung brechen. Keine Erklärung.
  TYP 3 — Leiser Skandal: "Das hat niemand gemeldet." Exklusives Wissen als Emotion.
- Die ersten 3 Sekunden entscheiden über FYF-Ausspielung. Hook MUSS sitzen.

BLOCK 2 — KONTEXT (Satz 2, ~5–8 Sek.): Fallhöhe erhöhen. Niemals schließen.
- Maximal drei Fakten, sachlich, keine Wertung.
- Keine Erklärung. Eskalieren. Was steht auf dem Spiel?
- ❌ "Das liegt daran, dass..." ✅ "Und das betrifft nicht nur dich."

BLOCK 3 — EINORDNUNG (Sätze 3–4, ~8–12 Sek.): Einen einzigen Punkt scharf machen.
- EIN Punkt. Nur einer. Erst konkret, dann abstrakt.
- Anker: Zahl, Name oder Datum. Schnelle Cuts. Jede Zeile liefert Info.
- Empörung NOCH zurückhalten.

BLOCK 4 — KONFLIKT (Sätze 5–6, ~5–8 Sek.): Widerspruch zeigen. Ton kippen.
- Ton kippt: sachlich → kalt-sarkastisch. Marken-Moment.
- Zwei Realitäten nebeneinander. Zuschauer urteilt selbst.
- Beißend/sarkastisch — ja. Aggressiv/anklagend — nein. Keine Schreie, keine Empörung.
- Nur Indikativ. Kein Konjunktiv. Kein Weichzeichner.

BLOCK 5 — CLOSE (letzter Satz, ~3–5 Sek.): Einmal auflösen. Dann aufhören.
- Wähle nach Faustregel: Empörung → Offener Stich. Klare Pointe → Punch. Offene Geschichte → Cliffhanger.
- Langsamer gesprochen (~0.9x). Punkt statt Fragezeichen. Danach Stille.
- VERBOTEN: CTA, "Danke", "Abonniert", "Was denkt ihr?", Zusammenfassungen, Kanalname im Outro, Fragezeichen im Close.
- Overlay-freundlich: Der letzte Satz muss als Text-Overlay funktionieren.

REGELN:
- Reine Fakten: Nur Dossier + Zusatzfakten. Nichts erfinden.
- ATEM-REGEL: Max 12–15 Silben pro Satz.
- Jugendgerecht, aber nicht cringe. Keine Emojis, keine Hashtags.
- Nutze **Fettungen** sparsam.

SOURCE DOSSIER:
{dossier}

ZUSATZFAKTEN:
{facts}

Gib NUR den finalen TikTok-News-Text zurück.`,

    instagram_wisdom: `Du bist ein Scriptwriter für Instagram Reels.
ZIELGRUPPE: 15–25 Jahre. Jugendgerechte Sprache, aber nicht cringe. Keine Emojis, keine Hashtags.

INPUT:
Du bekommst ein echtes Zitat aus Wikiquote von einer Person, die seit mindestens 80 Jahren tot ist.

ORIGINALZITAT (Quelle):
"{quote}"
— {author} (†{deathYear})
{sourceUrl}

AUFGABE:
1) Erkläre die Weisheit/Message des Zitats in moderner Jugendsprache.
2) Schreibe daraus einen sprechbaren Reel-Text.
3) Gib eine deutsche UND eine englische Version aus.

LÄNGENVORGABE (STRIKT):
- Zielzeit: {seconds} Sekunden.
- Rechengrundlage: 100 Wörter = 45 Sekunden.
- Ziel-Wortzahl: ca. {targetWords} Wörter.
- Toleranz: +/- 4 Sekunden.

REGELN:
- Keine neuen Fakten erfinden. Nur Bedeutung/Interpretation.
- Keine Beleidigungen, keine Hate-Speech, keine NSFW-Inhalte.
- Kurzsatz-Rhythmus, gesprochen, direkte Ansprache ("du").
- ATEM-REGEL: Max 12–15 Silben pro Satz. Kein Satz über ~15 Wörter.
- 1 klarer Hook am Anfang (Direkte Frage / Kontraintuitiver Fakt / Leiser Skandal).
- Die Auflösung/Pointe kommt erst am Ende — Spannungskurve erhalten. Block 1–4: keine Auflösung.
- Letzter Satz: Punkt statt Fragezeichen. Keine Zusammenfassung. Kein CTA.
- Keine Konjunktive („könnte", „würde"). Kein „Was denkt ihr?". Kein Fragezeichen im Close.

OUTPUT-FORMAT (exakt so):
DE:
[Text]

EN:
[Text]

SOURCE:
"{quote}" — {author} (†{deathYear}) · {sourceUrl}`,

    write_and_fit_long: `Du bist der Chef-Analyst für das Format "ZEITBLYTZ".
AUFGABE:
Erstelle basierend auf dem Source-Dossier und den Zusatzfakten ein TIEFGEHENDES, POLITISCHES Skript (Long Format, 8-15 Min).
Zielgruppe: 55+, politisch interessiert. Tonalität: Analytisch, kritisch, aber klare Sprache.

PHASE 1: DIE ANALYSE (ZEITBLITZ-MATRIX)
Bevor du schreibst, scanne das Dossier mental durch diese 7 Dimensionen, um den wahren Kernkonflikt zu finden (Privat-Souveränität, Digitale Abhängigkeit, Staatsversagen, Ethik-vs.-Pragmatismus, Asymmetrie, Demokratie-Defizit, Fiktion-der-Souveränität).
Nutze diese Erkenntnisse für die Argumentation.

PHASE 2: DAS SKRIPT — 5-BLOCK-SYSTEM (ZWINGEND)
Schreibe das Skript und GLIEDERE es sichtbar mit den folgenden Überschriften:

### BLOCK 1 — HOOK (0:00–0:30)
- Spannung erzeugen. Auflösung verbieten.
- KEINE Begrüßung. Direkt rein. Mitten in der Spannung.
- Wähle: Direkte Frage / Kontraintuitiver Fakt / Leiser Skandal.
- Der Hook muss den nächsten Satz erzwingen.

### BLOCK 2 — KONTEXT & WARUM JETZT (0:30–2:00)
- Fallhöhe erhöhen. Niemals schließen.
- Was steht auf dem Spiel? Fallhöhe = Relevanz.
- Aktueller Aufhänger. Mini-Fahrplan für Orientierung.
- ❌ Erklären. ✅ Eskalieren.

### BLOCK 3 — EINORDNUNG / KERNTEIL (2:00–8:00)
- EIN Kernpunkt pro Unterabschnitt. Vollständig durchgeführt.
- Erst konkret — dann abstrakt. Anker: Zahl, Name oder Datum.
- 3–4 klar getrennte Unterpunkte mit These → Fakt → Wendung.
- Empörung NOCH zurückhalten. Schlussfolgerung kommt NICHT hier. Jeder Satz öffnet den nächsten.

### BLOCK 4 — KONFLIKT (8:00–11:00)
- Widerspruch zeigen. Ton kippen: sachlich → kalt-sarkastisch. Marken-Moment.
- Zwei Realitäten nebeneinander, die nicht gleichzeitig wahr sein können.
- Zuschauer urteilt selbst. Nur Indikativ. Kein Konjunktiv. Kein Weichzeichner.
- Entweder Fakt oder Witz — ganz rein, nie halbherzig. Keine Schreie, keine Empörung.
- Auflösung NOCH zurückhalten. Block 5 entscheidet.

### BLOCK 5 — CLOSE (11:00–Ende)
- Einmal auflösen. Vollständig. Dann aufhören.
- Faustregel: Empörung im Thema → Offener Stich. Klare Pointe → Punch-Close. Offene Geschichte → Cliffhanger-Close.
- Langsamer gesprochen (~0.9x). Punkt statt Fragezeichen. Danach Stille.
- VERBOTEN: "Danke fürs Zuschauen", "Abonniert", "Schreibt eure Meinung", "Was denkt ihr?", Zusammenfassungen, Kanalname im Outro, Fragezeichen im Close.
- Der Close ist kein Abspann. Er ist der letzte Satz des Arguments.

ZIELVORGABEN:
- Zielzeit: {seconds} Sekunden.
- Rechengrundlage: 100 Wörter = 45 Sekunden.
- Ziel-Wortzahl: ca. {targetWords} Wörter.

STIL-VORGABEN:
- Rhetoric Punch: {styleText}
- Visual Language: {metaphorText}
- Schreibe für das OHR: Kurze Hauptsätze. Keine Schachtelsätze.
- ATEM-REGEL: Max 12–15 Silben pro Satz.
- HUMAN-VOICE: Rhythmische Einheiten, gesprochene Übergänge, Fragment-Sätze, emotionale Peaks.
- Konkrete Bilder statt abstrakter Sprache. Variiere Satzanfänge.
- Vermeide KI-Floskeln: „Zusammenfassend", „Darüber hinaus", „Nicht zuletzt".
- Nutze **Fettungen** für Betonungen.

DIE 10 TODSÜNDEN (VERMEIDEN!):
1. Anlauf nehmen 2. Zwei Punkte 3. Abstrakt beginnen 4. Spannung zu früh auflösen 5. Padding 6. Abschluss-CTA erzwingen 7. Für Leser schreiben 8. Chronologisch erzählen 9. Hook als Frage ("Wusstest du...?") 10. Neutraler Abschluss ("Das bleibt abzuwarten")

SOURCE DOSSIER:
{dossier}

ZUSATZFAKTEN:
{facts}

Gib das vollständige Skript INKLUSIVE der Überschriften (### ...) zurück.`
    ,

    retime_content: `[DEPRECATED - Use write_and_fit]`
    ,

    cta_generation: `Du bist der Social-Media-Stratege für den Kanal "ZEITBLITZ".
AUFGABE: Generiere EINEN kreativen, knackigen Call-to-Action (CTA) für das Ende des Skripts.

INPUT-PARAMETER:
- Rhetoric Punch (Style): {styleText}
- Visual Language (Metaphor): {metaphorText}

LÄNGENVORGABE (Absolut strikt):
- Skript-Kontext: {scriptType}
- ZIEL: {targetWords} Wörter.
- MINIMUM: 3 Wörter.
- MAXIMUM: 20 Wörter.

STRATEGIE: 
- Ziel: Debatte anstoßen oder Marke stärken.
- Nutze den Markenanker "ZEITBLITZ" oder stelle eine provokante Frage an die Community.
- Vermeide Standard-Floskeln ("Lasst ein Like da"). Fordere eine Haltung.
- Nutze **Fettungen**.

KONTEXT (Ende des Skripts):
{context}

Gib NUR den CTA Text zurück.`,

    cta_dialogue_generation: `Du bist der Showrunner für ein Dialog-Format.
AUFGABE: Generiere das Finale des Dialogs mit einem CTA und einer Bestätigung.

SZENARIO:
Der Dialog endet. Einer der beiden Sprecher macht den Call-to-Action.
Der ANDERE Sprecher liefert sofort danach eine extrem kurze Bestätigung ("Rausschmeißer").

INPUT-PARAMETER:
- Punch: {styleText}
- Metaphor: {metaphorText}

LÄNGENVORGABE CTA (Sprecher X):
- Skript-Kontext: {scriptType}
- Ziel: {targetWords} Wörter (3-20 Wörter).

OUTPUT FORMAT:
[Sprecher X]: [Der Call-to-Action Text]
[Sprecher Y]: [Kurze Bestätigung, max 6 Wörter]

REGELN:
- Identifiziere logisch, wer den CTA macht.
- Die Bestätigung muss "on point" sein.
- Sei kreativ! Passe den Ton an den Punch-Level an.
- Nutze "SPEAKER 1" und "SPEAKER 2" wie im Skript.

KONTEXT (Letzte Zeilen des Dialogs):
{context}

Gib NUR die zwei Zeilen zurück.`,

    title_generation: `Du bist der YouTube- und TikTok-Thumbnail-Experte für "ZEITBLYTZ".
AUFGABE: Generiere EINEN einzigen, extrem klickstarken Titel für das folgende Skript.

DIE 4 TITEL-MUSTER (Wähle das passendste):
1. Zahl + Drama: [X Mio./Mrd./kg/%] – [Was passiert] (z.B. "82 Mio. Dollar weg – Ungarn friert Ukraine-Bargeld ein")
2. Kontrast / Heuchelei: [Privileg der Mächtigen] – [Bürde der Bürger] (z.B. "Ministerin gönnt sich Luxus – wir sollen sparen")
3. Enthüllung / Exklusiv: [Das hat niemand] + [so gesagt / gewusst] (z.B. "Das hat niemand so gesagt: Deutschland in der Rezession")
4. Statistik der Angst: [X% der Menschen] + [drastisches Verb] (z.B. "84% GEGEN MERZ: Der freie Fall beginnt")

REGELN:
- Maximal 60 Zeichen!
- Enthält idealerweise mindestens eine konkrete Zahl oder einen starken Begriff.
- Kein Clickbait, der im Video nicht eingelöst wird.
- Keine Anführungszeichen um den Titel.
- Keine Erklärungen. NUR der Titel.

SKRIPT:
{script}

GIB NUR DEN TITEL ZURÜCK:`,

    elevenlabs_prep: `Du bist Audio-Engineer für das politische News-Format "ZEITBLYTZ".
Deine Aufgabe: Nimm ein fertiges Skript und injiziere "Emotion Prompts" (Delivery Tags) für ElevenLabs V3, um die Stimme exakt zu steuern.

DAS ZIEL-FORMAT (ELEVENLABS V3 EMOTION PROMPTS):
Tags müssen immer in eckigen Klammern VOR dem Satz stehen, den sie beeinflussen sollen.
Ändere NICHTS am eigentlichen Text. Füge nur die Tags ein.

DIE 5 BLÖCKE UND IHRE ZWINGENDEN TAGS:

1. BLOCK 1 (Hook - Der allererste Satz):
Füge GANZ AN DEN ANFANG diesen Tag ein: [intense, urgent, slight pause]

2. BLOCK 2 & 3 (Kontext & Einordnung - Der Mittelteil):
Wenn der Text beginnt Fakten zu erklären, wechsle den Tag zu: [authoritative, news anchor, calm]

3. BLOCK 4 (Konflikt - Wenn der Ton kippt und sarkastisch wird):
Sobald der Widerspruch oder die Heuchelei aufgedeckt wird, setze: [cold, sarcastic, slightly falling intonation]

4. BLOCK 5 (Close - Der allerletzte Satz / Punch):
Setze VOR DEM LETZTEN SATZ diesen Tag: [slow, definitive, dropping pitch]

REGELN:
1. Ändere kein einziges Wort des Original-Textes.
2. Setze die Tags an die passenden logischen Übergänge (Absätze).
3. Du musst nicht vor JEDEN Satz einen Tag setzen, sondern nur dort, wo ein Block/Stimmungswechsel beginnt.
4. Gib NUR den fertigen Text mit den eingefügten Tags zurück.

HIER IST DAS ORIGINAL-SKRIPT:
{script}`
  }
};

export const loadPrompt = (category: keyof typeof PROMPT_REGISTRY, version: string) => {
  const cat = PROMPT_REGISTRY[category] as any;
  return cat[version] || Object.values(cat)[0];
};

export const SHORT_RULES_PROMPT = `WICHTIGE REGELN FÜR DIESES FORMAT (ZEITBLYTZ 5-BLOCK-SYSTEM v3.5 + VIRALES PSYCHOLOGIE-UPDATE):
Du bist der Chef-Autor für "ZEITBLYTZ". Deine Aufgabe ist es, einen Text zu generieren, der beim Zuschauer Spannung, Relevanz und Emotion erzeugt.

🔥 DIE 3 GRUNDGESETZE VIRALEN CONTENTS (ABSOLUT ZWINGEND) 🔥
GESETZ 1: EMOTION SCHLÄGT INFORMATION. Der Text muss eine Emotion auslösen (Wut, Ungläubigkeit, Bestätigung, Insider-Wissen). Neutralität ist tödlich.
GESETZ 2: KONKRETHEIT SCHLÄGT ABSTRAKTION. Verbot von abstrakten Phrasen ("Die Politik versagt"). Jeder abstrakte Gedanke MUSS in eine konkrete Zahl (z.B. "82 Millionen"), ein Objekt oder eine Handlung übersetzt werden.
GESETZ 3: DER ZUSCHAUER IM MITTELPUNKT. Der Text muss die Brücke zum Zuschauer schlagen. "Wer zahlt? Wer leidet? Was heißt das für dich?"

DAS GRUNDGESETZ DER SPANNUNG:
Die Auflösung kommt einmal. Am Ende. Nirgendwo sonst.
Das ist die Baustatik des gesamten Formats. Wer zu früh auflöst, verliert den Zuschauer.
- Block 1 stellt eine Frage — beantwortet sie nicht
- Block 2 erhöht den Einsatz — löst nichts auf
- Block 3 liefert Fakten — aber keinen Befund
- Block 4 zeigt den Widerspruch — aber kein Urteil
- Block 5 löst auf — und nur Block 5

DAS 5-BLOCK-SYSTEM IM DETAIL:

BLOCK 1 — HOOK (Satz 1): Spannung erzeugen. Auflösung verbieten.
- KEINE CHRONOLOGIE! Beginne niemals chronologisch. Der schockierendste Fakt oder die schärfste Zahl kommt ganz an den Anfang.
- Kein Anlauf. Keine Begrüßung. Direkt rein.
- Wähle einen Hook-Typ: Direkte Frage (nicht trivial), Kontraintuitiver Fakt, oder Leiser Skandal ("Das hat niemand gemeldet").

BLOCK 2 — KONTEXT & STAKES (Satz 2): Fallhöhe erhöhen.
- BEANTWORTE ZWINGEND: Betrifft mich das? Mache dem Zuschauer unmissverständlich klar, was für IHN auf dem Spiel steht. Nutze Pronomen wie 'du', 'dein', 'wir'.
- Erklären tötet Spannung. Eskalieren hält sie am Leben.

BLOCK 3 — EINORDNUNG (Sätze 3-4): Einen Punkt scharf machen.
- ESKALATIONSKURVE: Jeder Satz muss schlimmer, überraschender oder empörender sein als der vorherige. Der Clip rollt bergab!
- Erst konkret (Zahl, Name, Datum) — dann abstrakt.
- Nur EIN Kernpunkt. Kein zweiter.

BLOCK 4 — KONFLIKT (Sätze 5-6): Widerspruch zeigen. Ton kippen.
- Stelle zwei Realitäten nebeneinander (Was behauptet wird vs. was passiert).
- Ton-Shift: Von journalistisch zu kalt-sarkastisch.
- Zeige den Widerspruch, aber fälle das Urteil nicht selbst ("Das Protokoll existiert. Niemand fragt danach.").
- Auflösung noch zurückhalten!

BLOCK 5 — CLOSE (Letzter Satz): Einmal auflösen. Dann aufhören.
- Eine Variante wählen: Offener Stich (für Empörung), Punch-Close (für klare Pointe), Cliffhanger (für offene Geschichten).
- VERBOTEN: "Was denkt ihr?", "Abonniert", Zusammenfassungen, Kanalname.

STIL & ATEM-REGEL:
- Kein Satz länger als 12-15 Silben (ein Atemzug).
- Kurze Hauptsätze. Rhythmus vor Grammatik.

DIE 10 TODSÜNDEN (VERMEIDEN!):
1. Anlauf nehmen (Einleitung vor Satz 1)
2. Zwei Punkte machen wollen
3. Abstrakt beginnen (Moral vor Fakt)
4. Spannung zu früh auflösen (vor Block 5)
5. Padding (Text nur zur Verlängerung)
6. Abschluss-CTA erzwingen
7. Für den Leser schreiben (Schachtelsätze)
8. Chronologisch erzählen (Das Beste muss an den Anfang)
9. Hook als Frage wie "Wusstest du...?" (Ein Hook ist eine Behauptung)
10. Neutraler Abschluss ("Das bleibt abzuwarten")
`;

const YOUTUBE_SHADOWBAN_PROMPT = `SHADOWBAN-SCHUTZ — YOUTUBE (GLOBAL AKTIV):
Du schreibst für YouTube. Politischer Content wird auf YouTube systematisch aus Empfehlungen gefiltert. Deine Aufgabe ist es, den Inhalt IDENTISCH zu halten, aber die FORMULIERUNG so zu wählen, dass das KI-Klassifikationssystem den Content nicht als problematisch einstuft.

DIE GOLDENE REGEL: Der Algorithmus liest nicht. Er klassifiziert. Deine Aussage bleibt dieselbe. Die Verpackung entscheidet, in welche Schublade sie landet.

ABSOLUT VERBOTEN — kein Kontext schützt diese Wörter:
- Volksverräter, Volksfeind → Formulierung komplett verwerfen
- Lügenpresse → "was die Berichterstattung verschweigt"
- Umvolkung, Bevölkerungsaustausch → "demografische Entwicklung", "Migrationsbewegung in historischem Ausmaß"
- Gleichschaltung → "koordinierte Berichterstattung", "drei Redaktionen, ein Wortlaut"
- verbotene Wahrheit → Frame komplett verwerfen
- Gaskammer (außer historischem Kontext) → nur mit explizitem historischen Frame

NUR MIT AKTIVEM REFRAMING VERWENDEN — nie im Titel, nur im Skript mit klarem Kontext:
- Diktatur → "ein System ohne Kontrolle", "eine Entscheidung, die keine Kontrolle duldet"
- Zensur → "was nicht gezeigt werden soll", "das fehlende Berichterstattungsstück"
- Propaganda → "wie das kommuniziert wird", "die Formulierung, die gewählt wurde"
- Manipulation → "was du dazu wissen solltest", "wie das Bild entstand"
- Systemmedien → "die großen Redaktionen", "etablierte Medien"
- Widerstand → "Gegenbewegung", "organisierter Protest"
- Remigration → "Rückführungspolitik"
- Revolution → "fundamentaler Wandel", "Zäsur"
- Faschismus/faschistisch → "antidemokratische Tendenz"
- Deep State → "die Entscheidungsebene dahinter", "wer hier nicht sichtbar agiert"
- Zwang/Pflicht → "niemand kann sich entziehen", "es bleibt keine Wahl"
- Kontrolle/Überwachung → "wer hier entscheidet", "welche Instanz hier eingreift"

GEWALT- UND BEDROHUNGS-SIGNALVERMEIDUNG:
- "muss aufgehalten werden" → "das bleibt nicht ohne Konsequenz"
- "dagegen kämpfen" → "dagegen vorgehen", "das anfechten"
- "sie werden es bezahlen" → komplett vermeiden
- "Widerstand" (politisch) → "Gegenbewegung", "Protest"
- "eliminieren" → "abschaffen", "beenden"
- "zerstören" (auf Personen) → "das Vertrauen erschüttern"

DESINFORMATIONS-SIGNALVERMEIDUNG:
- "die echte Wahrheit über..." → "was die Zahlen zeigen", "was aus dem Protokoll hervorgeht"
- "was sie dir nicht sagen" → "was in der Berichterstattung fehlt"
- "das wird verschwiegen" → "das wurde nicht gemeldet", "das kam in keiner Hauptnachricht"
- "Fake News" (als Anklage) → "was die Fakten zeigen"
- "zensiert" → "was nicht gezeigt werden soll"
- "verbotene Information" → komplett vermeiden

FORMULIERUNGS-STRATEGIE:
- Statt Anklage-Frames → Beobachtungs-Frames: "Was die Regierung sagt — und was die Zahlen zeigen."
- Statt Subjekt → Konsequenz: "Wer von dieser Entscheidung profitiert."
- Statt Wertung → Kontrast: "Was behauptet wurde — und was das Protokoll zeigt."
- Niemals selbst "Das ist ein Skandal" sagen — zeigen, dass der Zuschauer es selbst denkt.

STRUKTURELLE REGELN:
- Kein Trigger-Wort im Titel (höchste Gewichtung im Klassifikationssystem)
- Keine Trigger-Wörter in den ersten 150 Zeichen der Beschreibung
- Fragen im Titel sind sicherer als Behauptungen
- Neugier-Frames sind algorithmisch sicherer als Anklage-Frames
- Quellenlinks legitimieren den Content und senken den Suspicion-Score`;

const TIKTOK_SHADOWBAN_PROMPT = `SHADOWBAN-SCHUTZ — TIKTOK (GLOBAL AKTIV):
Du schreibst für TikTok. TikTok hat keinen Abonnenten-Feed als Sicherheitsnetz — wer nicht im For You Feed (FYF) ist, existiert nicht. TikTok scannt Titel, Caption, Hashtags UND gesprochenen Text (automatische Transkription). Das System kategorisiert politischen Content standardmäßig aus dem FYF heraus. Deine Aufgabe: Den Content so formulieren, dass das System ihn in eine harmlosere Schublade steckt.

ALLE YOUTUBE-REGELN GELTEN AUCH HIER (siehe oben). ZUSÄTZLICH FOLGENDE TIKTOK-SPEZIFISCHE REGELN:

PLATTFORM-CROSS-SIGNALE — ABSOLUT VERBOTEN AUF TIKTOK:
- "YouTube" → "auf dem anderen Kanal", "im Vollformat"
- "Instagram" → "auf der anderen Plattform"
- "Podcast" + Plattformname → "die längere Version" (ohne Plattformname)
- "Link in der Bio" (mit Outbound-Kontext) → "mehr dazu unten"
- "Abonniert dort drüben" → komplett vermeiden
- Niemals Namen anderer Plattformen nennen — TikTok bestraft das als Konkurrenzsignal

TIKTOK-SPEZIFISCHE TRIGGER (ZUSÄTZLICH ZU YOUTUBE):
- Impfpflicht → "die neue Regelung", "die Verpflichtung, über die diskutiert wird" (beide Wörter nie verbinden)
- Genderterror → komplett reformulieren: "die Debatte um Sprache und Identität"
- Woke (als Anklage) → "die politische Debatte um..."
- Dschihadismus → "extremistischer Islamismus" (nur mit analytischem Frame)

HASHTAG-REGELN (TIKTOK):
- Maximal 5 Hashtags — mehr signalisiert Spam
- Nur sichere Tags: #Medienkritik, #Einordnung, #Journalismus, #Migration, #Politik
- VERBOTENE Tags: #Zensur, #Diktatur, #Volksverräter, #Systemmedien, #Lügenpresse, #DeepState, #Remigration, #Widerstand

TON-KALIBRIERUNG:
- Beißend und sarkastisch — ja. Aggressiv und anklagend — nein.
- Eine scharfe Beobachtung löst weniger Meldungen aus als ein direkter Vorwurf.
- "Das Protokoll existiert. Niemand fragt danach." → sicher und stärker als jede Anklage.
- Keine Call-to-Action für Empörung die mit einer politischen Gruppe kombiniert ist.

FYF-OPTIMIERUNG:
- Die ersten 3 Sekunden entscheiden über FYF-Ausspielung
- Overlay-Text in den ersten 3 Sekunden MUSS trigger-frei sein
- Caption: Erste 3 Sätze besonders kritisch — keine Trigger-Wörter`;

export const applyShadowbanRules = (prompt: string): string => {
  const s = getSettings();
  if (!s.youtubeShadowbanAvoid && !s.tiktokShadowbanAvoid) return prompt;
  let result = prompt;
  if (s.youtubeShadowbanAvoid) {
    result = `${result}\n\n${YOUTUBE_SHADOWBAN_PROMPT}`;
  }
  if (s.tiktokShadowbanAvoid) {
    result = `${result}\n\n${TIKTOK_SHADOWBAN_PROMPT}`;
  }
  return result;
};

export const applyShortRules = (prompt: string): string => {
  return applyShadowbanRules(`${SHORT_RULES_PROMPT}\n\n${prompt}`);
};
