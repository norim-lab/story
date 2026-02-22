
import React from 'react';
import { NewsItem, GeneratedImage, MODELS_CONFIG } from '../types';

const ImageDisplay: React.FC<{ img: GeneratedImage, isSelected: boolean, onToggle: () => void, onClick: () => void }> = ({ img, isSelected, onToggle, onClick }) => (
  <div className={`relative group/img rounded-2xl overflow-hidden bg-black/50 border border-white/10 ${img.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-[16:9]'}`}>
     <img src={img.url} className={`w-full h-full object-cover cursor-pointer transition-all ${isSelected ? 'brightness-110' : 'brightness-90 group-hover/img:brightness-100'}`} onClick={onClick} />
     <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className={`absolute top-2 right-2 p-2 rounded-xl backdrop-blur-md border border-white/10 transition-all ${isSelected ? 'bg-red-600' : 'bg-black/60'}`}>
       <svg className="w-4 h-4 text-white" fill={isSelected ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
     </button>
  </div>
);

const NewsItemCard: React.FC<{
  item: NewsItem;
  selectedUrls: Set<string>;
  onToggleSelect: (url: string) => void;
  onOpenLightbox: (img: GeneratedImage, index: number) => void;
  onSequence: (parent: GeneratedImage, count: number) => void;
}> = ({ item, selectedUrls, onToggleSelect, onOpenLightbox, onSequence }) => {
  return (
    <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-8 space-y-8 shadow-2xl">
      <div className="space-y-4">
        <h3 className="text-3xl font-black uppercase italic text-slate-200">{item.title}</h3>
        <p className="text-slate-400 leading-relaxed">{item.content}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        {item.generatedImages.map((img, index) => (
          <div key={img.id} className="space-y-4">
            <ImageDisplay img={img} isSelected={selectedUrls.has(img.url)} onToggle={() => onToggleSelect(img.url)} onClick={() => onOpenLightbox(img, index)} />
            <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-600">
                <span>{MODELS_CONFIG[img.modelId]?.label || img.modelId}</span>
                <button onClick={() => onSequence(img, 3)} className="text-red-400 hover:text-red-300">Sequence</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default NewsItemCard;
