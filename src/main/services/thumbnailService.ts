import { app } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function cacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'thumbnails');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Seek time that works for short clips too (never blindly the 3s mark). */
export function thumbnailSeekSeconds(duration: number | null): number {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return 0.1;
  return Math.max(0.1, Math.min(3, duration / 2));
}

async function cacheKey(videoPath: string): Promise<string> {
  const stat = await fs.promises.stat(videoPath).catch(() => null);
  const stamp = stat ? `${stat.size}:${stat.mtimeMs}` : 'nostat';
  return crypto.createHash('sha1').update(`${path.resolve(videoPath)}|${stamp}`).digest('hex');
}

// One FFmpeg thumbnail job at a time keeps imports from spawning a process storm.
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ffmpegPath, args, { windowsHide: true });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 30000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.stdout?.resume();
    child.stderr?.resume();
  });
}

/** Returns a data URL so the renderer never needs filesystem access. */
export function getThumbnail(
  ffmpegPath: string,
  videoPath: string,
  duration: number | null,
): Promise<string | null> {
  return serial(async () => {
    try {
      const key = await cacheKey(videoPath);
      const outPath = path.join(cacheDir(), `${key}.jpg`);

      const existing = await fs.promises.stat(outPath).catch(() => null);
      if (!existing || existing.size === 0) {
        const seek = thumbnailSeekSeconds(duration);
        const ok = await runFfmpeg(ffmpegPath, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          String(seek),
          '-i',
          videoPath,
          '-frames:v',
          '1',
          '-vf',
          'scale=320:-2',
          '-y',
          outPath,
        ]);
        const stat = await fs.promises.stat(outPath).catch(() => null);
        if (!ok || !stat || stat.size === 0) {
          await fs.promises.unlink(outPath).catch(() => undefined);
          return null;
        }
      }

      const buf = await fs.promises.readFile(outPath);
      if (!buf.length) return null;
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });
}
