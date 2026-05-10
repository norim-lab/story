import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, ZBSettings, Provider } from '../services/settings';

interface Props { open: boolean; onClose: () => void; }

const MODEL_OPTIONS = {
  google: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Schnell)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Leistungsstark)' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Schnell)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Ausgewogen)' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Leistungsstark)' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Schnell)' },
    { value: 'gpt-4o', label: 'GPT-4o (Ausgewogen)' },
    { value: 'gpt-4.1', label: 'GPT-4.1 (Leistungsstark)' },
  ]
};

const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const [s, setS] = useState<ZBSettings>(getSettings());
  useEffect(() => { if (open) setS(getSettings()); }, [open]);

  const onSave = () => { saveSettings(s); onClose(); };
  if (!open) return null;

  const renderProviderSection = (provider: Provider, label: string, apiKey: string, onKeyChange: (v: string) => void) => (
    <div className="space-y-2">
      <div className="text-[10px] uppercase font-bold text-slate-500">{label}</div>
      <input 
        value={apiKey} 
        onChange={e => onKeyChange(e.target.value)} 
        placeholder="API Key" 
        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" 
      />
      <select 
        value={provider === 'google' ? s.googleFastModel : provider === 'anthropic' ? s.anthropicFastModel : s.openaiFastModel}
        onChange={e => {
          if (provider === 'google') setS({...s, googleFastModel: e.target.value});
          else if (provider === 'anthropic') setS({...s, anthropicFastModel: e.target.value});
          else setS({...s, openaiFastModel: e.target.value});
        }}
        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"
      >
        {MODEL_OPTIONS[provider].map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[92%] max-w-3xl bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-300">Einstellungen · KI & API Keys</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">✕</button>
        </div>
        
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderProviderSection('google', 'Google AI Studio', s.googleApiKey, v => setS({...s, googleApiKey: v}))}
          {renderProviderSection('anthropic', 'Anthropic (Claude)', s.anthropicApiKey, v => setS({...s, anthropicApiKey: v}))}
          {renderProviderSection('openai', 'OpenAI (GPT)', s.openaiApiKey, v => setS({...s, openaiApiKey: v}))}
          
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">ElevenLabs (Text-to-Speech)</div>
            <input 
              value={s.elevenLabsApiKey} 
              onChange={e => setS({...s, elevenLabsApiKey: e.target.value})} 
              placeholder="API Key" 
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" 
            />
            <input 
              value={s.elevenLabsVoiceId} 
              onChange={e => setS({...s, elevenLabsVoiceId: e.target.value})} 
              placeholder="Voice ID (z.B. JBFqnCBsd6RMkjVDRZzb)" 
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm mt-1" 
            />
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">Auphonic (Audio Processing)</div>
            <input 
              value={s.auphonicApiKey} 
              onChange={e => setS({...s, auphonicApiKey: e.target.value})} 
              placeholder="API Token (Bearer)" 
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" 
            />
            <input 
              value={s.auphonicPresetUuid} 
              onChange={e => setS({...s, auphonicPresetUuid: e.target.value})} 
              placeholder="Preset UUID (optional)" 
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm mt-1" 
            />
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">Perplexity (Deep Dive)</div>
            <input 
              value={s.perplexityApiKey} 
              onChange={e => setS({...s, perplexityApiKey: e.target.value})} 
              placeholder="API Key (optional)" 
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" 
            />
          </div>
          
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">Aktiver Anbieter</div>
            <div className="flex gap-2">
              {(['anthropic', 'google', 'openai'] as const).map(p => (
                <button 
                  key={p} 
                  onClick={() => setS({...s, activeProvider: p})} 
                  className={`flex-1 px-3 py-2 rounded border text-[10px] font-black uppercase transition-all ${
                    s.activeProvider === p 
                      ? 'bg-emerald-600 border-emerald-500 text-white' 
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/30'
                  }`}
                >
                  {p === 'anthropic' ? 'Claude' : p === 'google' ? 'Gemini' : 'OpenAI'}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Bestimmt, welche API für die Generierung verwendet wird.</div>
          </div>
          
          <div className="space-y-3">
            <div className="text-[10px] uppercase font-bold text-slate-500">Shadowban-Schutz</div>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={s.youtubeShadowbanAvoid} 
                onChange={e => setS({...s, youtubeShadowbanAvoid: e.target.checked})} 
                className="w-4 h-4 rounded accent-red-500"
              />
              <div>
                <div className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">YouTube Shadowban Avoid</div>
                <div className="text-[10px] text-slate-500">Trigger-Wörter umgehen, sichere Alternativen nutzen, Beobachtungs-Frames statt Anklage-Frames</div>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={s.tiktokShadowbanAvoid} 
                onChange={e => setS({...s, tiktokShadowbanAvoid: e.target.checked})} 
                className="w-4 h-4 rounded accent-red-500"
              />
              <div>
                <div className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">TikTok Shadowban Avoid</div>
                <div className="text-[10px] text-slate-500">Zusätzlich: Keine Konkurrenz-Plattformen nennen, FYF-optimiertes Framing, max. 5 sichere Hashtags</div>
              </div>
            </label>
          </div>
        </div>
        
        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded text-[10px] font-black uppercase transition-all">Abbrechen</button>
          <button onClick={onSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-[10px] font-black uppercase transition-all">Speichern</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
