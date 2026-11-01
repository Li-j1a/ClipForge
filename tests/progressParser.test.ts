import { describe, expect, it } from 'vitest';
import {
  parseTimecode,
  percentFromProgress,
  ProgressParser,
} from '../src/main/services/progressParser';

describe('parseTimecode', () => {
  it('parses HH:MM:SS.micro', () => {
    expect(parseTimecode('00:01:30.500000')).toBeCloseTo(90.5, 3);
    expect(parseTimecode('01:02:03.000000')).toBeCloseTo(3723, 3);
  });

  it('rejects N/A and empty values', () => {
    expect(parseTimecode('N/A')).toBeUndefined();
    expect(parseTimecode(undefined)).toBeUndefined();
    expect(parseTimecode('garbage')).toBeUndefined();
  });
});

describe('ProgressParser', () => {
  it('emits one snapshot per progress block', () => {
    const parser = new ProgressParser();
    const snaps = parser.push(
      'frame=10\nfps=25\nout_time=00:00:01.000000\nspeed=2.5x\nprogress=continue\n',
    );
    expect(snaps).toHaveLength(1);
    expect(snaps[0].outTimeSeconds).toBeCloseTo(1);
    expect(snaps[0].speed).toBe('2.5x');
    expect(snaps[0].done).toBe(false);
  });

  it('handles chunks split mid-line', () => {
    const parser = new ProgressParser();
    expect(parser.push('out_time=00:00:0')).toEqual([]);
    const snaps = parser.push('2.500000\nspeed=N/A\nprogress=end\n');
    expect(snaps).toHaveLength(1);
    expect(snaps[0].outTimeSeconds).toBeCloseTo(2.5);
    expect(snaps[0].speed).toBeUndefined();
    expect(snaps[0].done).toBe(true);
  });

  it('falls back to out_time_us when out_time is missing', () => {
    const parser = new ProgressParser();
    const snaps = parser.push('out_time_us=4200000\nprogress=continue\n');
    expect(snaps[0].outTimeSeconds).toBeCloseTo(4.2);
  });

  it('does not leak fields between blocks', () => {
    const parser = new ProgressParser();
    parser.push('speed=3.0x\nout_time=00:00:01.0\nprogress=continue\n');
    const snaps = parser.push('out_time=00:00:02.0\nprogress=continue\n');
    expect(snaps[0].speed).toBeUndefined();
    expect(snaps[0].outTimeSeconds).toBeCloseTo(2);
  });
});

describe('percentFromProgress', () => {
  it('computes percent and clamps below 100', () => {
    expect(percentFromProgress(5, 10)).toBe(50);
    expect(percentFromProgress(10, 10)).toBe(99.9);
    expect(percentFromProgress(11, 10)).toBe(99.9);
    expect(percentFromProgress(-1, 10)).toBe(0);
  });

  it('returns 0 for unknown duration or missing time', () => {
    expect(percentFromProgress(5, null)).toBe(0);
    expect(percentFromProgress(5, 0)).toBe(0);
    expect(percentFromProgress(undefined, 10)).toBe(0);
  });
});
