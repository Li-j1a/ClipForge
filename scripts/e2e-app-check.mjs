/*
 * End-to-end check against the REAL running ClipForge app (Electron main + preload + real FFmpeg).
 * Start the app with:  electron . --remote-debugging-port=9222
 * Then run:            node scripts/e2e-app-check.mjs <testDataDir> <outputDir>
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.resolve(process.argv[2] || path.join(root, '.testdata'));
const outDir = path.resolve(process.argv[3] || path.join(dataDir, 'appout'));
fs.mkdirSync(outDir, { recursive: true });

const sample = path.join(dataDir, 'sample 样本.mp4');
const short = path.join(dataDir, 'short.mp4');
const noaudio = path.join(dataDir, 'noaudio.mp4');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find((t) => t.type === 'page' && t.title === 'ClipForge');
if (!page) {
  console.error('ClipForge window not found. Start it with --remote-debugging-port=9222');
  process.exit(2);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
await new Promise((resolve) => {
  ws.onopen = resolve;
});
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await send('Runtime.enable');

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) {
    throw new Error(JSON.stringify(res.result.exceptionDetails));
  }
  return res.result?.result?.value;
}

// 1. import through the real IPC + FFprobe + thumbnail pipeline
const imports = await evaluate(`(async () => {
  return await window.api.importVideos(${JSON.stringify([sample, short, noaudio])});
})()`);

for (const item of imports) {
  check(
    `import ${path.basename(item.path)}`,
    item.ok && item.info && item.info.videoCodec && (item.info.thumbnailDataUrl || '').length > 1000,
    item.ok
      ? `${item.info.duration?.toFixed(2)}s ${item.info.width}x${item.info.height} ${item.info.videoCodec}/${item.info.audioCodec ?? 'none'} thumb=${Math.round(item.info.thumbnailDataUrl.length / 1024)}KB`
      : item.error,
  );
}

// 2. settings update must persist through IPC
const settingsAfter = await evaluate(`(async () => window.api.updateSettings({ outputDir: ${JSON.stringify(outDir)}, defaultFormat: 'mp4' }))()`);
check('settings outputDir persists', path.resolve(settingsAfter.outputDir) === outDir, settingsAfter.outputDir);

// 3. enqueue two real conversions and follow progress events
const enqueueResult = await evaluate(`(async () => {
  const evts = [];
  window.__cfEvents = evts;
  window.__cfOff = window.api.onTaskUpdate((t) => evts.push({ id: t.id, status: t.status, progress: t.progress, speed: t.speed }));
  const tasks = await window.api.enqueue([
    { inputPath: ${JSON.stringify(sample)}, inputName: 'sample 样本.mp4', inputSize: 1, inputFormat: 'MP4', duration: 8, outputFormat: 'mp4', preset: 'compatibility', outputDir: ${JSON.stringify(outDir)} },
    { inputPath: ${JSON.stringify(noaudio)}, inputName: 'noaudio.mp4', inputSize: 1, inputFormat: 'MP4', duration: 4, outputFormat: 'mkv', preset: 'compatibility', outputDir: ${JSON.stringify(outDir)} },
  ]);
  return tasks;
})()`);
check('enqueue returns two pending tasks', enqueueResult.length === 2);

const deadline = Date.now() + 120_000;
let finalTasks = [];
while (Date.now() < deadline) {
  finalTasks = await evaluate(`(async () => window.api.getTasks())()`);
  if (finalTasks.length >= 2 && finalTasks.every((t) => ['completed', 'failed', 'cancelled'].includes(t.status))) break;
  await new Promise((r) => setTimeout(r, 500));
}
const events = await evaluate(`(() => { window.__cfOff?.(); return window.__cfEvents; })()`);

for (const t of finalTasks.slice(0, 2)) {
  check(
    `convert ${path.basename(t.inputPath)} -> ${t.outputFormat}`,
    t.status === 'completed' && t.progress === 100 && fs.existsSync(t.outputPath) && fs.statSync(t.outputPath).size > 0,
    `${t.status} progress=${t.progress} output=${t.outputPath ? path.basename(t.outputPath) : '-'} err=${t.errorMessage ?? ''}`,
  );
}
const runningProgress = events.filter((e) => e.status === 'running' && e.progress > 0);
check('progress events are real and monotonic-ish', runningProgress.length > 0, `${runningProgress.length} progress events, speeds=${[...new Set(runningProgress.map((e) => e.speed).filter(Boolean))].slice(0, 3)}`);

// 4. serial queue: never two running at the same time
let maxRunning = 0;
const runningIds = new Set();
for (const e of events) {
  if (e.status === 'running') runningIds.add(e.id);
  if (['completed', 'failed', 'cancelled'].includes(e.status)) runningIds.delete(e.id);
  maxRunning = Math.max(maxRunning, runningIds.size);
}
check('serial queue (max one running)', maxRunning <= 1, `maxRunning=${maxRunning}`);

// 5. history written after verified success
const history = await evaluate(`(async () => window.api.getHistory())()`);
check('history records completed conversions', history.length >= 2, `${history.length} entries, first=${history[0]?.outputName}`);

// 6. cancel a running conversion; no final file, no temp leftover
const cancelTask = await evaluate(`(async () => {
  const [t] = await window.api.enqueue([{ inputPath: ${JSON.stringify(sample)}, inputName: 'cancel-me.mp4', inputSize: 1, inputFormat: 'MP4', duration: 8, outputFormat: 'mkv', preset: 'high-quality', outputDir: ${JSON.stringify(outDir)} }]);
  return t;
})()`);
await new Promise((r) => setTimeout(r, 700));
await evaluate(`(async () => window.api.cancelTask(${JSON.stringify(cancelTask.id)}))()`);
await new Promise((r) => setTimeout(r, 2500));
const cancelState = (await evaluate(`(async () => window.api.getTasks())()`)).find((t) => t.id === cancelTask.id);
const tempLeftovers = fs.readdirSync(outDir).filter((f) => f.startsWith('.clipforge-'));
check(
  'cancel running task',
  cancelState?.status === 'cancelled' && !fs.existsSync(cancelTask.outputPath) && tempLeftovers.length === 0,
  `status=${cancelState?.status} outputExists=${fs.existsSync(cancelTask.outputPath)} tempFiles=${tempLeftovers.length}`,
);

// 7. output conflict: enqueue same name while the first output exists
const conflictA = await evaluate(`(async () => {
  const [t] = await window.api.enqueue([{ inputPath: ${JSON.stringify(short)}, inputName: 'conflict.mp4', inputSize: 1, inputFormat: 'MP4', duration: 0.8, outputFormat: 'mp4', preset: 'compatibility', outputDir: ${JSON.stringify(outDir)} }]);
  return t;
})()`);
fs.writeFileSync(conflictA.outputPath, 'user-owned-file'); // simulate an existing user file
const conflictB = await evaluate(`(async () => {
  const [t] = await window.api.enqueue([{ inputPath: ${JSON.stringify(short)}, inputName: 'conflict.mp4', inputSize: 1, inputFormat: 'MP4', duration: 0.8, outputFormat: 'mp4', preset: 'compatibility', outputDir: ${JSON.stringify(outDir)} }]);
  return t;
})()`);
check(
  'queued output paths do not collide',
  path.resolve(conflictA.outputPath) !== path.resolve(conflictB.outputPath),
  `${path.basename(conflictA.outputPath)} vs ${path.basename(conflictB.outputPath)}`,
);
// let the second finish, then confirm the user-owned file was untouched
await new Promise((r) => setTimeout(r, 6000));
check(
  'existing user file is not overwritten',
  fs.existsSync(conflictA.outputPath) && fs.readFileSync(conflictA.outputPath, 'utf8') === 'user-owned-file',
);

console.log(failures === 0 ? '\nALL APP E2E CHECKS PASSED' : `\n${failures} APP E2E CHECK(S) FAILED`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
