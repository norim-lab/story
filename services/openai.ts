import { PlatformSafetyCheck, SegmentControls } from "../types";
import { getOpenAIKey } from "./settings";
import { applyShortRules, loadPrompt, getStyleInstruction, getMetaphorInstruction, getFactInstruction, appendStyleEnforcement } from "./prompts";

function safeReplace(template: string, key: string, value: string): string {
    return template.split(key).join(value);
}

async function handleApiCall<T>(call: () => Promise<T>): Promise<T> {
    const key = getOpenAIKey();
    if (!key) {
        throw new Error("OpenAI API Key fehlt. Bitte in den Einstellungen hinterlegen.");
    }
    try { 
        return await call(); 
    } catch (err: any) { 
        console.error("OpenAI API Error:", err); 
        throw err; 
    }
}

export const generateScriptWithControls = async (dossier: string, facts: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        const seconds = controls.target_seconds || 60;
        const targetWords = Math.round((seconds / 45) * 100);
        const isLongFormat = seconds >= 480;

        let promptTemplate = isLongFormat 
            ? loadPrompt('script_generation', 'write_and_fit_long')
            : loadPrompt('script_generation', 'write_and_fit');
        
        promptTemplate = safeReplace(promptTemplate, '{seconds}', seconds.toString());
        promptTemplate = safeReplace(promptTemplate, '{targetWords}', targetWords.toString());
        promptTemplate = safeReplace(promptTemplate, '{styleText}', getStyleInstruction(controls.style));
        promptTemplate = safeReplace(promptTemplate, '{metaphorText}', getMetaphorInstruction(controls.metaphor));
        promptTemplate = safeReplace(promptTemplate, '{factText}', getFactInstruction(controls.fact_intensity));
        promptTemplate = safeReplace(promptTemplate, '{dossier}', dossier || "");
        promptTemplate = safeReplace(promptTemplate, '{facts}', facts || "");
        promptTemplate = applyShortRules(promptTemplate);
        promptTemplate = appendStyleEnforcement(promptTemplate, controls.style, controls.metaphor, controls.fact_intensity);
        const systemInstruction = applyShortRules("Du bist ein erfahrener Redakteur für das Format 'ZEITBLITZ'. Antworte nur mit dem Skript.");

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4096,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: promptTemplate }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content || "";
        
        if (!result) {
            throw new Error("Kein Text generiert. Die API hat eine leere Antwort zurückgegeben.");
        }

        return result;
    });
};

export const generateTitle = async (script: string, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        
        let promptTemplate = loadPrompt('script_generation', 'title_generation');
        promptTemplate = safeReplace(promptTemplate, '{script}', script);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 150,
                messages: [
                    { role: 'system', content: 'Du bist ein Experte für klickstarke YouTube-Titel.' },
                    { role: 'user', content: promptTemplate }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        let result = data.choices?.[0]?.message?.content?.trim() || "";
        result = result.replace(/^["']|["']$/g, '');
        return result;
    });
};

export const generateNewsFlash = async (dossier: string, facts: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        const seconds = Math.max(15, Math.min(50, controls.news_seconds || 30));
        const targetWords = Math.round((seconds / 45) * 100);

        const promptKey = controls.news_tiktok ? 'news_flash_tiktok' : 'news_flash';
        let promptTemplate = loadPrompt('script_generation', promptKey);
        promptTemplate = safeReplace(promptTemplate, '{seconds}', seconds.toString());
        promptTemplate = safeReplace(promptTemplate, '{targetWords}', targetWords.toString());
        promptTemplate = safeReplace(promptTemplate, '{styleText}', getStyleInstruction(controls.style));
        promptTemplate = safeReplace(promptTemplate, '{metaphorText}', getMetaphorInstruction(controls.metaphor));
        promptTemplate = safeReplace(promptTemplate, '{factText}', getFactInstruction(controls.fact_intensity));
        promptTemplate = safeReplace(promptTemplate, '{dossier}', dossier || "");
        promptTemplate = safeReplace(promptTemplate, '{facts}', facts || "");
        promptTemplate = applyShortRules(promptTemplate);
        promptTemplate = appendStyleEnforcement(promptTemplate, controls.style, controls.metaphor, controls.fact_intensity);
        const systemInstruction = applyShortRules("Du bist ein erfahrener Redakteur für das Format 'ZEITBLITZ'. Antworte nur mit dem Text.");

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 2048,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: promptTemplate }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content || "";
        if (!result) throw new Error("Kein Text generiert. Die API hat eine leere Antwort zurückgegeben.");
        return result;
    });
};

export const generateInstagramWisdom = async (quote: string, author: string, deathYear: number, sourceUrl: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        const seconds = Math.max(20, Math.min(70, controls.insta_seconds || 45));
        const targetWords = Math.round((seconds / 45) * 100);

        let promptTemplate = loadPrompt('script_generation', 'instagram_wisdom');
        promptTemplate = safeReplace(promptTemplate, '{seconds}', seconds.toString());
        promptTemplate = safeReplace(promptTemplate, '{targetWords}', targetWords.toString());
        promptTemplate = safeReplace(promptTemplate, '{quote}', quote || "");
        promptTemplate = safeReplace(promptTemplate, '{author}', author || "");
        promptTemplate = safeReplace(promptTemplate, '{deathYear}', deathYear ? String(deathYear) : "");
        promptTemplate = safeReplace(promptTemplate, '{sourceUrl}', sourceUrl || "");
        promptTemplate = applyShortRules(promptTemplate);
        const systemInstruction = applyShortRules("Du bist ein Scriptwriter. Antworte exakt im gewünschten Format.");

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 2048,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: promptTemplate }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content || "";
        if (!result) throw new Error("Kein Text generiert. Die API hat eine leere Antwort zurückgegeben.");
        return result;
    });
};

export const generateDialogue = async (rawText: string, factText: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        const seconds = controls.dialogue_seconds || 60;
        const targetWords = Math.round((seconds / 45) * 100);
        
        let systemInstruction = loadPrompt('script_generation', 'dialogue_generation');
        systemInstruction = safeReplace(systemInstruction, '{seconds}', seconds.toString());
        systemInstruction = safeReplace(systemInstruction, '{targetWords}', targetWords.toString());
        systemInstruction = safeReplace(systemInstruction, '{styleText}', getStyleInstruction(controls.style));
        systemInstruction = safeReplace(systemInstruction, '{metaphorText}', getMetaphorInstruction(controls.metaphor));
        systemInstruction = applyShortRules(systemInstruction);

        const fullContext = `DOSSIER:\n${rawText}\n\nZUSÄTZLICHE FAKTEN:\n${factText}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4096,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: fullContext }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    });
};

export const regenerateHook = async (text: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        const context = text.slice(0, 1000) + "...";

        let systemInstruction = loadPrompt('script_generation', 'hook_regen');
        systemInstruction = safeReplace(systemInstruction, '{styleText}', getStyleInstruction(controls.style));
        systemInstruction = safeReplace(systemInstruction, '{metaphorText}', getMetaphorInstruction(controls.metaphor));
        systemInstruction = safeReplace(systemInstruction, '{context}', context);
        systemInstruction = applyShortRules(systemInstruction);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1024,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: "Generiere den Hook jetzt." }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || text;
    });
};

export const generateCTA = async (text: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        const isDialogue = text.includes("USER 1:") || text.includes("USER 2:") || text.includes("SPEAKER 1:") || text.includes("SPEAKER 2:");
        const wordCount = text.split(/\s+/).length;
        const isShort = wordCount < 150;
        const scriptType = isShort ? "Kurzformat (Short/Reel)" : "Langformat (Video/Deep Dive)";
        const targetWords = isShort ? "3-10" : "10-20";
        const context = text.length > 1000 ? "..." + text.slice(-1000) : text;

        const promptKey = isDialogue ? 'cta_dialogue_generation' : 'cta_generation';
        
        let systemInstruction = loadPrompt('script_generation', promptKey);
        systemInstruction = safeReplace(systemInstruction, '{styleText}', getStyleInstruction(controls.style));
        systemInstruction = safeReplace(systemInstruction, '{metaphorText}', getMetaphorInstruction(controls.metaphor));
        systemInstruction = safeReplace(systemInstruction, '{context}', context);
        systemInstruction = safeReplace(systemInstruction, '{scriptType}', scriptType);
        systemInstruction = safeReplace(systemInstruction, '{targetWords}', targetWords);
        systemInstruction = applyShortRules(systemInstruction);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 512,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: "Generiere jetzt den Abschluss." }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    });
};

export const rewriteSelectionWithTone = async (text: string, tone: string, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        
        let systemInstruction = loadPrompt('script_generation', 'tone_transformation');
        systemInstruction = safeReplace(systemInstruction, '{toneKey}', tone);
        systemInstruction = applyShortRules(systemInstruction);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 2048,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: text }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || text;
    });
};

export const improveExistingScript = async (existingText: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        
        const seconds = controls.target_seconds || 60;
        const targetWords = Math.round((seconds / 45) * 100);

        const systemInstruction = applyShortRules(`Du bist ein erfahrener Redakteur für das Format 'ZEITBLITZ'.
Deine Aufgabe ist es, einen bestehenden Skriptentwurf zu verbessern und weiterzuentwickeln.

ZIEL:
- Behalte den Kerninhalt bei, aber mach ihn hörbar: flüssig, pointiert, menschlich gesprochen.

HUMAN-VOICE (WICHTIG FÜR SPRECHTEXTE):
- Schreibe in Atemeinheiten. Lieber mehrere kurze Sätze als einen langen.
- Meist 7–14 Wörter pro Satz. Keine Sätze über 18 Wörter.
- Rhythmus vor Grammatik-Perfektion: gern fragmentiert, wie gesprochen.
- Nach 2–3 Sätzen ein Rhythmusbruch: ein ultrakurzer Satz. Oder ein Gedankenstrich — als Pause.
- Gesprochene Übergänge (sparsam, aber regelmäßig): „Und jetzt wird’s interessant.“ „Aber es kommt noch was dazu.“ „Und genau hier wird’s spannend.“
- Gedankliche Sprünge: Erst A. Dann plötzlich B. Und jetzt wird’s kompliziert.
- Emotionale Peaks: „Und jetzt kommt der Punkt.“ „Das ist entscheidend.“ „Das verändert alles.“
- Variiere Satzanfänge. Keine Satzanfang-Ketten.
- Konkrete Bilder statt Abstrakta. Erlaubte Wiederholungen für Betonung: „Genau das.“ „Genau das ist das Problem.“
- Vermeide KI-Floskeln: „Zusammenfassend“, „Darüber hinaus“, „Nicht zuletzt“.

ZEITBLITZ-STIL:
- Punch (Rhetoric Punch): ${controls.style}/10 (steuert Late-Night-Ton: gewitzt, sarkastisch, intelligent, aber leicht verständlich; wenige Fremdwörter)
- Metaphern: ${controls.metaphor}/10 (höher = mehr Bilder/Vergleiche)
- Info Density: ${controls.info}/10 (höher = mehr konkrete Fakten/Zahlen/Beispiele pro Absatz; nichts erfinden)

LÄNGENVORGABE (STRIKT):
- Zielzeit: ${seconds} Sekunden
- Rechengrundlage: 100 Wörter = 45 Sekunden
- Ziel-Wortzahl: ca. ${targetWords} Wörter
- Passe den Text an diese Länge an (kürzen oder erweitern).

Antworte NUR mit dem verbesserten Skript, keine Erklärungen.`);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4096,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: `Verbessere und entwickle diesen Skriptentwurf weiter:\n\n${existingText}` }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || existingText;
    });
};

export const analyzePlatformSafety = async (text: string, model: string): Promise<PlatformSafetyCheck> => {
    return handleApiCall(async () => {
        const apiKey = getOpenAIKey();
        const prompt = `Prüfe diesen Text auf mögliche algorithmische Risiken für YouTube und TikTok.

Gib NUR gültiges JSON zurück, ohne Markdown.

Schema:
{
  "summary": "kurze Einordnung",
  "issues": [
    {
      "problematicQuote": "genaue problematische Stelle",
      "probability": 0.0,
      "reason": "warum diese Stelle problematisch sein könnte"
    }
  ],
  "variantA": "erste entschärfte Gesamtversion",
  "variantB": "zweite entschärfte Gesamtversion"
}

Regeln:
- probability zwischen 0 und 1.
- Finde problematische Begriffe, Pauschalisierungen, Gewalt-/Hass-/Diskriminierungsnähe, heikle politische Zuschreibungen, sensationalistische Begriffe, Fehlinformations-Risiken.
- variantA und variantB behalten die Aussageabsicht, formulieren aber plattformfreundlicher.

Text:
${text}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                messages: [
                    { role: 'system', content: 'Du bist ein strenger Safety-Editor für plattformfreundliche Formulierungen. Antworte nur mit JSON.' },
                    { role: 'user', content: prompt }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `OpenAI Error: ${response.status}`);
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || "";
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) throw new Error("Ungültige Safety-Analyse.");
        const parsed = JSON.parse(raw.slice(start, end + 1));
        return {
            summary: String(parsed?.summary || ""),
            issues: Array.isArray(parsed?.issues) ? parsed.issues.map((x: any) => ({
                problematicQuote: String(x?.problematicQuote || ""),
                probability: Math.max(0, Math.min(1, Number(x?.probability ?? 0))),
                reason: String(x?.reason || "")
            })).filter((x: any) => x.problematicQuote || x.reason) : [],
            variantA: String(parsed?.variantA || text),
            variantB: String(parsed?.variantB || text),
            checkedAt: Date.now()
        };
    });
};
