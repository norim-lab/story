
export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  ENRICHING = 'ENRICHING',
  REWRITING = 'REWRITING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export enum WorkflowStatus {
  IDLE = 'IDLE',
  RESEARCHING = 'RESEARCHING',
  SCRIPTING = 'SCRIPTING',
  VALIDATING = 'VALIDATING',
  SAVING = 'SAVING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export type TextModelId = string;

export enum EnrichmentMode {
  NONE = 'NONE',
  DEEP = 'DEEP'
}

export enum CloudStatus {
  CONNECTING = 'CONNECTING',
  ONLINE = 'ONLINE',     // Connected, idle
  SAVING = 'SAVING',     // Currently writing
  SAVED = 'SAVED',       // Write confirmed
  ERROR = 'ERROR',       // Write failed
  OFFLINE = 'OFFLINE'    // Ping failed
}

// Updated Slot System
export type ScriptLength = 
  | 'short_1' | 'short_2' | 'short_3' | 'short_4' | 'short_5' | 'short_6' | 'short_7' | 'short_8'
  | 'long_1' | 'long_2' | 'long_3' | 'long_4' | 'long_5' | 'long_6' | 'long_7' | 'long_8'
  | 'dialogue_1' | 'dialogue_2' | 'dialogue_3' | 'dialogue_4' | 'dialogue_5' | 'dialogue_6' | 'dialogue_7' | 'dialogue_8'
  | 'insta_1' | 'insta_2' | 'insta_3' | 'insta_4' | 'insta_5' | 'insta_6' | 'insta_7' | 'insta_8';

export type PublishPlatform = 'yt_shorts' | 'yt_long' | 'tiktok';

export interface ScriptSection {
  id: string;
  title: string;
  newsHeadline: string;
  versions: Record<string, string>;
  isFinal?: Record<string, boolean>; // Tracks finalized status per version key
  sources?: { title: string; url: string; type?: string }[];
  researchSnippet?: string;
}

export interface ScriptResult {
  sections: ScriptSection[];
  wordCount: Record<string, number>;
  estimatedCost: number;
  model: TextModelId;
  isEnriched: boolean;
  generatedAt: number;
  researchData?: string;
}

export interface SegmentControls {
  length: number;
  style: number;
  metaphor: number;
  info: number;
  x_source: number;
  fact_intensity: number;
  dialogue_seconds: number;
  target_seconds: number;
  news_seconds: number;
  insta_seconds: number;
  news_tiktok: boolean;
  series_parts: number;
}

export interface HistoryStateSnapshot {
  dossier: string;
  scriptResult: ScriptResult | null;
  segmentVersions: Record<string, ScriptLength>;
  segmentControls: Record<string, SegmentControls>;
  activeSegmentIdx: number;
  finalSelections: Record<string, ScriptLength>;
  factText?: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  description: string;
  state: HistoryStateSnapshot;
}

export interface ProjectSession {
  id: string;
  name: string;
  lastModified: number;
  rawInput: string;
  factText: string; // New field for facts
  scriptResult: ScriptResult | null;
  segmentVersions: Record<string, ScriptLength>;
  segmentControls: Record<string, SegmentControls>;
  history: HistoryItem[];
  historyIndex: number;
  isEditing: boolean;
  manualEditText: string;
  selectedModel: TextModelId;
  publishedOn: PublishPlatform[];
}

export interface WorkspaceExport {
  version: number;
  projects: ProjectSession[];
}

export interface ProjectState {
  dossier: string;
  scriptResult: ScriptResult | null;
  finalSelections: Record<string, ScriptLength>;
  segmentVersions: Record<string, ScriptLength>;
  segmentControls: Record<string, SegmentControls>;
  selectedModel: TextModelId;
  activeSegmentIdx: number;
  logs: BackgroundLog[];
  history: HistoryItem[];
  historyIndex: number;
  finalScriptText?: string;
}

export interface BackgroundLog {
  id: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'workflow';
}

export interface VisualAspect {
  referenceText?: string;
  perspective?: string;
  reasoning?: string;
  caption?: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  modelId: string;
  aspectRatio: string;
  metadata?: VisualAspect;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  generatedImages: GeneratedImage[];
}

export interface ImageModelInfo {
  id: string;
  name: string;
  pricePerImage: number;
  config: string;
  releaseDate: string;
  isFreeTier: boolean;
}

export interface NotionConfig {
  apiKey: string;
  databaseId: string;
}

export const MODELS_CONFIG: Record<string, { label: string }> = {
  'gemini-2.5-flash-image': { label: 'Flash Image' },
  'gemini-3-pro-image-preview': { label: 'Pro Image' }
};
