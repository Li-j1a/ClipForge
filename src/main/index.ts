import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { registerIpcHandlers, type IpcContext } from './ipc/handlers';

let ctx: IpcContext | null = null;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f1115',
    title: 'ClipForge',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // The renderer is a local UI: no popups, no navigation away from the app.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const allowed = url.startsWith('file://') || (Boolean(devUrl) && url.startsWith(devUrl as string));
    if (!allowed) event.preventDefault();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ctx = registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Give a running conversion a moment to abort its child process and delete the temp file.
let abortingForQuit = false;
app.on('before-quit', (event) => {
  if (!ctx || abortingForQuit || !ctx.taskManager.isBusy()) return;
  abortingForQuit = true;
  event.preventDefault();
  ctx.taskManager.shutdown();
  setTimeout(() => app.quit(), 1500);
});

app.on('window-all-closed', () => {
  app.quit();
});
