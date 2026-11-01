import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ConversionTask,
  EnqueueItem,
  ImportResult,
  OutputFormat,
  Preset,
  Settings,
} from '../../shared/types';
import {
  FORMAT_EXTENSIONS,
  runConversion,
  splitName,
  uniqueOutputPath,
} from '../services/conversionService';
import { getFfmpegStatus, resolveToolPaths } from '../services/ffmpegLocator';
import { importVideo } from '../services/mediaService';
import { AppStore } from '../services/store';
import { TaskManager } from '../services/taskManager';
import { getThumbnail } from '../services/thumbnailService';

const VIDEO_EXTENSIONS = [
  'mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv', 'm4v', 'ts', 'mpeg', 'mpg', '3gp', 'ogv',
];
const FORMATS: OutputFormat[] = ['mp4', 'mkv', 'webm'];
const PRESETS: Preset[] = ['compatibility', 'high-quality', 'small-size'];

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !v.includes('\0');
}

function requirePath(v: unknown): string {
  if (!isNonEmptyString(v) || !path.isAbsolute(v)) throw new Error('无效的文件路径');
  return v;
}

function parseEnqueueItem(raw: unknown, outputDir: string): EnqueueItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<EnqueueItem>;
  if (!isNonEmptyString(item.inputPath) || !path.isAbsolute(item.inputPath)) return null;
  if (!fs.existsSync(item.inputPath)) return null;
  if (!FORMATS.includes(item.outputFormat as OutputFormat)) return null;
  if (!PRESETS.includes(item.preset as Preset)) return null;
  const duration =
    typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0
      ? item.duration
      : null;
  return {
    inputPath: item.inputPath,
    inputName: isNonEmptyString(item.inputName) ? item.inputName : path.basename(item.inputPath),
    inputSize: typeof item.inputSize === 'number' && item.inputSize >= 0 ? item.inputSize : 0,
    inputFormat: isNonEmptyString(item.inputFormat) ? item.inputFormat : null,
    duration,
    outputFormat: item.outputFormat as OutputFormat,
    preset: item.preset as Preset,
    outputDir,
  };
}

export interface IpcContext {
  store: AppStore;
  taskManager: TaskManager;
}

export function registerIpcHandlers(): IpcContext {
  const store = new AppStore();

  const taskManager = new TaskManager(async (task, hooks, signal) => {
    const settings = store.getSettings();
    const tools = await resolveToolPaths({
      ffmpegPath: settings.ffmpegPath,
      ffprobePath: settings.ffprobePath,
    });
    return runConversion(task, tools, hooks, signal);
  });

  taskManager.on('update', (task: ConversionTask) => broadcast('task:update', task));
  taskManager.on('completed', (task: ConversionTask) => {
    store.addHistory({
      id: task.id,
      inputPath: task.inputPath,
      outputPath: task.outputPath,
      outputName: path.basename(task.outputPath),
      inputSize: task.inputSize,
      outputSize: task.outputSize ?? 0,
      inputFormat: task.inputFormat,
      outputFormat: task.outputFormat,
      preset: task.preset,
      completedAt: task.completedAt ?? Date.now(),
      elapsedMs: Math.max(0, (task.completedAt ?? Date.now()) - task.createdAt),
    });
  });

  ipcMain.handle('dialog:open-videos', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择要转换的视频',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '视频文件', extensions: VIDEO_EXTENSIONS },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:open-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择输出目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('media:import', async (_event, rawPaths: unknown): Promise<ImportResult[]> => {
    const paths = Array.isArray(rawPaths)
      ? rawPaths.filter((p): p is string => isNonEmptyString(p) && path.isAbsolute(p))
      : [];
    if (!paths.length) return [];

    const settings = store.getSettings();
    const status = await getFfmpegStatus({
      ffmpegPath: settings.ffmpegPath,
      ffprobePath: settings.ffprobePath,
    });
    if (!status.ok || !status.ffprobePath) {
      return paths.map((p) => ({
        path: p,
        ok: false,
        error: `${status.error ?? 'FFprobe 不可用'} 请前往「设置」配置 FFmpeg/FFprobe。`,
      }));
    }

    const unique = [...new Set(paths)];
    return Promise.all(
      unique.map(async (p): Promise<ImportResult> => {
        const info = await importVideo(status.ffprobePath as string, p);
        if ('error' in info) return { path: p, ok: false, error: info.error };
        const thumbnailDataUrl = status.ffmpegPath
          ? await getThumbnail(status.ffmpegPath, p, info.duration)
          : null;
        return { path: p, ok: true, info: { ...info, thumbnailDataUrl } };
      }),
    );
  });

  ipcMain.handle('ffmpeg:status', async () => {
    const settings = store.getSettings();
    return getFfmpegStatus({
      ffmpegPath: settings.ffmpegPath,
      ffprobePath: settings.ffprobePath,
    });
  });

  ipcMain.handle('ffmpeg:set-paths', async (_event, raw: unknown) => {
    const patch =
      raw && typeof raw === 'object'
        ? {
            ffmpegPath:
              typeof (raw as Record<string, unknown>).ffmpegPath === 'string'
                ? ((raw as Record<string, string>).ffmpegPath.trim() || null)
                : null,
            ffprobePath:
              typeof (raw as Record<string, unknown>).ffprobePath === 'string'
                ? ((raw as Record<string, string>).ffprobePath.trim() || null)
                : null,
          }
        : { ffmpegPath: null, ffprobePath: null };
    const settings = store.updateSettings(patch);
    return getFfmpegStatus({
      ffmpegPath: settings.ffmpegPath,
      ffprobePath: settings.ffprobePath,
    });
  });

  ipcMain.handle('settings:get', () => store.getSettings());

  ipcMain.handle('settings:update', (_event, patch: unknown): Settings => {
    if (!patch || typeof patch !== 'object') return store.getSettings();
    const raw = patch as Partial<Settings>;
    const clean: Partial<Settings> = {};
    if (isNonEmptyString(raw.outputDir) && path.isAbsolute(raw.outputDir)) {
      clean.outputDir = raw.outputDir;
    }
    if (raw.defaultFormat && FORMATS.includes(raw.defaultFormat)) {
      clean.defaultFormat = raw.defaultFormat;
    }
    if (raw.defaultPreset && PRESETS.includes(raw.defaultPreset)) {
      clean.defaultPreset = raw.defaultPreset;
    }
    return store.updateSettings(clean);
  });

  ipcMain.handle('task:enqueue', async (_event, rawItems: unknown): Promise<ConversionTask[]> => {
    const items = Array.isArray(rawItems) ? rawItems : [];
    const settings = store.getSettings();
    const outputDir = settings.outputDir;

    try {
      await fs.promises.mkdir(outputDir, { recursive: true });
      const check = await fs.promises.stat(outputDir);
      if (!check.isDirectory()) throw new Error('not a directory');
    } catch {
      throw new Error(`无法写入输出目录：${outputDir}`);
    }

    const reserved = new Set(taskManager.list().map((t) => t.outputPath));
    const created: ConversionTask[] = [];

    for (const raw of items) {
      const item = parseEnqueueItem(raw, outputDir);
      if (!item) continue;
      const { base } = splitName(item.inputName);
      const outputPath = uniqueOutputPath(
        item.outputDir,
        base,
        FORMAT_EXTENSIONS[item.outputFormat],
        reserved,
      );
      reserved.add(outputPath);

      const task: ConversionTask = {
        id: randomUUID(),
        inputPath: item.inputPath,
        inputName: item.inputName,
        inputSize: item.inputSize,
        inputFormat: item.inputFormat,
        outputPath,
        outputFormat: item.outputFormat,
        preset: item.preset,
        status: 'pending',
        progress: 0,
        duration: item.duration,
        createdAt: Date.now(),
      };
      created.push(taskManager.add(task));
    }

    if (!created.length) throw new Error('没有可转换的有效视频。');
    return created;
  });

  ipcMain.handle('task:list', () => taskManager.list());

  ipcMain.handle('task:cancel', (_event, id: unknown) => {
    if (typeof id === 'string') taskManager.cancel(id);
  });

  ipcMain.handle('task:clear-finished', () => {
    taskManager.clearFinished();
  });

  ipcMain.handle('shell:open-path', async (_event, raw: unknown) => {
    const target = requirePath(raw);
    return shell.openPath(target);
  });

  ipcMain.handle('shell:show-item', (_event, raw: unknown) => {
    const target = requirePath(raw);
    shell.showItemInFolder(target);
  });

  ipcMain.handle('history:list', () => store.getHistory());

  ipcMain.handle('history:clear', () => {
    store.clearHistory();
  });

  return { store, taskManager };
}
