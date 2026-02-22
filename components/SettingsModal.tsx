import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, ZBSettings } from '../services/settings';

interface Props { open: boolean; onClose: () => void; }

const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const [s, setS] = useState<ZBSettings>(getSettings());
  useEffect(() => { if (open) setS(getSettings()); }, [open]);

  const onSave = () => { saveSettings(s); onClose(); };
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70">
      <div className="w-[92%] max-w-3xl bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-300">Einstellungen · KI & API Keys</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Google AI Studio</div>
            <input value={s.googleApiKey} onChange={e=>setS({...s, googleApiKey: e.target.value})} placeholder="API Key" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm mb-2" />
            <input value={s.googleFastModel} onChange={e=>setS({...s, googleFastModel: e.target.value})} placeholder="Fast Model (z.B. gemini-2.5-flash)" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm mb-2" />
            <input value={s.googleProModel} onChange={e=>setS({...s, googleProModel: e.target.value})} placeholder="Pro Model (z.B. gemini-2.5-pro)" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">OpenAI</div>
            <input value={s.openaiApiKey} onChange={e=>setS({...s, openaiApiKey: e.target.value})} placeholder="API Key" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm mb-2" />
            <input value={s.openaiFastModel} onChange={e=>setS({...s, openaiFastModel: e.target.value})} placeholder="Fast Model (z.B. gpt-4o-mini)" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm mb-2" />
            <input value={s.openaiProModel} onChange={e=>setS({...s, openaiProModel: e.target.value})} placeholder="Pro Model (z.B. gpt-4.1)" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Anthropic</div>
            <input value={s.anthropicApiKey} onChange={e=>setS({...s, anthropicApiKey: e.target.value})} placeholder="API Key" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm mb-2" />
            <input value={s.anthropicFastModel} onChange={e=>setS({...s, anthropicFastModel: e.target.value})} placeholder="Fast Model (z.B. claude-3-haiku)" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm mb-2" />
            <input value={s.anthropicProModel} onChange={e=>setS({...s, anthropicProModel: e.target.value})} placeholder="Pro Model (z.B. claude-3-opus)" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Perplexity (Deep Dive)</div>
            <input value={s.perplexityApiKey} onChange={e=>setS({...s, perplexityApiKey: e.target.value})} placeholder="API Key" className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Aktiver Anbieter</div>
            <div className="flex gap-2">
              {(['google','openai','anthropic'] as const).map(p=>(
                <button key={p} onClick={()=>setS({...s, activeProvider: p})} className={`px-3 py-2 rounded border text-[10px] font-black uppercase ${s.activeProvider===p?'bg-emerald-600 border-emerald-500 text-white':'bg-white/5 border-white/10 text-slate-300'}`}>{p}</button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-2">Die aktive Auswahl bestimmt, welche Modellschnellwahl im Editor verwendet wird.</div>
          </div>
        </div>
        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded text-[10px] font-black uppercase">Abbrechen</button>
          <button onClick={onSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-[10px] font-black uppercase">Speichern</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
