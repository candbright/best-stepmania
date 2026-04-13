// --- Editor Constants ---
// Static configuration values shared across the editor.

export const COLUMN_WIDTH = 72;
export const NOTE_SIZE = 48;
export const HEADER_HEIGHT = 56;
export const WAVEFORM_WIDTH = 76;
/** Default gap between waveform panel and track field (increased for better visibility) */
export const WAVEFORM_FIELD_GAP = 50;
export const MAX_UNDO_STACK = 50;

/** Vertical zoom: pixels per beat on the chart canvas (min/max for wheel & +/- keys). */
export const EDITOR_ZOOM_MIN = 20;
/** High cap so 1/192 quantize grid lines stay usable (~25px apart at max when step = 4/192 beat). */
export const EDITOR_ZOOM_MAX = 1200;
export const EDITOR_ZOOM_STEP_KEY = 10;

/** Quantize dropdown values; +/- keys cycle this list (Ctrl++ / Ctrl+- still adjust zoom). */
export const EDITOR_QUANTIZE_LEVELS = [3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 192] as const;

/** Two BPM changes closer than this (in beats) are treated as the same anchor (matches quantize grid). */
export const BPM_BEAT_MATCH_EPS = 1e-4;

export const RATE_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export const PIU_PAD_COLORS = ["#448aff", "#ff1744", "#ffeb3b", "#ff1744", "#448aff"];

export const NOTE_TYPES = [
  { id: "Tap", label: "editor.tap", color: "#4fc3f7" },
  { id: "Mine", label: "editor.mine", color: "#ff1744" },
  { id: "Lift", label: "editor.lift", color: "#ce93d8" },
  { id: "Fake", label: "editor.fake", color: "#78909c" },
] as const;

/** Options in the "new chart" dialog only (matches play modes: single / double / routine). */
export const STEPS_TYPES = [
  { value: "pump-single", labelKey: "editor.stepsTypeOption.pump-single" },
  { value: "pump-double", labelKey: "editor.stepsTypeOption.pump-double" },
  { value: "pump-routine", labelKey: "editor.stepsTypeOption.pump-routine" },
] as const;

/** Column count for each steps type tag (must match `sm_core::StepsType::num_columns`). */
export const STEPS_TYPE_NUM_TRACKS: Record<string, number> = {
  "dance-threepanel": 3,
  "dance-single": 4,
  "pump-single": 5,
  "pump-halfdouble": 5,
  "dance-solo": 6,
  "dance-double": 8,
  "dance-couple": 8,
  "dance-routine": 8,
  "pump-double": 10,
  "pump-couple": 10,
  "pump-routine": 10,
};

export const DIFFICULTIES = ["Beginner", "Easy", "Medium", "Hard", "Challenge", "Edit"] as const;

export const DIFF_COLORS: Record<string, string> = {
  Beginner: "#66bb6a",
  Easy: "#ffd740",
  Medium: "#ff9100",
  Hard: "#ff1744",
  Challenge: "#ce93d8",
  Edit: "#78909c",
};

const NOTE_TYPE_ICONS: Record<string, string> = {
  Tap: "●",
  Mine: "✖",
  Lift: "△",
  Fake: "◇",
};

export function getNoteTypeIcon(id: string): string {
  return NOTE_TYPE_ICONS[id] || "●";
}
