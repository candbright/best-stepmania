import type { RhythmSfxStyle, UiSfxStyle } from "@/shared/api/config";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// Gameplay SFX: judgments, countdown, mines
let gameplaySfxVolume = 0.9;
let gameplaySfxEnabled = true;
/** Relative metronome loudness (0–1), persisted as metronomeSfxVolume; used by beat-line ticks. */
let metronomeSfxEnabled = true;
let metronomeSfxGain = 1;
let metronomeSfxStyle: RhythmSfxStyle = "bright";
/** Relative rhythm loudness (0–1), persisted as rhythmSfxVolume; used by per-lane approach ticks. */
let rhythmSfxEnabled = true;
let rhythmSfxGain = 1;
let rhythmSfxStyle: RhythmSfxStyle = "bright";

// UI SFX: menu navigation / button interactions
let uiSfxVolume = 0.7;
let uiSfxEnabled = true;
let uiSfxStyle: UiSfxStyle = "classic";

export function setGameplaySfxVolume(v: number) {
  gameplaySfxVolume = Math.max(0, Math.min(1, v));
}

export function setGameplaySfxEnabled(enabled: boolean) {
  gameplaySfxEnabled = enabled;
}

export function setMetronomeSfxEnabled(enabled: boolean) {
  metronomeSfxEnabled = enabled;
}

export function setMetronomeSfxGain(v: number) {
  metronomeSfxGain = Math.max(0, Math.min(1, v));
}

export function setMetronomeSfxStyle(style: RhythmSfxStyle) {
  metronomeSfxStyle = style;
}

export function setRhythmSfxEnabled(enabled: boolean) {
  rhythmSfxEnabled = enabled;
}

export function setRhythmSfxGain(v: number) {
  rhythmSfxGain = Math.max(0, Math.min(1, v));
}

export function setRhythmSfxStyle(style: RhythmSfxStyle) {
  rhythmSfxStyle = style;
}

/** Snapshot of persisted options (audio) — keep gameplay / editor / bridge on one code path. */
interface GameplayRhythmSfxSettingsSnapshot {
  effectVolume: number;
  metronomeSfxEnabled: boolean;
  metronomeSfxVolume: number;
  metronomeSfxStyle: RhythmSfxStyle;
  rhythmSfxEnabled: boolean;
  rhythmSfxVolume: number;
  rhythmSfxStyle: RhythmSfxStyle;
}

export function applyGameplayRhythmSfxSettings(s: GameplayRhythmSfxSettingsSnapshot): void {
  setGameplaySfxVolume((s.effectVolume ?? 90) / 100);
  setGameplaySfxEnabled(true);
  setMetronomeSfxEnabled(s.metronomeSfxEnabled ?? true);
  setMetronomeSfxGain((s.metronomeSfxVolume ?? 100) / 100);
  setMetronomeSfxStyle(s.metronomeSfxStyle ?? "bright");
  setRhythmSfxEnabled(s.rhythmSfxEnabled ?? true);
  setRhythmSfxGain((s.rhythmSfxVolume ?? 100) / 100);
  setRhythmSfxStyle(s.rhythmSfxStyle ?? "bright");
}

export function setUiSfxVolume(v: number) {
  uiSfxVolume = Math.max(0, Math.min(1, v));
}

export function setUiSfxEnabled(enabled: boolean) {
  uiSfxEnabled = enabled;
}

export function setUiSfxStyle(style: UiSfxStyle) {
  uiSfxStyle = style;
}

export function isGameplaySfxEnabled(): boolean {
  return gameplaySfxEnabled;
}

export function isUiSfxEnabled(): boolean {
  return uiSfxEnabled;
}

/** Extra headroom so rhythm cues read over music at typical effect volume. */
const RHYTHM_SFX_BASE_BOOST = 1.68;

/** Amplitude multiplier for gameplay-category SFX (countdown, judgments, mines). */
function gameplayRhythmAmp(mult: number): number {
  return gameplaySfxVolume * mult * RHYTHM_SFX_BASE_BOOST;
}

function metronomeAmp(mult: number): number {
  return gameplaySfxVolume * metronomeSfxGain * mult * RHYTHM_SFX_BASE_BOOST;
}

function laneRhythmAmp(mult: number): number {
  return gameplaySfxVolume * rhythmSfxGain * mult * RHYTHM_SFX_BASE_BOOST;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", vol = gameplaySfxVolume) {
  if (vol <= 0) return;
  const ctx = getCtx();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  // 提高基准响度，保证与音乐同音量时仍明显可感知
  const peak = Math.max(0.0001, vol * 0.55);
  const attack = Math.min(0.008, Math.max(0.002, duration * 0.25));
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

type RhythmTickParams = {
  beatFreq: number;
  beatDur: number;
  beatWave: OscillatorType;
  beatMul: number;
  laneBase: number;
  laneStep: number;
  laneDur: number;
  laneWave: OscillatorType;
  laneMul: number;
};

function metronomeTickParams(): RhythmTickParams {
  switch (metronomeSfxStyle) {
    case "warm":
      return {
        beatFreq: 600,
        beatDur: 0.042,
        beatWave: "sine",
        beatMul: 0.24,
        laneBase: 548,
        laneStep: 22,
        laneDur: 0.042,
        laneWave: "sine",
        laneMul: 0.22,
      };
    case "crisp":
      return {
        beatFreq: 2400,
        beatDur: 0.028,
        beatWave: "triangle",
        beatMul: 0.28,
        laneBase: 1980,
        laneStep: 28,
        laneDur: 0.026,
        laneWave: "square",
        laneMul: 0.26,
      };
    case "bright":
    default:
      return {
        beatFreq: 1180,
        beatDur: 0.036,
        beatWave: "sine",
        beatMul: 0.26,
        laneBase: 1020,
        laneStep: 20,
        laneDur: 0.035,
        laneWave: "triangle",
        laneMul: 0.24,
      };
  }
}

function laneRhythmTickParams(): RhythmTickParams {
  switch (rhythmSfxStyle) {
    case "warm":
      return {
        beatFreq: 560,
        beatDur: 0.04,
        beatWave: "sine",
        beatMul: 0.22,
        laneBase: 520,
        laneStep: 24,
        laneDur: 0.04,
        laneWave: "sine",
        laneMul: 0.24,
      };
    case "crisp":
      return {
        beatFreq: 2100,
        beatDur: 0.024,
        beatWave: "triangle",
        beatMul: 0.24,
        laneBase: 1860,
        laneStep: 30,
        laneDur: 0.023,
        laneWave: "square",
        laneMul: 0.28,
      };
    case "bright":
    default:
      return {
        beatFreq: 1080,
        beatDur: 0.033,
        beatWave: "sine",
        beatMul: 0.24,
        laneBase: 980,
        laneStep: 22,
        laneDur: 0.032,
        laneWave: "triangle",
        laneMul: 0.26,
      };
  }
}

export function playMenuMove() {
  if (!uiSfxEnabled) return;
  if (uiSfxStyle === "soft") {
    playTone(740, 0.08, "sine", uiSfxVolume * 0.28);
    return;
  }
  if (uiSfxStyle === "arcade") {
    playTone(980, 0.04, "triangle", uiSfxVolume * 0.28);
    return;
  }
  // classic
  playTone(800, 0.06, "square", uiSfxVolume * 0.24);
}

export function playMenuConfirm() {
  if (!uiSfxEnabled) return;
  if (uiSfxStyle === "soft") {
    playTone(820, 0.08, "sine", uiSfxVolume * 0.3);
    setTimeout(() => {
      if (!uiSfxEnabled) return;
      playTone(1060, 0.09, "sine", uiSfxVolume * 0.28);
    }, 45);
    return;
  }
  if (uiSfxStyle === "arcade") {
    playTone(1400, 0.06, "square", uiSfxVolume * 0.34);
    setTimeout(() => {
      if (!uiSfxEnabled) return;
      playTone(1900, 0.08, "square", uiSfxVolume * 0.3);
    }, 35);
    return;
  }
  // classic
  playTone(1200, 0.08, "square", uiSfxVolume * 0.3);
  setTimeout(() => {
    if (!uiSfxEnabled) return;
    playTone(1600, 0.1, "square", uiSfxVolume * 0.28);
  }, 50);
}

export function playMenuBack() {
  if (!uiSfxEnabled) return;
  if (uiSfxStyle === "soft") {
    playTone(520, 0.09, "sine", uiSfxVolume * 0.26);
    return;
  }
  if (uiSfxStyle === "arcade") {
    playTone(520, 0.09, "sawtooth", uiSfxVolume * 0.27);
    return;
  }
  // classic
  playTone(400, 0.1, "square", uiSfxVolume * 0.24);
}

export function playJudgment(judgment: string) {
  if (!gameplaySfxEnabled) return;
  const vol = gameplayRhythmAmp(0.34);

  switch (judgment) {
    case "W1":
    case "W2":
      playTone(1000, 0.05, "sine", vol);
      break;
    case "W3":
      playTone(700, 0.06, "triangle", vol);
      break;
    case "W4":
      playTone(400, 0.08, "triangle", vol * 0.8);
      break;
    case "W5":
      playTone(250, 0.1, "sawtooth", vol * 0.65);
      break;
    case "Miss": {
      const ctx = getCtx();
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.1;
      }
      noise.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      noise.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      break;
    }
  }
}

export function playMineHit() {
  if (!gameplaySfxEnabled) return;
  const vol = gameplayRhythmAmp(0.38);
  playTone(150, 0.15, "sawtooth", vol);
  setTimeout(() => {
    if (!gameplaySfxEnabled) return;
    playTone(100, 0.2, "sawtooth", vol * 0.6);
  }, 30);
}

export function playCountdown() {
  if (!gameplaySfxEnabled) return;
  playTone(880, 0.12, "sine", gameplayRhythmAmp(0.3));
}

export function playCountdownGo() {
  if (!gameplaySfxEnabled) return;
  playTone(1320, 0.15, "sine", gameplayRhythmAmp(0.4));
  setTimeout(() => {
    if (!gameplaySfxEnabled) return;
    playTone(1760, 0.2, "sine", gameplayRhythmAmp(0.36));
  }, 80);
}

/**
 * Soft tick sound for beat lines with notes - triggered when judgment line
 * reaches a beat line that has notes (before the player hits them).
 */
export function playBeatLine() {
  if (!gameplaySfxEnabled || !metronomeSfxEnabled) return;
  const p = metronomeTickParams();
  playTone(p.beatFreq, p.beatDur, p.beatWave, metronomeAmp(p.beatMul));
}

/**
 * Per-lane rhythm tick (e.g. editor: note crosses receptor on that key). Pitch steps by track so
 * simultaneous lanes stay separable; {@link volumeScale} down-weights dense chords.
 */
export function playRhythmLaneApproach(track: number, volumeScale = 1) {
  if (!gameplaySfxEnabled || !rhythmSfxEnabled) return;
  const s = Math.max(0.35, Math.min(1, volumeScale));
  const p = laneRhythmTickParams();
  const freq = p.laneBase + (track % 10) * p.laneStep;
  playTone(freq, p.laneDur, p.laneWave, laneRhythmAmp(p.laneMul * s));
}

export function previewUiSfx() {
  if (!uiSfxEnabled) return;
  // 只试听当前设置下的单个 UI 音效
  playMenuConfirm();
}

/** Preview beat-line metronome tick only. */
export function previewMetronomeSfx() {
  if (!gameplaySfxEnabled || !metronomeSfxEnabled) return;
  playBeatLine();
}

/** Preview per-lane rhythm tick only (matches key-to-receptor cue). */
export function previewRhythmSfx() {
  if (!gameplaySfxEnabled || !rhythmSfxEnabled) return;
  setTimeout(() => {
    if (!gameplaySfxEnabled || !rhythmSfxEnabled) return;
    playRhythmLaneApproach(2, 0.88);
  }, 36);
}

export function previewGameplaySfx() {
  if (!gameplaySfxEnabled) return;
  previewRhythmSfx();
}
