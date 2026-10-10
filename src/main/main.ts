
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

function ffmpegPath() {
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    return path.join(process.resourcesPath, 'ffmpeg-static', exe);
  }

  // ffmpeg-static provides the FFmpeg executable path.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('ffmpeg-static') as string;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Could not start FFmpeg: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            stderr.slice(-1800) || `FFmpeg exited with code ${code}`
          )
        );
      }
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: '#101114',
    title: 'BPM Changer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('audio:read', async (_event, filePath: string) => {
  if (!fs.existsSync(filePath)) {
    throw new Error('Audio file not found.');
  }

  return new Uint8Array(fs.readFileSync(filePath));
});

// Convert the imported audio to a standard PCM WAV.
// This avoids browser decoding failures with some MP3/WAV variants.
ipcMain.handle('audio:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose an audio file',
    properties: ['openFile'],
    filters: [
      { name: 'Audio files', extensions: ['mp3', 'wav'] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);

  const previewDir = path.join(os.tmpdir(), 'bpm-changer-preview');
  fs.mkdirSync(previewDir, { recursive: true });

  const previewPath = path.join(previewDir, `${randomUUID()}.wav`);

  try {
    await runFfmpeg([
      '-y',
      '-i', filePath,
      '-vn',
      '-ac', '2',
      '-ar', '44100',
      '-c:a', 'pcm_s16le',
      previewPath
    ]);

    if (
      !fs.existsSync(previewPath) ||
      fs.statSync(previewPath).size < 44
    ) {
      throw new Error('FFmpeg did not create a valid preview WAV.');
    }
  } catch (error) {
    try {
      fs.rmSync(previewPath, { force: true });
    } catch {
      // Ignore temporary-file cleanup errors.
    }

    const detail =
      error instanceof Error ? error.message : String(error);

    throw new Error(`Could not prepare audio preview. ${detail}`);
  }

  return {
    path: filePath,
    previewPath,
    name: path.basename(filePath),
    size: stat.size,
    previewUrl: pathToFileURL(previewPath).href
  };
});

ipcMain.handle(
  'audio:export',
  async (
    _event,
    args: {
      inputPath: string;
      originalBpm: number;
      targetBpm: number;
      format: 'mp3' | 'wav';
    }
  ) => {
    const { inputPath, originalBpm, targetBpm, format } = args;

    if (!fs.existsSync(inputPath)) {
      throw new Error(
        'The selected source file no longer exists. Please import it again.'
      );
    }

    if (
      !Number.isFinite(originalBpm) ||
      !Number.isFinite(targetBpm) ||
      originalBpm < 30 ||
      originalBpm > 300 ||
      targetBpm < 30 ||
      targetBpm > 300
    ) {
      throw new Error('BPM must be between 30 and 300.');
    }

    const base = path.basename(inputPath, path.extname(inputPath));

    const result = await dialog.showSaveDialog({
      title: 'Export changed audio',
      defaultPath: path.join(
        path.dirname(inputPath),
        `${base}_${targetBpm}bpm.${format}`
      ),
      filters: [
        { name: format.toUpperCase(), extensions: [format] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const ratio = targetBpm / originalBpm;

    // Chain filters because each atempo filter supports 0.5–2.0.
    const filters: number[] = [];
    let remaining = ratio;

    while (remaining > 2) {
      filters.push(2);
      remaining /= 2;
    }

    while (remaining < 0.5) {
      filters.push(0.5);
      remaining /= 0.5;
    }

    filters.push(remaining);

    const atempo = filters
      .map(value => `atempo=${value.toFixed(8)}`)
      .join(',');

    const outputArgs =
      format === 'mp3'
        ? [
            '-y',
            '-i', inputPath,
            '-vn',
            '-af', atempo,
            '-codec:a', 'libmp3lame',
            '-q:a', '2',
            result.filePath
          ]
        : [
            '-y',
            '-i', inputPath,
            '-vn',
            '-af', atempo,
            '-codec:a', 'pcm_s16le',
            result.filePath
          ];

    await runFfmpeg(outputArgs);

    return {
      canceled: false,
      path: result.filePath
    };
  }
);
