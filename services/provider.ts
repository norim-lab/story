import { SegmentControls } from "../types";
import { getSettings, hasValidKey, getMissingKeyMessage } from "./settings";
import * as gemini from "./gemini";
import * as openai from "./openai";
import * as anthropic from "./anthropic";

function getProvider() {
    const settings = getSettings();
    return settings.activeProvider;
}

export function checkApiKey(): { valid: boolean; message: string | null } {
    return {
        valid: hasValidKey(),
        message: getMissingKeyMessage()
    };
}

export const generateScriptWithControls = async (dossier: string, facts: string, controls: SegmentControls, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.generateScriptWithControls(dossier, facts, controls, model);
    } else if (provider === 'anthropic') {
        return anthropic.generateScriptWithControls(dossier, facts, controls, model);
    }
    return gemini.generateScriptWithControls(dossier, facts, controls, model);
};

export const generateDialogue = async (rawText: string, factText: string, controls: SegmentControls, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.generateDialogue(rawText, factText, controls, model);
    } else if (provider === 'anthropic') {
        return anthropic.generateDialogue(rawText, factText, controls, model);
    }
    return gemini.generateDialogue(rawText, factText, controls, model);
};

export const regenerateHook = async (text: string, controls: SegmentControls, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.regenerateHook(text, controls, model);
    } else if (provider === 'anthropic') {
        return anthropic.regenerateHook(text, controls, model);
    }
    return gemini.regenerateHook(text, controls, model);
};

export const generateCTA = async (text: string, controls: SegmentControls, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.generateCTA(text, controls, model);
    } else if (provider === 'anthropic') {
        return anthropic.generateCTA(text, controls, model);
    }
    return gemini.generateCTA(text, controls, model);
};

export const rewriteSelectionWithTone = async (text: string, tone: string, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.rewriteSelectionWithTone(text, tone, model);
    } else if (provider === 'anthropic') {
        return anthropic.rewriteSelectionWithTone(text, tone, model);
    }
    return gemini.rewriteSelectionWithTone(text, tone, model);
};

export { rewriteSelectionWithCustomPrompt } from "./gemini";
