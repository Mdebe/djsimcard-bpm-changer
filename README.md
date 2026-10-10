# BPM Changer — Windows desktop starter

A local-first Electron + React + TypeScript desktop app for importing MP3/WAV, estimating BPM, manually correcting the original tempo, setting a target BPM, previewing the source and exporting a new MP3 or WAV using FFmpeg's pitch-preserving `atempo` filter.

## Requirements
- Windows 10/11 64-bit
- Node.js 20+ (Node 22 LTS recommended)
- Internet during first `npm install` to download dependencies and the FFmpeg binary

## Run in development
Open PowerShell in this folder:

```powershell
npm install
npm run dev
```

## Build Windows installer
```powershell
npm install
npm run build
```
The NSIS installer should be written to `release/`.

## Current MVP scope
- Open MP3 and WAV via native Windows file picker.
- Best-effort BPM estimate using audio energy onset envelope autocorrelation; the original BPM remains editable because half-time/double-time and syncopation can confuse automatic detection.
- Set target tempo using number input, slider or quick presets.
- Export to a new MP3 or WAV file; source file is never overwritten by default.
- FFmpeg `atempo` filter is used for pitch-preserving tempo changes. Very large changes can still introduce artifacts.

## Known limitations / next improvements
- The current BPM detector is a lightweight baseline, not a production-grade beat tracker. Validate estimates by ear and manually correct them. Better detection could use a dedicated beat-tracking library or native aubio integration.
- The first preview plays the original file, not a rendered tempo-adjusted preview. Next iteration should render a temporary preview and allow A/B comparison before final export.
- File URL loading for BPM analysis can depend on Chromium's local-file handling. If analysis fails for a file, enter the original BPM manually; export is handled by the Electron main process and FFmpeg.
- Large WAVs may require substantial RAM for browser decoding. A native streaming analysis pipeline would improve this.
- The UI references Google Fonts for styling; local system fonts are fallbacks when offline.

## Project structure

```text
bpm-changer/
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.electron.json
├── src/
│   ├── main/
│   │   ├── main.ts       # Electron window, file dialogs, FFmpeg export
│   │   └── preload.ts    # Secure IPC bridge
│   └── renderer/
│       ├── main.tsx      # React entry
│       ├── vite-env.d.ts # Window API types
│       └── ui/
│           ├── App.tsx   # Import, BPM controls, preview, export
│           └── styles.css
└── README.md
```
