import { PlatformSafetyCheck, SegmentControls } from "../types";
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

export const generateTitle = async (script: string, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.generateTitle(script, model);
    } else if (provider === 'anthropic') {
        return anthropic.generateTitle(script, model);
    }
    return gemini.generateTitle(script, model);
};

export const generateNewsFlash = async (dossier: string, facts: string, controls: SegmentControls, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.generateNewsFlash(dossier, facts, controls, model);
    } else if (provider === 'anthropic') {
        return anthropic.generateNewsFlash(dossier, facts, controls, model);
    }
    return gemini.generateNewsFlash(dossier, facts, controls, model);
};

export const generateInstagramWisdom = async (quote: string, author: string, deathYear: number, sourceUrl: string, controls: SegmentControls, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.generateInstagramWisdom(quote, author, deathYear, sourceUrl, controls, model);
    } else if (provider === 'anthropic') {
        return anthropic.generateInstagramWisdom(quote, author, deathYear, sourceUrl, controls, model);
    }
    return gemini.generateInstagramWisdom(quote, author, deathYear, sourceUrl, controls, model);
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

export const improveExistingScript = async (existingText: string, controls: SegmentControls, model: string): Promise<string> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.improveExistingScript(existingText, controls, model);
    } else if (provider === 'anthropic') {
        return anthropic.improveExistingScript(existingText, controls, model);
    }
    return gemini.improveExistingScript(existingText, controls, model);
};

export const analyzePlatformSafety = async (text: string, model: string): Promise<PlatformSafetyCheck> => {
    const provider = getProvider();
    if (provider === 'openai') {
        return openai.analyzePlatformSafety(text, model);
    } else if (provider === 'anthropic') {
        return anthropic.analyzePlatformSafety(text, model);
    }
    return gemini.analyzePlatformSafety(text, model);
};

export { rewriteSelectionWithCustomPrompt } from "./gemini";
