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
  activeProvider: Provider;
}

const defaults: ZBSettings = {
  googleApiKey: '',
  googleFastModel: 'gemini-2.5-flash-preview-05-20',
  googleProModel: 'gemini-2.5-pro-preview-06-05',
  openaiApiKey: '',
  openaiFastModel: 'gpt-4o-mini',
  openaiProModel: 'o3-pro',
  anthropicApiKey: '',
  anthropicFastModel: 'claude-sonnet-4-20250514',
  anthropicProModel: 'claude-opus-4-20250514',
  perplexityApiKey: '',
  activeProvider: 'anthropic'
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
  if (s.activeProvider === 'anthropic' && !s.anthropicApiKey) return 'Anthropic API Key fehlt. Bitte in den Einstellungen hinterlegen.';
  return null;
}
