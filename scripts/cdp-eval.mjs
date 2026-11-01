/*
 * Dev utility: evaluate an expression in the running ClipForge window.
 * Requires the app started with --remote-debugging-port=9222.
 * Usage: node scripts/cdp-eval.mjs "document.title"
 */
let expression = process.argv[2];
if (expression === '-') {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  expression = Buffer.concat(chunks).toString('utf8');
}
if (!expression) {
  console.error('usage: node scripts/cdp-eval.mjs "<js expression>" | -  (stdin)');
  process.exit(2);
}

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('no page target found');
  process.exit(1);
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
const response = await send('Runtime.evaluate', {
  expression,
  awaitPromise: true,
  returnByValue: true,
});
console.log(JSON.stringify(response.result, null, 2));
ws.close();
