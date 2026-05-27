import React, { useState, useRef, useEffect } from 'react';

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

const MiniGap: React.FC<{
    gapIndex: number;
    mode: 'sentence' | 'word';
    marker: PauseMarker | undefined;
    isDragOver: boolean;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: () => void;
    onAdd: (duration: number) => void;
    onRemove: () => void;
    onUpdateDuration: (d: number) => void;
    onDragStartMarker: () => void;
}> = ({ gapIndex, mode, marker, isDragOver, onDragOver, onDragLeave, onDrop, onAdd, onRemove, onUpdateDuration, onDragStartMarker }) => {
    if (marker) {
        return (
            <span
                draggable
                onDragStart={onDragStartMarker}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 mx-0.5 px-1 py-0 rounded bg-cyan-600/20 border border-cyan-500/30 cursor-grab active:cursor-grabbing group relative"
            >
                <span className="text-cyan-400 text-[8px]">⏸</span>
                <span className="text-[8px] font-black text-cyan-300 tabular-nums">{formatDuration(marker.duration)}</span>
                <button
                    onClick={(e) => { e.stopPropagation(); onUpdateDuration(Math.max(MIN_DUR, Math.round((marker.duration - STEP) * 10) / 10)); }}
                    className="text-[7px] text-slate-400 hover:text-white px-0"
                >−</button>
                <button
                    onClick={(e) => { e.stopPropagation(); onUpdateDuration(Math.min(MAX_DUR, Math.round((marker.duration + STEP) * 10) / 10)); }}
                    className="text-[7px] text-slate-400 hover:text-white px-0"
                >+</button>
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="text-[7px] text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 ml-0"
                >×</button>
            </span>
        );
    }

    return (
        <span
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={(e) => { e.stopPropagation(); onAdd(0.5); }}
            className={`inline-block mx-px rounded transition-all cursor-pointer select-none ${
                isDragOver
                    ? 'bg-cyan-500/30 border border-dashed border-cyan-500/50 px-1'
                    : 'hover:bg-white/10 px-0.5'
            }`}
            style={{ minWidth: isDragOver ? '12px' : '4px', height: '14px', verticalAlign: 'middle' }}
        >
            {isDragOver && <span className="text-[7px] text-cyan-400">+</span>}
        </span>
    );
};

export const PauseEditor: React.FC<PauseEditorProps> = ({ text, markers, onChange }) => {
    const [displayMode, setDisplayMode] = useState<'sentence' | 'word'>('sentence');
    const [dragOverGap, setDragOverGap] = useState<number | null>(null);
    const [isDragNew, setIsDragNew] = useState(false);
    const dragRef = useRef<{ type: 'new' | 'existing'; duration?: number; markerId?: string } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const sentences = splitIntoSentences(text);
    const words = splitIntoWords(text);

    if (sentences.length === 0) {
        return (
            <div className="text-[10px] text-slate-500 italic p-3 bg-black/20 rounded-lg">
                Kein Skripttext vorhanden. Bitte zuerst ein Skript generieren.
            </div>
        );
    }

    const filteredMarkers = markers.filter(m => m.mode === displayMode);

    const addMarker = (gapIndex: number, duration: number = 0.5) => {
        const existing = markers.find(m => m.gapIndex === gapIndex && m.mode === displayMode);
        if (existing) {
            onChange(markers.map(m => (m.gapIndex === gapIndex && m.mode === displayMode) ? { ...m, duration } : m));
        } else {
            onChange([...markers, { id: `pause_${Date.now()}_${displayMode}_${gapIndex}`, gapIndex, duration, mode: displayMode }]);
        }
    };

    const removeMarker = (gapIndex: number) => {
        onChange(markers.filter(m => !(m.gapIndex === gapIndex && m.mode === displayMode)));
    };

    const updateDuration = (gapIndex: number, duration: number) => {
        onChange(markers.map(m => (m.gapIndex === gapIndex && m.mode === displayMode) ? { ...m, duration } : m));
    };

    const handleDrop = (gapIndex: number) => {
        const dragItem = dragRef.current;
        if (!dragItem) { setDragOverGap(null); return; }

        if (dragItem.type === 'new') {
            addMarker(gapIndex, dragItem.duration || 0.5);
        } else if (dragItem.type === 'existing' && dragItem.markerId) {
            const existing = markers.find(m => m.id === dragItem.markerId);
            if (existing && (existing.gapIndex !== gapIndex || existing.mode !== displayMode)) {
                onChange(markers.map(m =>
                    m.id === dragItem.markerId ? { ...m, gapIndex, mode: displayMode } : m
                ));
            }
        }
        setDragOverGap(null);
        dragRef.current = null;
    };

    const totalPauseTime = markers.reduce((sum, m) => sum + m.duration, 0);

    const renderSentenceMode = () => (
        <div className="bg-black/20 rounded-lg p-3 max-h-[280px] overflow-y-auto border border-white/5 space-y-0">
            {sentences.map((segment, i) => (
                <React.Fragment key={`s_${i}`}>
                    <div className="text-[11px] text-slate-300 leading-relaxed py-0.5">{segment}</div>
                    {i < sentences.length - 1 && (
                        <MiniGap
                            gapIndex={i}
                            mode="sentence"
                            marker={markers.find(m => m.gapIndex === i && m.mode === 'sentence')}
                            isDragOver={dragOverGap === i}
                            onDragOver={(e) => { e.preventDefault(); setDragOverGap(i); }}
                            onDragLeave={() => setDragOverGap(null)}
                            onDrop={() => handleDrop(i)}
                            onAdd={(d) => addMarker(i, d)}
                            onRemove={() => removeMarker(i)}
                            onUpdateDuration={(d) => updateDuration(i, d)}
                            onDragStartMarker={() => {
                                const m = markers.find(m => m.gapIndex === i && m.mode === 'sentence');
                                if (m) dragRef.current = { type: 'existing', markerId: m.id };
                            }}
                        />
                    )}
                </React.Fragment>
            ))}
        </div>
    );

    const renderWordMode = () => (
        <div ref={scrollRef} className="bg-black/20 rounded-lg p-3 max-h-[280px] overflow-y-auto border border-white/5 leading-6">
            {words.map((word, i) => (
                <React.Fragment key={`w_${i}`}>
                    <span className="text-[11px] text-slate-300">{word}</span>
                    {i < words.length - 1 && (
                        <MiniGap
                            gapIndex={i}
                            mode="word"
                            marker={markers.find(m => m.gapIndex === i && m.mode === 'word')}
                            isDragOver={dragOverGap === i}
                            onDragOver={(e) => { e.preventDefault(); setDragOverGap(i); }}
                            onDragLeave={() => setDragOverGap(null)}
                            onDrop={() => handleDrop(i)}
                            onAdd={(d) => addMarker(i, d)}
                            onRemove={() => removeMarker(i)}
                            onUpdateDuration={(d) => updateDuration(i, d)}
                            onDragStartMarker={() => {
                                const mk = markers.find(x => x.gapIndex === i && x.mode === 'word');
                                if (mk) dragRef.current = { type: 'existing', markerId: mk.id };
                            }}
                        />
                    )}
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
                        onDragStart={() => { dragRef.current = { type: 'new', duration: d }; setIsDragNew(true); }}
                        onDragEnd={() => { dragRef.current = null; setDragOverGap(null); setIsDragNew(false); }}
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
