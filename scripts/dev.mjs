import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
server.printUrls();

const url = server.resolvedUrls?.local?.[0];
if (!url) {
  console.error('Vite dev server did not expose a local URL');
  await server.close();
  process.exit(1);
}

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

child.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
