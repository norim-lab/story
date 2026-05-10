
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { 
    WorkflowStatus, ScriptResult, 
    ScriptLength, BackgroundLog, SegmentControls, 
    HistoryItem, HistoryStateSnapshot, PlatformSafetyCheck, ProjectSession, WorkspaceExport,
    CloudStatus, PublishPlatform
} from './types';
import { ZeitblitzOrchestrator } from './services/orchestrator';
import { 
    regenerateHook, 
    rewriteSelectionWithTone, 
    rewriteSelectionWithCustomPrompt,
    generateDialogue,
    generateScriptWithControls,
    generateNewsFlash,
    generateInstagramWisdom,
    generateCTA,
    analyzePlatformSafety,
    checkApiKey,
    improveExistingScript,
    generateTitle,
    prepareForElevenLabs
} from './services/provider';
import { initStorage, listProjects, saveProject, deleteProject as deleteCloudProject, checkConnection } from './services/storage';
import SettingsModal from './components/SettingsModal';
import { getSettings, getFastModel, getProModel, saveSettings } from './services/settings';
import { getRandomHistoricalWikiquote } from './services/wikiquote';
import { getPerplexityLegalCheck } from './services/perplexity';
import { generateElevenLabsAudio, getElevenLabsUserInfo } from './services/elevenlabs';
import { processWithAuphonic, getAuphonicUserInfo, applySpeedup } from './services/auphonic';

const MAX_HISTORY_STEPS = 50;
const MAIN_ID = "main-script";
const AUTO_SAVE_DELAY = 2000; // 2 seconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

type SlotPrefix = 'short' | 'long' | 'dialogue' | 'insta';
const SLOT_PREFIXES: SlotPrefix[] = ['short', 'long', 'dialogue', 'insta'];

const getSlotPrefix = (slot: string): SlotPrefix | null => {
    const match = slot.match(/^(short|long|dialogue|insta)_\d+$/);
    return match ? match[1] as SlotPrefix : null;
};

const getSlotNumber = (slot: string): number => {
    const match = slot.match(/_(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
};

const getSlotLabel = (slot: string): string => {
    const prefix = getSlotPrefix(slot);
    const number = getSlotNumber(slot);
    if (!prefix || !number) return slot;
    if (prefix === 'dialogue') return `Dialog ${number}`;
    if (prefix === 'insta') return `IG ${number}`;
    return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${number}`;
};

const TONE_OPTIONS = [
    { key: 'metaphor', label: '🎨 Metapher · Bildhaft', desc: 'Verwandelt Fakten in starke Bilder.' },
    { key: 'punchy', label: '🔥 Punchy · Kurz', desc: 'Kurze, harte Sätze. Rhythmus.' },
    { key: 'analytic', label: '🧠 Analytisch · Sachlich', desc: 'Nüchtern, präzise, erklärend.' },
    { key: 'ironic', label: '😏 Ironisch · Spitz', desc: 'Leichte Distanz, feiner Spott.' },
    { key: 'engaging', label: '👋 Engaging · Direkt', desc: 'Spricht das Publikum direkt an.' }
];

const CONTROL_LABELS: Record<keyof SegmentControls, string> = {
    info: "Info Density",
    style: "Rhetoric Punch",
    metaphor: "Visual Language",
    x_source: "X Source Facts",
    fact_intensity: "Fakten Intensität",
    dialogue_seconds: "Dialogue Duration",
    target_seconds: "Target Duration",
    news_seconds: "News Duration",
    insta_seconds: "IG Wisdom Duration",
    news_tiktok: "TikTok Optimization",
    series_parts: "Serie Teile",
    length: "Target Length" // Will be hidden
};

const DEFAULT_CONTROLS: SegmentControls = { info: 5, style: 5, metaphor: 5, length: 5, x_source: 1, fact_intensity: 5, dialogue_seconds: 60, target_seconds: 60, news_seconds: 30, insta_seconds: 45, news_tiktok: false, series_parts: 3 };

type LegalVerdict = 'green' | 'yellow' | 'red';
type LegalIssue = { problematicQuote: string; whyRisky: string; saferRewrite: string };
type LegalCheckResult = { verdict: LegalVerdict; summary: string; issues: LegalIssue[]; citations: string[] };
type LegalCheckState =
    | { open: false }
    | { open: true; loading: true; slot: ScriptLength }
    | { open: true; loading: false; slot: ScriptLength; result?: LegalCheckResult; error?: string };

const mapSelectionToRaw = (raw: string, selectedText: string): { start: number, end: number } | null => {
    if (!selectedText || !selectedText.trim()) return null;
    const tagRegex = /(<[^>]*>|\*\*)/g;
    let plain = "";
    const map: number[] = [];
    let lastIdx = 0;
    let match;
    while ((match = tagRegex.exec(raw)) !== null) {
        for (let i = lastIdx; i < match.index; i++) {
            map.push(i);
            plain += raw[i];
        }
        lastIdx = match.index + match[0].length;
    }
    for (let i = lastIdx; i < raw.length; i++) {
        map.push(i);
        plain += raw[i];
    }
    map.push(raw.length);
    const escaped = selectedText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    try {
        const regex = new RegExp(escaped, 'gi');
        const matchInPlain = regex.exec(plain);
        if (matchInPlain) {
            const endIdx = matchInPlain.index + matchInPlain[0].length;
            return { 
                start: map[matchInPlain.index], 
                end: map[endIdx] !== undefined ? map[endIdx] : raw.length 
            };
        }
    } catch (e) { console.error("Selection Regex Error", e); }
    return null;
};

// Helper for pure snapshot creation
const createSnapshot = (project: ProjectSession): HistoryStateSnapshot => {
    return {
        dossier: project.rawInput, 
        factText: project.factText,
        scriptResult: project.scriptResult ? JSON.parse(JSON.stringify(project.scriptResult)) : null, 
        segmentVersions: { ...project.segmentVersions }, 
        segmentControls: JSON.parse(JSON.stringify(project.segmentControls)), 
        activeSegmentIdx: 0,
        finalSelections: {} 
    };
};

// --- Sub Components ---

const CloudStatusIndicator: React.FC<{ status: CloudStatus, lastSaved: Date | null }> = ({ status, lastSaved }) => {
    let color = "bg-slate-500";
    let text = "CONN"; // Shortened for mobile default
    let icon = null;

    switch (status) {
        case CloudStatus.ONLINE:
            color = "bg-emerald-500";
            text = "READY";
            break;
        case CloudStatus.SAVING:
            color = "bg-yellow-400";
            text = "SYNC";
            icon = <div className="animate-spin w-2 h-2 border-[1.5px] border-yellow-400 border-t-transparent rounded-full ml-1" />;
            break;
        case CloudStatus.SAVED:
            color = "bg-emerald-500";
            text = "SAFE"; // Shortened
            break;
        case CloudStatus.ERROR:
            color = "bg-red-500";
            text = "ERR";
            break;
        case CloudStatus.OFFLINE:
            color = "bg-red-500";
            text = "OFF";
            break;
    }

    return (
        <div className="flex items-center gap-2 px-2 md:px-3 py-1 bg-slate-800/80 rounded-full border border-white/5 shadow-inner">
            <div className="relative flex items-center justify-center w-2 h-2 md:w-2.5 md:h-2.5">
                {(status === CloudStatus.SAVING || status === CloudStatus.ONLINE || status === CloudStatus.SAVED) && (
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${color}`}></span>
                )}
                <span className={`relative inline-flex rounded-full h-full w-full ${color}`}></span>
            </div>
            <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-wider ${status === CloudStatus.ERROR || status === CloudStatus.OFFLINE ? 'text-red-400' : 'text-slate-400'}`}>
                {text}
            </span>
            {icon}
        </div>
    );
};

const HistoryMenu: React.FC<{ history: HistoryItem[], currentIndex: number, onSelect: (index: number) => void }> = ({ history, currentIndex, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-[10px] font-bold hidden md:inline">History</span>
            </button>
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                    <div className="p-2 space-y-1">
                        {history.map((item, index) => (
                            <button 
                                key={item.id} 
                                onClick={() => { onSelect(index); setIsOpen(false); }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-medium flex items-center justify-between transition-all ${index === currentIndex ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/5 text-slate-400'}`}
                            >
                                <span className="truncate flex-1">{item.description}</span>
                                <span className="text-[9px] opacity-50 ml-2">{item.timestamp}</span>
                            </button>
                        )).reverse()}
                    </div>
                </div>
            )}
        </div>
    );
};

const ResearchInsights: React.FC<{ data: string }> = ({ data }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    if (!data) return null;

    return (
        <div className="bg-slate-900/60 border border-blue-500/20 rounded-2xl overflow-hidden backdrop-blur-xl shadow-lg mt-8 mb-24 md:mb-8">
            <button onClick={() => setIsExpanded(!isExpanded)} className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-all">
                <div className="flex items-center gap-4">
                    <div className="w-1.5 h-8 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                    <div className="flex flex-col items-start">
                        <h4 className="text-[10px] font-black uppercase text-blue-400 tracking-[0.2em]">Deep Dive Insights</h4>
                    </div>
                </div>
                <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</div>
            </button>
            {isExpanded && (
                <div className="p-6 pt-0 animate-in fade-in slide-in-from-top-2">
                     <div className="bg-black/40 rounded-xl p-6 border border-white/5 max-h-[300px] overflow-y-auto custom-scrollbar text-slate-300 text-sm whitespace-pre-wrap">{data}</div>
                </div>
            )}
        </div>
    );
};

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatRichText = (text: string) => {
    if (!text) return "";
    const bodyParts = text.split(/(<blue>[\s\S]*?<\/blue>|<red>[\s\S]*?<\/red>|\*\*[\s\S]*?\*\*)/g);
    return bodyParts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**')) {
            const hook = part.slice(2, -2);
            return <span key={i} className="font-bold text-yellow-400 inline-block bg-yellow-400/10 px-1 rounded mx-0.5 border-b border-yellow-400/20">{hook}</span>;
        }
        if (part.startsWith('<blue>') && part.endsWith('</blue>')) return <span key={i} className="text-blue-400 font-bold bg-blue-400/10 px-1 rounded mx-0.5">{part.slice(6, -7)}</span>;
        if (part.startsWith('<red>') && part.endsWith('</red>')) return <span key={i} className="text-red-500/50 line-through decoration-red-500/30 decoration-2 mx-0.5 italic">{part.slice(5, -6)}</span>;
        return <span key={i}>{part}</span>;
    });
};

const PlatformIcon: React.FC<{ type: PublishPlatform, active: boolean }> = ({ type, active }) => {
    const baseClass = `w-4 h-4 transition-all duration-300 ${active ? '' : 'opacity-40 grayscale'}`;
    
    if (type === 'tiktok') {
        return (
            <svg className={baseClass} fill={active ? "#00f2ea" : "currentColor"} viewBox="0 0 24 24">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
        );
    }
    // YouTube (Shorts & Long)
    return (
        <svg className={baseClass} fill={active ? "#ff0000" : "currentColor"} viewBox="0 0 24 24">
             <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
        </svg>
    );
};

// --- Home Dashboard Component ---
const HomeDashboard: React.FC<{ 
    projects: ProjectSession[], 
    setProjects: React.Dispatch<React.SetStateAction<ProjectSession[]>>,
    onCreate: () => void, 
    onSelect: (id: string) => void, 
    onDelete: (id: string) => void,
    onImport: (e: React.ChangeEvent<HTMLInputElement>) => void,
    isLoading: boolean,
    cloudStatus: CloudStatus,
    onOpenSettings: () => void
}> = ({ projects, setProjects, onCreate, onSelect, onDelete, onImport, isLoading, cloudStatus, onOpenSettings }) => {
    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-16">
            <div className="max-w-6xl mx-auto space-y-8 md:space-y-12">
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between border-b border-white/10 pb-6 md:pb-8 gap-4">
                    <div>
                        <h1 className="text-3xl md:text-5xl font-black italic uppercase text-white mb-2 tracking-tighter">Zeitblitz <span className="text-emerald-500">Studio</span></h1>
                        <div className="flex items-center gap-3">
                            <p className="text-slate-500 uppercase tracking-widest text-[10px] md:text-xs font-bold">Web Storage</p>
                            <CloudStatusIndicator status={cloudStatus} lastSaved={null} />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => {
                            if (window.confirm("Alle bestehenden Projekte mit Standard-Namen sinnvoll benennen? (Dies kann einen Moment dauern, da LLMs abgefragt werden)")) {
                                const doRename = async () => {
                                    const projectsToRename = projects.filter(p => p.name.startsWith('Projekt_') && p.scriptResult?.sections?.[0]?.versions);
                                    if (projectsToRename.length === 0) {
                                        alert("Keine Projekte zum Umbenennen gefunden.");
                                        return;
                                    }
                                    
                                    let renamedCount = 0;
                                    for (const p of projectsToRename) {
                                        const text = p.scriptResult?.sections?.[0]?.versions?.['short_1'] 
                                            || p.scriptResult?.sections?.[0]?.versions?.['long_1'] 
                                            || p.rawInput 
                                            || "";
                                        
                                        if (text.trim()) {
                                            try {
                                                const title = await generateTitle(text, p.scriptResult?.model || 'gpt-4o');
                                                if (title) {
                                                    setProjects((current: ProjectSession[]) => current.map((cp: ProjectSession) => cp.id === p.id ? { ...cp, name: title } : cp));
                                                    renamedCount++;
                                                }
                                            } catch (e) {
                                                console.error("Rename failed for", p.id, e);
                                            }
                                        }
                                    }
                                    alert(`${renamedCount} Projekte wurden erfolgreich umbenannt!`);
                                };
                                doRename();
                            }
                        }} className="px-4 py-3 bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2" title="Benennt alle älteren Projekte automatisch um">
                            <span>Auto-Rename</span>
                        </button>
                        <button onClick={onOpenSettings} className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2" title="API-Schlüssel und globale Einstellungen konfigurieren">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            <span>API Keys</span>
                        </button>
                        <label className="w-full md:w-auto px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black uppercase cursor-pointer transition-all flex items-center justify-center gap-2" title="Stellt ein zuvor exportiertes Projekt-Backup wieder her">
                            <span>Import Backup</span>
                            <input type="file" accept=".json" className="hidden" onChange={onImport} />
                        </label>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"/>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 pb-20">
                        {/* Create New Card */}
                        <button onClick={onCreate} className="group aspect-video rounded-[2rem] border-2 border-dashed border-white/10 hover:border-emerald-500/50 bg-white/5 hover:bg-emerald-600/5 transition-all flex flex-col items-center justify-center gap-4 text-slate-500 hover:text-emerald-400" title="Erstellt ein neues, leeres Projekt">
                            <div className="w-16 h-16 rounded-full bg-white/5 group-hover:bg-emerald-500/20 flex items-center justify-center transition-all">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            <span className="font-black uppercase text-xs tracking-widest">New Project</span>
                        </button>

                        {/* Project Cards */}
                        {projects.map(p => {
                             const finalized = p.scriptResult?.sections?.[0]?.isFinal 
                                ? Object.entries(p.scriptResult!.sections[0].isFinal!).filter(([_, v]) => v).map(([k]) => k)
                                : [];

                            return (
                            <div key={p.id} onClick={() => onSelect(p.id)} className="group relative aspect-video bg-slate-900 border border-white/5 rounded-[2rem] p-6 md:p-8 hover:border-emerald-500/30 transition-all cursor-pointer overflow-hidden flex flex-col justify-between hover:shadow-2xl hover:shadow-emerald-900/10" title="Klicke hier, um dieses Projekt zu öffnen">
                                <div className="absolute top-0 right-0 p-32 bg-emerald-600/10 blur-[80px] rounded-full group-hover:bg-emerald-600/20 transition-all pointer-events-none" />
                                
                                <div className="relative z-10 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase">
                                            {(p.scriptResult?.model?.replace('gemini-', '') ?? p.selectedModel?.replace('gemini-', '') ?? 'Draft')}
                                        </span>
                                        {p.scriptResult?.isEnriched && <span className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 text-[9px] font-black uppercase">Deep Dive</span>}
                                        {finalized.map(f => (
                                            <span key={f} className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase border border-amber-500/20 flex items-center gap-1">
                                                <span>🔒</span> {getSlotLabel(f)}
                                            </span>
                                        ))}
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-100 line-clamp-2">{p.name}</h3>
                                </div>

                                <div className="relative z-10 flex items-end justify-between mt-4">
                                    <div className="flex gap-2">
                                        {(p.publishedOn || []).map(platform => (
                                            <div key={platform} className="bg-white/10 rounded-full p-1.5 backdrop-blur-sm">
                                                <PlatformIcon type={platform} active={true} />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-[10px] font-mono text-slate-500">
                                            {new Date(p.lastModified).toLocaleDateString()}
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                                            className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-slate-600 transition-all z-20"
                                            title="Löscht dieses Projekt unwiderruflich"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );})}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main App ---

export const App: React.FC = () => {
    // Global State
    const [projects, setProjects] = useState<ProjectSession[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>(WorkflowStatus.IDLE);
    const [logs, setLogs] = useState<BackgroundLog[]>([]);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsVersion, setSettingsVersion] = useState(0);
    const SETTINGS = useMemo(() => getSettings(), [settingsVersion]);
    
    // Cloud State
    const [isCloudLoading, setIsCloudLoading] = useState(true);
    const [cloudStatus, setCloudStatus] = useState<CloudStatus>(CloudStatus.CONNECTING);
    const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
    
    // Editor UI State
    const [isZapping, setIsZapping] = useState(false);
    const [isElevenLabsLoading, setIsElevenLabsLoading] = useState(false);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const [isGeneratingAuphonic, setIsGeneratingAuphonic] = useState(false);
    const [selectionMenu, setSelectionMenu] = useState<{ x: number, y: number, text: string, visible: boolean } | null>(null);
    const [mobileTab, setMobileTab] = useState<'inputs' | 'editor'>('inputs');
    const [editorMode, setEditorMode] = useState<'controls' | 'source'>('controls');
    const [confirmClearSlot, setConfirmClearSlot] = useState<{ slot: ScriptLength; projectId: string } | null>(null);
    const [legalCheck, setLegalCheck] = useState<LegalCheckState>({ open: false });
    const [platformCheckLoadingSlot, setPlatformCheckLoadingSlot] = useState<ScriptLength | null>(null);
    const [elevenLabsUsage, setElevenLabsUsage] = useState<{ used: number, limit: number } | null>(null);
    const [auphonicQuota, setAuphonicQuota] = useState<{ credits: number } | null>(null);
    const [isProcessingSpeedup, setIsProcessingSpeedup] = useState(false);
    const [speedupConfig, setSpeedupConfig] = useState({
        preset: 'zeitblytz_standard',
        speed: 1.12,
        silenceThreshold: -40.0,
        minSilenceDuration: 0.30,
        targetSilenceDuration: 0.15,
    });

    // Fetch ElevenLabs Usage
    const fetchElevenLabsUsage = useCallback(async () => {
        try {
            const usage = await getElevenLabsUserInfo();
            setElevenLabsUsage(usage);
        } catch (e) {
            console.error("Konnte ElevenLabs Usage nicht abrufen", e);
        }
    }, []);

    // Fetch Auphonic Usage
    const fetchAuphonicUsage = useCallback(async () => {
        try {
            const usage = await getAuphonicUserInfo();
            setAuphonicQuota(usage);
        } catch (e) {
            console.error("Konnte Auphonic Usage nicht abrufen", e);
        }
    }, []);

    // Initial fetch when settings change or component mounts
    useEffect(() => {
        if (SETTINGS.elevenLabsApiKey) {
            fetchElevenLabsUsage();
        }
        if (SETTINGS.auphonicApiKey) {
            fetchAuphonicUsage();
        }
    }, [SETTINGS.elevenLabsApiKey, SETTINGS.auphonicApiKey, fetchElevenLabsUsage, fetchAuphonicUsage]);

    // --- Helpers ---
    const addLog = useCallback((message: string, type: any = 'info') => {
        setLogs(prev => [...prev.slice(-49), { id: Math.random().toString(36).substr(2, 9), message, timestamp: new Date().toLocaleTimeString(), type }]);
    }, []);

    const orchestrator = useMemo(() => new ZeitblitzOrchestrator((s, msg) => { setWorkflowStatus(s); if (msg) addLog(msg, 'workflow'); }, addLog), [addLog]);

    const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);

    // Always get current model from settings (not from project)
    const getCurrentModel = useCallback((usePro: boolean = false) => {
        return usePro ? getProModel() : getFastModel();
    }, [settingsVersion]);

    const toggleShortRules = useCallback(() => {
        const nextValue = !SETTINGS.shortRulesEnabled;
        saveSettings({ shortRulesEnabled: nextValue });
        setSettingsVersion(v => v + 1);
        addLog(`SHORTRULES ${nextValue ? 'aktiviert' : 'deaktiviert'}`, nextValue ? 'success' : 'info');
    }, [SETTINGS.shortRulesEnabled, addLog]);

    // Helper to check if current version is final
    const checkProtection = useCallback(() => {
        if (!activeProject?.scriptResult) return true;
        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const isFinal = activeProject.scriptResult.sections[0].isFinal?.[currentV];
        
        if (isFinal) {
            return window.confirm(`Warnung: Die Version "${getSlotLabel(currentV)}" ist als FINAL markiert.\n\nWirklich Änderungen vornehmen?`);
        }
        return true;
    }, [activeProject]);

    // Robust History Manager
    const commitAction = useCallback((description: string, updates: Partial<ProjectSession>) => {
        setProjects(currentProjects => {
            const currentActive = currentProjects.find(p => p.id === activeProjectId);
            if (!currentActive) return currentProjects;

            const updatedProject = { ...currentActive, ...updates, lastModified: Date.now() };
            const snapshot = createSnapshot(updatedProject);
            
            const historyTrail = currentActive.history.slice(0, currentActive.historyIndex + 1);
            const newItem: HistoryItem = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                description,
                state: snapshot
            };
            
            const newHistory = [...historyTrail, newItem].slice(-MAX_HISTORY_STEPS);

            const finalProject = {
                ...updatedProject,
                history: newHistory,
                historyIndex: newHistory.length - 1
            };

            return currentProjects.map(p => p.id === activeProjectId ? finalProject : p);
        });
    }, [activeProjectId]);

    const navigateHistory = useCallback((direction: -1 | 1 | number) => {
        setProjects(currentProjects => {
            const p = currentProjects.find(pr => pr.id === activeProjectId);
            if (!p) return currentProjects;
            
            let newIndex: number;
            if (direction === -1 || direction === 1) {
                newIndex = p.historyIndex + direction;
            } else {
                newIndex = direction; // Absolute jump
            }

            if (newIndex < 0 || newIndex >= p.history.length) return currentProjects;

            const snapshot = p.history[newIndex].state;
            const restoredProject = {
                ...p,
                rawInput: snapshot.dossier,
                factText: snapshot.factText || "",
                scriptResult: snapshot.scriptResult,
                segmentVersions: snapshot.segmentVersions || {},
                segmentControls: snapshot.segmentControls || {},
                isEditing: false,
                historyIndex: newIndex,
                lastModified: Date.now()
            };
            return currentProjects.map(proj => proj.id === activeProjectId ? restoredProject : proj);
        });
    }, [activeProjectId]);

    // Switch to editor tab automatically when script is ready
    useEffect(() => {
        if (activeProject?.scriptResult && mobileTab === 'inputs') {
            setMobileTab('editor');
        }
    }, [activeProject?.scriptResult]);

    // --- Cloud Initialization & Sync ---
    useEffect(() => {
        const boot = async () => {
            setIsCloudLoading(true);
            setCloudStatus(CloudStatus.CONNECTING);
            const success = await initStorage();
            if (success) {
                setCloudStatus(CloudStatus.ONLINE);
                try {
                    const cloudProjects = await listProjects();
                    const migratedProjects = cloudProjects.map((p: any) => {
                        const safeId = p.id || (p.name ? p.name.toLowerCase().replace(/\s+/g, '-') : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)));
                        const mergedControls = {
                            [MAIN_ID]: { 
                                ...DEFAULT_CONTROLS, 
                                ...(p?.segmentControls?.[MAIN_ID] || p?.segmentControls || {}) 
                            }
                        };
                        return { 
                            id: safeId,
                            name: p.name || safeId,
                            lastModified: p.lastModified || Date.now(),
                            rawInput: p.rawInput || "",
                            factText: p.factText || "", 
                            scriptResult: p.scriptResult ?? null,
                            segmentVersions: p.segmentVersions || { [MAIN_ID]: 'short_1' },
                            segmentControls: mergedControls,
                            history: Array.isArray(p.history) ? p.history : [],
                            historyIndex: typeof p.historyIndex === 'number' ? p.historyIndex : -1,
                            isEditing: !!p.isEditing,
                            manualEditText: p.manualEditText || "",
                            selectedModel: p.selectedModel || getSettings().googleFastModel,
                            publishedOn: p.publishedOn || [] 
                        } as ProjectSession;
                    });
                    setProjects(migratedProjects);
                    console.log("=== PROJEKTE GELADEN ===");
                    console.log("Anzahl:", migratedProjects.length);
                    console.log("IDs:", migratedProjects.map((p: any) => p.id));
                    console.log("========================");
                    addLog("Verbindung zum Web-Speicher hergestellt", "success");
                } catch (e) {
                    setCloudStatus(CloudStatus.ERROR);
                    addLog("Konnte Projekte nicht laden", "error");
                }
            } else {
                setCloudStatus(CloudStatus.OFFLINE);
                addLog("Web-Speicher nicht erreichbar (track.php fehlt?)", "info");
            }
            setIsCloudLoading(false);
        };
        boot();
    }, [addLog]);

    useEffect(() => {
        const interval = setInterval(async () => {
            if (cloudStatus === CloudStatus.ONLINE || cloudStatus === CloudStatus.SAVED || cloudStatus === CloudStatus.OFFLINE || cloudStatus === CloudStatus.ERROR) {
                const isOnline = await checkConnection();
                if (isOnline) {
                    if (cloudStatus === CloudStatus.OFFLINE || cloudStatus === CloudStatus.ERROR) {
                        setCloudStatus(CloudStatus.ONLINE);
                        addLog("Cloud Verbindung wiederhergestellt", "success");
                    }
                } else {
                    if (cloudStatus !== CloudStatus.OFFLINE) {
                        setCloudStatus(CloudStatus.OFFLINE);
                        addLog("Verbindung zum Server verloren", "error");
                    }
                }
            }
        }, HEARTBEAT_INTERVAL);
        return () => clearInterval(interval);
    }, [cloudStatus, addLog]);

    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevActiveProjectRef = useRef<string>("");

    useEffect(() => {
        if (!activeProject) return;
        const currentHash = JSON.stringify({
            name: activeProject.name,
            rawInput: activeProject.rawInput,
            factText: activeProject.factText,
            controls: activeProject.segmentControls,
            script: activeProject.scriptResult,
            versions: activeProject.segmentVersions,
            manual: activeProject.manualEditText,
            isEditing: activeProject.isEditing,
            publishedOn: activeProject.publishedOn
        });

        if (currentHash === prevActiveProjectRef.current) return;
        
        prevActiveProjectRef.current = currentHash;
        setCloudStatus(CloudStatus.SAVING);

        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

        autoSaveTimeoutRef.current = setTimeout(async () => {
            try {
                await saveProject(activeProject);
                setCloudStatus(CloudStatus.SAVED);
                setLastSavedTime(new Date());
            } catch (e) {
                setCloudStatus(CloudStatus.ERROR);
                addLog("Speicherung fehlgeschlagen", "error");
            }
        }, AUTO_SAVE_DELAY);

        return () => {
            if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        };
    }, [activeProject, addLog]);

    // --- Core Logic ---

    const createNewProject = useCallback(async () => {
        const newId = crypto.randomUUID();
        const fallbackName = `Projekt_${Date.now().toString().slice(-6)}`;
        const newProject: ProjectSession = {
            id: newId,
            name: fallbackName,
            lastModified: Date.now(),
            rawInput: "",
            factText: "",
            scriptResult: null,
            segmentVersions: { [MAIN_ID]: 'short_1' },
            segmentControls: { [MAIN_ID]: { ...DEFAULT_CONTROLS } },
            history: [],
            historyIndex: -1,
            isEditing: false,
            manualEditText: "",
            selectedModel: SETTINGS.googleFastModel,
            publishedOn: []
        };
        
        setProjects(prev => [newProject, ...prev]);
        
        try {
            setCloudStatus(CloudStatus.SAVING);
            await saveProject(newProject);
            setCloudStatus(CloudStatus.SAVED);
            setLastSavedTime(new Date());
            addLog("✅ Neues Projekt erstellt und gespeichert", "success");
            setActiveProjectId(newProject.id);
            
            console.log("=== PROJEKT GESPEICHERT ===");
            console.log("ID:", newId);
            console.log("Projekt:", newProject);
            console.log("===========================");
        } catch(e: any) { 
            console.error("Initial save failed", e);
            setCloudStatus(CloudStatus.ERROR);
            addLog(`❌ Fehler beim Speichern: ${e.message}`, "error");
            
            setProjects(prev => prev.filter(p => p.id !== newProject.id));
        }

    }, []);

    const updateActiveProject = useCallback((updates: Partial<ProjectSession>) => {
        if (!activeProjectId) return;
        setProjects(prev => prev.map(p => {
            if (p.id !== activeProjectId) return p;
            return { ...p, ...updates, lastModified: Date.now() };
        }));
    }, [activeProjectId]);

    const deleteProject = useCallback(async (id: string) => {
        if (window.confirm("Projekt wirklich vom Server löschen?")) {
            const backup = projects;
            setProjects(prev => prev.filter(p => p.id !== id));
            if (activeProjectId === id) setActiveProjectId(null);
            
            try {
                await deleteCloudProject(id);
                addLog("Projekt gelöscht", "success");
            } catch (e: any) {
                setProjects(backup);
                addLog(`Löschen fehlgeschlagen: ${e.message}`, "error");
                alert(`Fehler beim Löschen: ${e.message}`);
            }
        }
    }, [activeProjectId, projects, addLog]);

    const togglePublishPlatform = (platform: PublishPlatform) => {
        if (!activeProject) return;
        const current = activeProject.publishedOn || [];
        const updated = current.includes(platform) 
            ? current.filter(p => p !== platform) 
            : [...current, platform];
        updateActiveProject({ publishedOn: updated });
    };

    // --- Actions ---

    const handleGenerate = async () => {
        if (!activeProject) return;
        if (!activeProject.rawInput.trim() && !activeProject.factText.trim()) {
            return addLog("Bitte Text (Grok oder Fakten) eingeben.", "error");
        }
        addLog("Starte Import...", "info");
        try {
            const sourceText = activeProject.rawInput.trim() || activeProject.factText;
            const res = await orchestrator.generateStandardShow(sourceText, getCurrentModel());
            
            setProjects(prev => prev.map(p => {
                if (p.id !== activeProjectId) return p;
                
                // Wir benennen das Projekt nach dem generierten Titel oder der internen ID
                const generatedTitle = res.sections?.[0]?.title;
                const newName = generatedTitle || res.sections?.[0]?.id || `Projekt_${Date.now().toString().slice(-6)}`;
                
                const updated = {
                    ...p,
                    scriptResult: res,
                    segmentVersions: { [MAIN_ID]: 'short_1' as ScriptLength },
                    name: p.name.startsWith('Projekt_') ? newName : p.name, // Überschreibe nur, wenn es noch der Default-Name ist
                    lastModified: Date.now()
                };
                const snapshot = createSnapshot(updated);
                updated.history = [{ id: 'init', timestamp: 'Now', description: 'Import', state: snapshot }];
                updated.historyIndex = 0;
                return updated;
            }));
            setMobileTab('editor'); 
        } catch (e) { addLog("Fehler beim Import.", "error"); }
    };

    const handleDeepUpgrade = async () => {
        if (!activeProject?.scriptResult) return;
        try {
            const res = await orchestrator.upgradeToDeep(activeProject.rawInput, activeProject.scriptResult);
            commitAction("Deep Dive durchgeführt", { scriptResult: res });
        } catch (e) { addLog("Fehler bei Deep Dive.", "error"); }
    };

    const getSourceContext = (): string => {
        const raw = (activeProject?.rawInput || "").trim();
        const facts = (activeProject?.factText || "").trim();
        if (!raw && !facts) return "";
        if (raw && facts) return `DOSSIER:\n${raw}\n\nZUSÄTZLICHE FAKTEN:\n${facts}`;
        if (raw) return `DOSSIER:\n${raw}`;
        return `ZUSÄTZLICHE FAKTEN:\n${facts}`;
    };

    const isSlotUnedited = (slot: ScriptLength): boolean => {
        const versions = activeProject?.scriptResult?.sections?.[0]?.versions || {};
        const raw = (versions as any)[slot];
        const slotText = typeof raw === "string" ? raw : "";
        return slotText.trim().length === 0;
    };

    const getSlotTextOrSourceContext = (slot: ScriptLength): { slotText: string; context: string } => {
        const versions = activeProject?.scriptResult?.sections?.[0]?.versions || {};
        const raw = (versions as any)[slot];
        const slotText = typeof raw === "string" ? raw : "";
        if (slotText.trim() && !isSlotUnedited(slot)) return { slotText, context: slotText };
        return { slotText: "", context: getSourceContext() };
    };

    const clampSeriesParts = (value?: number): number => {
        const v = Number.isFinite(value as number) ? Math.round(value as number) : 3;
        return Math.max(2, Math.min(5, v));
    };

    const getSeriesFocus = (mode: 'writefit' | 'news' | 'dialogue', part: number, total: number): string => {
        const isLast = part === total;
        if (mode === 'news') {
            const focuses = ["Breaking / Kernereignis", "Hintergrund / Ursachen", "Auswirkungen / Betroffene", "Reaktionen / Konflikt", "Ausblick / Was als Nächstes passiert"];
            return focuses[Math.min(focuses.length - 1, part - 1)] + (isLast ? " + kurzer Ausblick" : "");
        }
        if (mode === 'dialogue') {
            const focuses = ["Setup / Konflikt", "Eskalation / Gegenargumente", "Wende / neue Information", "Auflösung / Entscheidung", "Ausblick / Konsequenzen"];
            return focuses[Math.min(focuses.length - 1, part - 1)] + (isLast ? " + Abschluss" : "");
        }
        const focuses = ["Setup / Hook + Szene", "Konflikt / Problemkern", "Wende / neue Perspektive", "Lösung / Konsequenzen", "Abschluss / Takeaway"];
        return focuses[Math.min(focuses.length - 1, part - 1)] + (isLast ? " + Abschluss" : "");
    };

    const buildSeriesMeta = (mode: 'writefit' | 'news' | 'dialogue', part: number, total: number, previousText?: string): string => {
        const focus = getSeriesFocus(mode, part, total);
        const prev = (previousText || "").trim();
        const prevExcerpt = prev ? prev.slice(-1200) : "";
        const header = `SERIE-MODUS: Erstelle Teil ${part}/${total}.`;
        const rules = [
            `Schwerpunkt dieses Teils: ${focus}.`,
            "Jeder Teil muss für sich funktionieren (eigener Einstieg, eigener Abschluss).",
            "Alle Teile zusammen ergeben eine zusammenhängende Geschichte mit fortschreitendem Ablauf.",
            "Nutze DOSSIER + ZUSÄTZLICHE FAKTEN als Hauptquelle. Keine neuen Fakten erfinden.",
            "Vermeide Wiederholungen; keine langen Recaps.",
            "WICHTIG: Schreibe in diesem Schritt weder Hook noch CTA. Hook und CTA werden separat erzeugt und eingefügt."
        ].join("\n");
        if (!prevExcerpt) return `${header}\n${rules}`;
        return `${header}\n${rules}\n\nBISHERIGER TEIL (nur zur Kontinuität, keine neuen Fakten):\n${prevExcerpt}`;
    };

    const getSlotsByPrefix = (prefix: SlotPrefix, includeTrailingEmpty: boolean = false): ScriptLength[] => {
        const versions = activeProject?.scriptResult?.sections?.[0]?.versions || {};
        const found = Object.keys(versions)
            .filter(slot => getSlotPrefix(slot) === prefix)
            .sort((a, b) => getSlotNumber(a) - getSlotNumber(b)) as ScriptLength[];
        if (found.length === 0) found.push(`${prefix}_1`);
        if (includeTrailingEmpty) {
            const next = `${prefix}_${Math.max(0, ...found.map(getSlotNumber)) + 1}` as ScriptLength;
            if (!found.includes(next)) found.push(next);
        }
        return found;
    };

    const getNextSlot = (prefix: SlotPrefix): ScriptLength => {
        const slots = getSlotsByPrefix(prefix, false);
        return `${prefix}_${Math.max(0, ...slots.map(getSlotNumber)) + 1}` as ScriptLength;
    };

    const getFirstWritableSlot = (prefix: SlotPrefix, preferredSlot?: ScriptLength): ScriptLength => {
        if (preferredSlot && getSlotPrefix(preferredSlot) === prefix && isSlotUnedited(preferredSlot)) return preferredSlot;
        const slots = getSlotsByPrefix(prefix, true);
        const empty = slots.find(s => isSlotUnedited(s));
        return empty || getNextSlot(prefix);
    };

    const buildSeriesSlots = (prefix: 'short' | 'long' | 'dialogue', parts: number, preferredSlot?: ScriptLength): ScriptLength[] => {
        const all = getSlotsByPrefix(prefix, true);
        const empties = all.filter(s => isSlotUnedited(s));
        const ordered: ScriptLength[] = [];
        const preferredOk = preferredSlot && preferredSlot.startsWith(prefix) && isSlotUnedited(preferredSlot);
        if (preferredOk) ordered.push(preferredSlot as ScriptLength);
        for (const s of empties) if (!ordered.includes(s)) ordered.push(s);
        while (ordered.length < parts) {
            const next = `${prefix}_${Math.max(0, ...all.map(getSlotNumber), ...ordered.map(getSlotNumber)) + 1}` as ScriptLength;
            ordered.push(next);
        }
        return ordered.slice(0, parts);
    };

    const getSeriesBadge = (slot: ScriptLength): number | null => {
        const series = activeProject?.scriptResult?.sections?.[0]?.seriesSlots?.[slot];
        return typeof series?.part === "number" ? series.part : null;
    };

    const buildSeriesSlotMap = (targetSlots: ScriptLength[], total: number) => {
        const seriesId = `series_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return targetSlots.reduce<Record<string, { seriesId: string; part: number; total: number }>>((acc, slot, idx) => {
            acc[slot] = { seriesId, part: idx + 1, total };
            return acc;
        }, {});
    };

    const normalizeHookForDialogue = (hook: string): string => {
        return (hook || "").replace(/^\*\*+/, "").replace(/\*\*+$/, "").trim();
    };

    const injectHookIntoText = (text: string, hook: string, isDialogue: boolean): string => {
        const t = (text || "");
        const h = (hook || "").trim();
        if (!t.trim()) return h;
        if (!h) return t;

        if (isDialogue) {
            const speakerRegex = /^(.*?:)(.*?)(\n|$)/m;
            const match = t.match(speakerRegex);
            if (match) {
                const fullMatch = match[0];
                const prefix = match[1];
                const suffix = match[3];
                const newLine = `${prefix} ${normalizeHookForDialogue(h)}${suffix}`;
                return t.replace(fullMatch, newLine);
            }
            return normalizeHookForDialogue(h) + "\n\n" + t;
        }

        const oldHookMatch = t.match(/^\*\*[\s\S]*?\*\*/);
        if (oldHookMatch) return t.replace(/^\*\*[\s\S]*?\*\*/, h);
        return h + "\n\n" + t;
    };

    const appendCTA = (text: string, cta: string): string => {
        const t = (text || "").trim();
        const c = (cta || "").trim();
        if (!t) return c;
        if (!c) return t;
        return t + "\n\n" + c;
    };

    const enforceSeriesHookAndCTA = async (mode: 'writefit' | 'news' | 'dialogue', baseText: string, controls: SegmentControls, model: string): Promise<string> => {
        const isDialogue = mode === 'dialogue';
        const hook = await regenerateHook(baseText, controls, model);
        const withHook = injectHookIntoText(baseText, hook, isDialogue);
        const cta = await generateCTA(withHook, controls, model);
        return appendCTA(withHook, cta);
    };

    const handleWriteAndFitSeries = async (requestedParts?: number) => {
        addLog("=== WRITE & FIT SERIE GESTARTET ===", "info");
        if (!activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }

        const sourceRaw = (activeProject.rawInput || "").trim();
        const sourceFacts = (activeProject.factText || "").trim();
        if (!sourceRaw && !sourceFacts) {
            addLog("Bitte Grok Dossier oder Additional Facts füllen (Source Data ist leer).", "error");
            return;
        }

        const controls = activeProject.segmentControls[MAIN_ID] || DEFAULT_CONTROLS;
        const parts = clampSeriesParts(requestedParts ?? controls.series_parts);
        const model = getCurrentModel();
        const seconds = controls.target_seconds || 60;
        const prefix: 'short' | 'long' = seconds < 180 ? 'short' : 'long';
        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const targetSlots = buildSeriesSlots(prefix, parts, currentV);
        const section0 = activeProject.scriptResult.sections[0];
        const versions = section0.versions;
        const nextSeriesSlots = { ...(section0.seriesSlots || {}), ...buildSeriesSlotMap(targetSlots, parts) };

        setIsZapping(true);
        const updatedVersions = { ...versions };
        let prevText = "";
        let generatedCount = 0;
        try {
            for (let idx = 0; idx < parts; idx++) {
                const partNo = idx + 1;
                const seriesMeta = buildSeriesMeta('writefit', partNo, parts, prevText);
                const factsAug = [sourceFacts, seriesMeta].filter(Boolean).join("\n\n");
                const generatedText = await generateScriptWithControls(sourceRaw, factsAug, controls, model);
                if (!generatedText || generatedText.trim().length === 0) throw new Error("Generierter Text ist leer.");
                let finalText = generatedText;
                try {
                    finalText = await enforceSeriesHookAndCTA('writefit', generatedText, controls, model);
                } catch (hookCtaError: any) {
                    addLog(`Teil ${partNo}: Hook/CTA fehlgeschlagen, nutze Basisteil (${hookCtaError?.message || hookCtaError})`, "warn");
                }
                const slot = targetSlots[idx];
                updatedVersions[slot] = finalText;
                prevText = generatedText;
                generatedCount += 1;
                addLog(`Teil ${partNo}/${parts} -> ${slot} (${finalText.length} Zeichen)`, "success");
            }

            const updatedResult = {
                ...activeProject.scriptResult,
                model,
                sections: [{ ...section0, versions: updatedVersions, seriesSlots: nextSeriesSlots }]
            };
            const lastSlot = targetSlots[targetSlots.length - 1] || currentV;
            commitAction(`Write & Fit Serie (${parts} Teile) -> ${prefix}`, { scriptResult: updatedResult, segmentVersions: { [MAIN_ID]: lastSlot } });
        } catch (e: any) {
            if (generatedCount > 0) {
                const partialSeriesSlots = targetSlots.slice(0, generatedCount).reduce<Record<string, { seriesId: string; part: number; total: number }>>((acc, slot) => {
                    acc[slot] = nextSeriesSlots[slot];
                    return acc;
                }, {});
                const updatedResult = {
                    ...activeProject.scriptResult,
                    model,
                    sections: [{ ...section0, versions: updatedVersions, seriesSlots: { ...(section0.seriesSlots || {}), ...partialSeriesSlots } }]
                };
                const lastGeneratedSlot = targetSlots[Math.max(0, generatedCount - 1)] || currentV;
                commitAction(`Write & Fit Serie teilweise (${generatedCount}/${parts})`, { scriptResult: updatedResult, segmentVersions: { [MAIN_ID]: lastGeneratedSlot } });
            }
            addLog(`❌ FEHLER: ${e?.message || e}`, "error");
        } finally {
            setIsZapping(false);
            addLog("=== WRITE & FIT SERIE BEENDET ===", "info");
        }
    };

    const handleNewsFlashSeries = async (requestedParts?: number) => {
        if (!activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }

        const sourceRaw = (activeProject.rawInput || "").trim();
        const sourceFacts = (activeProject.factText || "").trim();
        if (!sourceRaw && !sourceFacts) {
            addLog("Bitte Grok Dossier oder Additional Facts füllen (Source Data ist leer).", "error");
            return;
        }

        const controls = activeProject.segmentControls[MAIN_ID] || DEFAULT_CONTROLS;
        const parts = clampSeriesParts(requestedParts ?? controls.series_parts);
        const model = getCurrentModel();

        const section0 = activeProject.scriptResult.sections[0];
        const versions = section0.versions;
        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const targetSlots = buildSeriesSlots('short', parts, currentV);
        const nextSeriesSlots = { ...(section0.seriesSlots || {}), ...buildSeriesSlotMap(targetSlots, parts) };

        setIsZapping(true);
        const updatedVersions = { ...versions };
        let prevText = "";
        let generatedCount = 0;
        try {
            for (let idx = 0; idx < parts; idx++) {
                const partNo = idx + 1;
                const seriesMeta = buildSeriesMeta('news', partNo, parts, prevText);
                const factsAug = [sourceFacts, seriesMeta].filter(Boolean).join("\n\n");
                const newsText = await generateNewsFlash(sourceRaw, factsAug, controls, model);
                if (!newsText || newsText.trim().length === 0) throw new Error("Generierter Text ist leer.");
                let finalText = newsText;
                try {
                    finalText = await enforceSeriesHookAndCTA('news', newsText, controls, model);
                } catch (hookCtaError: any) {
                    addLog(`News Teil ${partNo}: Hook/CTA fehlgeschlagen, nutze Basisteil (${hookCtaError?.message || hookCtaError})`, "warn");
                }
                const slot = targetSlots[idx];
                updatedVersions[slot] = finalText;
                prevText = newsText;
                generatedCount += 1;
                addLog(`News Teil ${partNo}/${parts} -> ${slot}`, "success");
            }

            const updatedResult = {
                ...activeProject.scriptResult,
                model,
                sections: [{ ...section0, versions: updatedVersions, seriesSlots: nextSeriesSlots }]
            };
            const lastSlot = targetSlots[targetSlots.length - 1] || currentV;
            commitAction(`News Flash Serie (${parts} Teile)`, { scriptResult: updatedResult, segmentVersions: { [MAIN_ID]: lastSlot } });
        } catch (e: any) {
            if (generatedCount > 0) {
                const partialSeriesSlots = targetSlots.slice(0, generatedCount).reduce<Record<string, { seriesId: string; part: number; total: number }>>((acc, slot) => {
                    acc[slot] = nextSeriesSlots[slot];
                    return acc;
                }, {});
                const updatedResult = {
                    ...activeProject.scriptResult,
                    model,
                    sections: [{ ...section0, versions: updatedVersions, seriesSlots: { ...(section0.seriesSlots || {}), ...partialSeriesSlots } }]
                };
                const lastGeneratedSlot = targetSlots[Math.max(0, generatedCount - 1)] || currentV;
                commitAction(`News Flash Serie teilweise (${generatedCount}/${parts})`, { scriptResult: updatedResult, segmentVersions: { [MAIN_ID]: lastGeneratedSlot } });
            }
            addLog(`Fehler: ${e?.message || e}`, "error");
        } finally {
            setIsZapping(false);
        }
    };

    const handleDialogueSeries = async (requestedParts?: number) => {
        if (!activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }

        const sourceRaw = (activeProject.rawInput || "").trim();
        const sourceFacts = (activeProject.factText || "").trim();
        if (!sourceRaw && !sourceFacts) {
            addLog("Bitte Grok Dossier oder Additional Facts füllen (Source Data ist leer).", "error");
            return;
        }

        const controls = activeProject.segmentControls[MAIN_ID] || DEFAULT_CONTROLS;
        const parts = clampSeriesParts(requestedParts ?? controls.series_parts);
        const model = getCurrentModel();

        const section0 = activeProject.scriptResult.sections[0];
        const versions = section0.versions;
        const currentV = activeProject.segmentVersions[MAIN_ID] || 'dialogue_1';
        const targetSlots = buildSeriesSlots('dialogue', parts, currentV);
        const nextSeriesSlots = { ...(section0.seriesSlots || {}), ...buildSeriesSlotMap(targetSlots, parts) };

        setIsZapping(true);
        const updatedVersions = { ...versions };
        let prevText = "";
        let generatedCount = 0;
        try {
            for (let idx = 0; idx < parts; idx++) {
                const partNo = idx + 1;
                const seriesMeta = buildSeriesMeta('dialogue', partNo, parts, prevText);
                const factsAug = [sourceFacts, seriesMeta].filter(Boolean).join("\n\n");
                const dialogueText = await generateDialogue(sourceRaw, factsAug, controls, model);
                if (!dialogueText || dialogueText.trim().length === 0) throw new Error("Generierter Dialog ist leer.");
                let finalText = dialogueText;
                try {
                    finalText = await enforceSeriesHookAndCTA('dialogue', dialogueText, controls, model);
                } catch (hookCtaError: any) {
                    addLog(`Dialogue Teil ${partNo}: Hook/CTA fehlgeschlagen, nutze Basisteil (${hookCtaError?.message || hookCtaError})`, "warn");
                }
                const slot = targetSlots[idx];
                updatedVersions[slot] = finalText;
                prevText = dialogueText;
                generatedCount += 1;
                addLog(`Dialogue Teil ${partNo}/${parts} -> ${slot}`, "success");
            }

            const updatedResult = {
                ...activeProject.scriptResult,
                model,
                sections: [{ ...section0, versions: updatedVersions, seriesSlots: nextSeriesSlots }]
            };
            const lastSlot = targetSlots[targetSlots.length - 1] || currentV;
            commitAction(`Dialogue Serie (${parts} Teile)`, { scriptResult: updatedResult, segmentVersions: { [MAIN_ID]: lastSlot } });
        } catch (e: any) {
            if (generatedCount > 0) {
                const partialSeriesSlots = targetSlots.slice(0, generatedCount).reduce<Record<string, { seriesId: string; part: number; total: number }>>((acc, slot) => {
                    acc[slot] = nextSeriesSlots[slot];
                    return acc;
                }, {});
                const updatedResult = {
                    ...activeProject.scriptResult,
                    model,
                    sections: [{ ...section0, versions: updatedVersions, seriesSlots: { ...(section0.seriesSlots || {}), ...partialSeriesSlots } }]
                };
                const lastGeneratedSlot = targetSlots[Math.max(0, generatedCount - 1)] || currentV;
                commitAction(`Dialogue Serie teilweise (${generatedCount}/${parts})`, { scriptResult: updatedResult, segmentVersions: { [MAIN_ID]: lastGeneratedSlot } });
            }
            addLog(`Fehler: ${e?.message || e}`, "error");
        } finally {
            setIsZapping(false);
        }
    };

    const handleWriteAndFit = async () => {
        addLog("=== WRITE & FIT GESTARTET ===", "info");
        
        if (!activeProject?.scriptResult) {
            addLog("FEHLER: Kein aktives Projekt oder scriptResult", "error");
            return;
        }
        
        if (!checkProtection()) {
            addLog("ABGEBROCHEN: Final-Schutz", "warn");
            return;
        }

        const keyCheck = checkApiKey();
        addLog(`API Key Check: ${keyCheck.valid ? 'OK' : 'FEHLT'}`, keyCheck.valid ? "info" : "error");
        
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }

        const controls = activeProject.segmentControls[MAIN_ID];
        const versions = activeProject.scriptResult.sections[0].versions;
        const currentV = activeProject.segmentVersions[MAIN_ID];
        const currentText = versions[currentV] || "";
        const hasExistingText = currentText.trim().length > 0;
        const model = getCurrentModel();
        
        addLog(`Modell: ${model}`, "info");
        addLog(`Aktueller Slot: ${currentV}`, "info");
        addLog(`Hat bestehenden Text: ${hasExistingText}`, "info");
        addLog(`📋 Grok Dossier: ${activeProject.rawInput?.length || 0} Zeichen`, "info");
        addLog(`📝 Additional Facts: ${activeProject.factText?.length || 0} Zeichen`, "info");
        addLog(`🎯 Basis für Write & Fit: Grok + Facts (Slot-Inhalt wird nicht als Quelle genutzt)`, "info");
        addLog(`Controls: style=${controls?.style}, metaphor=${controls?.metaphor}, info=${controls?.info}`, "info");
        
        setIsZapping(true);
        try {
            const sourceRaw = (activeProject.rawInput || "").trim();
            const sourceFacts = (activeProject.factText || "").trim();
            if (!sourceRaw && !sourceFacts) {
                throw new Error("Bitte Grok Dossier oder Additional Facts füllen (Source Data ist leer).");
            }

            addLog("Rufe generateScriptWithControls auf...", "info");
            const generatedText = await generateScriptWithControls(
                sourceRaw,
                sourceFacts,
                controls,
                model
            );

            addLog(`Antwort erhalten: ${generatedText?.length || 0} Zeichen`, "info");

            if (!generatedText || generatedText.trim().length === 0) {
                throw new Error("Generierter Text ist leer.");
            }

            addLog("Generiere klickstarken Titel...", "info");
            const generatedTitle = await generateTitle(generatedText, model).catch(e => {
                console.error("Titel-Generierung fehlgeschlagen:", e);
                return ""; // Fallback
            });

            // Classify by actual word count (150 words ≈ 1 min, 450 words ≈ 3 min)
            const wordCount = generatedText.split(/\s+/).filter(w => w.length > 0).length;
            const isShort = wordCount < 450;
            const targetType = isShort ? 'short' : 'long';
            
            addLog(`Wörter: ${wordCount} → Klassifizierung: ${isShort ? 'SHORT' : 'LONG'}`, "info");
            
            let targetSlot: ScriptLength | null = null;
            if (isSlotUnedited(currentV)) {
                targetSlot = currentV;
                addLog(`Aktueller Slot ist leer, generiere direkt in: ${currentV}`, "info");
            } else {
                targetSlot = getFirstWritableSlot(targetType);
                addLog(`Leeren oder neuen Slot gefunden: ${targetSlot}`, "info");
            }
            
            if (!targetSlot) {
                targetSlot = getNextSlot(targetType);
                addLog(`Kein Slot gefunden, erstelle neu: ${targetSlot}`, "warn");
            }

            const updatedResult = { 
                ...activeProject.scriptResult, 
                model,
                sections: [{ 
                    ...activeProject.scriptResult.sections[0],
                    title: generatedTitle || activeProject.scriptResult.sections[0].title,
                    versions: { ...versions, [targetSlot]: generatedText } 
                }] 
            };
            
            const actionUpdates: Partial<typeof activeProject> = {
                scriptResult: updatedResult,
                segmentVersions: { [MAIN_ID]: targetSlot }
            };

            if (generatedTitle) {
                actionUpdates.name = generatedTitle;
                addLog(`Titel aktualisiert: ${generatedTitle}`, "success");
            }

            commitAction(`Generiert: ${wordCount} Wörter -> ${targetSlot}`, actionUpdates);
            addLog(`✅ ERFOLG: ${wordCount} Wörter in ${targetSlot}`, "success");
        } catch(e: any) { 
            addLog(`❌ FEHLER: ${e.message}`, "error"); 
            console.error("Write & Fit Error:", e);
        } finally { 
            setIsZapping(false); 
            addLog("=== WRITE & FIT BEENDET ===", "info");
        }
    };

    const handleNewsFlashGenerate = async () => {
        if (!activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }

        const controls = activeProject.segmentControls[MAIN_ID] || DEFAULT_CONTROLS;
        const seconds = Math.max(15, Math.min(50, controls.news_seconds || 30));
        const model = getCurrentModel();

        const sourceRaw = (activeProject.rawInput || "").trim();
        const sourceFacts = (activeProject.factText || "").trim();
        if (!sourceRaw && !sourceFacts) {
            addLog("Bitte Grok Dossier oder Additional Facts füllen (Source Data ist leer).", "error");
            return;
        }

        setIsZapping(true);
        try {
            const newsText = await generateNewsFlash(sourceRaw, sourceFacts, { ...controls, news_seconds: seconds }, model);
            if (!newsText || newsText.trim().length === 0) throw new Error("Generierter Text ist leer.");

            addLog("Generiere klickstarken Titel...", "info");
            const generatedTitle = await generateTitle(newsText, model).catch(e => {
                console.error("Titel-Generierung fehlgeschlagen:", e);
                return ""; // Fallback
            });

            const versions = activeProject.scriptResult.sections[0].versions;
            const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
            const targetSlot: ScriptLength = getFirstWritableSlot('short', currentV.startsWith('short') ? currentV : undefined);

            const updatedResult = {
                ...activeProject.scriptResult,
                model,
                sections: [{
                    ...activeProject.scriptResult.sections[0],
                    title: generatedTitle || activeProject.scriptResult.sections[0].title,
                    versions: { ...versions, [targetSlot]: newsText }
                }]
            };

            const actionUpdates: Partial<typeof activeProject> = {
                scriptResult: updatedResult,
                segmentVersions: { [MAIN_ID]: targetSlot }
            };

            if (generatedTitle) {
                actionUpdates.name = generatedTitle;
                addLog(`Titel aktualisiert: ${generatedTitle}`, "success");
            }

            const wordCount = newsText.split(/\s+/).filter(w => w.length > 0).length;
            commitAction(`News Flash: ${seconds}s (${wordCount} Wörter) -> ${targetSlot}`, actionUpdates);
        } catch (e: any) {
            addLog(`Fehler: ${e.message}`, "error");
        } finally {
            setIsZapping(false);
        }
    };

    const handleInstagramWisdomGenerate = async () => {
        if (!activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }

        const controls = activeProject.segmentControls[MAIN_ID] || DEFAULT_CONTROLS;
        const seconds = Math.max(20, Math.min(70, controls.insta_seconds || 45));
        const model = getCurrentModel();

        setIsZapping(true);
        try {
            const picked = await getRandomHistoricalWikiquote(80);
            const igText = await generateInstagramWisdom(
                picked.quote,
                picked.author,
                picked.deathYear,
                picked.url,
                { ...controls, insta_seconds: seconds },
                model
            );
            if (!igText || igText.trim().length === 0) throw new Error("Generierter Text ist leer.");

            const section0 = activeProject.scriptResult.sections[0];
            const versions = section0.versions;
            const currentV = activeProject.segmentVersions[MAIN_ID] || 'insta_1';
            const targetSlot: ScriptLength = getFirstWritableSlot('insta', currentV.startsWith('insta') ? currentV : undefined);

            const prevSources = Array.isArray(section0.sources) ? section0.sources : [];
            const hasSource = prevSources.some(s => s?.url === picked.url);
            const nextSources = hasSource ? prevSources : [...prevSources, { title: `Wikiquote: ${picked.author}`, url: picked.url, type: 'wikiquote' }];

            const updatedResult = {
                ...activeProject.scriptResult,
                model,
                sections: [{
                    ...section0,
                    sources: nextSources,
                    versions: { ...versions, [targetSlot]: igText }
                }]
            };

            commitAction(`IG Wisdom: ${seconds}s -> ${targetSlot}`, {
                scriptResult: updatedResult,
                segmentVersions: { [MAIN_ID]: targetSlot }
            });
        } catch (e: any) {
            addLog(`Fehler: ${e?.message || e}`, "error");
        } finally {
            setIsZapping(false);
        }
    };

    const handleDialogueGenerate = async () => {
        if (!activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }

        const versions = activeProject.scriptResult.sections[0].versions;
        const currentV = activeProject.segmentVersions[MAIN_ID];
        let targetSlot: ScriptLength = currentV;

        if (!currentV.startsWith('dialogue')) {
            targetSlot = getFirstWritableSlot('dialogue');
        }

        setIsZapping(true);
        try {
            const controls = activeProject.segmentControls[MAIN_ID] || DEFAULT_CONTROLS;
            const model = getCurrentModel();
            const dialogueText = await generateDialogue(
                activeProject.rawInput, 
                activeProject.factText, 
                controls, 
                model
            );
            
            if (!dialogueText || dialogueText.trim().length === 0) {
                throw new Error("Generierter Dialog ist leer.");
            }

            const updatedResult = { 
                ...activeProject.scriptResult, 
                model,
                sections: [{ 
                    ...activeProject.scriptResult.sections[0], 
                    versions: { ...activeProject.scriptResult.sections[0].versions, [targetSlot]: dialogueText } 
                }] 
            };
            
            commitAction(`Dialogue (${controls.dialogue_seconds || 60}s) -> ${targetSlot}`, { 
                scriptResult: updatedResult, 
                segmentVersions: { [MAIN_ID]: targetSlot } 
            });
        } catch(e: any) { addLog(`Fehler: ${e.message}`, "error"); } finally { setIsZapping(false); }
    };
    
    // ... (rest of handles same as before)
    const handleGenerateCTA = async () => {
        if (!activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const { slotText, context } = getSlotTextOrSourceContext(currentV);
        const controls = activeProject.segmentControls[MAIN_ID];
        const model = getCurrentModel();

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }
        if (!context.trim()) {
            addLog("Bitte Grok Dossier oder Additional Facts füllen (Source Data ist leer).", "error");
            return;
        }

        setIsZapping(true);
        try {
            const ctaText = await generateCTA(context, controls, model);
            const updatedText = slotText.trim() ? (slotText + "\n\n" + ctaText) : ctaText;
            const updatedResult = { 
                ...activeProject.scriptResult, 
                model,
                sections: [{ 
                    ...activeProject.scriptResult.sections[0], 
                    versions: { ...activeProject.scriptResult.sections[0].versions, [currentV]: updatedText } 
                }] 
            };
            commitAction("New CTA Added", { scriptResult: updatedResult });
        } catch(e: any) { addLog(`CTA Fehler: ${e?.message || e}`, "error"); } finally { setIsZapping(false); }
    };

    const handleHookZapp = async () => {
        if (!activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const { slotText: text, context } = getSlotTextOrSourceContext(currentV);
        const controls = activeProject.segmentControls[MAIN_ID];
        const isDialogue = currentV.includes('dialogue');
        const model = getCurrentModel();

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }
        if (!context.trim()) {
            addLog("Bitte Grok Dossier oder Additional Facts füllen (Source Data ist leer).", "error");
            return;
        }

        setIsZapping(true);
        try {
            const newHook = await regenerateHook(context, controls, model);
            let updatedText = text;

            if (!text.trim()) {
                updatedText = newHook;
            } else if (isDialogue) {
                const speakerRegex = /^(.*?:)(.*?)(\n|$)/m;
                const match = text.match(speakerRegex);
                
                if (match) {
                    const fullMatch = match[0];
                    const prefix = match[1];
                    const suffix = match[3]; 
                    const newLine = `${prefix} ${newHook}${suffix}`;
                    updatedText = text.replace(fullMatch, newLine);
                } else {
                    updatedText = newHook + "\n\n" + text;
                }
            } else {
                const oldHookMatch = text.match(/^\*\*[\s\S]*?\*\*/);
                if (oldHookMatch) {
                    updatedText = text.replace(/^\*\*[\s\S]*?\*\*/, newHook);
                } else {
                    updatedText = newHook + "\n\n" + text;
                }
            }

            const updatedResult = { 
                ...activeProject.scriptResult, 
                model,
                sections: [{ 
                    ...activeProject.scriptResult.sections[0], 
                    versions: { ...activeProject.scriptResult.sections[0].versions, [currentV]: updatedText } 
                }] 
            };
            commitAction("Hook Zapp", { scriptResult: updatedResult });
        } catch (e: any) { addLog(`Hook Fehler: ${e?.message || e}`, "error"); } finally { setIsZapping(false); }
    };

    const handleEmptyEditor = () => {
        if (!activeProject || !activeProject.scriptResult) return;
        
        if (window.confirm("⚠️ Editor leeren?\n\nNur der Inhalt des aktuellen Slots wird gelöscht.")) {
            const currentSlot = activeProject.segmentVersions[MAIN_ID];
            const section = activeProject.scriptResult.sections[0];
            
            if (section?.versions[currentSlot]) {
                const updatedVersions = { ...section.versions, [currentSlot]: "" };
                const updatedResult: ScriptResult = {
                    ...activeProject.scriptResult,
                    wordCount: activeProject.scriptResult.wordCount || {},
                    estimatedCost: activeProject.scriptResult.estimatedCost || 0,
                    model: activeProject.scriptResult.model || "",
                    sections: [{ ...section, versions: updatedVersions }]
                };
                commitAction(`Editor geleert: ${currentSlot}`, { scriptResult: updatedResult });
                addLog(`✅ Slot ${currentSlot} geleert`, "success");
            }
        }
    };

    const handleToggleEdit = () => {
        if (!activeProject) return;
        if (activeProject.isEditing) {
            // Save
            if (!activeProject.scriptResult) return;
            const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
            const updatedResult = {
                ...activeProject.scriptResult,
                sections: [{
                    ...activeProject.scriptResult.sections[0],
                    versions: { ...activeProject.scriptResult.sections[0].versions, [currentV]: activeProject.manualEditText }
                }]
            };
            commitAction("Manueller Edit", { scriptResult: updatedResult, isEditing: false });
        } else {
            // Start
            if (!checkProtection()) return;
            const text = activeProject.scriptResult?.sections?.[0]?.versions[activeProject.segmentVersions[MAIN_ID] || 'short_1'] || "";
            updateActiveProject({ isEditing: true, manualEditText: text });
        }
    };

    const handleToneRewrite = async (toneKey: string) => {
        if (!selectionMenu || !activeProject?.scriptResult) return;
        if (!checkProtection()) return;

        setSelectionMenu(null); setIsZapping(true);
        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const model = getCurrentModel();
        try {
            const transformed = await rewriteSelectionWithTone(selectionMenu.text, toneKey, model);
            const sourceText = activeProject.scriptResult.sections[0].versions[currentV];
            const range = mapSelectionToRaw(sourceText, selectionMenu.text);
            
            if (range) {
                const updatedText = sourceText.substring(0, range.start) + transformed + sourceText.substring(range.end);
                const updatedResult = {
                    ...activeProject.scriptResult,
                    model,
                    sections: [{
                        ...activeProject.scriptResult.sections[0],
                        versions: { ...activeProject.scriptResult.sections[0].versions, [currentV]: updatedText }
                    }]
                };
                commitAction(`Tone: ${toneKey}`, { scriptResult: updatedResult });
            }
        } catch(e) { addLog("Tone Error", "error"); } finally { setIsZapping(false); }
    };
    
    const handleToggleFinal = () => {
        if (!activeProject?.scriptResult) return;
        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const section = activeProject.scriptResult.sections[0];
        const isFinal = section.isFinal?.[currentV] || false;
        const versions = section.versions || {};
        const currentText = typeof (versions as any)[currentV] === 'string' ? (versions as any)[currentV] : "";
        
        const updatedResult = {
            ...activeProject.scriptResult,
            sections: [{
                ...section,
                isFinal: {
                    ...section.isFinal,
                    [currentV]: !isFinal
                }
            }]
        };
        commitAction("Status Änderung", { scriptResult: updatedResult });

        const willBeFinal = !isFinal;
        if (!willBeFinal) return;
        if (!currentText.trim()) return;

        const safeParse = (input: string): any => {
            const s = (input || "").trim();
            const start = s.indexOf('{');
            const end = s.lastIndexOf('}');
            if (start === -1 || end === -1 || end <= start) throw new Error("Unerwartetes Antwortformat (kein JSON).");
            return JSON.parse(s.slice(start, end + 1));
        };

        setLegalCheck({ open: true, loading: true, slot: currentV });
        (async () => {
            try {
                const { content, citations } = await getPerplexityLegalCheck(currentText);
                const parsed = safeParse(content) as Partial<LegalCheckResult>;
                const verdict: LegalVerdict = (parsed.verdict === 'green' || parsed.verdict === 'yellow' || parsed.verdict === 'red') ? parsed.verdict : 'yellow';
                const issues = Array.isArray((parsed as any).issues) ? (parsed as any).issues.map((x: any) => ({
                    problematicQuote: String(x?.problematicQuote || ""),
                    whyRisky: String(x?.whyRisky || ""),
                    saferRewrite: String(x?.saferRewrite || "")
                })).filter((i: LegalIssue) => i.problematicQuote || i.whyRisky || i.saferRewrite) : [];
                setLegalCheck({
                    open: true,
                    loading: false,
                    slot: currentV,
                    result: {
                        verdict,
                        summary: String((parsed as any).summary || ""),
                        issues,
                        citations: Array.isArray(citations) ? citations : []
                    }
                });
            } catch (e: any) {
                setLegalCheck({ open: true, loading: false, slot: currentV, error: e?.message || String(e) });
            }
        })();
    };

    const handlePlatformSafetyCheck = async () => {
        if (!activeProject?.scriptResult) return;
        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const text = activeProject.scriptResult.sections[0].versions[currentV] || "";
        if (!text.trim()) {
            addLog("Kein generierter Text im aktuellen Slot.", "error");
            return;
        }

        const keyCheck = checkApiKey();
        if (!keyCheck.valid) {
            addLog(keyCheck.message || "API Key fehlt", "error");
            setSettingsOpen(true);
            return;
        }

        setPlatformCheckLoadingSlot(currentV);
        try {
            const model = getCurrentModel();
            const result = await analyzePlatformSafety(text, model);
            const section = activeProject.scriptResult.sections[0];
            const updatedResult = {
                ...activeProject.scriptResult,
                sections: [{
                    ...section,
                    platformSafetyChecks: {
                        ...(section.platformSafetyChecks || {}),
                        [currentV]: result
                    }
                }]
            };
            commitAction(`Plattform-Check: ${currentV}`, { scriptResult: updatedResult });
            addLog(`Plattform-Check abgeschlossen: ${getSlotLabel(currentV)}`, "success");
        } catch (e: any) {
            addLog(`Plattform-Check Fehler: ${e?.message || e}`, "error");
        } finally {
            setPlatformCheckLoadingSlot(null);
        }
    };

    const handleApplySafetyVariant = (variantKey: 'variantA' | 'variantB', targetMode: 'current' | 'new' = 'current') => {
        if (!activeProject?.scriptResult) return;
        const currentV = activeProject.segmentVersions[MAIN_ID] || 'short_1';
        const section = activeProject.scriptResult.sections[0];
        const safetyCheck = section.platformSafetyChecks?.[currentV];
        const replacement = safetyCheck?.[variantKey] || "";
        if (!replacement.trim()) {
            addLog("Keine entschärfte Variante verfügbar.", "error");
            return;
        }

        const nextSafetyChecks = { ...(section.platformSafetyChecks || {}) };
        delete nextSafetyChecks[currentV];
        const prefix = getSlotPrefix(currentV);
        const targetSlot = targetMode === 'new' && prefix ? getNextSlot(prefix) : currentV;

        const updatedResult = {
            ...activeProject.scriptResult,
            sections: [{
                ...section,
                versions: {
                    ...section.versions,
                    [targetSlot]: replacement
                },
                platformSafetyChecks: nextSafetyChecks
            }]
        };

        commitAction(`Entschärfte Variante ${variantKey === 'variantA' ? 'A' : 'B'} übernommen`, { scriptResult: updatedResult, segmentVersions: { [MAIN_ID]: targetSlot } });
        addLog(`Entschärfte Variante ${variantKey === 'variantA' ? 'A' : 'B'} in ${getSlotLabel(targetSlot)} übernommen`, "success");
    };

    const clearSlot = (slot: ScriptLength, projectId: string) => {
        addLog(`clearSlot aufgerufen für: ${slot} in Projekt: ${projectId}`, "info");
        
        setProjects(currentProjects => {
            const project = currentProjects.find(p => p.id === projectId);
            if (!project?.scriptResult) {
                addLog("FEHLER: Projekt nicht gefunden oder kein scriptResult", "error");
                return currentProjects;
            }
            
            const section = project.scriptResult.sections[0];
            const isFinal = section.isFinal?.[slot] || false;
            const currentContent = section.versions[slot];
            
            addLog(`Aktueller Inhalt: ${currentContent?.length || 0} Zeichen`, "info");
            addLog(`Ist final: ${isFinal}`, "info");
            
            if (isFinal) {
                addLog("Slot ist finalisiert und kann nicht geleert werden", "error");
                return currentProjects;
            }
            
            const updatedVersions = { ...section.versions, [slot]: "" };
            const updatedSafetyChecks = { ...(section.platformSafetyChecks || {}) };
            delete updatedSafetyChecks[slot];
            const updatedSeriesSlots = { ...(section.seriesSlots || {}) };
            delete updatedSeriesSlots[slot];
            
            const updatedResult = {
                ...project.scriptResult,
                sections: [{
                    ...section,
                    versions: updatedVersions,
                    platformSafetyChecks: updatedSafetyChecks,
                    seriesSlots: updatedSeriesSlots
                }]
            };
            
            const updatedProject = {
                ...project,
                scriptResult: updatedResult,
                lastModified: Date.now()
            };
            
            addLog(`✅ Slot ${slot} erfolgreich geleert`, "success");
            return currentProjects.map(p => p.id === projectId ? updatedProject : p);
        });
    };

    const handleAuphonicProcessing = async () => {
        if (!activeProject?.scriptResult?.sections?.[0]) return;
        const currentSlot = activeProject.segmentVersions?.[MAIN_ID] ?? 'short_1';
        const elevenLabsAudio = activeProject.scriptResult.sections[0].elevenLabsAudio?.[currentSlot];
        
        if (!elevenLabsAudio) {
            addLog("Kein ElevenLabs Audio vorhanden zum Verarbeiten.", "error");
            return;
        }
        
        setIsGeneratingAuphonic(true);
        addLog("Sende Audio an Auphonic zur Verarbeitung...", "info");
        
        try {
            const masteredAudioBase64 = await processWithAuphonic(elevenLabsAudio);
            
            const updatedResult = {
                ...activeProject.scriptResult,
                sections: [{
                    ...activeProject.scriptResult.sections[0],
                    auphonicAudio: {
                        ...(activeProject.scriptResult.sections[0].auphonicAudio || {}),
                        [currentSlot]: masteredAudioBase64
                    }
                }]
            };

            commitAction(`Auphonic Mastering für ${currentSlot}`, { scriptResult: updatedResult });
            fetchAuphonicUsage();
            addLog("Auphonic Verarbeitung erfolgreich abgeschlossen!", "success");
        } catch (e: any) {
            console.error("Auphonic Error:", e);
            addLog(`Fehler bei Auphonic Verarbeitung: ${e.message}`, "error");
            alert(`Fehler bei Auphonic: ${e.message}`);
        } finally {
            setIsGeneratingAuphonic(false);
        }
    };

    const SPEEDUP_PRESETS: Record<string, { speed: number, silenceThreshold: number, minSilenceDuration: number, targetSilenceDuration: number }> = {
        zeitblytz_standard: { speed: 1.12, silenceThreshold: -40.0, minSilenceDuration: 0.30, targetSilenceDuration: 0.15 },
        aggressiv: { speed: 1.18, silenceThreshold: -45.0, minSilenceDuration: 0.22, targetSilenceDuration: 0.08 },
        voiceover_turbo: { speed: 1.20, silenceThreshold: -43.0, minSilenceDuration: 0.20, targetSilenceDuration: 0.10 },
    };

    const handleSpeedup = async () => {
        if (!activeProject?.scriptResult?.sections?.[0]) return;
        const auphonicAudio = activeProject.scriptResult.sections[0].auphonicAudio?.[currentSlot];
        if (!auphonicAudio) {
            addLog("Kein gemastertes Audio vorhanden. Bitte zuerst Auphonic ausführen.", "error");
            return;
        }
        setIsProcessingSpeedup(true);
        addLog("Wende Speedup an (Pausen kürzen + beschleunigen)...", "info");
        try {
            const presetValues = speedupConfig.preset ? SPEEDUP_PRESETS[speedupConfig.preset] : null;
            const params = presetValues || speedupConfig;
            const formData = new FormData();
            formData.append('audio_base64', auphonicAudio);
            if (speedupConfig.preset && presetValues) {
                formData.append('preset', speedupConfig.preset);
            } else {
                formData.append('speed', params.speed.toString());
                formData.append('silence_threshold', params.silenceThreshold.toString());
                formData.append('min_silence_duration', params.minSilenceDuration.toString());
                formData.append('target_silence_duration', params.targetSilenceDuration.toString());
            }

            const response = await fetch('https://story.zeitblytz.media/speedup.php', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
                throw new Error(errData.error || response.statusText);
            }

            const result = await response.json();
            if (!result.audio_base64) throw new Error('Keine Audiodaten in der Antwort');

            const updatedResult = {
                ...activeProject.scriptResult,
                sections: [{
                    ...activeProject.scriptResult.sections[0],
                    speedupAudio: {
                        ...(activeProject.scriptResult.sections[0].speedupAudio || {}),
                        [currentSlot]: result.audio_base64
                    },
                    speedupStats: {
                        ...(activeProject.scriptResult.sections[0].speedupStats || {}),
                        [currentSlot]: result.stats
                    }
                }]
            };

            commitAction(`Speedup für ${currentSlot}`, { scriptResult: updatedResult });
            const stats = result.stats;
            addLog(`Speedup fertig! ${stats.silences_shortened} Pausen gekürzt, ${stats.speed_applied}x Speed, ${stats.original_duration}s → ${stats.processed_duration}s`, "success");
        } catch (e: any) {
            console.error("Speedup Error:", e);
            addLog(`Fehler bei Speedup: ${e.message}`, "error");
            alert(`Fehler bei Speedup: ${e.message}`);
        } finally {
            setIsProcessingSpeedup(false);
        }
    };

    const handleGlobalExport = () => {
        const exportData: WorkspaceExport = { version: 1, projects: projects };
        const blob = new Blob([JSON.stringify(exportData)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `zeitblitz_workspace_${new Date().toISOString().slice(0,10)}.json`; a.click();
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target?.result as string);
                if (json.version === 1 && Array.isArray(json.projects)) {
                    setProjects(json.projects);
                    setActiveProjectId(null);
                    addLog(`Workspace geladen (${json.projects.length} Projekte)`, "success");
                    json.projects.forEach((p: ProjectSession) => saveProject(p));
                } else if (json.dossier) {
                    const recoveredProject: ProjectSession = {
                        id: crypto.randomUUID(),
                        name: "Imported Project",
                        lastModified: Date.now(),
                        rawInput: json.dossier,
                        factText: "",
                        scriptResult: json.scriptResult,
                        segmentVersions: json.segmentVersions || { [MAIN_ID]: 'short_1' },
                        segmentControls: json.segmentControls || { [MAIN_ID]: { ...DEFAULT_CONTROLS } },
                        history: [], 
                        historyIndex: -1,
                        isEditing: false,
                        manualEditText: "",
                        selectedModel: getSettings().googleFastModel,
                        publishedOn: []
                    };
                    setProjects(prev => [recoveredProject, ...prev]);
                    saveProject(recoveredProject);
                    addLog("Einzelprojekt importiert und gespeichert", "success");
                } else {
                    addLog("Unbekanntes Format", "error");
                }
            } catch(err) { addLog("Ungültige Datei", "error"); }
        };
        reader.readAsText(file);
    };

    if (!activeProject || !activeProjectId) {
        return <>
            <HomeDashboard 
                projects={projects} 
                setProjects={setProjects}
                onCreate={createNewProject} 
                onSelect={setActiveProjectId} 
                onDelete={deleteProject}
                onImport={handleImport}
                isLoading={isCloudLoading}
                cloudStatus={cloudStatus}
                onOpenSettings={() => setSettingsOpen(true)}
            />
            <SettingsModal 
                open={settingsOpen} 
                onClose={() => { 
                    setSettingsOpen(false); 
                    setSettingsVersion(v => v + 1); 
                }} 
            />
            {confirmClearSlot && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-white/20 rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
                        <h3 className="text-lg font-black text-white mb-2">Slot leeren?</h3>
                        <p className="text-slate-400 text-sm mb-4">
                            Der Inhalt von <span className="text-white font-bold">{getSlotLabel(confirmClearSlot.slot)}</span> wird unwiderruflich gelöscht.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmClearSlot(null)} className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold text-white transition-all">
                                Abbrechen
                            </button>
                            <button onClick={() => { clearSlot(confirmClearSlot.slot, confirmClearSlot.projectId); setConfirmClearSlot(null); }} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-bold text-white transition-all">
                                Löschen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>;
    }

    const versions = activeProject.scriptResult?.sections?.[0]?.versions ?? {};
    const currentSlot = activeProject.segmentVersions?.[MAIN_ID] ?? 'short_1';
    const currentText = typeof (versions as any)[currentSlot] === 'string' ? (versions as any)[currentSlot] : "";
    const controls = activeProject.segmentControls?.[MAIN_ID] ?? DEFAULT_CONTROLS;
    const isCurrentFinal = activeProject.scriptResult?.sections?.[0]?.isFinal?.[currentSlot] || false;
    const currentSafetyCheck = activeProject.scriptResult?.sections?.[0]?.platformSafetyChecks?.[currentSlot];
    
    const getTextWordCount = (txt: string) => (txt || "").replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(w => w.length > 0).length;
    const words = activeProject.isEditing ? getTextWordCount(activeProject.manualEditText) : getTextWordCount(currentText);
    const totalSeconds = Math.round((words / 100) * 45);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const readingTime = `${minutes}:${seconds.toString().padStart(2, '0')} min`;
    
    const exportShorts = (type: 'copy' | 'download') => {
        const versions = activeProject?.scriptResult?.sections?.[0]?.versions || {};
        const shortSlots = getSlotsByPrefix('short', false).filter(v => (versions[v]?.trim().length ?? 0) > 0);
        
        if (shortSlots.length === 0) {
            alert('Keine generierten Short-Texte gefunden.');
            return;
        }

        let exportContent = '';
        shortSlots.forEach((slot, index) => {
            exportContent += `Version ${index + 1}\n\n${versions[slot].trim()}\n\n`;
        });

        if (type === 'copy') {
            navigator.clipboard.writeText(exportContent.trim()).then(() => {
                alert('Alle Short-Texte wurden in die Zwischenablage kopiert!');
            }).catch(err => {
                console.error('Fehler beim Kopieren:', err);
                alert('Fehler beim Kopieren in die Zwischenablage.');
            });
        } else if (type === 'download') {
            const blob = new Blob([exportContent.trim()], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeName = (activeProject?.name || 'Projekt').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `${safeName}_shorts.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    const handleElevenLabsPrep = async () => {
        if (!currentText || currentText.trim().length === 0) {
            alert('Kein Text zum Vorbereiten gefunden.');
            return;
        }

        setIsElevenLabsLoading(true);
        addLog("Bereite Skript für ElevenLabs V3 vor...", "info");
        try {
            const model = getProModel();
            const taggedScript = await prepareForElevenLabs(currentText, model);
            
            // Optional: Text in die Zwischenablage kopieren
            // await navigator.clipboard.writeText(taggedScript);
            
            updateActiveProject({
                scriptResult: {
                    ...activeProject.scriptResult!,
                    sections: [
                        {
                            ...activeProject.scriptResult!.sections[0],
                            elevenLabsPrep: {
                                ...(activeProject.scriptResult!.sections[0].elevenLabsPrep || {}),
                                [currentSlot]: taggedScript
                            }
                        }
                    ]
                }
            });
            addLog("Skript erfolgreich für ElevenLabs vorbereitet!", "success");
        } catch (error) {
            console.error('Fehler bei der ElevenLabs Vorbereitung:', error);
            addLog("Fehler bei der Vorbereitung für ElevenLabs.", "error");
            alert('Fehler bei der Vorbereitung für ElevenLabs.');
        } finally {
            setIsElevenLabsLoading(false);
        }
    };

    const handleElevenLabsAudio = async () => {
        const prepText = activeProject.scriptResult?.sections?.[0]?.elevenLabsPrep?.[currentSlot];
        if (!prepText || prepText.trim().length === 0) {
            alert('Bitte bereite den Text zuerst für ElevenLabs vor.');
            return;
        }

        setIsGeneratingAudio(true);
        addLog("Generiere Audio mit ElevenLabs V3...", "info");
        try {
            const { audioBase64, characterCount } = await generateElevenLabsAudio(prepText);
            
            updateActiveProject({
                scriptResult: {
                    ...activeProject.scriptResult!,
                    sections: [
                        {
                            ...activeProject.scriptResult!.sections[0],
                            elevenLabsAudio: {
                                ...(activeProject.scriptResult!.sections[0].elevenLabsAudio || {}),
                                [currentSlot]: audioBase64
                            },
                            elevenLabsCharCount: {
                                ...(activeProject.scriptResult!.sections[0].elevenLabsCharCount || {}),
                                [currentSlot]: characterCount
                            }
                        }
                    ]
                }
            });
            fetchElevenLabsUsage();
            addLog(`ElevenLabs Audio generiert! (Kosten: ${characterCount} Zeichen)`, "success");
        } catch (error: any) {
            console.error('Fehler bei der Audio-Generierung:', error);
            addLog(`Fehler bei ElevenLabs: ${error.message || 'Unbekannter Fehler'}`, "error");
            alert(error.message || 'Fehler bei der Generierung des Audios.');
        } finally {
            setIsGeneratingAudio(false);
        }
    };

    const allSlotGroups = {
        shorts: getSlotsByPrefix('short', true),
        longs: getSlotsByPrefix('long', true),
        dialogues: getSlotsByPrefix('dialogue', true),
        instas: getSlotsByPrefix('insta', true)
    };

    return (
        <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-emerald-500/30 overflow-hidden flex flex-col"
             onMouseDown={(e) => { if (selectionMenu && !(e.target as HTMLElement).closest('.selection-menu')) setSelectionMenu(null); }}>
             
            {/* ... rest of the JSX ... */}
            {/* The rest of the return block is identical to the previous context, ensuring the full file is returned correctly. */}
            
            {selectionMenu?.visible && (
                <div className="fixed z-[999] bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl p-4 w-72 selection-menu" style={{ left: selectionMenu.x, top: selectionMenu.y, transform: 'translate(-50%, -100%)' }}>
                     <div className="grid grid-cols-1 gap-1">
                        {TONE_OPTIONS.map(tone => <button key={tone.key} onClick={() => handleToneRewrite(tone.key)} className="text-left px-3 py-2 hover:bg-white/5 rounded-lg text-xs font-bold">{tone.label}</button>)}
                     </div>
                </div>
            )}

            <header className="h-14 md:h-16 border-b border-white/5 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-50">
                <div className="flex items-center gap-2 md:gap-4 flex-1">
                    <button onClick={() => setActiveProjectId(null)} className="w-8 h-8 bg-white/5 hover:bg-emerald-600 rounded-lg flex items-center justify-center transition-all group shrink-0" title="Projekt verlassen & zur Übersicht">
                         <svg className="w-4 h-4 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                    
                    <input 
                        type="text" 
                        value={activeProject.name} 
                        onChange={(e) => updateActiveProject({ name: e.target.value })}
                        className="bg-transparent border-none outline-none font-bold tracking-widest text-xs uppercase text-slate-400 focus:text-white placeholder-slate-600 transition-all w-32 md:w-64 hover:bg-white/5 rounded px-2 py-1 truncate"
                        placeholder="PROJECT NAME"
                        title="Projektname ändern"
                    />
                    
                    <div className="hidden md:block ml-4" title="Status der Cloud-Speicherung">
                        <CloudStatusIndicator status={cloudStatus} lastSaved={lastSavedTime} />
                    </div>
                </div>
                <div className="flex gap-2 md:gap-4 items-center">
                    {activeProject?.segmentControls?.[MAIN_ID]?.target_seconds && 
                     activeProject.segmentControls[MAIN_ID].target_seconds <= 60 && 
                     (activeProject.segmentControls[MAIN_ID].target_seconds < 35 || activeProject.segmentControls[MAIN_ID].target_seconds > 40) && (
                        <div className="hidden md:flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg" title="Warnung: Vorgeschriebene Zeit überschritten">
                            <span className="text-xs font-bold text-red-500">⚠️ ZEIT-WARNUNG: {activeProject.segmentControls[MAIN_ID].target_seconds}s verletzt die 35-40s Kurzvideo-Regel!</span>
                        </div>
                    )}
                    <button onClick={() => setSettingsOpen(true)} className="w-8 h-8 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all group shrink-0 border border-white/10" title="Einstellungen (API-Keys, Modelle, Audio-Settings)">
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <button onClick={toggleShortRules} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border whitespace-nowrap ${SETTINGS.shortRulesEnabled ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40' : 'bg-white/5 text-slate-500 border-white/10 hover:text-white hover:bg-white/10'}`} title="Strikte ZEITBLYTZ-Regeln (v3.5) für kurze Skripte aktivieren/deaktivieren">
                        SHORTRULES
                    </button>
                    <div className="hidden md:flex items-center gap-1" title="Aktuell gewähltes Sprachmodell (Provider-Einstellungen via Zahnrad)">
                        <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                            {SETTINGS.activeProvider === 'google' && (
                                <>
                                    <button onClick={() => { /* Model is now from settings */ }} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`}>⚡ {SETTINGS.googleFastModel}</button>
                                    <div className="w-px bg-white/10 my-1 mx-1"></div>
                                    <span className="px-3 py-1.5 text-[10px] font-black uppercase text-slate-500">💎 {SETTINGS.googleProModel}</span>
                                </>
                            )}
                            {SETTINGS.activeProvider === 'openai' && (
                                <>
                                    <button onClick={() => { /* Model is now from settings */ }} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all bg-green-500/20 text-green-400 border border-green-500/30`}>🟢 {SETTINGS.openaiFastModel}</button>
                                    <div className="w-px bg-white/10 my-1 mx-1"></div>
                                    <span className="px-3 py-1.5 text-[10px] font-black uppercase text-slate-500">🔷 {SETTINGS.openaiProModel}</span>
                                </>
                            )}
                            {SETTINGS.activeProvider === 'anthropic' && (
                                <>
                                    <button onClick={() => { /* Model is now from settings */ }} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all bg-orange-500/20 text-orange-400 border border-orange-500/30`}>🟠 {SETTINGS.anthropicFastModel}</button>
                                    <div className="w-px bg-white/10 my-1 mx-1"></div>
                                    <span className="px-3 py-1.5 text-[10px] font-black uppercase text-slate-500">🔶 {SETTINGS.anthropicProModel}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <button onClick={handleGlobalExport} className="px-3 py-1.5 md:px-4 md:py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[9px] md:text-[10px] font-black uppercase transition-all whitespace-nowrap" title="Alle Projekte als Workspace-Datei exportieren">Export All</button>
                </div>
            </header>
            
            <div className="md:hidden h-6 bg-slate-900/80 border-b border-white/5 flex items-center justify-between px-4">
                <CloudStatusIndicator status={cloudStatus} lastSaved={lastSavedTime} />
                <div className="flex items-center gap-2">
                    <button onClick={toggleShortRules} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${SETTINGS.shortRulesEnabled ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40' : 'bg-white/5 text-slate-500 border-white/10'}`}>
                        SR
                    </button>
                    <span className="text-[8px] font-bold text-slate-600 uppercase">{SETTINGS.activeProvider}</span>
                    <span className="text-[9px] font-mono text-slate-500">{getCurrentModel().split('-').slice(-2).join('-')}</span>
                </div>
            </div>

            <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
                <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#020617] border-t border-white/10 z-[60] flex items-center justify-around px-2 pb-safe shrink-0">
                    <button 
                        onClick={() => setMobileTab('inputs')}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${mobileTab === 'inputs' ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                        <span className="text-[9px] font-black uppercase tracking-wider">Inputs</span>
                    </button>
                    <button 
                        onClick={() => setMobileTab('editor')}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${mobileTab === 'editor' ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        <span className="text-[9px] font-black uppercase tracking-wider">Editor</span>
                    </button>
                </div>

                <div className={`w-full md:w-[400px] border-r border-white/5 bg-slate-900/30 md:flex flex-col p-6 gap-6 overflow-y-auto custom-scrollbar pb-24 md:pb-6 ${mobileTab === 'inputs' ? 'flex' : 'hidden'}`}>
                    {!activeProject.scriptResult ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-4 h-full flex flex-col">
                            <input 
                                className="w-full bg-transparent border-none text-xl font-bold text-white placeholder-slate-600 outline-none flex-shrink-0" 
                                placeholder="Project Title"
                                value={activeProject.name}
                                onChange={e => updateActiveProject({ name: e.target.value })}
                                title="Hier kannst du den Projektnamen ändern"
                            />
                            <div className="flex-1 flex flex-col gap-4">
                                <textarea 
                                    className="w-full flex-1 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-slate-300 outline-none focus:border-emerald-500/50 transition-all resize-none" 
                                    placeholder="Grok Text hier einfügen..."
                                    value={activeProject.rawInput}
                                    onChange={e => updateActiveProject({ rawInput: e.target.value })}
                                    title="Dossier / Rohmaterial: Füge hier deinen Haupt-Recherchetext ein"
                                />
                                <textarea 
                                    className="w-full h-32 md:h-48 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-slate-300 outline-none focus:border-emerald-500/50 transition-all resize-none" 
                                    placeholder="Zusätzliche Fakten / Kontext..."
                                    value={activeProject.factText}
                                    onChange={e => updateActiveProject({ factText: e.target.value })}
                                    title="Zusätzliche Fakten: Hier kannst du weitere Hintergrundinfos hinterlegen"
                                />
                            </div>
                            <button onClick={handleGenerate} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg transition-all flex-shrink-0" title="Startet die Erstanalyse deines Textes und lädt ihn in den Editor">
                                Load to Editor
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 h-full flex flex-col">
                            <div className="space-y-2 flex-shrink-0">
                                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Script Versions</h3>
                                
                                <div className="space-y-3">
                                    <details open className="group bg-black/20 border border-white/5 rounded-xl p-3 transition-all open:bg-black/40">
                                        <summary className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none list-none flex items-center justify-between">
                                            <span>Shorts (&lt; 3min)</span>
                                            <div className="flex gap-2 items-center">
                                                <div className="flex gap-1" onClick={e => e.preventDefault()}>
                                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); exportShorts('copy'); }} className="px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded text-[9px] font-bold text-slate-400 transition-colors" title="Alle Short-Texte kopieren">📋 Kopieren</button>
                                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); exportShorts('download'); }} className="px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded text-[9px] font-bold text-slate-400 transition-colors" title="Alle Short-Texte als TXT herunterladen">💾 Download</button>
                                                </div>
                                                <span className="text-slate-600 group-open:rotate-180 transition-transform">▼</span>
                                            </div>
                                        </summary>
                                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                                            {allSlotGroups.shorts.map(v => {
                                                const isFinal = activeProject.scriptResult?.sections?.[0]?.isFinal?.[v];
                                                const hasContent = ((activeProject.scriptResult?.sections?.[0]?.versions[v]?.trim().length ?? 0) > 0);
                                                const seriesBadge = getSeriesBadge(v);
                                                return (
                                                <div key={v} className="relative flex items-center">
                                                    {seriesBadge && (
                                                        <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-yellow-400 text-[8px] font-black text-black flex items-center justify-center z-10 shadow">
                                                            {seriesBadge}
                                                        </div>
                                                    )}
                                                    <button onClick={() => updateActiveProject({ segmentVersions: { ...activeProject.segmentVersions, [MAIN_ID]: v } })} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all flex items-center gap-1.5 ${activeProject.segmentVersions[MAIN_ID] === v ? 'bg-emerald-600 border-emerald-500 text-white' : hasContent ? 'bg-white/10 border-white/10 text-slate-300' : 'bg-white/5 border-white/5 text-slate-600 hover:text-slate-400'}`} title={`Zum Text-Slot "${getSlotLabel(v)}" wechseln`}>
                                                        {isFinal && <span className="text-[10px]">🔒</span>}
                                                        {getSlotLabel(v).replace('Short ', '')}
                                                        {isFinal && activeProject.segmentVersions[MAIN_ID] !== v && <span className="text-emerald-500 ml-0.5">✓</span>}
                                                    </button>
                                                    {hasContent && !isFinal && (
                                                        <button onClick={(e) => { e.stopPropagation(); setConfirmClearSlot({ slot: v, projectId: activeProject.id }); }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none" title="Diesen Slot leeren">×</button>
                                                    )}
                                                </div>
                                            )})}
                                        </div>
                                    </details>

                                    <details className="group bg-black/20 border border-white/5 rounded-xl p-3 transition-all open:bg-black/40">
                                        <summary className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none list-none flex items-center justify-between">
                                            <span>Longs (&gt; 3min)</span>
                                            <span className="text-slate-600 group-open:rotate-180 transition-transform">▼</span>
                                        </summary>
                                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                                            {allSlotGroups.longs.map(v => {
                                                const isFinal = activeProject.scriptResult?.sections?.[0]?.isFinal?.[v];
                                                const hasContent = ((activeProject.scriptResult?.sections?.[0]?.versions[v]?.trim().length ?? 0) > 0);
                                                const seriesBadge = getSeriesBadge(v);
                                                return (
                                                <div key={v} className="relative flex items-center">
                                                    {seriesBadge && (
                                                        <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-yellow-400 text-[8px] font-black text-black flex items-center justify-center z-10 shadow">
                                                            {seriesBadge}
                                                        </div>
                                                    )}
                                                    <button onClick={() => updateActiveProject({ segmentVersions: { ...activeProject.segmentVersions, [MAIN_ID]: v } })} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all flex items-center gap-1.5 ${activeProject.segmentVersions[MAIN_ID] === v ? 'bg-indigo-600 border-indigo-500 text-white' : hasContent ? 'bg-white/10 border-white/10 text-slate-300' : 'bg-white/5 border-white/5 text-slate-600 hover:text-slate-400'}`} title={`Zum Text-Slot "${getSlotLabel(v)}" wechseln`}>
                                                        {isFinal && <span className="text-[10px]">🔒</span>}
                                                        {getSlotLabel(v).replace('Long ', '')}
                                                    </button>
                                                    {hasContent && !isFinal && (
                                                        <button onClick={(e) => { e.stopPropagation(); setConfirmClearSlot({ slot: v, projectId: activeProject.id }); }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none" title="Diesen Slot leeren">×</button>
                                                    )}
                                                </div>
                                            )})}
                                        </div>
                                    </details>
                                    
                                    <details className="group bg-black/20 border border-white/5 rounded-xl p-3 transition-all open:bg-black/40">
                                        <summary className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none list-none flex items-center justify-between">
                                            <span>Dialogues</span>
                                            <span className="text-slate-600 group-open:rotate-180 transition-transform">▼</span>
                                        </summary>
                                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                                            {allSlotGroups.dialogues.map(v => {
                                                const isFinal = activeProject.scriptResult?.sections?.[0]?.isFinal?.[v];
                                                const hasContent = ((activeProject.scriptResult?.sections?.[0]?.versions[v]?.trim().length ?? 0) > 0);
                                                const seriesBadge = getSeriesBadge(v);
                                                return (
                                                <div key={v} className="relative flex items-center">
                                                    {seriesBadge && (
                                                        <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-yellow-400 text-[8px] font-black text-black flex items-center justify-center z-10 shadow">
                                                            {seriesBadge}
                                                        </div>
                                                    )}
                                                    <button onClick={() => updateActiveProject({ segmentVersions: { ...activeProject.segmentVersions, [MAIN_ID]: v } })} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all flex items-center gap-1.5 ${activeProject.segmentVersions[MAIN_ID] === v ? 'bg-purple-600 border-purple-500 text-white' : hasContent ? 'bg-white/10 border-white/10 text-slate-300' : 'bg-white/5 border-white/5 text-slate-600 hover:text-slate-400'}`} title={`Zum Text-Slot "${getSlotLabel(v)}" wechseln`}>
                                                        {isFinal && <span className="text-[10px]">🔒</span>}
                                                        {getSlotLabel(v).replace('Dialog ', '')}
                                                    </button>
                                                    {hasContent && !isFinal && (
                                                        <button onClick={(e) => { e.stopPropagation(); setConfirmClearSlot({ slot: v, projectId: activeProject.id }); }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none" title="Diesen Slot leeren">×</button>
                                                    )}
                                                </div>
                                            )})}
                                        </div>
                                    </details>

                                    <details className="group bg-black/20 border border-white/5 rounded-xl p-3 transition-all open:bg-black/40">
                                        <summary className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none list-none flex items-center justify-between">
                                            <span>Instagram Wisdom</span>
                                            <span className="text-slate-600 group-open:rotate-180 transition-transform">▼</span>
                                        </summary>
                                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                                            {allSlotGroups.instas.map(v => {
                                                const isFinal = activeProject.scriptResult?.sections?.[0]?.isFinal?.[v];
                                                const hasContent = ((activeProject.scriptResult?.sections?.[0]?.versions[v]?.trim().length ?? 0) > 0);
                                                const seriesBadge = getSeriesBadge(v);
                                                return (
                                                <div key={v} className="relative flex items-center">
                                                    {seriesBadge && (
                                                        <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-yellow-400 text-[8px] font-black text-black flex items-center justify-center z-10 shadow">
                                                            {seriesBadge}
                                                        </div>
                                                    )}
                                                    <button onClick={() => updateActiveProject({ segmentVersions: { ...activeProject.segmentVersions, [MAIN_ID]: v } })} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all flex items-center gap-1.5 ${activeProject.segmentVersions[MAIN_ID] === v ? 'bg-fuchsia-600 border-fuchsia-500 text-white' : hasContent ? 'bg-white/10 border-white/10 text-slate-300' : 'bg-white/5 border-white/5 text-slate-600 hover:text-slate-400'}`} title={`Zum Text-Slot "${getSlotLabel(v)}" wechseln`}>
                                                        {isFinal && <span className="text-[10px]">🔒</span>}
                                                        {getSlotLabel(v).replace('IG ', '')}
                                                    </button>
                                                    {hasContent && !isFinal && (
                                                        <button onClick={(e) => { e.stopPropagation(); setConfirmClearSlot({ slot: v, projectId: activeProject.id }); }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none" title="Diesen Slot leeren">×</button>
                                                    )}
                                                </div>
                                            )})}
                                        </div>
                                    </details>
                                </div>

                            </div>

                            <div className="flex p-1 bg-black/40 rounded-lg border border-white/5 flex-shrink-0">
                                <button 
                                    onClick={() => setEditorMode('controls')}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all ${editorMode === 'controls' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                    title="Zeigt die Steuerelemente und Slider für die Text-Generierung an"
                                >
                                    Fine-Tuning
                                </button>
                                <button 
                                    onClick={() => setEditorMode('source')}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all ${editorMode === 'source' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                    title="Zeigt das ursprüngliche Recherche-Material an"
                                >
                                    Source Data
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 min-h-0">
                                {editorMode === 'controls' ? (
                                    <>
                                        <div className="space-y-6 p-4 bg-black/20 rounded-2xl border border-white/5">
                                            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Refinement Controls</h3>
                                            {Object.entries(controls).map(([key, val]) => {
                                                if (key === 'info' || key === 'dialogue_seconds' || key === 'target_seconds' || key === 'news_seconds' || key === 'insta_seconds' || key === 'news_tiktok' || key === 'series_parts' || key === 'length') return null; 
                                                return (
                                                <div key={key} className="space-y-2">
                                                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400">
                                                        <span>{CONTROL_LABELS[key as keyof SegmentControls] || key}</span>
                                                        <span>{val}</span>
                                                    </div>
                                                    <input type="range" min={key === 'fact_intensity' ? "0" : "1"} max="10" value={val} onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, [key]: parseInt(e.target.value) } } })} className={`w-full h-1 bg-white/10 rounded-full appearance-none ${key === 'x_source' ? 'accent-sky-500' : key === 'fact_intensity' ? 'accent-amber-500' : 'accent-emerald-500'}`} />
                                                </div>
                                            )})}
                                            
                                            {/* Write & Fit Logic */}
                                            <div className="pt-4 border-t border-white/5 space-y-4">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[10px] uppercase font-bold text-amber-400">
                                                        <span>Target Duration</span>
                                                        <span className="text-lg font-bold">{formatTime(controls.target_seconds || 60)} Min</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="15" 
                                                        max="900" 
                                                        step="5"
                                                        value={controls.target_seconds || 60} 
                                                        onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, target_seconds: parseInt(e.target.value) } } })} 
                                                        className="w-full h-1 bg-white/10 rounded-full appearance-none accent-amber-500" 
                                                    />
                                                </div>
                                                <button onClick={handleWriteAndFit} disabled={isZapping} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg text-white" title="Generiert ein Skript basierend auf dem eingestellten Zeit-Limit und den Schiebereglern (Fine-Tuning)">
                                                    Write & Fit by Style & Time
                                                </button>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={controls.series_parts || 3}
                                                        onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, series_parts: parseInt(e.target.value) } } })}
                                                        className="flex-1 py-2 px-3 bg-black/40 border border-white/10 rounded-xl text-[10px] font-black uppercase text-slate-300 outline-none"
                                                        title="Anzahl der Episoden für eine Serien-Generierung"
                                                    >
                                                        <option value={2}>Serie: 2</option>
                                                        <option value={3}>Serie: 3</option>
                                                        <option value={4}>Serie: 4</option>
                                                        <option value={5}>Serie: 5</option>
                                                    </select>
                                                    <button
                                                        onClick={() => handleWriteAndFitSeries(controls.series_parts)}
                                                        disabled={isZapping}
                                                        className="flex-1 py-2 bg-emerald-700/40 hover:bg-emerald-600 border border-emerald-500/30 rounded-xl text-[10px] font-black uppercase transition-all text-white"
                                                        title="Generiert gleich mehrere zusammenhängende Skripte als Serie"
                                                    >
                                                        Write & Fit Serie
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="pt-4 border-t border-white/5 space-y-4">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400">
                                                        <span>News Duration</span>
                                                        <span className="text-lg font-bold">{formatTime(controls.news_seconds || 30)} Min</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="15"
                                                        max="50"
                                                        step="5"
                                                        value={controls.news_seconds || 30}
                                                        onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, news_seconds: parseInt(e.target.value) } } })}
                                                        className="w-full h-1 bg-white/10 rounded-full appearance-none accent-slate-400"
                                                        title="Dauer für die News Flash Generierung"
                                                    />
                                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 select-none" title="Passt den Text speziell für den TikTok-Algorithmus an">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!controls.news_tiktok}
                                                            onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, news_tiktok: e.target.checked } } })}
                                                            className="accent-fuchsia-500"
                                                        />
                                                        TikTok Optimization
                                                    </label>
                                                </div>
                                                <button onClick={handleNewsFlashGenerate} disabled={isZapping} className="w-full py-3 bg-slate-700/50 hover:bg-slate-600 border border-white/10 rounded-xl text-[10px] font-black uppercase transition-all" title="Generiert kurze Nachrichten-Updates (20-60s) basierend auf Fakten">
                                                    News Flash (15–50s)
                                                </button>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={controls.series_parts || 3}
                                                        onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, series_parts: parseInt(e.target.value) } } })}
                                                        className="flex-1 py-2 px-3 bg-black/40 border border-white/10 rounded-xl text-[10px] font-black uppercase text-slate-300 outline-none"
                                                    >
                                                        <option value={2}>Serie: 2</option>
                                                        <option value={3}>Serie: 3</option>
                                                        <option value={4}>Serie: 4</option>
                                                        <option value={5}>Serie: 5</option>
                                                    </select>
                                                    <button
                                                        onClick={() => handleNewsFlashSeries(controls.series_parts)}
                                                        disabled={isZapping}
                                                        className="flex-1 py-2 bg-slate-700/70 hover:bg-slate-600 border border-white/10 rounded-xl text-[10px] font-black uppercase transition-all"
                                                        title="Generiert gleich mehrere zusammenhängende News-Skripte als Serie"
                                                    >
                                                        News Serie
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="pt-4 border-t border-white/5 space-y-4">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400">
                                                        <span>IG Wisdom Duration</span>
                                                        <span>{controls.insta_seconds || 45}s</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="20"
                                                        max="70"
                                                        step="5"
                                                        value={controls.insta_seconds || 45}
                                                        onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, insta_seconds: parseInt(e.target.value) } } })}
                                                        className="w-full h-1 bg-white/10 rounded-full appearance-none accent-fuchsia-500"
                                                        title="Dauer für Instagram Wisdom Zitate"
                                                    />
                                                </div>
                                                <button onClick={handleInstagramWisdomGenerate} disabled={isZapping} className="w-full py-3 bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all" title="Generiert ein tiefgründiges Skript, das mit einem passenden historischen Zitat (Wikiquote) beginnt">
                                                    IG Wisdom (Wikiquote)
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-4 p-4 bg-black/20 rounded-2xl border border-white/5">
                                            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Dialogue Generator</h3>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400">
                                                    <span>Duration (Seconds)</span>
                                                    <span>{controls.dialogue_seconds || 60}s</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="30" 
                                                    max="300" 
                                                    step="5"
                                                    value={controls.dialogue_seconds || 60} 
                                                    onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, dialogue_seconds: parseInt(e.target.value) } } })} 
                                                    className="w-full h-1 bg-white/10 rounded-full appearance-none accent-purple-500" 
                                                    title="Dauer des zu generierenden Dialogs"
                                                />
                                            </div>
                                            <button onClick={handleDialogueGenerate} disabled={isZapping} className="w-full py-3 bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all" title="Generiert ein Zwei-Personen-Interview/Dialog (Host & Experte) basierend auf den Fakten">
                                                Generate Dialogue
                                            </button>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={controls.series_parts || 3}
                                                    onChange={(e) => updateActiveProject({ segmentControls: { ...activeProject.segmentControls, [MAIN_ID]: { ...controls, series_parts: parseInt(e.target.value) } } })}
                                                    className="flex-1 py-2 px-3 bg-black/40 border border-white/10 rounded-xl text-[10px] font-black uppercase text-slate-300 outline-none"
                                                    title="Anzahl der Episoden für eine Serien-Generierung"
                                                >
                                                    <option value={2}>Serie: 2</option>
                                                    <option value={3}>Serie: 3</option>
                                                    <option value={4}>Serie: 4</option>
                                                    <option value={5}>Serie: 5</option>
                                                </select>
                                                <button
                                                    onClick={() => handleDialogueSeries(controls.series_parts)}
                                                    disabled={isZapping}
                                                    className="flex-1 py-2 bg-purple-600/30 text-purple-300 border border-purple-500/30 hover:bg-purple-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all"
                                                    title="Generiert mehrere Dialoge als zusammenhängende Serie"
                                                >
                                                    Dialogue Serie
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-4 p-4 bg-black/20 rounded-2xl border border-white/5">
                                            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Veröffentlichung & Status</h3>
                                            <div className="space-y-2">
                                                <button onClick={() => togglePublishPlatform('yt_shorts')} className={`w-full py-2 px-3 rounded-xl border flex items-center justify-between transition-all ${activeProject.publishedOn?.includes('yt_shorts') ? 'bg-red-600/20 border-red-500/50 text-white' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`} title="Markiert das Skript als 'veröffentlicht' auf YouTube Shorts">
                                                    <div className="flex items-center gap-3">
                                                        <PlatformIcon type="yt_shorts" active={true} />
                                                        <span className="text-[10px] font-black uppercase">YouTube Shorts</span>
                                                    </div>
                                                    <div className={`w-2 h-2 rounded-full ${activeProject.publishedOn?.includes('yt_shorts') ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-white/10'}`} />
                                                </button>
                                                
                                                <button onClick={() => togglePublishPlatform('yt_long')} className={`w-full py-2 px-3 rounded-xl border flex items-center justify-between transition-all ${activeProject.publishedOn?.includes('yt_long') ? 'bg-red-800/20 border-red-700/50 text-white' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`} title="Markiert das Skript als 'veröffentlicht' auf YouTube Long">
                                                    <div className="flex items-center gap-3">
                                                        <PlatformIcon type="yt_long" active={true} />
                                                        <span className="text-[10px] font-black uppercase">YouTube Long</span>
                                                    </div>
                                                    <div className={`w-2 h-2 rounded-full ${activeProject.publishedOn?.includes('yt_long') ? 'bg-red-700 shadow-[0_0_8px_rgba(185,28,28,0.6)]' : 'bg-white/10'}`} />
                                                </button>

                                                <button onClick={() => togglePublishPlatform('tiktok')} className={`w-full py-2 px-3 rounded-xl border flex items-center justify-between transition-all ${activeProject.publishedOn?.includes('tiktok') ? 'bg-cyan-900/20 border-cyan-500/30 text-white' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`} title="Markiert das Skript als 'veröffentlicht' auf TikTok">
                                                    <div className="flex items-center gap-3">
                                                        <PlatformIcon type="tiktok" active={true} />
                                                        <span className="text-[10px] font-black uppercase">TikTok</span>
                                                    </div>
                                                    <div className={`w-2 h-2 rounded-full ${activeProject.publishedOn?.includes('tiktok') ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-white/10'}`} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <button onClick={handleDeepUpgrade} disabled={isZapping} className="w-full py-3 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all" title="Führt eine tiefe Recherche aus und generiert den Text mit erweiterten Fakten neu">Deep Dive Research</button>
                                            <button onClick={handleHookZapp} disabled={isZapping} className="w-full py-3 bg-pink-600/20 text-pink-400 border border-pink-500/30 hover:bg-pink-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all" title="Generiert nur den ersten Satz (Hook) neu, ohne den restlichen Text zu verändern">Regenerate Hook (**)</button>
                                            <button onClick={handleGenerateCTA} disabled={isZapping} className="w-full py-3 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all" title="Generiert einen Call-to-Action und hängt ihn an das Ende des aktuellen Textes an">Generiere neuen CTA (Ende)</button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4 h-full flex flex-col">
                                        <div className="flex-1 flex flex-col min-h-[150px]">
                                            <label className="block text-[9px] font-bold text-slate-500 mb-1">Grok Dossier (Raw Script)</label>
                                            <textarea 
                                                className="w-full flex-1 bg-black/20 border border-white/10 rounded-lg p-2 text-xs text-slate-400 focus:text-white focus:border-emerald-500/30 outline-none resize-none custom-scrollbar"
                                                value={activeProject.rawInput}
                                                onChange={e => updateActiveProject({ rawInput: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex-1 flex flex-col min-h-[150px]">
                                            <label className="block text-[9px] font-bold text-slate-500 mb-1">Additional Facts</label>
                                            <textarea 
                                                className="w-full flex-1 bg-black/20 border border-white/10 rounded-lg p-2 text-xs text-slate-400 focus:text-white focus:border-emerald-500/30 outline-none resize-none custom-scrollbar"
                                                value={activeProject.factText}
                                                onChange={e => updateActiveProject({ factText: e.target.value })}
                                                placeholder="Hier Fakten ergänzen, die über den Regler 'Fakten Intensität' eingesteuert werden..."
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="pt-4 border-t border-white/5 flex-shrink-0">
                                <h3 className="text-[10px] font-black uppercase text-slate-600 mb-2">Log</h3>
                                <div className="h-24 overflow-y-auto custom-scrollbar text-[9px] font-mono text-slate-500 space-y-1">
                                    {logs.map(l => <div key={l.id} className={l.type === 'error' ? 'text-red-400' : ''}>[{l.timestamp}] {l.message}</div>)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={`flex-1 bg-[#05091a] relative md:flex flex-col ${mobileTab === 'editor' ? 'flex' : 'hidden'}`}>
                    {activeProject.scriptResult ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-24 flex flex-col items-center pb-24 md:pb-4">
                            <div className="w-full max-w-3xl relative">
                                <div className="absolute -top-8 md:-top-12 right-0 flex gap-2">
                                    <div className="px-3 py-1.5 bg-slate-900/60 border border-white/5 rounded-lg flex items-center gap-2 backdrop-blur-md">
                                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{words} Words</span>
                                    </div>
                                    <div className="px-3 py-1.5 bg-slate-900/60 border border-emerald-500/20 rounded-lg flex items-center gap-2 backdrop-blur-md">
                                        <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">{readingTime}</span>
                                    </div>
                                </div>
                                
                                <div className="bg-slate-900/50 border border-white/5 rounded-t-3xl p-3 md:p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 backdrop-blur-sm sticky top-0 z-10">
                                    <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                                        <div className="flex gap-2">
                                            <button onClick={() => navigateHistory(-1)} disabled={activeProject.historyIndex <= 0} className="px-3 py-1 rounded hover:bg-white/10 text-slate-500 hover:text-white text-xs">Undo</button>
                                            <button onClick={() => navigateHistory(1)} disabled={activeProject.historyIndex >= activeProject.history.length - 1} className="px-3 py-1 rounded hover:bg-white/10 text-slate-500 hover:text-white text-xs">Redo</button>
                                            <HistoryMenu history={activeProject.history} currentIndex={activeProject.historyIndex} onSelect={navigateHistory} />
                                        </div>
                                        
                                        {activeProject.scriptResult?.sections?.[0]?.title && (
                                            <div className="block lg:hidden w-full mt-2">
                                                <span className="text-xs font-bold text-white/70 truncate block px-4 py-1 bg-white/5 rounded-full border border-white/10 w-full text-center">
                                                    {activeProject.scriptResult!.sections[0].title}
                                                </span>
                                            </div>
                                        )}
                                        {activeProject.scriptResult?.sections?.[0]?.title && (
                                            <div className="hidden lg:block">
                                                <span className="text-xs font-bold text-white/70 truncate block px-4 py-1 bg-white/5 rounded-full border border-white/10 max-w-[200px] lg:max-w-[300px]">
                                                    {activeProject.scriptResult!.sections[0].title}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end relative z-10 w-full lg:w-auto mt-2 lg:mt-0">
                                        {activeProject.scriptResult?.model && (
                                            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-[10px] font-black uppercase tracking-wider shrink-0" title="Verwendetes Modell für dieses Skript">
                                                {activeProject.scriptResult.model.replace('gemini-', '').replace('gpt-', '').replace('claude-', '')}
                                            </span>
                                        )}
                                        <div className="w-full lg:w-px h-px lg:h-6 bg-white/10 mx-0 lg:mx-1 my-1 lg:my-0"></div>
                                        <button onClick={handleEmptyEditor} className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20 shrink-0" title="Diesen Text-Slot komplett leeren">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                        <button onClick={handleToggleEdit} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shrink-0 ${activeProject.isEditing ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20' : 'bg-white/5 text-slate-400 hover:text-white border border-white/5 hover:bg-white/10'}`} title="Manuelle Änderungen am Text vornehmen / speichern">
                                            {activeProject.isEditing ? 'Save Edits' : 'Edit Text'}
                                        </button>
                                        <button onClick={handleToggleFinal} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border flex items-center gap-2 shrink-0 ${isCurrentFinal ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-slate-400 border-white/5 hover:text-white hover:bg-white/10'}`} title="Skript sperren, um versehentliches Überschreiben zu verhindern">
                                            {isCurrentFinal && <span>🔒</span>}
                                            {isCurrentFinal ? 'Finalized' : 'Mark Final'}
                                        </button>
                                        
                                        <div className="w-full lg:w-px h-px lg:h-6 bg-white/10 mx-0 lg:mx-1 my-1 lg:my-0"></div>
                                        
                                        <button onClick={handlePlatformSafetyCheck} disabled={platformCheckLoadingSlot === currentSlot || !currentText.trim()} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 shrink-0" title="Überprüft das Skript auf Trigger-Wörter für YouTube/TikTok">
                                            {platformCheckLoadingSlot === currentSlot ? 'Prüft…' : 'Safety Check'}
                                        </button>
                                        <button onClick={handleElevenLabsPrep} disabled={isElevenLabsLoading || !currentText.trim()} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-40 flex items-center gap-2 shrink-0" title="Bereitet das Skript für die Sprachausgabe vor (fügt Emotion-Tags für ElevenLabs V3 hinzu)">
                                            {isElevenLabsLoading ? <span className="animate-spin inline-block">⏳</span> : '🎙️'}
                                            {isElevenLabsLoading ? 'Prep...' : 'Audio Prep'}
                                        </button>
                                    </div>
                                </div>

                                <div className="min-h-[60vh] text-base md:text-lg lg:text-xl leading-relaxed text-slate-300 font-medium selection:bg-emerald-500/30 selection:text-white pb-32 pt-4 px-2"
                                     onMouseUp={() => {
                                         if (activeProject.isEditing) return;
                                         const sel = window.getSelection();
                                         if (sel && sel.toString().trim()) {
                                             const r = sel.getRangeAt(0).getBoundingClientRect();
                                             setSelectionMenu({ x: r.left + r.width/2, y: r.top, text: sel.toString(), visible: true });
                                         } else setSelectionMenu(null);
                                     }}>
                                    {activeProject.isEditing ? (
                                        <textarea className="w-full h-[60vh] bg-transparent outline-none resize-none" value={activeProject.manualEditText} onChange={e => updateActiveProject({ manualEditText: e.target.value })} autoFocus />
                                    ) : (
                                        <div className="whitespace-pre-wrap">
                                            {formatRichText(
                                                activeProject.scriptResult?.sections?.[0]?.elevenLabsPrep?.[currentSlot] 
                                                ? currentText.replace(/\[.*?\]\s*/g, '') 
                                                : currentText
                                            )}
                                        </div>
                                    )}
                                </div>
                                {!activeProject.isEditing && currentSafetyCheck && (
                                    <div className="mt-4 bg-slate-900/40 border border-amber-500/10 rounded-2xl p-4 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">Plattform-Check</div>
                                            <div className="text-[10px] text-slate-500">{new Date(currentSafetyCheck.checkedAt).toLocaleString()}</div>
                                        </div>
                                        {currentSafetyCheck.summary && (
                                            <div className="text-sm text-slate-300 whitespace-pre-wrap">{currentSafetyCheck.summary}</div>
                                        )}
                                        {(currentSafetyCheck.issues?.length || 0) > 0 && (
                                            <div className="space-y-3">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Problematische Stellen</div>
                                                {currentSafetyCheck.issues.map((issue, idx) => (
                                                    <div key={idx} className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-1">
                                                        <div className="text-sm text-slate-200 whitespace-pre-wrap">
                                                            {issue.problematicQuote} <span className="text-amber-400">({Math.round((issue.probability || 0) * 100)}%)</span>
                                                        </div>
                                                        <div className="text-xs text-slate-400 whitespace-pre-wrap">{issue.reason}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="space-y-3">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Entschärfte Varianten</div>
                                            <div className="bg-black/20 border border-white/5 rounded-xl p-3">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-2">Variante A</div>
                                                <div className="text-sm text-slate-200 whitespace-pre-wrap">{currentSafetyCheck.variantA}</div>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <button onClick={() => handleApplySafetyVariant('variantA')} className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-[10px] font-black uppercase text-emerald-200 transition-all" title="Ersetzt den aktuellen Text mit dieser entschärften Variante">
                                                        Variante A übernehmen
                                                    </button>
                                                    <button onClick={() => handleApplySafetyVariant('variantA', 'new')} className="px-3 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-[10px] font-black uppercase text-sky-200 transition-all" title="Kopiert diese entschärfte Variante in einen neuen Slot, um das Original zu behalten">
                                                        In neuen Slot
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="bg-black/20 border border-white/5 rounded-xl p-3">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-2">Variante B</div>
                                                <div className="text-sm text-slate-200 whitespace-pre-wrap">{currentSafetyCheck.variantB}</div>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <button onClick={() => handleApplySafetyVariant('variantB')} className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-[10px] font-black uppercase text-emerald-200 transition-all" title="Ersetzt den aktuellen Text mit dieser entschärften Variante">
                                                        Variante B übernehmen
                                                    </button>
                                                    <button onClick={() => handleApplySafetyVariant('variantB', 'new')} className="px-3 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-[10px] font-black uppercase text-sky-200 transition-all" title="Kopiert diese entschärfte Variante in einen neuen Slot, um das Original zu behalten">
                                                        In neuen Slot
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {!activeProject.isEditing && activeProject.scriptResult?.sections?.[0]?.elevenLabsPrep?.[currentSlot] && (
                                    <div className="mt-8 border-t-2 border-dashed border-emerald-500/20 pt-8 w-full max-w-3xl">
                                        <h2 className="text-xl font-black italic uppercase text-emerald-500 tracking-tighter mb-4">Post-Production</h2>
                                        <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-4 md:p-6 shadow-2xl shadow-emerald-900/20 space-y-6">
                                            
                                            {/* ElevenLabs Prep Section */}
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">1</div>
                                                        <div>
                                                            <div className="text-xs font-black uppercase tracking-widest text-emerald-400">ElevenLabs V3 Prompt</div>
                                                            <div className="text-[10px] text-emerald-500/50 mt-0.5">Generierte Delivery-Tags für die Sprach-KI</div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2">
                                                        {elevenLabsUsage && (
                                                            <div className="text-[10px] text-emerald-500/80 bg-emerald-900/40 px-2 py-1 rounded-md border border-emerald-500/20 font-mono" title="ElevenLabs: Verbrauchte Zeichen / Limit">
                                                                Quota: {elevenLabsUsage.used.toLocaleString()} / {elevenLabsUsage.limit.toLocaleString()}
                                                            </div>
                                                        )}
                                                        <button 
                                                            onClick={handleElevenLabsAudio} 
                                                            disabled={isGeneratingAudio}
                                                            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                                                            title="Sendet den vorbereiteten Text an ElevenLabs, um die Audiodatei zu generieren"
                                                        >
                                                            {isGeneratingAudio ? <span className="animate-spin inline-block">⏳</span> : '▶️'}
                                                            {isGeneratingAudio ? 'Generiere Audio...' : 'Audio generieren'}
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div className="text-sm text-emerald-100/80 whitespace-pre-wrap font-mono p-4 bg-black/40 rounded-xl border border-emerald-500/10">
                                                    {activeProject.scriptResult.sections[0].elevenLabsPrep[currentSlot]}
                                                </div>
                                                
                                                {activeProject.scriptResult.sections[0].elevenLabsCharCount?.[currentSlot] && (
                                                    <div className="text-[10px] font-mono text-emerald-500/60 text-right">
                                                        Geschätzte Kosten: {activeProject.scriptResult.sections[0].elevenLabsCharCount[currentSlot]} Zeichen
                                                    </div>
                                                )}
                                            </div>

                                            {/* ElevenLabs Audio Result */}
                                            {activeProject.scriptResult.sections[0].elevenLabsAudio?.[currentSlot] && (
                                                <div className="pt-6 border-t border-emerald-500/10 space-y-4">
                                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">2</div>
                                                            <div className="text-xs font-black uppercase tracking-widest text-emerald-400">Raw Audio</div>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                                            {auphonicQuota && (
                                                                <div className="text-[10px] text-purple-400/80 bg-purple-900/40 px-2 py-1 rounded-md border border-purple-500/20 font-mono flex items-center" title="Auphonic: Verbleibende Stunden">
                                                                    Auphonic: {auphonicQuota.credits.toFixed(2)}h übrig
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={handleAuphonicProcessing}
                                                                disabled={isGeneratingAuphonic}
                                                                className="flex-1 md:flex-none justify-center px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-[10px] font-black uppercase text-white transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-purple-600/20"
                                                                title="Sendet die ElevenLabs Audiodatei an Auphonic für professionelles Mastering und Lautstärken-Anpassung"
                                                            >
                                                                {isGeneratingAuphonic ? <span className="animate-spin inline-block">⏳</span> : '🎛️'}
                                                                {isGeneratingAuphonic ? 'Mastering...' : 'An Auphonic senden'}
                                                            </button>
                                                            <a 
                                                                href={activeProject.scriptResult.sections[0].elevenLabsAudio[currentSlot]} 
                                                                download={`${activeProject.name || 'Projekt'}_${currentSlot}_raw.mp3`}
                                                                className="flex-1 md:flex-none justify-center px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-[10px] font-black uppercase text-emerald-200 transition-all flex items-center gap-1.5"
                                                                title="Lädt die ungemasterte ElevenLabs Audiodatei herunter"
                                                            >
                                                                ⬇️ RAW MP3
                                                            </a>
                                                        </div>
                                                    </div>
                                                    <audio 
                                                        controls 
                                                        className="w-full h-10 rounded-lg outline-none" 
                                                        src={activeProject.scriptResult.sections[0].elevenLabsAudio[currentSlot]} 
                                                    />
                                                </div>
                                            )}

                                            {/* Auphonic Audio Result */}
                                            {activeProject.scriptResult.sections[0].auphonicAudio?.[currentSlot] && (
                                                <div className="pt-6 border-t border-purple-500/20 space-y-4">
                                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">3</div>
                                                            <div className="text-xs font-black uppercase tracking-widest text-purple-400">Mastered Audio</div>
                                                        </div>
                                                        <div className="flex w-full md:w-auto">
                                                            <a 
                                                                href={activeProject.scriptResult.sections[0].auphonicAudio[currentSlot]} 
                                                                download={`${activeProject.name || 'Projekt'}_${currentSlot}_mastered.mp3`}
                                                                className="flex-1 md:flex-none justify-center px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-[10px] font-black uppercase text-purple-200 transition-all flex items-center gap-2"
                                                                title="Lädt die fertige, gemasterte Audiodatei herunter"
                                                            >
                                                                ⬇️ Download Master
                                                            </a>
                                                        </div>
                                                    </div>
                                                    <audio 
                                                        controls 
                                                        className="w-full h-10 rounded-lg outline-none" 
                                                        src={activeProject.scriptResult.sections[0].auphonicAudio[currentSlot]} 
                                                    />
                                                </div>
                                            )}

                                            {/* Speedup Section - Step 4 */}
                                            {activeProject.scriptResult.sections[0].auphonicAudio?.[currentSlot] && (
                                                <div className="pt-6 border-t border-amber-500/20 space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">4</div>
                                                        <div className="text-xs font-black uppercase tracking-widest text-amber-400">Speedup</div>
                                                    </div>

                                                    <div className="space-y-3 bg-black/30 rounded-xl p-4 border border-amber-500/10">
                                                        <div className="space-y-1">
                                                            <div className="text-[10px] text-slate-400 font-bold uppercase">Preset</div>
                                                            <div className="flex gap-2">
                                                                {[
                                                                    { value: 'zeitblytz_standard', label: 'Standard', desc: '1.12x' },
                                                                    { value: 'aggressiv', label: 'Aggressiv', desc: '1.18x' },
                                                                    { value: 'voiceover_turbo', label: 'Turbo', desc: '1.20x' },
                                                                    { value: 'custom', label: 'Custom', desc: 'Manuell' },
                                                                ].map(p => (
                                                                    <button 
                                                                        key={p.value}
                                                                        onClick={() => {
                                                                            if (p.value !== 'custom' && SPEEDUP_PRESETS[p.value]) {
                                                                                setSpeedupConfig({
                                                                                    ...SPEEDUP_PRESETS[p.value],
                                                                                    preset: p.value,
                                                                                });
                                                                            } else {
                                                                                setSpeedupConfig(prev => ({ ...prev, preset: 'custom' }));
                                                                            }
                                                                        }}
                                                                        className={`flex-1 px-2 py-2 rounded-lg border text-center transition-all ${
                                                                            speedupConfig.preset === p.value 
                                                                                ? 'bg-amber-600 border-amber-500 text-white' 
                                                                                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/30'
                                                                        }`}
                                                                    >
                                                                        <div className="text-[10px] font-black uppercase">{p.label}</div>
                                                                        <div className="text-[9px] opacity-70">{p.desc}</div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase">Speed</span>
                                                                <span className="text-lg font-black text-amber-400">{speedupConfig.speed.toFixed(2)}x</span>
                                                            </div>
                                                            <input 
                                                                type="range" 
                                                                min="1.0" max="2.0" step="0.01" 
                                                                value={speedupConfig.speed}
                                                                onChange={e => setSpeedupConfig(prev => ({ ...prev, speed: parseFloat(e.target.value), preset: 'custom' }))}
                                                                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                                                                style={{ background: `linear-gradient(to right, #f59e0b ${(speedupConfig.speed - 1) / 1 * 100}%, rgba(255,255,255,0.1) ${(speedupConfig.speed - 1) / 1 * 100}%)` }}
                                                            />
                                                            <div className="flex justify-between text-[9px] text-slate-500">
                                                                <span>1.00x</span>
                                                                <span>1.50x</span>
                                                                <span>2.00x</span>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Threshold</div>
                                                                <input 
                                                                    type="number" 
                                                                    value={speedupConfig.silenceThreshold}
                                                                    onChange={e => setSpeedupConfig(prev => ({ ...prev, silenceThreshold: parseFloat(e.target.value) || -40, preset: 'custom' }))}
                                                                    step="1"
                                                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-slate-300"
                                                                />
                                                            </div>
                                                            <div>
                                                                <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Min Pause</div>
                                                                <input 
                                                                    type="number" 
                                                                    value={speedupConfig.minSilenceDuration}
                                                                    onChange={e => setSpeedupConfig(prev => ({ ...prev, minSilenceDuration: parseFloat(e.target.value) || 0.3, preset: 'custom' }))}
                                                                    step="0.01"
                                                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-slate-300"
                                                                />
                                                            </div>
                                                            <div>
                                                                <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Ziel Pause</div>
                                                                <input 
                                                                    type="number" 
                                                                    value={speedupConfig.targetSilenceDuration}
                                                                    onChange={e => setSpeedupConfig(prev => ({ ...prev, targetSilenceDuration: parseFloat(e.target.value) || 0.15, preset: 'custom' }))}
                                                                    step="0.01"
                                                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-slate-300"
                                                                />
                                                            </div>
                                                        </div>

                                                        <button 
                                                            onClick={handleSpeedup}
                                                            disabled={isProcessingSpeedup}
                                                            className="w-full px-4 py-3 rounded-xl text-xs font-black uppercase transition-all bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 shadow-lg shadow-amber-600/20 disabled:opacity-40 flex items-center justify-center gap-2"
                                                        >
                                                            {isProcessingSpeedup ? <span className="animate-spin inline-block">⏳</span> : '⚡'}
                                                            {isProcessingSpeedup ? 'Verarbeite...' : 'Speedup anwenden'}
                                                        </button>

                                                        {activeProject.scriptResult.sections[0].speedupStats?.[currentSlot] && (
                                                            <div className="text-[10px] text-slate-500 bg-black/20 rounded-lg p-2 flex flex-wrap gap-x-4 gap-y-1">
                                                                <span>🔇 {activeProject.scriptResult.sections[0].speedupStats[currentSlot].silences_shortened} Pausen gekürzt</span>
                                                                <span>⚡ {activeProject.scriptResult.sections[0].speedupStats[currentSlot].speed_applied}x Speed</span>
                                                                <span>⏱️ {activeProject.scriptResult.sections[0].speedupStats[currentSlot].original_duration}s → {activeProject.scriptResult.sections[0].speedupStats[currentSlot].processed_duration}s</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {activeProject.scriptResult.sections[0].speedupAudio?.[currentSlot] && (
                                                        <div className="space-y-3">
                                                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">✓</div>
                                                                    <div className="text-xs font-black uppercase tracking-widest text-amber-300">Fertiges Audio</div>
                                                                </div>
                                                                <div className="flex w-full md:w-auto gap-2">
                                                                    <a 
                                                                        href={activeProject.scriptResult.sections[0].speedupAudio[currentSlot]} 
                                                                        download={`${activeProject.name || 'Projekt'}_${currentSlot}_final.mp3`}
                                                                        className="flex-1 md:flex-none justify-center px-4 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-[10px] font-black uppercase text-amber-200 transition-all flex items-center gap-2"
                                                                    >
                                                                        ⬇️ Download Final
                                                                    </a>
                                                                </div>
                                                            </div>
                                                            <audio 
                                                                controls 
                                                                className="w-full h-10 rounded-lg outline-none" 
                                                                src={activeProject.scriptResult.sections[0].speedupAudio[currentSlot]} 
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {activeProject.scriptResult.researchData && <ResearchInsights data={activeProject.scriptResult.researchData} />}
                            </div>
                        </div>
                    ) : (
                         <div className="flex-1 flex items-center justify-center text-slate-700 font-black uppercase tracking-[0.5em] text-sm animate-pulse p-4 text-center">
                             Waiting for Input...
                         </div>
                    )}
                    
                    {isZapping && (
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"/>
                        </div>
                    )}
                </div>
            </main>
            <SettingsModal 
                open={settingsOpen} 
                onClose={() => { 
                    setSettingsOpen(false); 
                    setSettingsVersion(v => v + 1); 
                }} 
            />
            {legalCheck.open && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                            <div className="space-y-0.5">
                                <div className="text-white font-black uppercase text-xs tracking-widest">Rechtssicherheits-Check</div>
                                <div className="text-slate-500 text-[11px]">Automatische Prüfung via Perplexity Web Search (keine Rechtsberatung)</div>
                            </div>
                            <button onClick={() => setLegalCheck({ open: false })} className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-lg leading-none">
                                ×
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {legalCheck.loading ? (
                                <div className="flex items-center gap-3 text-slate-300">
                                    <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full"/>
                                    <div className="text-sm font-bold">Prüfe Text auf rechtliche Risiken…</div>
                                </div>
                            ) : (
                                <>
                                    {legalCheck.error ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.35)]" />
                                                <div className="text-sm font-black text-amber-300 uppercase tracking-widest">Bitte prüfen</div>
                                            </div>
                                            <div className="text-slate-300 text-sm whitespace-pre-wrap">{legalCheck.error}</div>
                                            <div className="flex justify-end">
                                                <button onClick={() => setSettingsOpen(true)} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase text-white">
                                                    Einstellungen öffnen
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-3.5 h-3.5 rounded-full ${
                                                        legalCheck.result?.verdict === 'green'
                                                            ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.35)]'
                                                            : legalCheck.result?.verdict === 'red'
                                                            ? 'bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.35)]'
                                                            : 'bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                                                    }`}
                                                />
                                                <div className={`text-sm font-black uppercase tracking-widest ${
                                                    legalCheck.result?.verdict === 'green'
                                                        ? 'text-emerald-300'
                                                        : legalCheck.result?.verdict === 'red'
                                                        ? 'text-red-300'
                                                        : 'text-amber-300'
                                                }`}>
                                                    {legalCheck.result?.verdict === 'green' ? 'Grün' : legalCheck.result?.verdict === 'red' ? 'Rot' : 'Gelb'}
                                                </div>
                                                <div className="text-slate-500 text-[11px]">
                                                    Slot: {getSlotLabel(legalCheck.slot)}
                                                </div>
                                            </div>

                                            {legalCheck.result?.summary && (
                                                <div className="text-slate-200 text-sm whitespace-pre-wrap">{legalCheck.result.summary}</div>
                                            )}

                                            {(legalCheck.result?.issues?.length || 0) > 0 && (
                                                <div className="space-y-3">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Problemstellen & sichere Vorschläge</div>
                                                    <div className="space-y-3">
                                                        {legalCheck.result!.issues.map((it, idx) => (
                                                            <div key={idx} className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-2">
                                                                <div className="text-slate-400 text-[10px] font-black uppercase">Riskant</div>
                                                                <div className="text-slate-200 text-sm whitespace-pre-wrap">{it.problematicQuote}</div>
                                                                <div className="text-slate-400 text-[10px] font-black uppercase pt-2">Warum</div>
                                                                <div className="text-slate-300 text-sm whitespace-pre-wrap">{it.whyRisky}</div>
                                                                <div className="text-slate-400 text-[10px] font-black uppercase pt-2">Vorschlag (rechtssicherer)</div>
                                                                <div className="text-slate-200 text-sm whitespace-pre-wrap">{it.saferRewrite}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {(legalCheck.result?.citations?.length || 0) > 0 && (
                                                <div className="space-y-2">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Quellen</div>
                                                    <div className="space-y-1">
                                                        {legalCheck.result!.citations.map((u, i) => (
                                                            <a key={u + i} href={u} target="_blank" rel="noreferrer" className="block text-[11px] text-slate-400 hover:text-slate-200 break-all">
                                                                [{i + 1}] {u}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
