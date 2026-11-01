export type OutputFormat = 'mp4' | 'mkv' | 'webm';
export type Preset = 'compatibility' | 'high-quality' | 'small-size';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface VideoInfo {
  name: string;
  path: string;
  format: string | null;
  duration: number | null;
  fileSize: number;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrate: number | null;
  thumbnailDataUrl?: string | null;
  error?: string;
}

export interface ImportResult {
  path: string;
  ok: boolean;
  info?: VideoInfo;
  error?: string;
}

export interface ConversionTask {
  id: string;
  inputPath: string;
  inputName: string;
  inputSize: number;
  inputFormat: string | null;
  outputPath: string;
  outputFormat: OutputFormat;
  preset: Preset;
  status: TaskStatus;
  progress: number;
  speed?: string;
  duration: number | null;
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
  outputSize?: number;
}

export interface EnqueueItem {
  inputPath: string;
  inputName: string;
  inputSize: number;
  inputFormat: string | null;
  duration: number | null;
  outputFormat: OutputFormat;
  preset: Preset;
  outputDir: string;
}

export interface Settings {
  outputDir: string;
  defaultFormat: OutputFormat;
  defaultPreset: Preset;
  ffmpegPath: string | null;
  ffprobePath: string | null;
}

export interface FfmpegStatus {
  ok: boolean;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  version: string | null;
  error: string | null;
}

export interface HistoryEntry {
  id: string;
  inputPath: string;
  outputPath: string;
  outputName: string;
  inputSize: number;
  outputSize: number;
  inputFormat: string | null;
  outputFormat: OutputFormat;
  preset: Preset;
  completedAt: number;
  elapsedMs: number;
}

export interface ClipForgeApi {
  openVideoDialog(): Promise<string[]>;
  openDirDialog(): Promise<string | null>;
  getPathForFile(file: File): string;
  importVideos(paths: string[]): Promise<ImportResult[]>;
  getFfmpegStatus(): Promise<FfmpegStatus>;
  setFfmpegPaths(paths: { ffmpegPath?: string | null; ffprobePath?: string | null }): Promise<FfmpegStatus>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  enqueue(items: EnqueueItem[]): Promise<ConversionTask[]>;
  getTasks(): Promise<ConversionTask[]>;
  cancelTask(id: string): Promise<void>;
  clearFinished(): Promise<void>;
  onTaskUpdate(cb: (task: ConversionTask) => void): () => void;
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): Promise<void>;
  getHistory(): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
}
