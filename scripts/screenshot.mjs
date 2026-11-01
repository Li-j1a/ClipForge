/*
 * Captures real screenshots from the running ClipForge window via the Chrome DevTools Protocol.
 * Start the app with: electron . --remote-debugging-port=9222
 * Usage: node scripts/screenshot.mjs <testDataDir> <screenshotsDir>
 *
 * The UI is driven through the real Pinia store (Vue exposes __vue_app__ on #app),
 * so every screenshot shows real imported files, real FFprobe metadata and real FFmpeg progress.
 */
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.argv[2] || '.testdata');
const shotsDir = path.resolve(process.argv[3] || 'docs/screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

const sample = path.join(dataDir, 'sample 样本.mp4');
const short = path.join(dataDir, 'short.mp4');
const long = path.join(dataDir, 'long 示例.mp4');

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
await send('Page.enable');

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  if (!res.result?.data) throw new Error(`captureScreenshot failed: ${JSON.stringify(res)}`);
  fs.writeFileSync(path.join(shotsDir, name), Buffer.from(res.result.data, 'base64'));
  console.log(`saved ${name}`);
}

const storeExpr = `(() => {
  const app = document.querySelector('#app').__vue_app__;
  return app.config.globalProperties.$pinia._s.get('app');
})()`;

async function storeCall(body) {
  return evaluate(`(async () => { const store = ${storeExpr}; ${body} })()`);
}

// reset to a clean empty state
await storeCall(`
  await window.api.clearHistory();
  await window.api.clearFinished();
  await store.loadTasks();
  await store.loadHistory();
  store.clearVideos();
  store.setPage('convert');
  store.clearNotice();
`);
await new Promise((r) => setTimeout(r, 400));
await shot('01-empty-state.png');

// import real files (real FFprobe + real thumbnails)
await storeCall(`await store.importVideos(${JSON.stringify([sample, short, long])});`);
await new Promise((r) => setTimeout(r, 800));
await shot('02-imported-videos.png');

// start a real high-quality conversion and capture live progress
await storeCall(`
  await store.updateSettings({ defaultFormat: 'mp4', defaultPreset: 'high-quality' });
`);
await storeCall(`await store.startConversion();`);
await new Promise((r) => setTimeout(r, 3200));
await shot('03-converting.png');

// wait for the queue to finish
const deadline = Date.now() + 180_000;
while (Date.now() < deadline) {
  const busy = await storeCall(`return store.tasks.some((t) => t.status === 'pending' || t.status === 'running');`);
  if (!busy) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 500));
await shot('04-completed.png');

await storeCall(`store.setPage('history'); await store.loadHistory();`);
await new Promise((r) => setTimeout(r, 600));
await shot('05-history.png');

await storeCall(`store.setPage('settings');`);
await new Promise((r) => setTimeout(r, 600));
await shot('06-settings.png');

console.log('done');
ws.close();
