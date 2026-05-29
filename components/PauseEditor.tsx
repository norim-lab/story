import React, { useState, useRef } from 'react';

export interface PauseMarker {
    id: string;
    gapIndex: number;
    duration: number;
    mode: 'sentence' | 'word';
}

interface PauseEditorProps {
    text: string;
    markers: PauseMarker[];
    onChange: (markers: PauseMarker[]) => void;
}

const PAUSE_PRESETS = [0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0];
const STEP = 0.1;
const MIN_DUR = 0.1;
const MAX_DUR = 10;

function splitIntoSentences(text: string): string[] {
    if (!text || !text.trim()) return [];
    return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
}

function splitIntoWords(text: string): string[] {
    if (!text || !text.trim()) return [];
    return text.split(/\s+/).filter(s => s.trim().length > 0);
}

function formatDuration(d: number): string {
    if (d < 1) return `${d.toFixed(1)}s`;
    if (d === Math.floor(d)) return `${d}s`;
    return `${d.toFixed(1)}s`;
}

function MarkerControls({ marker, onUpdate, onRemove }: {
    marker: PauseMarker;
    onUpdate: (d: number) => void;
    onRemove: () => void;
}) {
    return (
        <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} className="inline-flex items-center gap-0.5 mx-0.5 px-1 rounded bg-cyan-600/20 border border-cyan-500/30 group relative">
            <span className="text-cyan-400 text-[8px]">⏸</span>
            <span className="text-[8px] font-black text-cyan-300 tabular-nums">{formatDuration(marker.duration)}</span>
            <button onClick={(e) => { e.stopPropagation(); onUpdate(Math.max(MIN_DUR, Math.round((marker.duration - STEP) * 10) / 10)); }} className="text-[7px] text-slate-400 hover:text-white">−</button>
            <button onClick={(e) => { e.stopPropagation(); onUpdate(Math.min(MAX_DUR, Math.round((marker.duration + STEP) * 10) / 10)); }} className="text-[7px] text-slate-400 hover:text-white">+</button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-[7px] text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100">×</button>
        </div>
    );
}

export const PauseEditor: React.FC<PauseEditorProps> = ({ text, markers, onChange }) => {
    const [displayMode, setDisplayMode] = useState<'sentence' | 'word'>('sentence');
    const [dragOverGap, setDragOverGap] = useState<number | null>(null);
    const dragRef = useRef<{ type: 'new' | 'existing'; duration?: number; markerId?: string } | null>(null);

    const sentences = splitIntoSentences(text);
    const words = splitIntoWords(text);

    if (sentences.length === 0) {
        return (
            <div className="text-[10px] text-slate-500 italic p-3 bg-black/20 rounded-lg">
                Kein Skripttext vorhanden. Bitte zuerst ein Skript generieren.
            </div>
        );
    }

    const addMarker = (gapIndex: number, duration: number = 0.5) => {
        const mode = displayMode;
        const existing = markers.find(m => m.gapIndex === gapIndex && m.mode === mode);
        if (existing) {
            onChange(markers.map(m => (m.gapIndex === gapIndex && m.mode === mode) ? { ...m, duration } : m));
        } else {
            onChange([...markers, { id: `pause_${Date.now()}_${mode}_${gapIndex}`, gapIndex, duration, mode }]);
        }
    };

    const removeMarker = (gapIndex: number) => {
        const mode = displayMode;
        onChange(markers.filter(m => !(m.gapIndex === gapIndex && m.mode === mode)));
    };

    const updateDuration = (gapIndex: number, duration: number) => {
        const mode = displayMode;
        onChange(markers.map(m => (m.gapIndex === gapIndex && m.mode === mode) ? { ...m, duration } : m));
    };

    const handleDrop = (gapIndex: number) => {
        const dragItem = dragRef.current;
        if (!dragItem) { setDragOverGap(null); return; }
        const mode = displayMode;
        if (dragItem.type === 'new') {
            const existing = markers.find(m => m.gapIndex === gapIndex && m.mode === mode);
            if (existing) {
                onChange(markers.map(m => (m.gapIndex === gapIndex && m.mode === mode) ? { ...m, duration: dragItem.duration || 0.5 } : m));
            } else {
                onChange([...markers, { id: `pause_${Date.now()}_${mode}_${gapIndex}`, gapIndex, duration: dragItem.duration || 0.5, mode }]);
            }
        } else if (dragItem.type === 'existing' && dragItem.markerId) {
            const existing = markers.find(m => m.id === dragItem.markerId);
            if (existing && (existing.gapIndex !== gapIndex || existing.mode !== mode)) {
                onChange(markers.map(m => m.id === dragItem.markerId ? { ...m, gapIndex, mode } : m));
            }
        }
        setDragOverGap(null);
        dragRef.current = null;
    };

    const totalPauseTime = markers.reduce((sum, m) => sum + m.duration, 0);

    const renderSentenceMode = () => (
        <div className="bg-black/20 rounded-lg p-3 max-h-[280px] overflow-y-auto border border-white/5">
            {sentences.map((segment, i) => (
                <React.Fragment key={`s_${i}`}>
                    <div className="text-[11px] text-slate-300 leading-relaxed py-0.5">{segment}</div>
                    {i < sentences.length - 1 && (
                        <div
                            onClick={() => addMarker(i, 0.5)}
                            onDragOver={(e) => { e.preventDefault(); setDragOverGap(i); }}
                            onDragLeave={() => setDragOverGap(null)}
                            onDrop={() => handleDrop(i)}
                            className={`my-1 h-6 flex items-center justify-center rounded transition-all cursor-pointer ${
                                dragOverGap === i
                                    ? 'bg-cyan-500/20 border border-dashed border-cyan-500/50'
                                    : 'hover:bg-white/5 border border-transparent'
                            }`}
                        >
                            {markers.find(m => m.gapIndex === i && m.mode === 'sentence') ? (
                                <MarkerControls
                                    marker={markers.find(m => m.gapIndex === i && m.mode === 'sentence')!}
                                    onUpdate={(d) => updateDuration(i, d)}
                                    onRemove={() => removeMarker(i)}
                                />
                            ) : (
                                <span className={`text-[9px] ${dragOverGap === i ? 'opacity-100 text-cyan-400' : 'opacity-0 hover:opacity-40 text-slate-500'}`}>
                                    + Pause
                                </span>
                            )}
                        </div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );

    const renderWordMode = () => (
        <div className="bg-black/20 rounded-lg p-3 max-h-[280px] overflow-y-auto border border-white/5 leading-7">
            {words.map((word, i) => (
                <React.Fragment key={`w_${i}`}>
                    <span className="text-[11px] text-slate-300">{word}</span>
                    {i < words.length - 1 && (() => {
                        const marker = markers.find(m => m.gapIndex === i && m.mode === 'word');
                        if (marker) {
                            return (
                                <MarkerControls
                                    marker={marker}
                                    onUpdate={(d) => updateDuration(i, d)}
                                    onRemove={() => removeMarker(i)}
                                />
                            );
                        }
                        return (
                            <span
                                onClick={() => addMarker(i, 0.5)}
                                onDragOver={(e) => { e.preventDefault(); setDragOverGap(i); }}
                                onDragLeave={() => setDragOverGap(null)}
                                onDrop={() => handleDrop(i)}
                                className={`inline-block rounded transition-all cursor-pointer select-none ${
                                    dragOverGap === i
                                        ? 'bg-cyan-500/30 border border-dashed border-cyan-500/50 px-1'
                                        : 'hover:bg-white/10'
                                }`}
                                style={{ minWidth: dragOverGap === i ? '12px' : '6px' }}
                            >
                                {dragOverGap === i && <span className="text-[7px] text-cyan-400">+</span>}
                            </span>
                        );
                    })()}
                </React.Fragment>
            ))}
        </div>
    );

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Skripttext — Pausen setzen</div>
                    <div className="flex rounded-lg overflow-hidden border border-white/10">
                        <button
                            onClick={() => setDisplayMode('sentence')}
                            className={`px-2 py-0.5 text-[8px] font-bold uppercase transition-all ${
                                displayMode === 'sentence' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-slate-500 hover:text-white'
                            }`}
                        >Satz</button>
                        <button
                            onClick={() => setDisplayMode('word')}
                            className={`px-2 py-0.5 text-[8px] font-bold uppercase transition-all ${
                                displayMode === 'word' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-slate-500 hover:text-white'
                            }`}
                        >Wort</button>
                    </div>
                </div>
                {markers.length > 0 && (
                    <div className="text-[9px] text-cyan-400">
                        {markers.length} Pause{markers.length > 1 ? 'n' : ''} · +{totalPauseTime.toFixed(1)}s
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[8px] text-slate-600 uppercase">Ziehen:</span>
                {PAUSE_PRESETS.map(d => (
                    <div
                        key={d}
                        draggable
                        onDragStart={() => { dragRef.current = { type: 'new', duration: d }; }}
                        onDragEnd={() => { dragRef.current = null; setDragOverGap(null); }}
                        className="px-1.5 py-0.5 rounded bg-cyan-600/15 border border-cyan-500/25 text-cyan-300 text-[9px] font-bold cursor-grab active:cursor-grabbing hover:bg-cyan-600/25 transition-all select-none"
                    >
                        ⏸ {formatDuration(d)}
                    </div>
                ))}
            </div>

            {displayMode === 'sentence' ? renderSentenceMode() : renderWordMode()}

            {markers.length > 0 && (
                <button
                    onClick={() => onChange([])}
                    className="text-[9px] text-slate-500 hover:text-red-400 transition-colors"
                >
                    Alle Pausen entfernen
                </button>
            )}
        </div>
    );
};
