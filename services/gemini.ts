
import { GoogleGenAI, Type } from "@google/genai";
import { PlatformSafetyCheck, ScriptResult, ScriptSection, SegmentControls } from "../types";
import { getGoogleKey } from "./settings";
import { applyShortRules, loadPrompt, getStyleInstruction, getMetaphorInstruction, getFactInstruction, appendStyleEnforcement } from "./prompts";

async function handleApiCall<T>(call: () => Promise<T>): Promise<T> {
  console.log("[Gemini] API Call starting...");
  try { 
    const result = await call(); 
    console.log("[Gemini] API Call success");
    return result;
  } 
  catch (err: any) { 
    console.error("[Gemini] API Error:", err?.message || err);
    console.error("[Gemini] Full error:", err);
    throw err; 
  }
}

// Helper to safely replace all occurrences without regex/special char issues
function safeReplace(template: string, key: string, value: string): string {
    return template.split(key).join(value);
}

function extractFirstJsonObject(text: string): string {
  if (!text) return "{}";
  let sanitized = text.replace(/```json\s?|```/g, "").trim();
  const start = sanitized.indexOf('{');
  if (start === -1) return "{}";
  let stack = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < sanitized.length; i++) {
    const char = sanitized[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') stack++;
      if (char === '}') {
        stack--;
        if (stack === 0) return sanitized.substring(start, i + 1);
      }
    }
  }
  return sanitized.substring(start);
}

const deepUpgradeSchema = {
  type: Type.OBJECT,
  properties: {
    versions: {
      type: Type.OBJECT,
      properties: {
        short_long_deep: { type: Type.STRING },
        long_short_deep: { type: Type.STRING },
        ultra_short_deep: { type: Type.STRING },
        long_long_deep: { type: Type.STRING }
      },
      required: ["short_long_deep", "long_short_deep", "ultra_short_deep", "long_long_deep"]
    }
  },
  required: ["versions"]
};

// Vereinfachte Funktion: Nimmt den Raw Text und packt ihn in eine Section
export const generateZeitblitzScript = async (rawText: string, model: string): Promise<ScriptResult> => {
    // Wir erstellen EINE Sektion für das gesamte Skript
    const mainSection: ScriptSection = {
        id: "main-script",
        title: "Hauptskript",
        newsHeadline: "Manuskript",
        versions: {
            short_1: rawText
        },
        sources: []
    };

    return {
        sections: [mainSection],
        wordCount: {},
        estimatedCost: 0,
        model,
        isEnriched: false,
        generatedAt: Date.now()
    };
};

export const enrichScriptWithDeep = async (script: ScriptResult, research: string): Promise<ScriptResult['sections']> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    const systemInstruction = applyShortRules(loadPrompt('script_generation', 'deep_upgrade'));
    
    // Da wir nur eine Section haben
    const currentText = script.sections[0].versions['short_1'];
    
    const prompt = `RECHERCHE-DATEN:\n${research}\n\nGEGENWÄRTIGER TEXT:\n${currentText}`;
    
    const response = await ai.models.generateContent({
      model: script.model,
      contents: prompt,
      config: { systemInstruction, temperature: 0.3, responseMimeType: "application/json", responseSchema: deepUpgradeSchema as any }
    });
    
    const parsed = JSON.parse(extractFirstJsonObject(response.text || "{}"));
    
    // Update der einzigen Section
    return [{
        ...script.sections[0],
        versions: {
            ...script.sections[0].versions,
            ...parsed.versions
        }
    }];
  });
};

export const mapResearchToSegments = async (script: ScriptResult, research: string): Promise<Record<string, string>> => {
    return { "main-script": research };
};

export const regenerateHook = async (text: string, controls: SegmentControls, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    
    // Provide first 1000 chars as context for the hook
    const context = text.slice(0, 1000) + "...";

    let systemInstruction = loadPrompt('script_generation', 'hook_regen');
    systemInstruction = safeReplace(systemInstruction, '{styleText}', getStyleInstruction(controls.style));
    systemInstruction = safeReplace(systemInstruction, '{metaphorText}', getMetaphorInstruction(controls.metaphor));
    systemInstruction = safeReplace(systemInstruction, '{context}', context);
    systemInstruction = applyShortRules(systemInstruction);

    const response = await ai.models.generateContent({ 
        model, 
        contents: "Generiere den Hook jetzt.", 
        config: { systemInstruction, temperature: 0.85 } 
    });
    return response.text?.trim() || text;
  });
};

export const refineSegmentWithControls = async (text: string, controls: SegmentControls, model: string, researchData?: string, factText?: string): Promise<any> => {
    // Legacy function support
    return { short_1: text }; 
};

export const generateDialogue = async (rawText: string, factText: string, controls: SegmentControls, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    
    const seconds = controls.dialogue_seconds || 60;
    // Calculation: 100 words = 45 seconds
    const targetWords = Math.round((seconds / 45) * 100);
    
    let systemInstruction = loadPrompt('script_generation', 'dialogue_generation');
    systemInstruction = safeReplace(systemInstruction, '{seconds}', seconds.toString());
    systemInstruction = safeReplace(systemInstruction, '{targetWords}', targetWords.toString());
    systemInstruction = safeReplace(systemInstruction, '{styleText}', getStyleInstruction(controls.style));
    systemInstruction = safeReplace(systemInstruction, '{metaphorText}', getMetaphorInstruction(controls.metaphor));
    systemInstruction = applyShortRules(systemInstruction);

    // Combine raw source and facts for full context
    const fullContext = `DOSSIER:\n${rawText}\n\nZUSÄTZLICHE FAKTEN:\n${factText}`;

    const response = await ai.models.generateContent({
        model,
        contents: fullContext,
        config: {
            systemInstruction,
            temperature: 0.85
        }
    });

    return response.text || "";
  });
};

// NEW FUNCTION: Writes script from scratch based on raw input + controls
export const generateScriptWithControls = async (dossier: string, facts: string, controls: SegmentControls, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    
    const seconds = controls.target_seconds || 60;
    // Calculation: 100 words = 45 seconds
    const targetWords = Math.round((seconds / 45) * 100);
    
    // Check if long format (>= 8 mins / 480 seconds)
    const isLongFormat = seconds >= 480;

    // Load template based on format length
    let promptTemplate = isLongFormat 
        ? loadPrompt('script_generation', 'write_and_fit_long')
        : loadPrompt('script_generation', 'write_and_fit');
    
    // Use safeReplace to handle potential special characters in user input (dossier/facts)
    promptTemplate = safeReplace(promptTemplate, '{seconds}', seconds.toString());
    promptTemplate = safeReplace(promptTemplate, '{targetWords}', targetWords.toString());
    promptTemplate = safeReplace(promptTemplate, '{styleText}', getStyleInstruction(controls.style));
    promptTemplate = safeReplace(promptTemplate, '{metaphorText}', getMetaphorInstruction(controls.metaphor));
    promptTemplate = safeReplace(promptTemplate, '{factText}', getFactInstruction(controls.fact_intensity));
    promptTemplate = safeReplace(promptTemplate, '{dossier}', dossier || "");
    promptTemplate = safeReplace(promptTemplate, '{facts}', facts || "");
    promptTemplate = applyShortRules(promptTemplate);
    promptTemplate = appendStyleEnforcement(promptTemplate, controls.style, controls.metaphor, controls.fact_intensity);

    console.log(`Sending Prompt to Gemini (${isLongFormat ? 'LONG' : 'STANDARD'}):`, promptTemplate.substring(0, 200) + "...");

    const response = await ai.models.generateContent({
        model,
        contents: promptTemplate, 
        config: {
            systemInstruction: applyShortRules("Du bist ein erfahrener Redakteur für das Format 'ZEITBLITZ'. Antworte nur mit dem Skript."),
            temperature: 0.7 
        }
    });

    const result = response.text || "";
    if (!result) {
        console.warn("Gemini returned empty text for write_and_fit", response);
        throw new Error("Kein Text generiert. Die API hat eine leere Antwort zurückgegeben.");
    }

    return result;
  });
};

export const generateNewsFlash = async (dossier: string, facts: string, controls: SegmentControls, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
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

    const response = await ai.models.generateContent({
      model,
      contents: promptTemplate,
      config: {
        systemInstruction: applyShortRules("Du bist ein erfahrener Redakteur für das Format 'ZEITBLITZ'. Antworte nur mit dem Text."),
        temperature: 0.75
      }
    });

    const result = response.text || "";
    if (!result) throw new Error("Kein Text generiert. Die API hat eine leere Antwort zurückgegeben.");
    return result;
  });
};

export const generateInstagramWisdom = async (quote: string, author: string, deathYear: number, sourceUrl: string, controls: SegmentControls, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
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

    const response = await ai.models.generateContent({
      model,
      contents: promptTemplate,
      config: {
        systemInstruction: applyShortRules("Du bist ein Scriptwriter. Antworte exakt im gewünschten Format."),
        temperature: 0.8
      }
    });

    const result = response.text || "";
    if (!result) throw new Error("Kein Text generiert. Die API hat eine leere Antwort zurückgegeben.");
    return result;
  });
};

export const retimeSegment = async (text: string, seconds: number, controls: SegmentControls, model: string): Promise<string> => {
    // Deprecated for the new logic
    return text;
};

export const generateCTA = async (text: string, controls: SegmentControls, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    
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

    const response = await ai.models.generateContent({
        model,
        contents: "Generiere jetzt den Abschluss.",
        config: {
            systemInstruction,
            temperature: 1.0 
        }
    });

    return response.text || "";
  });
};

export const rewriteSelectionWithTone = async (text: string, tone: string, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    let systemInstruction = loadPrompt('script_generation', 'tone_transformation');
    systemInstruction = safeReplace(systemInstruction, '{toneKey}', tone);
    systemInstruction = applyShortRules(systemInstruction);
    const response = await ai.models.generateContent({ model, contents: text, config: { systemInstruction, temperature: 0.8 } });
    return response.text || text;
  });
};

export const rewriteSelectionWithCustomPrompt = async (text: string, prompt: string, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    let systemInstruction = loadPrompt('script_generation', 'custom_selection_rewrite');
    systemInstruction = safeReplace(systemInstruction, '{instruction}', prompt);
    systemInstruction = applyShortRules(systemInstruction);
    const response = await ai.models.generateContent({ model, contents: text, config: { systemInstruction, temperature: 0.7 } });
    return response.text || text;
  });
};

export const improveExistingScript = async (existingText: string, controls: SegmentControls, model: string): Promise<string> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    
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
- Punch (Rhetoric Punch): ${controls.style}/10 (Late-Night: gewitzt, sarkastisch, intelligent, aber leicht verständlich; wenige Fremdwörter)
- Metaphern: ${controls.metaphor}/10
- Info Density: ${controls.info}/10 (mehr konkrete Fakten/Zahlen/Beispiele pro Absatz; nichts erfinden)

LÄNGENVORGABE (STRIKT):
- Zielzeit: ${seconds} Sekunden
- Rechengrundlage: 100 Wörter = 45 Sekunden
- Ziel-Wortzahl: ca. ${targetWords} Wörter
- Passe den Text an diese Länge an (kürzen oder erweitern).

Antworte NUR mit dem verbesserten Skript, keine Erklärungen.`);

    const response = await ai.models.generateContent({ 
      model, 
      contents: `Verbessere und entwickle diesen Skriptentwurf weiter:\n\n${existingText}`, 
      config: { systemInstruction, temperature: 0.8 } 
    });
    return response.text || existingText;
  });
};

export const analyzePlatformSafety = async (text: string, model: string): Promise<PlatformSafetyCheck> => {
  return handleApiCall(async () => {
    const ai = new GoogleGenAI({ apiKey: getGoogleKey() });
    const prompt = `Du prüfst einen Text auf mögliche algorithmische Risiken für YouTube und TikTok.

Gib NUR gültiges JSON zurück, ohne Markdown, ohne Backticks.

Schema:
{
  "summary": "kurze Einordnung",
  "issues": [
    {
      "problematicQuote": "genaue problematische Stelle",
      "probability": 0.0,
      "reason": "warum die Stelle für Plattform-Algorithmen problematisch sein könnte"
    }
  ],
  "variantA": "erste vollständig entschärfte Gesamtversion",
  "variantB": "zweite vollständig entschärfte Gesamtversion"
}

Regeln:
- probability ist zwischen 0 und 1.
- Erkenne problematische Begriffe, pauschalisierende Formulierungen, Gewalt-/Hass-/Diskriminierungsnähe, medizinische/kriminelle/extreme Begriffe, heikle politische Zuschreibungen, sensationalistische Wörter und Fehlinformations-Risiken.
- issues nur für echte Risikostellen.
- variantA und variantB müssen den Kerninhalt behalten, aber deutlich plattformfreundlicher formuliert sein.
- Antworte ausschließlich mit JSON.

Text:
${text}`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: "Du bist ein strenger Safety-Editor für plattformfreundliche Formulierungen.",
        temperature: 0.2
      }
    });

    const raw = response.text || "";
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
