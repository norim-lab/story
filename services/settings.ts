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
