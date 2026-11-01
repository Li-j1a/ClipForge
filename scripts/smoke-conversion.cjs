/*
 * Real end-to-end smoke test of the conversion engine (no Electron window needed).
 * Usage: node scripts/smoke-conversion.cjs [testDataDir]
 * Creates <testDataDir>/output and runs real FFmpeg conversions, verifying results with FFprobe.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  runConversion,
  buildConversionArgs,
} = require('../dist-electron/main/services/conversionService.js');
const { probeFile } = require('../dist-electron/main/services/mediaService.js');

const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.argv[2] || path.join(root, '.testdata'));
const outDir = path.join(dataDir, 'output');
fs.mkdirSync(outDir, { recursive: true });

const tools = {
  ffmpeg: path.join(root, 'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),
  ffprobe: path.join(root, 'node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
};

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function makeTask({ id, input, format, preset, duration }) {
  return {
    id,
    inputPath: input,
    inputName: path.basename(input),
    inputSize: fs.statSync(input).size,
    inputFormat: 'MP4',
    outputPath: path.join(outDir, `${path.basename(input, path.extname(input))} [${preset}].${format}`),
    outputFormat: format,
    preset,
    status: 'running',
    progress: 0,
    duration,
    createdAt: Date.now(),
  };
}

async function convert(task) {
  const progress = [];
  const result = await runConversion(
    task,
    tools,
    { onProgress: (p, s) => progress.push({ p, s }) },
    new AbortController().signal,
  );
  const probe = await probeFile(tools.ffprobe, result.outputPath);
  return { result, probe, progress };
}

async function main() {
  const sample = path.join(dataDir, 'sample 样本.mp4');
  const short = path.join(dataDir, 'short.mp4');
  const noaudio = path.join(dataDir, 'noaudio.mp4');
  const corrupt = path.join(dataDir, 'corrupt.mp4');

  if (!fs.existsSync(sample)) {
    console.error(`Missing test inputs in ${dataDir}`);
    process.exit(2);
  }

  // a corrupt input for the failure path
  const buf = fs.readFileSync(sample).subarray(0, 400_000);
  fs.writeFileSync(corrupt, buf);

  const cases = [
    { name: 'MP4 compatibility', input: sample, format: 'mp4', preset: 'compatibility', duration: 8 },
    { name: 'MKV high-quality', input: sample, format: 'mkv', preset: 'high-quality', duration: 8 },
    { name: 'WebM compatibility (short clip)', input: short, format: 'webm', preset: 'compatibility', duration: 0.8 },
    { name: 'MP4 small-size (H.265)', input: short, format: 'mp4', preset: 'small-size', duration: 0.8 },
    { name: 'no-audio source', input: noaudio, format: 'mp4', preset: 'compatibility', duration: 4 },
  ];

  for (const [i, c] of cases.entries()) {
    const task = makeTask({ id: `smoke-${i}`, ...c });
    try {
      const { result, probe, progress } = await convert(task);
      const size = fs.statSync(result.outputPath).size;
      check(
        c.name,
        probe.ok && size > 0,
        `${path.basename(result.outputPath)} ${size}B, codec=${probe.data?.videoCodec}/${probe.data?.audioCodec ?? 'none'}, progressSamples=${progress.length}`,
      );
      check(`${c.name}: real progress reported`, progress.length > 0 && progress.some((p) => p.p > 0));
    } catch (err) {
      check(c.name, false, err.message);
    }
  }

  // output name conflict: run the same conversion twice, expect " (1)" suffix
  const conflictTask = makeTask({ id: 'smoke-conflict', input: short, format: 'mp4', preset: 'compatibility', duration: 0.8 });
  try {
    const first = await convert(conflictTask);
    const second = await convert(conflictTask);
    check(
      'output filename conflict auto-renames',
      first.result.outputPath !== second.result.outputPath && fs.existsSync(first.result.outputPath),
      path.basename(second.result.outputPath),
    );
  } catch (err) {
    check('output filename conflict auto-renames', false, err.message);
  }

  // corrupt input must fail with a friendly message and leave no final file
  const badTask = makeTask({ id: 'smoke-corrupt', input: corrupt, format: 'mp4', preset: 'compatibility', duration: 8 });
  try {
    await convert(badTask);
    check('corrupt input fails cleanly', false, 'conversion unexpectedly succeeded');
  } catch (err) {
    const leftover = fs.existsSync(badTask.outputPath);
    const temp = fs.readdirSync(outDir).filter((f) => f.startsWith('.clipforge-'));
    check('corrupt input fails cleanly', !leftover && temp.length === 0, err.message);
  }

  // cancellation: abort a running conversion, expect abort + temp cleanup
  const cancelTask = makeTask({ id: 'smoke-cancel', input: sample, format: 'mkv', preset: 'high-quality', duration: 8 });
  cancelTask.outputPath = path.join(outDir, 'cancel-test.mkv');
  fs.rmSync(cancelTask.outputPath, { force: true });
  const controller = new AbortController();
  const started = Date.now();
  setTimeout(() => controller.abort(), 400);
  try {
    await runConversion(cancelTask, tools, { onProgress: () => undefined }, controller.signal);
    check('cancel aborts FFmpeg', false, 'conversion unexpectedly resolved');
  } catch (err) {
    const temp = fs.readdirSync(outDir).filter((f) => f.startsWith('.clipforge-'));
    check(
      'cancel aborts FFmpeg and cleans temp file',
      err.name === 'ConversionCancelledError' && !fs.existsSync(cancelTask.outputPath) && temp.length === 0,
      `${err.name} after ${Date.now() - started}ms, message="${err.message}"`,
    );
  }

  // argv hygiene sanity
  const argv = buildConversionArgs({ inputPath: sample, outputPath: 'x.mp4', format: 'mp4', preset: 'compatibility' });
  check('argv contains input path as one entry', argv.filter((a) => a === sample).length === 1);

  console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failures} SMOKE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke harness crashed:', err);
  process.exit(1);
});
