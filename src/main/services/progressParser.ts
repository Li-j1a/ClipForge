export interface ProgressSnapshot {
  /** Media time processed by FFmpeg, in seconds. Undefined if FFmpeg did not report it. */
  outTimeSeconds?: number;
  speed?: string;
  done: boolean;
}

/**
 * Parses FFmpeg `-progress pipe:1` output: blocks of `key=value` lines
 * terminated by `progress=continue` / `progress=end`.
 */
export class ProgressParser {
  private buffer = '';
  private current: Record<string, string> = {};

  push(chunk: string): ProgressSnapshot[] {
    this.buffer += chunk;
    const snapshots: ProgressSnapshot[] = [];
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      const snapshot = this.parseLine(line);
      if (snapshot) snapshots.push(snapshot);
      newline = this.buffer.indexOf('\n');
    }
    return snapshots;
  }

  private parseLine(line: string): ProgressSnapshot | null {
    const eq = line.indexOf('=');
    if (eq <= 0) return null;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (key !== 'progress') {
      this.current[key] = value;
      return null;
    }

    const snapshot: ProgressSnapshot = {
      outTimeSeconds: readOutTime(this.current),
      speed: cleanSpeed(this.current.speed),
      done: value === 'end',
    };
    this.current = {};
    return snapshot;
  }
}

/** `out_time` is HH:MM:SS.ffffff; prefer it because out_time_us/ms differ across builds. */
export function parseTimecode(value: string | undefined): number | undefined {
  if (!value || value === 'N/A') return undefined;
  const match = /^(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return undefined;
  const [, sign, h, m, s] = match;
  const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return sign === '-' ? 0 : seconds;
}

function readOutTime(fields: Record<string, string>): number | undefined {
  const direct = parseTimecode(fields.out_time);
  if (direct !== undefined) return direct;
  const us = Number(fields.out_time_us);
  if (Number.isFinite(us) && us >= 0) return us / 1_000_000;
  const ms = Number(fields.out_time_ms);
  if (Number.isFinite(ms) && ms >= 0) return ms / 1000;
  return undefined;
}

function cleanSpeed(value: string | undefined): string | undefined {
  if (!value || value === 'N/A') return undefined;
  return value.trim();
}

/** Clamp to 0..99.9; 100% is only reported after a verified successful exit. */
export function percentFromProgress(outTimeSeconds: number | undefined, duration: number | null): number {
  if (outTimeSeconds === undefined || !duration || duration <= 0) return 0;
  const pct = (outTimeSeconds / duration) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(99.9, Number(pct.toFixed(1))));
}
