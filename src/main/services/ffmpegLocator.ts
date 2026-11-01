import { app } from 'electron';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { FfmpegStatus } from '../../shared/types';

export interface ToolPaths {
  ffmpeg: string;
  ffprobe: string;
}

type Tool = 'ffmpeg' | 'ffprobe';

function resolveBundled(tool: Tool): string | null {
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'bin', `${tool}.exe`);
    return existsSync(p) ? p : null;
  }
  try {
    // Development: binaries ship with the npm installer packages.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const installer = require(`@${tool}-installer/${tool}`) as { path?: string };
    if (installer?.path && existsSync(installer.path)) return installer.path;
  } catch {
    /* not installed, fall back to PATH */
  }
  return null;
}

function readVersion(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, ['-version'], { windowsHide: true });
    } catch {
      done(null);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, 5000);
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      done(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done(code === 0 && out.trim() ? out.split('\n')[0].trim() : null);
    });
  });
}

async function locate(tool: Tool, override: string | null): Promise<{ path: string; version: string } | null> {
  const candidates: string[] = [];
  if (override && existsSync(override)) candidates.push(override);
  const bundled = resolveBundled(tool);
  if (bundled) candidates.push(bundled);
  candidates.push(tool); // PATH lookup

  for (const bin of candidates) {
    const version = await readVersion(bin);
    if (version) {
      return { path: bin, version };
    }
  }
  return null;
}

export async function getFfmpegStatus(overrides: {
  ffmpegPath: string | null;
  ffprobePath: string | null;
}): Promise<FfmpegStatus> {
  const ffmpeg = await locate('ffmpeg', overrides.ffmpegPath);
  const ffprobe = await locate('ffprobe', overrides.ffprobePath);
  const ok = Boolean(ffmpeg && ffprobe);
  return {
    ok,
    ffmpegPath: ffmpeg?.path ?? null,
    ffprobePath: ffprobe?.path ?? null,
    version: ffmpeg?.version ?? null,
    error: ok
      ? null
      : !ffmpeg && !ffprobe
        ? '未找到 FFmpeg 和 FFprobe。'
        : !ffmpeg
          ? '未找到 FFmpeg。'
          : '未找到 FFprobe。',
  };
}

export async function resolveToolPaths(overrides: {
  ffmpegPath: string | null;
  ffprobePath: string | null;
}): Promise<ToolPaths> {
  const status = await getFfmpegStatus(overrides);
  if (!status.ok || !status.ffmpegPath || !status.ffprobePath) {
    throw new Error(status.error ?? 'FFmpeg 不可用');
  }
  return { ffmpeg: status.ffmpegPath, ffprobe: status.ffprobePath };
}
