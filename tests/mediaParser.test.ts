import { describe, expect, it } from 'vitest';
import {
  formatLabel,
  parseFrameRate,
  parseProbeJson,
} from '../src/main/services/mediaService';

describe('parseFrameRate', () => {
  it('handles fractional rates', () => {
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseFrameRate('25/1')).toBe(25);
    expect(parseFrameRate('24000/1001')).toBeCloseTo(23.976, 2);
  });

  it('rejects invalid values', () => {
    expect(parseFrameRate('0/0')).toBeNull();
    expect(parseFrameRate('0/1001')).toBeNull();
    expect(parseFrameRate('abc')).toBeNull();
    expect(parseFrameRate(undefined)).toBeNull();
  });
});

describe('formatLabel', () => {
  it('maps comma lists to a short container label', () => {
    expect(formatLabel('mov,mp4,m4a,3gp,3g2,mj2')).toBe('MP4');
    expect(formatLabel('matroska,webm')).toBe('WebM');
    expect(formatLabel('matroska')).toBe('MKV');
    expect(formatLabel('webm')).toBe('WebM');
    expect(formatLabel(undefined)).toBeNull();
  });
});

describe('parseProbeJson', () => {
  it('reads full metadata', () => {
    const data = parseProbeJson({
      format: {
        format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
        duration: '12.5',
        size: '1048576',
        bit_rate: '800000',
      },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1920,
          height: 1080,
          avg_frame_rate: '30000/1001',
        },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    });
    expect(data).toMatchObject({
      format: 'MP4',
      duration: 12.5,
      fileSize: 1048576,
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
      audioCodec: 'aac',
      bitrate: 800000,
    });
    expect(data.frameRate).toBeCloseTo(29.97, 2);
  });

  it('tolerates a missing audio track', () => {
    const data = parseProbeJson({
      format: { format_name: 'matroska,webm', duration: '3' },
      streams: [{ codec_type: 'video', codec_name: 'vp9', width: 640, height: 360 }],
    });
    expect(data.audioCodec).toBeNull();
    expect(data.frameRate).toBeNull();
    expect(data.videoCodec).toBe('vp9');
  });

  it('tolerates missing fields entirely', () => {
    const data = parseProbeJson({});
    expect(data).toEqual({
      format: null,
      duration: null,
      fileSize: 0,
      width: null,
      height: null,
      frameRate: null,
      videoCodec: null,
      audioCodec: null,
      bitrate: null,
    });
  });

  it('ignores attached cover-art streams when picking the video stream', () => {
    const data = parseProbeJson({
      format: { format_name: 'mp3' },
      streams: [
        { codec_type: 'video', codec_name: 'mjpeg', width: 300, height: 300, disposition: { attached_pic: 1 } },
        { codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    });
    expect(data.videoCodec).toBe('h264');
    expect(data.width).toBe(1280);
  });
});
