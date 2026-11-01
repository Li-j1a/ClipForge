import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildConversionArgs,
  friendlyError,
  uniqueOutputPath,
} from '../src/main/services/conversionService';

const input = 'C:\\Videos\\我的 视频.mov';
const output = 'C:\\Out\\.clipforge-1.part';

function argsFor(format: 'mp4' | 'mkv' | 'webm', preset: 'compatibility' | 'high-quality' | 'small-size') {
  return buildConversionArgs({ inputPath: input, outputPath: output, format, preset });
}

describe('buildConversionArgs', () => {
  it('passes the input as a single argv entry (spaces and Chinese intact)', () => {
    const args = argsFor('mp4', 'compatibility');
    expect(args[args.indexOf('-i') + 1]).toBe(input);
    expect(args[args.length - 1]).toBe(output);
  });

  it('MP4 compatibility uses H.264/AAC and faststart', () => {
    const args = argsFor('mp4', 'compatibility');
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args).toContain('+faststart');
    expect(args.join(' ')).toContain('-progress pipe:1');
    expect(args[args.indexOf('-f') + 1]).toBe('mp4');
  });

  it('maps WebM to VP9/Opus and the webm muxer', () => {
    const args = argsFor('webm', 'compatibility');
    expect(args).toContain('libvpx-vp9');
    expect(args).toContain('libopus');
    expect(args[args.indexOf('-f') + 1]).toBe('webm');
    expect(args).not.toContain('+faststart');
  });

  it('maps MKV to the matroska muxer', () => {
    const args = argsFor('mkv', 'high-quality');
    expect(args[args.indexOf('-f') + 1]).toBe('matroska');
    expect(args).toContain('18'); // high-quality CRF
  });

  it('small-size switches MP4 to H.265', () => {
    const args = argsFor('mp4', 'small-size');
    expect(args).toContain('libx265');
  });
});

describe('uniqueOutputPath', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipforge-test-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns the plain name when free', () => {
    expect(uniqueOutputPath(dir, 'movie', '.mp4')).toBe(path.join(dir, 'movie.mp4'));
  });

  it('avoids existing files', () => {
    fs.writeFileSync(path.join(dir, 'movie.mp4'), 'x');
    expect(uniqueOutputPath(dir, 'movie', '.mp4')).toBe(path.join(dir, 'movie (1).mp4'));
  });

  it('avoids reserved names too', () => {
    const reserved = [path.join(dir, 'movie (1).mp4')];
    expect(uniqueOutputPath(dir, 'movie', '.mp4', reserved)).toBe(path.join(dir, 'movie (2).mp4'));
  });
});

describe('friendlyError', () => {
  it('translates common FFmpeg failures', () => {
    expect(friendlyError('No space left on device', 1)).toContain('磁盘空间不足');
    expect(friendlyError('Permission denied', 1)).toContain('权限');
    expect(friendlyError('moov atom not found', 1)).toContain('损坏');
    expect(friendlyError('Unknown encoder libx265', 1)).toContain('编码器');
  });

  it('falls back to the last stderr line', () => {
    expect(friendlyError('mystery failure', 3)).toContain('mystery failure');
    expect(friendlyError('', 3)).toContain('退出码 3');
  });
});
