import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ConversionTask, OutputFormat, Preset } from '../../shared/types';
import { probeFile } from './mediaService';
import { percentFromProgress, ProgressParser } from './progressParser';
import type { ToolPaths } from './ffmpegLocator';

const CONTAINERS: Record<OutputFormat, string> = {
  mp4: 'mp4',
  mkv: 'matroska',
  webm: 'webm',
};

export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  mp4: '.mp4',
  mkv: '.mkv',
  webm: '.webm',
};

const VIDEO_ARGS: Record<Preset, Record<OutputFormat, string[]>> = {
  compatibility: {
    mp4: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p'],
    mkv: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p'],
    webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1'],
  },
  'high-quality': {
    mp4: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p'],
    mkv: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p'],
    webm: ['-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-row-mt', '1'],
  },
  'small-size': {
    mp4: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '28', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'],
    mkv: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '28', '-pix_fmt', 'yuv420p'],
    webm: ['-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1'],
  },
};

const AUDIO_ARGS: Record<Preset, Record<OutputFormat, string[]>> = {
  compatibility: {
    mp4: ['-c:a', 'aac', '-b:a', '192k'],
    mkv: ['-c:a', 'aac', '-b:a', '192k'],
    webm: ['-c:a', 'libopus', '-b:a', '128k'],
  },
  'high-quality': {
    mp4: ['-c:a', 'aac', '-b:a', '256k'],
    mkv: ['-c:a', 'aac', '-b:a', '256k'],
    webm: ['-c:a', 'libopus', '-b:a', '160k'],
  },
  'small-size': {
    mp4: ['-c:a', 'aac', '-b:a', '128k'],
    mkv: ['-c:a', 'aac', '-b:a', '128k'],
    webm: ['-c:a', 'libopus', '-b:a', '96k'],
  },
};

/** Builds an argv array — never a shell string. */
export function buildConversionArgs(opts: {
  inputPath: string;
  outputPath: string;
  format: OutputFormat;
  preset: Preset;
}): string[] {
  const { inputPath, outputPath, format, preset } = opts;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?', // optional: sources without an audio track must not fail
    '-sn',
    '-dn',
    ...VIDEO_ARGS[preset][format],
    ...AUDIO_ARGS[preset][format],
    ...(format === 'mp4' ? ['-movflags', '+faststart'] : []),
    '-f',
    CONTAINERS[format],
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath,
  ];
}

export function splitName(fileName: string): { base: string; ext: string } {
  const ext = path.extname(fileName);
  return { base: ext ? fileName.slice(0, -ext.length) : fileName, ext };
}

/** "holiday (1).mp4", "holiday (2).mp4", ... avoiding existing files and reserved names. */
export function uniqueOutputPath(
  dir: string,
  baseName: string,
  ext: string,
  reserved: Iterable<string> = [],
): string {
  const taken = new Set<string>();
  for (const p of reserved) taken.add(path.resolve(p).toLowerCase());

  let candidate = path.join(dir, `${baseName}${ext}`);
  let n = 1;
  while (fs.existsSync(candidate) || taken.has(path.resolve(candidate).toLowerCase())) {
    candidate = path.join(dir, `${baseName} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

export function friendlyError(stderr: string, exitCode: number | null): string {
  const text = stderr.trim();
  if (/No space left on device|ENOSPC/i.test(text)) {
    return '磁盘空间不足，无法写入输出文件。请清理磁盘后重试。';
  }
  if (/Permission denied|EACCES|EPERM/i.test(text)) {
    return '没有写入输出目录的权限，请更换保存位置。';
  }
  if (/No such file or directory/i.test(text)) {
    return '输入文件不存在或输出目录不可用。';
  }
  if (/Invalid data found|moov atom not found|Error while decoding|corrupt/i.test(text)) {
    return '视频文件已损坏或数据不完整，无法转换。';
  }
  if (/Unknown encoder|Encoder .* not found|Unknown decoder/i.test(text)) {
    return '当前 FFmpeg 构建不支持所需的编码器，请尝试其他格式或预设。';
  }
  if (/Unknown input format|Invalid argument/i.test(text)) {
    return '无法识别输入文件格式或转换参数无效。';
  }
  const lastLine = text.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  if (lastLine) return `转换失败：${lastLine}`;
  return `转换失败（FFmpeg 退出码 ${exitCode ?? '未知'}）。`;
}

export class ConversionCancelledError extends Error {
  constructor() {
    super('任务已取消');
    this.name = 'ConversionCancelledError';
  }
}

export interface RunningConversionHooks {
  onProgress: (percent: number, speed?: string) => void;
  isPathReserved?: (outputPath: string) => boolean;
}

export interface ConversionResult {
  outputPath: string;
  outputSize: number;
}

export async function runConversion(
  task: ConversionTask,
  tools: ToolPaths,
  hooks: RunningConversionHooks,
  signal: AbortSignal,
): Promise<ConversionResult> {
  const tempPath = path.join(path.dirname(task.outputPath), `.clipforge-${task.id}.part`);
  const args = buildConversionArgs({
    inputPath: task.inputPath,
    outputPath: tempPath,
    format: task.outputFormat,
    preset: task.preset,
  });

  await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);

  let capturedStderr = '';
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(tools.ffmpeg, args, { windowsHide: true }) as ChildProcessWithoutNullStreams;
    } catch (err) {
      reject(new Error(`无法启动 FFmpeg：${(err as Error).message}`));
      return;
    }

    const parser = new ProgressParser();
    let cancelled = signal.aborted;

    const onAbort = () => {
      cancelled = true;
      child.kill();
    };
    signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (d: Buffer) => {
      if (cancelled) return;
      for (const snap of parser.push(d.toString())) {
        const percent = percentFromProgress(snap.outTimeSeconds, task.duration);
        hooks.onProgress(percent, snap.speed);
      }
    });
    child.stderr.on('data', (d: Buffer) => {
      capturedStderr += d.toString();
      if (capturedStderr.length > 64_000) capturedStderr = capturedStderr.slice(-32_000);
    });
    child.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error(`无法启动 FFmpeg：${err.message}`));
    });
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort);
      resolve(cancelled ? null : code);
    });
  }).catch(async (err: Error) => {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  });

  if (signal.aborted || exitCode === null) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw new ConversionCancelledError();
  }
  if (exitCode !== 0) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw new Error(friendlyError(capturedStderr, exitCode));
  }

  // Never present an unverified file as a successful conversion.
  try {
    const stat = await fs.promises.stat(tempPath);
    if (!stat.isFile() || stat.size === 0) throw new Error('empty output');

    const check = await probeFile(tools.ffprobe, tempPath);
    // temp file has no media extension; probe by content is fine for ffprobe.
    if (!check.ok || !check.data?.videoCodec) {
      throw new Error(check.error ?? '输出文件校验失败');
    }
    // ffprobe can exit 0 with an empty/truncated artifact; require a real duration.
    if (!check.data.duration || check.data.duration <= 0) {
      throw new Error('输出文件缺少有效时长');
    }

    // The target may have appeared (or been claimed by a queued task) during conversion.
    const dir = path.dirname(task.outputPath);
    const base = splitName(path.basename(task.outputPath)).base;
    const ext = FORMAT_EXTENSIONS[task.outputFormat];
    const isTaken = (p: string) => fs.existsSync(p) || Boolean(hooks.isPathReserved?.(p));
    let finalPath = task.outputPath;
    for (let n = 1; isTaken(finalPath); n += 1) {
      finalPath = path.join(dir, `${base} (${n})${ext}`);
    }
    await fs.promises.rename(tempPath, finalPath);
    const finalStat = await fs.promises.stat(finalPath);
    return { outputPath: finalPath, outputSize: finalStat.size };
  } catch (err) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw new Error(
      err instanceof Error && err.message !== 'empty output' && !err.message.startsWith('output')
        ? `输出文件校验失败：${err.message}`
        : '转换未产生可用的输出文件。',
    );
  }
}
