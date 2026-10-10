import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bpmApi', {
  openAudio: () =>
  ipcRenderer.invoke('audio:open') as Promise<{
    path: string;
    previewPath: string;
    name: string;
    size: number;
    previewUrl: string;
  } | null>,
  readAudio: (filePath: string) => ipcRenderer.invoke('audio:read', filePath) as Promise<Uint8Array>,
  exportAudio: (args: { inputPath: string; originalBpm: number; targetBpm: number; format: 'mp3' | 'wav' }) => ipcRenderer.invoke('audio:export', args)
});
