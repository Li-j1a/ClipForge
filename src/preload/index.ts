import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ClipForgeApi, ConversionTask } from '../shared/types';

const api: ClipForgeApi = {
  openVideoDialog: () => ipcRenderer.invoke('dialog:open-videos'),
  openDirDialog: () => ipcRenderer.invoke('dialog:open-dir'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  importVideos: (paths: string[]) => ipcRenderer.invoke('media:import', paths),
  getFfmpegStatus: () => ipcRenderer.invoke('ffmpeg:status'),
  setFfmpegPaths: (paths) => ipcRenderer.invoke('ffmpeg:set-paths', paths),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  enqueue: (items) => ipcRenderer.invoke('task:enqueue', items),
  getTasks: () => ipcRenderer.invoke('task:list'),
  cancelTask: (id: string) => ipcRenderer.invoke('task:cancel', id),
  clearFinished: () => ipcRenderer.invoke('task:clear-finished'),
  onTaskUpdate: (cb: (task: ConversionTask) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, task: ConversionTask) => cb(task);
    ipcRenderer.on('task:update', listener);
    return () => ipcRenderer.removeListener('task:update', listener);
  },
  openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item', path),
  getHistory: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
};

contextBridge.exposeInMainWorld('api', api);
