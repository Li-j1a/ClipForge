import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { HistoryEntry, Settings } from '../../shared/types';

function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function defaultOutputDir(): string {
  for (const key of ['videos', 'downloads', 'home'] as const) {
    try {
      return app.getPath(key);
    } catch {
      /* try next */
    }
  }
  return process.cwd();
}

function defaultSettings(): Settings {
  return {
    outputDir: defaultOutputDir(),
    defaultFormat: 'mp4',
    defaultPreset: 'compatibility',
    ffmpegPath: null,
    ffprobePath: null,
  };
}

function sanitizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  return {
    outputDir: typeof raw.outputDir === 'string' && raw.outputDir ? raw.outputDir : base.outputDir,
    defaultFormat:
      raw.defaultFormat === 'mp4' || raw.defaultFormat === 'mkv' || raw.defaultFormat === 'webm'
        ? raw.defaultFormat
        : base.defaultFormat,
    defaultPreset:
      raw.defaultPreset === 'compatibility' ||
      raw.defaultPreset === 'high-quality' ||
      raw.defaultPreset === 'small-size'
        ? raw.defaultPreset
        : base.defaultPreset,
    ffmpegPath: typeof raw.ffmpegPath === 'string' && raw.ffmpegPath ? raw.ffmpegPath : null,
    ffprobePath: typeof raw.ffprobePath === 'string' && raw.ffprobePath ? raw.ffprobePath : null,
  };
}

export class AppStore {
  private settings: Settings;
  private history: HistoryEntry[];

  constructor() {
    this.settings = sanitizeSettings(readJson(userDataFile('settings.json'), null));
    this.history = readJson<HistoryEntry[]>(userDataFile('history.json'), []).filter(
      (h) => h && typeof h.outputPath === 'string' && typeof h.completedAt === 'number',
    );
  }

  getSettings(): Settings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    writeJsonAtomic(userDataFile('settings.json'), this.settings);
    return this.getSettings();
  }

  getHistory(): HistoryEntry[] {
    return this.history.map((h) => ({ ...h }));
  }

  addHistory(entry: HistoryEntry): void {
    this.history.unshift(entry);
    if (this.history.length > 200) this.history = this.history.slice(0, 200);
    writeJsonAtomic(userDataFile('history.json'), this.history);
  }

  clearHistory(): void {
    this.history = [];
    writeJsonAtomic(userDataFile('history.json'), this.history);
  }
}
