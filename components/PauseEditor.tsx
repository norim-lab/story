import React, { useState, useRef } from 'react';

export interface PauseMarker {
    id: string;
    gapIndex: number;
    duration: number;
}

interface PauseEditorProps {
    text: string;
    markers: PauseMarker[];
    onChange: (markers: PauseMarker[]) => void;
}

const PAUSE_PRESETS = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0];

function splitIntoSegments(text: string): string[] {
    if (!text || !text.trim()) return [];
    const segments = text.split(/(?<=[.!?])\s+/);
    return segments.filter(s => s.trim().length > 0);
}

function formatDuration(d: number): string {
    if (d < 1) return `${Math.round(d * 10) / 10}s`;
    if (d === Math.floor(d)) return `${d}s`;
    return `${d.toFixed(1)}s`;
}

const GapZone: React.FC<{
    gapIndex: number;
    marker: PauseMarker | undefined;
    isDragOver: boolean;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: () => void;
    onAdd: (duration: number) => void;
    onRemove: () => void;
    onUpdateDuration: (d: number) => void;
    onDragStartMarker: () => void;
}> = ({ gapIndex, marker, isDragOver, onDragOver, onDragLeave, onDrop, onAdd, onRemove, onUpdateDuration, onDragStartMarker }) => {
    if (marker) {
        return (
            <div
                draggable
                onDragStart={onDragStartMarker}
                className="flex items-center gap-1.5 my-1.5 px-2 py-1 rounded-lg bg-cyan-600/15 border border-cyan-500/25 group cursor-grab active:cursor-grabbing"
            >
                <div className="text-cyan-400 text-[10px]">⏸</div>
                <div
                    className="flex items-center gap-0.5"
                    onWheel={(e) => {
                        e.preventDefault();
                        const delta = e.deltaY > 0 ? -0.5 : 0.5;
                        onUpdateDuration(Math.max(0.5, Math.min(10, marker.duration + delta)));
                    }}
                >
                    <button
                        onClick={() => onUpdateDuration(Math.max(0.5, marker.duration - 0.5))}
                        className="w-4 h-4 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-400 flex items-center justify-center"
                    >−</button>
                    <span className="text-[10px] font-black text-cyan-300 min-w-[32px] text-center tabular-nums">
                        {formatDuration(marker.duration)}
                    </span>
                    <button
                        onClick={() => onUpdateDuration(Math.min(10, marker.duration + 0.5))}
                        className="w-4 h-4 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-400 flex items-center justify-center"
                    >+</button>
                </div>
                <button
                    onClick={onRemove}
                    className="ml-auto opacity-0 group-hover:opacity-100 w-4 h-4 rounded bg-red-500/20 hover:bg-red-500/40 text-[9px] text-red-400 flex items-center justify-center transition-opacity"
                >×</button>
            </div>
        );
    }

    return (
        <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => onAdd(1.0)}
            className={`my-1 h-4 flex items-center justify-center rounded transition-all cursor-pointer ${
                isDragOver
                    ? 'bg-cyan-500/20 border border-dashed border-cyan-500/50'
                    : 'hover:bg-white/5 border border-transparent'
            }`}
        >
            <span className={`text-[9px] transition-opacity ${isDragOver ? 'opacity-100 text-cyan-400' : 'opacity-0 hover:opacity-40 text-slate-500'}`}>
                + Pause
            </span>
        </div>
    );
};

export const PauseEditor: React.FC<PauseEditorProps> = ({ text, markers, onChange }) => {
    const segments = splitIntoSegments(text);
    const [dragOverGap, setDragOverGap] = useState<number | null>(null);
    const dragRef = useRef<{ type: 'new' | 'existing'; duration?: number; markerId?: string } | null>(null);

    if (segments.length === 0) {
        return (
            <div className="text-[10px] text-slate-500 italic p-3 bg-black/20 rounded-lg">
                Kein Skripttext vorhanden. Bitte zuerst ein Skript generieren.
            </div>
        );
    }

    const addMarker = (gapIndex: number, duration: number = 1.0) => {
        const existing = markers.find(m => m.gapIndex === gapIndex);
        if (existing) {
            onChange(markers.map(m => m.gapIndex === gapIndex ? { ...m, duration } : m));
        } else {
            onChange([...markers.filter(m => m.gapIndex !== gapIndex), { id: `pause_${Date.now()}_${gapIndex}`, gapIndex, duration }]);
        }
    };

    const removeMarker = (gapIndex: number) => {
        onChange(markers.filter(m => m.gapIndex !== gapIndex));
    };

    const updateDuration = (gapIndex: number, duration: number) => {
        onChange(markers.map(m => m.gapIndex === gapIndex ? { ...m, duration } : m));
    };

    const handleDrop = (gapIndex: number) => {
        const dragItem = dragRef.current;
        if (!dragItem) { setDragOverGap(null); return; }

        if (dragItem.type === 'new') {
            addMarker(gapIndex, dragItem.duration || 1.0);
        } else if (dragItem.type === 'existing' && dragItem.markerId) {
            const existing = markers.find(m => m.id === dragItem.markerId);
            if (existing && existing.gapIndex !== gapIndex) {
                onChange(markers.map(m =>
                    m.id === dragItem.markerId ? { ...m, gapIndex } : m
                ));
            }
        }
        setDragOverGap(null);
        dragRef.current = null;
    };

    const totalPauseTime = markers.reduce((sum, m) => sum + m.duration, 0);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Skripttext — Klick oder Drag für Pause</div>
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

            <div className="bg-black/20 rounded-lg p-3 max-h-[280px] overflow-y-auto border border-white/5 space-y-0">
                {segments.map((segment, i) => (
                    <React.Fragment key={i}>
                        <div className="text-[11px] text-slate-300 leading-relaxed py-0.5">{segment}</div>
                        {i < segments.length - 1 && (
                            <GapZone
                                gapIndex={i}
                                marker={markers.find(m => m.gapIndex === i)}
                                isDragOver={dragOverGap === i}
                                onDragOver={(e) => { e.preventDefault(); setDragOverGap(i); }}
                                onDragLeave={() => setDragOverGap(null)}
                                onDrop={() => handleDrop(i)}
                                onAdd={(d) => addMarker(i, d)}
                                onRemove={() => removeMarker(i)}
                                onUpdateDuration={(d) => updateDuration(i, d)}
                                onDragStartMarker={() => {
                                    const m = markers.find(m => m.gapIndex === i);
                                    if (m) dragRef.current = { type: 'existing', markerId: m.id };
                                }}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>

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
