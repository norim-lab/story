const LS_KEY = 'zb_settings';

export type Provider = 'google' | 'openai' | 'anthropic';

export interface ZBSettings {
  googleApiKey: string;
  googleFastModel: string;
  googleProModel: string;
  openaiApiKey: string;
  openaiFastModel: string;
  openaiProModel: string;
  anthropicApiKey: string;
  anthropicFastModel: string;
  anthropicProModel: string;
  perplexityApiKey: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  auphonicApiKey: string;
  auphonicPresetUuid: string;
  shortRulesEnabled: boolean;
  youtubeShadowbanAvoid: boolean;
  tiktokShadowbanAvoid: boolean;
  speedupEnabled: boolean;
  speedupPreset: string;
  activeProvider: Provider;
}

const defaults: ZBSettings = {
  googleApiKey: '',
  googleFastModel: 'gemini-2.5-flash',
  googleProModel: 'gemini-2.5-pro',
  openaiApiKey: '',
  openaiFastModel: 'gpt-4o-mini',
  openaiProModel: 'gpt-4o',
  anthropicApiKey: '',
  anthropicFastModel: 'anthropic/claude-haiku-4-5',
  anthropicProModel: 'anthropic/claude-sonnet-4-6',
  perplexityApiKey: '',
  elevenLabsApiKey: '',
  elevenLabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb', // Example default voice ID
  auphonicApiKey: '',
  auphonicPresetUuid: '',
  shortRulesEnabled: true,
  youtubeShadowbanAvoid: false,
  tiktokShadowbanAvoid: false,
  speedupEnabled: true,
  speedupPreset: 'zeitblytz_standard',
  activeProvider: 'google'
};

export function getSettings(): ZBSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(update: Partial<ZBSettings>) {
  const merged = { ...getSettings(), ...update };
  localStorage.setItem(LS_KEY, JSON.stringify(merged));
  return merged;
}

export function getActiveModel(): string {
  const s = getSettings();
  if (s.activeProvider === 'google') return s.googleFastModel;
  if (s.activeProvider === 'openai') return s.openaiFastModel;
  return s.anthropicFastModel;
}

export function getFastModel(): string {
  const s = getSettings();
  if (s.activeProvider === 'google') return s.googleFastModel;
  if (s.activeProvider === 'openai') return s.openaiFastModel;
  return s.anthropicFastModel;
}

export function getProModel(): string {
  const s = getSettings();
  if (s.activeProvider === 'google') return s.googleProModel;
  if (s.activeProvider === 'openai') return s.openaiProModel;
  return s.anthropicProModel;
}

export function getGoogleKey(): string {
  return getSettings().googleApiKey || '';
}

export function getPerplexityKey(): string {
  return getSettings().perplexityApiKey || '';
}

export function getOpenAIKey(): string {
  return getSettings().openaiApiKey || '';
}

export function getAnthropicKey(): string {
  return getSettings().anthropicApiKey || '';
}

export function getElevenLabsKey(): string {
  return getSettings().elevenLabsApiKey || '';
}

export function getElevenLabsVoiceId(): string {
  return getSettings().elevenLabsVoiceId || '';
}

export function getAuphonicKey(): string {
  return getSettings().auphonicApiKey || '';
}

export function getAuphonicPresetUuid(): string {
  return getSettings().auphonicPresetUuid || '';
}

export function hasValidKey(): boolean {
  const s = getSettings();
  if (s.activeProvider === 'google') return !!s.googleApiKey;
  if (s.activeProvider === 'openai') return !!s.openaiApiKey;
  if (s.activeProvider === 'anthropic') return !!s.anthropicApiKey;
  return false;
}

export function getMissingKeyMessage(): string | null {
  const s = getSettings();
  if (s.activeProvider === 'google' && !s.googleApiKey) return 'Google API Key fehlt. Bitte in den Einstellungen hinterlegen.';
  if (s.activeProvider === 'openai' && !s.openaiApiKey) return 'OpenAI API Key fehlt. Bitte in den Einstellungen hinterlegen.';
  if (s.activeProvider === 'anthropic' && !s.anthropicApiKey) return 'DeepInfra API Key fehlt. Bitte in den Einstellungen hinterlegen.';
  return null;
}
