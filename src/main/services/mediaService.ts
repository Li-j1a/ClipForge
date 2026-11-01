import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { VideoInfo } from '../../shared/types';

export interface ProbeData {
  format: string | null;
  duration: number | null;
  fileSize: number;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrate: number | null;
}

interface FfStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
  disposition?: { attached_pic?: number };
}

interface FfFormat {
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

interface FfProbeOutput {
  format?: FfFormat;
  streams?: FfStream[];
}

/** "30000/1001" -> 29.97, "25/1" -> 25, "0/0" -> null */
export function parseFrameRate(raw: string | undefined | null): number | null {
  if (!raw) return null;
  if (raw.includes('/')) {
    const [n, d] = raw.split('/').map(Number);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0 || n === 0) return null;
    const fps = n / d;
    return Number.isFinite(fps) && fps > 0 ? Number(fps.toFixed(3)) : null;
  }
  const fps = Number(raw);
  return Number.isFinite(fps) && fps > 0 ? Number(fps.toFixed(3)) : null;
}

const CONTAINER_LABELS: Record<string, string> = {
  mp4: 'MP4',
  mov: 'MOV',
  matroska: 'MKV',
  webm: 'WebM',
  avi: 'AVI',
  flv: 'FLV',
  mpegts: 'TS',
  '3gp': '3GP',
  ogg: 'OGG',
  wav: 'WAV',
  mp3: 'MP3',
};

/** format_name can be a comma list like "mov,mp4,m4a,3gp,3g2,mj2" */
export function formatLabel(formatName: string | undefined | null): string | null {
  if (!formatName) return null;
  const tokens = formatName.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  // FFprobe lists the whole aliased family ("mov,mp4,m4a,..."); prefer the container users know.
  const preferred = ['mp4', 'webm', 'matroska', 'mov'].find((t) => tokens.includes(t));
  const key = preferred ?? tokens[0];
  return key ? (CONTAINER_LABELS[key] ?? key.toUpperCase()) : null;
}

function positiveNumber(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pure parser, unit-testable without running FFprobe. */
export function parseProbeJson(raw: unknown): ProbeData {
  const data = (raw ?? {}) as FfProbeOutput;
  const format = data.format ?? {};
  const streams = Array.isArray(data.streams) ? data.streams : [];
  // skip cover-art streams (attached_pic) when picking the video stream
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic) ??
    streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');

  const duration = positiveNumber(format.duration) ?? positiveNumber(video?.duration);

  return {
    format: formatLabel(format.format_name),
    duration,
    fileSize: positiveNumber(format.size) ?? 0,
    width: positiveNumber(video?.width),
    height: positiveNumber(video?.height),
    frameRate: parseFrameRate(video?.avg_frame_rate) ?? parseFrameRate(video?.r_frame_rate),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    bitrate: positiveNumber(format.bit_rate) ?? positiveNumber(video?.bit_rate) ?? positiveNumber(audio?.bit_rate),
  };
}

export interface ProbeResult {
  ok: boolean;
  data?: ProbeData;
  error?: string;
}

export function probeFile(ffprobePath: string, filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: ProbeResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        ffprobePath,
        ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath],
        { windowsHide: true },
      );
    } catch (err) {
      finish({ ok: false, error: `无法启动 FFprobe：${(err as Error).message}` });
      return;
    }

    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: '读取视频信息超时。' });
    }, 30000);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, error: `无法启动 FFprobe：${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish({ ok: false, error: describeProbeError(stderr, code) });
        return;
      }
      try {
        const parsed = parseProbeJson(JSON.parse(stdout));
        if (!parsed.videoCodec) {
          finish({ ok: false, error: '该文件不包含可识别的视频流。' });
          return;
        }
        finish({ ok: true, data: parsed });
      } catch {
        finish({ ok: false, error: '无法解析 FFprobe 输出，文件可能已损坏。' });
      }
    });
  });
}

function describeProbeError(stderr: string, code: number | null): string {
  const text = stderr.trim();
  if (/No such file or directory/i.test(text)) return '文件不存在或已被移动。';
  if (/Permission denied/i.test(text)) return '没有读取该文件的权限。';
  if (/Invalid data found|moov atom not found|End of file/i.test(text)) {
    return '文件已损坏或不是受支持的视频格式。';
  }
  const lastLine = text.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  return lastLine ? `无法读取视频信息：${lastLine}` : `无法读取视频信息（FFprobe 退出码 ${code}）。`;
}

export async function importVideo(ffprobePath: string, filePath: string): Promise<VideoInfo | { error: string }> {
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat) return { error: '文件不存在或已被移动。' };
  if (!stat.isFile()) return { error: '所选路径不是文件。' };

  const probe = await probeFile(ffprobePath, filePath);
  if (!probe.ok || !probe.data) return { error: probe.error ?? '无法读取视频信息。' };

  return {
    name: path.basename(filePath),
    path: filePath,
    ...probe.data,
    fileSize: probe.data.fileSize || stat.size,
    thumbnailDataUrl: null,
  };
}
