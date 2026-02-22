import { SegmentControls } from "../types";
import { getAnthropicKey } from "./settings";
import { loadPrompt } from "./prompts";

function safeReplace(template: string, key: string, value: string): string {
    return template.split(key).join(value);
}

async function handleApiCall<T>(call: () => Promise<T>): Promise<T> {
    const key = getAnthropicKey();
    if (!key) {
        throw new Error("Anthropic API Key fehlt. Bitte in den Einstellungen hinterlegen.");
    }
    try { 
        return await call(); 
    } catch (err: any) { 
        console.error("Anthropic API Error:", err); 
        throw err; 
    }
}

export const generateScriptWithControls = async (dossier: string, facts: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getAnthropicKey();
        const seconds = controls.target_seconds || 60;
        const targetWords = Math.round((seconds / 45) * 100);
        const isLongFormat = seconds >= 480;

        let promptTemplate = isLongFormat 
            ? loadPrompt('script_generation', 'write_and_fit_long')
            : loadPrompt('script_generation', 'write_and_fit');
        
        promptTemplate = safeReplace(promptTemplate, '{seconds}', seconds.toString());
        promptTemplate = safeReplace(promptTemplate, '{targetWords}', targetWords.toString());
        promptTemplate = safeReplace(promptTemplate, '{style}', controls.style.toString());
        promptTemplate = safeReplace(promptTemplate, '{metaphor}', controls.metaphor.toString());
        promptTemplate = safeReplace(promptTemplate, '{info}', controls.info.toString());
        promptTemplate = safeReplace(promptTemplate, '{dossier}', dossier || "Kein Dossier verfügbar.");
        promptTemplate = safeReplace(promptTemplate, '{facts}', facts || "Keine Zusatzfakten.");

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4096,
                system: "Du bist ein erfahrener Redakteur für das Format 'ZEITBLITZ'. Antworte nur mit dem Skript.",
                messages: [
                    { role: 'user', content: promptTemplate }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `Anthropic Error: ${response.status}`);
        }

        const data = await response.json();
        const result = data.content?.[0]?.text || "";
        
        if (!result) {
            throw new Error("Kein Text generiert. Die API hat eine leere Antwort zurückgegeben.");
        }

        return result;
    });
};

export const generateDialogue = async (rawText: string, factText: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getAnthropicKey();
        const seconds = controls.dialogue_seconds || 60;
        const targetWords = Math.round((seconds / 45) * 100);
        
        let systemInstruction = loadPrompt('script_generation', 'dialogue_generation');
        systemInstruction = safeReplace(systemInstruction, '{seconds}', seconds.toString());
        systemInstruction = safeReplace(systemInstruction, '{targetWords}', targetWords.toString());
        systemInstruction = safeReplace(systemInstruction, '{style}', controls.style.toString());
        systemInstruction = safeReplace(systemInstruction, '{metaphor}', controls.metaphor.toString());
        systemInstruction = safeReplace(systemInstruction, '{info}', controls.info.toString());

        const fullContext = `DOSSIER:\n${rawText}\n\nZUSÄTZLICHE FAKTEN:\n${factText}`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4096,
                system: systemInstruction,
                messages: [
                    { role: 'user', content: fullContext }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `Anthropic Error: ${response.status}`);
        }

        const data = await response.json();
        return data.content?.[0]?.text || "";
    });
};

export const regenerateHook = async (text: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getAnthropicKey();
        const context = text.slice(0, 1000) + "...";

        let systemInstruction = loadPrompt('script_generation', 'hook_regen');
        systemInstruction = safeReplace(systemInstruction, '{style}', controls.style.toString());
        systemInstruction = safeReplace(systemInstruction, '{metaphor}', controls.metaphor.toString());
        systemInstruction = safeReplace(systemInstruction, '{context}', context);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1024,
                system: systemInstruction,
                messages: [
                    { role: 'user', content: "Generiere den Hook jetzt." }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `Anthropic Error: ${response.status}`);
        }

        const data = await response.json();
        return data.content?.[0]?.text?.trim() || text;
    });
};

export const generateCTA = async (text: string, controls: SegmentControls, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getAnthropicKey();
        const isDialogue = text.includes("USER 1:") || text.includes("USER 2:") || text.includes("SPEAKER 1:") || text.includes("SPEAKER 2:");
        const wordCount = text.split(/\s+/).length;
        const isShort = wordCount < 150;
        const scriptType = isShort ? "Kurzformat (Short/Reel)" : "Langformat (Video/Deep Dive)";
        const targetWords = isShort ? "3-10" : "10-20";
        const context = text.length > 1000 ? "..." + text.slice(-1000) : text;

        const promptKey = isDialogue ? 'cta_dialogue_generation' : 'cta_generation';
        
        let systemInstruction = loadPrompt('script_generation', promptKey);
        systemInstruction = safeReplace(systemInstruction, '{style}', controls.style.toString());
        systemInstruction = safeReplace(systemInstruction, '{metaphor}', controls.metaphor.toString());
        systemInstruction = safeReplace(systemInstruction, '{context}', context);
        systemInstruction = safeReplace(systemInstruction, '{scriptType}', scriptType);
        systemInstruction = safeReplace(systemInstruction, '{targetWords}', targetWords);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 512,
                system: systemInstruction,
                messages: [
                    { role: 'user', content: "Generiere jetzt den Abschluss." }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `Anthropic Error: ${response.status}`);
        }

        const data = await response.json();
        return data.content?.[0]?.text || "";
    });
};

export const rewriteSelectionWithTone = async (text: string, tone: string, model: string): Promise<string> => {
    return handleApiCall(async () => {
        const apiKey = getAnthropicKey();
        
        let systemInstruction = loadPrompt('script_generation', 'tone_transformation');
        systemInstruction = safeReplace(systemInstruction, '{toneKey}', tone);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 2048,
                system: systemInstruction,
                messages: [
                    { role: 'user', content: text }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `Anthropic Error: ${response.status}`);
        }

        const data = await response.json();
        return data.content?.[0]?.text || text;
    });
};
