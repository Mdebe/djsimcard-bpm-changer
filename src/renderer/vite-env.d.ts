/// <reference types="vite/client" />
interface Window {
  bpmApi: {
    openAudio: () => Promise<{ path: string; previewPath: string; name: string; size: number; previewUrl: string } | null>;
    readAudio: (filePath: string) => Promise<Uint8Array>;
    exportAudio: (args: { inputPath: string; originalBpm: number; targetBpm: number; format: 'mp3' | 'wav' }) => Promise<{ canceled: boolean; path?: string }>;
  };
}