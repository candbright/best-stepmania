import { invoke } from "./core";

/** Serialized form matches Rust `KeyChord` (camelCase). */
export interface KeyChordDto {
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface KeyBindingsConfigDto {
  gameplayPumpDoubleLanes?: string[] | null;
  shortcuts?: Record<string, KeyChordDto[]> | null;
}

export interface PlayerConfig {
  speedMod: string;
  reverse: boolean;
  mirror: boolean;
  sudden: boolean;
  hidden: boolean;
  rotate: boolean;
  noteskin: string;
  noteStyle: "default" | "neon" | "retro" | "tetris" | "cyberpunk" | "mechanical" | "musical";
  audioOffset: number;
  noteScale: number;
}

export type UiSfxStyle = "classic" | "soft" | "arcade";
/** Beat-line / lane approach SFX: warm = legacy low tone, bright = default, crisp = short high click. */
export type RhythmSfxStyle = "warm" | "bright" | "crisp";
export type CursorStylePreset = "a" | "b";

export interface AppConfig {
  language: string;
  theme: string;
  defaultProfile: string;
  masterVolume: number;
  musicVolume: number;
  effectVolume: number;
  rhythmSfxEnabled?: boolean;
  rhythmSfxVolume?: number;
  rhythmSfxStyle?: RhythmSfxStyle;
  uiSfxEnabled?: boolean;
  uiSfxVolume?: number;
  uiSfxStyle?: UiSfxStyle;
  audioOffsetMs: number;
  fullscreen: boolean;
  /** Window layout: normal, fixed aspect sizes, borderless, or fullscreen. */
  windowDisplayPreset?: string;
  vsync: boolean;
  targetFps: number;
  judgmentStyle: string;
  showOffset: boolean;
  lifeType: string;
  autoPlay: boolean;
  playerConfigs: [PlayerConfig, PlayerConfig];
  playbackRate: number;
  uiScale: number;
  /** Horizontal gap (px) between P1/P2 note panels in double and co-op layouts. */
  doublePanelGapPx: number;
  batteryLives: number;
  chartCacheSize: number;
  showParticles: boolean;
  cursorEnabled?: boolean;
  cursorStylePreset?: CursorStylePreset;
  cursorScale?: number;
  cursorOpacity?: number;
  cursorGlow?: number;
  cursorTrailsEnabled?: boolean;
  cursorRippleEnabled?: boolean;
  cursorRippleDurationMs?: number;
  cursorRippleMinScale?: number;
  cursorRippleMaxScale?: number;
  cursorRippleOpacity?: number;
  cursorRippleLineWidth?: number;
  cursorRippleGlow?: number;
  songDirectories: string[];
  keyBindings?: KeyBindingsConfigDto | null;
}

export interface MonitorResolution {
  width: number;
  height: number;
  scaleFactor: number;
}

export async function loadConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("load_config");
}

export async function getPrimaryMonitorResolution(): Promise<MonitorResolution> {
  return invoke<MonitorResolution>("get_primary_monitor_resolution");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_config", { config });
}

export async function getFactoryDefaultLanguage(): Promise<string> {
  return invoke<string>("get_factory_default_language");
}

export interface ExportDiagnosticsResult {
  path: string;
}

export async function exportDiagnostics(): Promise<ExportDiagnosticsResult> {
  return invoke<ExportDiagnosticsResult>("export_diagnostics");
}

export async function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}
