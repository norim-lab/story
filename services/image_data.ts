
import { ImageModelInfo } from "../types";

export const IMAGE_MODELS: ImageModelInfo[] = [
  { 
    id: 'gemini-2.5-flash-image', 
    name: 'Gemini 2.5 Flash Image', 
    pricePerImage: 0.00, 
    config: '1024x1024 · Fast · Free Tier', 
    releaseDate: 'Dec 2024', 
    isFreeTier: true 
  }
];

export const getModelById = (id: string) => IMAGE_MODELS.find(m => m.id === id);
