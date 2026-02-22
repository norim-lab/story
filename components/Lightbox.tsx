
import React, { useState, useEffect, useCallback } from 'react';
import { VisualAspect } from '../types';

interface LightboxProps {
  images: { url: string, metadata?: VisualAspect }[];
  initialIndex: number;
  context?: { title: string, content: string };
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ images, initialIndex, context, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoom(1);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoom(1);
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  const currentItem = images[currentIndex];

  const renderHighlightedText = () => {
    if (!context?.content) return null;
    const refText = currentItem?.metadata?.referenceText;

    if (!refText) return <p className="text-slate-300 whitespace-pre-wrap">{context.content}</p>;

    const parts = context.content.split(refText);
    
    if (parts.length === 1) return <p className="text-slate-300 whitespace-pre-wrap">{context.content}</p>;

    return (
      <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {i < parts.length - 1 && (
              <span className="text-emerald-400 italic font-bold bg-emerald-400/10 px-1 rounded mx-0.5 box-decoration-clone">
                {refText}
              </span>
            )}
          </React.Fragment>
        ))}
      </p>
    );
  };

  if (!currentItem) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 md:top-10 md:right-10 flex items-center gap-4 md:gap-12 z-[110]" onClick={e => e.stopPropagation()}>
        <span className="text-white/30 font-black text-[1em] md:text-[1.2em] tracking-[0.6em] uppercase font-mono">
          {currentIndex + 1} / {images.length}
        </span>
        <button onClick={onClose} className="p-4 md:p-6 bg-white/5 hover:bg-white/15 rounded-full transition-all text-white border border-white/10 group shadow-2xl">
          <svg className="w-8 h-8 md:w-10 md:h-10 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden p-4">
        <button onClick={handlePrev} className="absolute left-4 md:left-12 p-6 md:p-10 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/5 z-[110] backdrop-blur-xl shadow-2xl">
          <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
        </button>

        <img 
          key={currentItem.url} 
          src={currentItem.url} 
          className="max-w-full md:max-w-[85%] max-h-[75vh] object-contain rounded-xl md:rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] transition-transform duration-500 ease-out" 
          style={{ transform: `scale(${zoom})` }}
          onClick={e => e.stopPropagation()}
        />

        <button onClick={handleNext} className="absolute right-4 md:right-12 p-6 md:p-10 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/5 z-[110] backdrop-blur-xl shadow-2xl">
          <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {currentItem.metadata && (
        <div className="w-full max-w-7xl px-4 md:px-16 pb-8 md:pb-12 animate-in slide-in-from-bottom-10 duration-700 max-h-[40vh] md:max-h-[35vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
          <div className="bg-slate-900/95 border border-white/10 rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-10 backdrop-blur-2xl shadow-2xl grid md:grid-cols-2 gap-6 md:gap-10">
            
            <div className="space-y-4 md:border-r md:border-white/5 md:pr-6">
               {context && (
                  <>
                     <h5 className="text-[0.7em] font-black uppercase tracking-widest text-slate-500 mb-2">{context.title}</h5>
                     <div className="text-[0.9em] md:text-[0.95em] opacity-90 max-h-[150px] md:max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                         {renderHighlightedText()}
                     </div>
                  </>
               )}
            </div>

            <div className="space-y-4 md:space-y-6 flex flex-col justify-center">
                <div className="flex items-center gap-4 md:gap-6">
                  <span className="px-4 py-2 bg-yellow-500 text-slate-900 text-[0.7em] font-black uppercase rounded-lg">Visual Context</span>
                  <span className="text-white/40 text-[0.7em] font-black uppercase tracking-[0.4em]">{currentItem.metadata.perspective}</span>
                </div>
                
                <div>
                  <div className="text-[0.65em] font-bold text-slate-500 uppercase mb-2">Visual Intention</div>
                  <p className="text-slate-200 text-[1em] md:text-[1.1em] leading-relaxed italic border-l-4 border-yellow-500 pl-4">{currentItem.metadata.reasoning}</p>
                </div>
                
                <div>
                  <div className="text-[0.65em] font-bold text-slate-500 uppercase mb-1">Generated Caption</div>
                  <p className="text-slate-400 text-[0.9em]">"{currentItem.metadata.caption}"</p>
                </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default Lightbox;
