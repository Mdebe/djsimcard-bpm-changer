import { useEffect, useRef, useState } from 'react';
import { AudioLines, Check, CircleHelp, Disc3, Download, FileAudio, FolderOpen, Headphones, LoaderCircle, Music2, Pause, Play, RefreshCw, SlidersHorizontal, Sparkles, Volume2, Waves } from 'lucide-react';

type AudioFile = { path: string; previewPath: string; name: string; size: number; previewUrl: string };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
const prettySize = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;

// Lightweight onset-envelope autocorrelation estimate. This is a best-effort suggestion;
// syncopated, half-time and double-time tracks should be corrected by the user.
async function detectBpm(filePath: string): Promise<number | null> {
  try {
    const context = new AudioContext();
    const bytes = await window.bpmApi.readAudio(filePath);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const audio = await context.decodeAudioData(buffer);
    await context.close();
    const channel = audio.getChannelData(0);
    const sampleRate = audio.sampleRate;
    const hop = 512;
    const envelope: number[] = [];
    for (let i = 0; i < channel.length; i += hop) {
      let sum = 0;
      const end = Math.min(i + hop, channel.length);
      for (let j = i; j < end; j++) sum += channel[j] * channel[j];
      envelope.push(Math.sqrt(sum / Math.max(1, end - i)));
    }
    const onset = envelope.map((v, i) => Math.max(0, v - (envelope[i - 1] ?? v)));
    const mean = onset.reduce((a, b) => a + b, 0) / Math.max(1, onset.length);
    for (let i = 0; i < onset.length; i++) onset[i] = Math.max(0, onset[i] - mean);
    const rate = sampleRate / hop;
    const minLag = Math.floor(rate * 60 / 200);
    const maxLag = Math.ceil(rate * 60 / 60);
    let bestLag = -1, bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = 0;
      for (let i = lag; i < onset.length; i++) score += onset[i] * onset[i - lag];
      if (score > bestScore) { bestScore = score; bestLag = lag; }
    }
    if (bestLag < 1 || !Number.isFinite(bestScore) || bestScore <= 0) return null;
    let bpm = 60 * rate / bestLag;
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    return Math.round(clamp(bpm, 30, 300));
  } catch { return null; }
}

export default function App() {
  const [file, setFile] = useState<AudioFile | null>(null);
  const [originalBpm, setOriginalBpm] = useState(120);
  const [targetBpm, setTargetBpm] = useState(128);
  const [detecting, setDetecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<'mp3' | 'wav'>('mp3');
  const [message, setMessage] = useState('Import a track to get started.');
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ratio = targetBpm / Math.max(1, originalBpm);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setCurrentTime(audio.currentTime);
    const metadata = () => setDuration(audio.duration || 0);
    const ended = () => setPlaying(false);
    audio.addEventListener('timeupdate', update); audio.addEventListener('loadedmetadata', metadata); audio.addEventListener('ended', ended);
    return () => { audio.removeEventListener('timeupdate', update); audio.removeEventListener('loadedmetadata', metadata); audio.removeEventListener('ended', ended); };
  }, [file]);

  async function importTrack() {
    setError('');
    try {
      const picked = await window.bpmApi.openAudio();
      if (!picked) return;
      setFile(picked); setCurrentTime(0); setDuration(0); setPlaying(false); setMessage('Analysing track for an estimated BPM…'); setDetecting(true);
      const detected = await detectBpm(picked.previewPath);
      if (detected) { setOriginalBpm(detected); setTargetBpm(detected); setMessage(`Estimated tempo: ${detected} BPM. Check it by ear and adjust if needed.`); }
      else { setMessage('Could not confidently estimate the BPM. Enter the original tempo manually.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this audio file.'); }
    finally { setDetecting(false); }
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { try { await audio.play(); setPlaying(true); } catch { setError('Preview could not start. Try importing the file again.'); } }
  }

  async function exportTrack() {
    if (!file) return;
    setError(''); setExporting(true); setMessage('Processing audio with pitch-preserving time-stretching…');
    try {
      const result = await window.bpmApi.exportAudio({ inputPath: file.path, originalBpm, targetBpm, format });
      if (result.canceled) setMessage('Export cancelled. Your original file is unchanged.');
      else setMessage(`Export complete: ${result.path}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
    finally { setExporting(false); }
  }

  const bpmChange = Math.round((ratio - 1) * 100);
  const bars = Array.from({ length: 72 }, (_, i) => 12 + ((i * 37 + i * i * 3) % 49));

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Waves size={23} /></div><div><div className="brand-name">DJ SIMCARD BPM Changer </div><div className="brand-sub">AUDIO WORKSPACE</div></div></div><div className="topbar-right"><span className="local-pill"><span className="green-dot"/> LOCAL PROCESSING</span><button className="icon-button" title="About BPM Changer" onClick={() => setMessage('BPM Changer estimates tempo and uses FFmpeg atempo to change speed while preserving pitch. BPM estimates can be imperfect, especially with syncopated music.')}><CircleHelp size={18}/></button></div></header>
    <main className="workspace"><div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> YOUR TEMPO, YOUR WAY</div><h1>Shape the <span>groove.</span></h1><p>Change the tempo. Keep the character.</p></div><div className="version-tag">BETA <span>·</span> 0.1.0</div></div>
      <section className={`import-card ${file ? 'has-file' : ''}`}>
        <div className="section-label"><span>01</span> SOURCE AUDIO <div className="section-line"/></div>
        {!file ? <button className="dropzone" onClick={importTrack}><div className="upload-icon"><FolderOpen size={24}/></div><strong>Drop your sound in here</strong><span>or click to browse files on your computer</span><div className="file-types"><span>MP3</span><span>WAV</span><span>MAX SIZE DEPENDS ON MEMORY</span></div></button> : <div className="file-row"><div className="file-art"><FileAudio size={25}/></div><div className="file-info"><strong title={file.name}>{file.name}</strong><span>{prettySize(file.size)} <i/> {duration ? formatTime(duration) : 'Reading duration…'}</span></div><div className="file-status"><Check size={14}/> LOADED</div><button className="replace-button" onClick={importTrack}><RefreshCw size={15}/> Replace</button></div>}
        {file && <div className="waveform-panel"><div className="waveform-top"><span><AudioLines size={14}/> WAVEFORM PREVIEW</span><span>{formatTime(currentTime)} <i>/</i> {formatTime(duration)}</span></div><div className="waveform" onClick={(e) => { if (audioRef.current && duration) { const rect = e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = clamp((e.clientX - rect.left) / rect.width, 0, 1) * duration; } }} role="slider" aria-label="Seek audio" tabIndex={0}>{bars.map((h, i) => <div key={i} className={`wave-bar ${duration && currentTime / duration > i / bars.length ? 'played' : ''}`} style={{ height: `${h}%` }}/>)}</div><div className="wave-controls"><button className="play-button" onClick={togglePlay}>{playing ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}</button><span>{playing ? 'Playing source audio' : 'Preview original audio'}</span><div className="wave-spacer"/><Volume2 size={16} className="muted-icon"/><span className="muted-label">SOURCE</span></div></div>}
      </section>

      <section className="tempo-card"><div className="section-label"><span>02</span> TEMPO CONTROL <div className="section-line"/><SlidersHorizontal size={15} className="section-icon"/></div><div className="tempo-grid"><div className="bpm-input-block"><label htmlFor="originalBpm">ORIGINAL BPM <span className="label-hint">{detecting ? <><LoaderCircle className="spin" size={12}/> ANALYSING</> : 'AUTO-DETECTED · EDITABLE'}</span></label><div className="bpm-input-wrap"><input id="originalBpm" type="number" min="30" max="300" value={originalBpm} onChange={e => setOriginalBpm(clamp(Number(e.target.value) || 30, 30, 300))}/><span>BPM</span></div><p>Starting tempo</p></div><div className="tempo-arrow"><div className="arrow-circle"><RefreshCw size={18}/></div><span>TIME<br/>STRETCH</span></div><div className="bpm-input-block target-block"><label htmlFor="targetBpm">NEW BPM <span className="label-hint accent-hint">TARGET TEMPO</span></label><div className="bpm-input-wrap target-input"><input id="targetBpm" type="number" min="30" max="300" value={targetBpm} onChange={e => setTargetBpm(clamp(Number(e.target.value) || 30, 30, 300))}/><span>BPM</span></div><p>{bpmChange > 0 ? `${bpmChange}% faster` : bpmChange < 0 ? `${Math.abs(bpmChange)}% slower` : 'Original tempo'}</p></div></div>
        <div className="slider-area"><div className="slider-labels"><span>30 BPM</span><span className="slider-value">{targetBpm} <small>BPM</small></span><span>300 BPM</span></div><input aria-label="New tempo" className="tempo-slider" type="range" min="30" max="300" value={targetBpm} onChange={e => setTargetBpm(Number(e.target.value))} style={{ '--progress': `${((targetBpm - 30) / 270) * 100}%` } as React.CSSProperties}/><div className="quick-presets"><span>QUICK SET</span>{[80, 90, 100, 110, 120, 128, 140, 160].map(n => <button key={n} className={targetBpm === n ? 'preset active' : 'preset'} onClick={() => setTargetBpm(n)}>{n}</button>)}</div></div>
        <div className="stretch-note"><div className="note-icon"><Headphones size={17}/></div><div><strong>Pitch-preserving time-stretch</strong><p>Adjust the groove without shifting the key or changing the character of the original pitch.</p></div><div className="on-badge"><span/> ON</div></div>
      </section>

      <section className="export-card"><div className="section-label"><span>03</span> EXPORT YOUR MIX <div className="section-line"/></div><div className="export-row"><div className="format-select"><label>FILE FORMAT</label><div className="format-options"><button className={format === 'mp3' ? 'format-option selected' : 'format-option'} onClick={() => setFormat('mp3')}><div className="format-symbol">MP3</div><div><strong>MP3</strong><span>Smaller file</span></div>{format === 'mp3' && <Check size={15} className="format-check"/>}</button><button className={format === 'wav' ? 'format-option selected' : 'format-option'} onClick={() => setFormat('wav')}><div className="format-symbol wav-symbol">WAV</div><div><strong>WAV</strong><span>Uncompressed PCM</span></div>{format === 'wav' && <Check size={15} className="format-check"/>}</button></div></div><div className="export-action"><div className="export-summary"><Disc3 size={19}/><div><strong>{file ? `${file.name.replace(/\.[^.]+$/, '')}_${targetBpm}bpm.${format}` : `your-beat_${targetBpm}bpm.${format}`}</strong><span>{file ? `Estimated duration ${formatTime(duration / Math.max(0.01, ratio))}` : 'Import audio to prepare export'}</span></div></div><button className="export-button" disabled={!file || exporting || detecting} onClick={exportTrack}>{exporting ? <LoaderCircle size={17} className="spin"/> : <Download size={17}/>} {exporting ? 'Processing…' : 'Export audio'} <span>↗</span></button></div></div><div className="privacy-line"><Check size={13}/> Your original stays untouched. Files are processed on this computer.</div></section>
      {(message || error) && <div className={error ? 'notice error-notice' : 'notice'}><span className="notice-dot"/><span>{error || message}</span>{error && <button onClick={() => setError('')}>Dismiss</button>}</div>}
      <footer><div><Waves size={15}/> BPM CHANGER <span>·</span> MADE FOR THE MUSIC</div><span>YOUR AUDIO. YOUR MACHINE. YOUR SOUND.</span></footer>
    </main>
    {file && <audio ref={audioRef} src={file.previewUrl} preload="metadata" onError={() => setError('The converted preview could not be loaded. Try importing the file again; check that FFmpeg is installed correctly.')}/>}
  </div>;
}
