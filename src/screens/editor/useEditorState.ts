// --- Editor Reactive State ---
// Composable that creates all reactive state for the chart editor.

import { ref, computed } from "vue";
import type { ChartNoteRow, ChartInfo } from "@/utils/api";
import type { ChartNoteInput } from "@/engine/types";
import { PIU_PAD_COLORS, COLUMN_WIDTH } from "./constants";

export interface BpmChange {
  beat: number;
  bpm: number;
}

export interface TimeSignatureChange {
  beat: number;
  numerator: number;
  denominator: number;
}

export interface TickcountChange {
  beat: number;
  ticksPerBeat: number;
}

export interface ComboChange {
  beat: number;
  combo: number;
  missCombo: number;
}

export interface SpeedChange {
  beat: number;
  ratio: number;
  delay: number;
  unit: 0 | 1;
}

export interface ScrollChange {
  beat: number;
  ratio: number;
}

export interface LabelChange {
  beat: number;
  label: string;
}

/** Single editor history frame: notes + BPM list + selected editable numeric metadata/chart fields (undo/redo). */
export interface EditorUndoSnapshot {
  notes: ChartNoteRow[];
  bpms: BpmChange[];
  offset: number;
  chartMeter: number;
  sampleStart: number;
  sampleLength: number;
}

/** Chart beat at elapsed chart-time seconds (multi-BPM); mirrors useEditorCanvas.timeToBeat. */
function editorTimeToBeat(seconds: number, changes: BpmChange[], fallbackBpm: number): number {
  if (changes.length <= 1) return (seconds * (changes[0]?.bpm ?? fallbackBpm)) / 60;
  let remaining = seconds;
  let prevBeat = 0;
  let prevBpm = changes[0]?.bpm ?? fallbackBpm;
  for (let i = 1; i < changes.length; i++) {
    const change = changes[i];
    const segDuration = ((change.beat - prevBeat) * 60) / prevBpm;
    if (remaining <= segDuration) break;
    remaining -= segDuration;
    prevBeat = change.beat;
    prevBpm = change.bpm;
  }
  return prevBeat + (remaining * prevBpm) / 60;
}

export function useEditorState() {
  // --- Canvas ---
  const canvasRef = ref<HTMLCanvasElement | null>(null);

  // --- Chart data ---
  const noteRows = ref<ChartNoteRow[]>([]);
  const allCharts = ref<ChartInfo[]>([]);
  const activeChartIndex = ref(0);
  const scrollBeat = ref(0);
  const zoom = ref(80);
  /** Overwritten when chart timing loads (from time signature denominator). */
  const quantize = ref(4);
  /** Toggle beat/measure line visibility in the editor canvas. */
  const showBeatLines = ref(true);
  /** Toggle track grid cell background visibility in the editor canvas. */
  const showTrackGrid = ref(true);
  const playing = ref(false);
  const playStartBeat = ref(0);
  /** Chart seconds when current editor playback segment started (real chart time; no gameplay-only lead-in). */
  const playStartChartSec = ref(0);
  /** Audio file seek base (seconds): the file position we seeked to when starting playback. */
  const audioSeekBase = ref(0);
  /** performance.now() when current editor playback segment started; scroll uses wall clock to avoid IPC jank. */
  const editorPlaybackWallStartMs = ref(0);
  const bpm = ref(120);
  const editorRate = ref(1.0);
  const undoStack = ref<EditorUndoSnapshot[]>([]);
  const redoStack = ref<EditorUndoSnapshot[]>([]);
  const saving = ref(false);
  const saveMessage = ref("");
  const currentNoteType = ref("Tap");
  const holdStartRow = ref<{ row: number; track: number } | null>(null);
  const holdDragCurrentRow = ref<number | null>(null);
  const isHoldDragging = ref(false);
  /** Interleaved min/max per time bucket: [min0, max0, min1, max1, ...] in [-1, 1]. */
  const waveformMinMax = ref<Float32Array>(new Float32Array(0));
  const waveformDuration = ref(0);
  /** Horizontal offset for waveform panel (drag to move), in pixels from default position */
  const waveformPanelOffsetX = ref(0);
  /** Starting X position when dragging waveform panel */
  const waveformPanelDragStartX = ref(0);
  /** Starting offset when dragging waveform panel */
  const waveformPanelDragStartOffset = ref(0);
  /** Waveform panel drag state: 'idle' | 'dragging' | 'canceled' */
  const waveformPanelDragState = ref<'idle' | 'dragging' | 'canceled'>('idle');
  /** Whether waveform panel is being dragged (used to suppress note creation on mouseup) */
  const isWaveformPanelDragging = ref(false);

  // --- Sidebar tab ---
  const sidebarTab = ref<"charts" | "info" | "stats" | "bpm">("charts");

  // --- BPM changes (timing segments) ---
  const bpmChanges = ref<BpmChange[]>([{ beat: 0, bpm: 120 }]);
  const newBpmBeat = ref(0);
  const newBpmValue = ref(120);
  /** Index of the BPM change currently being edited inline on the canvas (-1 = none) */
  const editingBpmChangeIndex = ref(-1);
  /** Temporary input value while editing a BPM change inline */
  const editingBpmInputValue = ref("");
  /** Offset editing state: tracks when user starts editing offset so we can push undo on commit */
  const offsetEditing = ref<{ active: boolean; previousValue: number }>({ active: false, previousValue: 0 });
  const chartMeterEditing = ref<{ active: boolean; previousValue: number }>({ active: false, previousValue: 0 });
  const sampleStartEditing = ref<{ active: boolean; previousValue: number }>({ active: false, previousValue: 0 });
  const sampleLengthEditing = ref<{ active: boolean; previousValue: number }>({ active: false, previousValue: 0 });

  // --- Other timing segments ---
  const timeSignatures = ref<TimeSignatureChange[]>([{ beat: 0, numerator: 4, denominator: 4 }]);
  const tickcounts = ref<TickcountChange[]>([{ beat: 0, ticksPerBeat: 4 }]);
  const comboChanges = ref<ComboChange[]>([{ beat: 0, combo: 1, missCombo: 1 }]);
  const speedChanges = ref<SpeedChange[]>([{ beat: 0, ratio: 1.0, delay: 0, unit: 0 }]);
  const scrollChanges = ref<ScrollChange[]>([{ beat: 0, ratio: 1.0 }]);
  const labelChanges = ref<LabelChange[]>([{ beat: 0, label: "Song Start" }]);

  // --- Selection ---
  const selectionStart = ref<number | null>(null);
  const selectionEnd = ref<number | null>(null);
  const selectionTrackStart = ref<number | null>(null);
  const selectionTrackEnd = ref<number | null>(null);
  const clipboard = ref<ChartNoteRow[]>([]);
  /** BPM changes captured with the last copy (same row band as note selection). */
  const clipboardBpmChanges = ref<BpmChange[]>([]);
  const isDragging = ref(false);
  /** Extra selection regions added via Ctrl+drag */
  const additionalSelections = ref<Array<{ minRow: number; maxRow: number; minTrack: number; maxTrack: number }>>([]);
  /**
   * Right-drag / Shift+drag marquee. Start is anchored in chart space so auto-scroll does not drift the first corner.
   * End follows the pointer in canvas CSS pixels.
   */
  const selectionRubberBand = ref<{
    anchorBeat: number;
    anchorTrackT: number;
    endBeat: number;
    endTrackT: number;
  } | null>(null);

  // --- New chart dialog ---
  const showNewChartModal = ref(false);
  const newChartStepsType = ref("pump-single");
  /** pump-routine: which chart layer new notes belong to (matches gameplay P1/P2 accent colors). */
  const editorRoutineLayer = ref<1 | 2>(1);
  const newChartDifficulty = ref("Edit");
  const newChartMeter = ref(1);

  /** Editable fields for the active chart (charts tab); synced when switching chart. */
  const editChartStepsType = ref("pump-single");
  const editChartDifficulty = ref("Edit");
  const editChartMeter = ref(1);
  const chartPropertiesSaving = ref(false);

  function syncEditChartPropertiesFromActive() {
    const chart = allCharts.value[activeChartIndex.value];
    if (!chart) {
      return;
    }
    editChartStepsType.value = chart.stepsType;
    editChartDifficulty.value = chart.difficulty;
    editChartMeter.value = chart.meter;
  }

  // --- Metadata panel ---
  const showMetadata = ref(false);
  const metaTitle = ref("");
  const metaSubtitle = ref("");
  const metaArtist = ref("");
  const metaGenre = ref("");
  const metaMusic = ref("");
  const metaBanner = ref("");
  const metaBackground = ref("");
  const metaOffsetRaw = ref<string | number>(0);
  /** Normalizes empty string / null / undefined to 0 so calculations never see NaN. */
  const metaOffset = computed({
    get: () => {
      const v = metaOffsetRaw.value;
      if (v === null || v === undefined || v === "") return 0;
      return Number(v) || 0;
    },
    set: (v: number | string | null | undefined) => {
      if (v === null || v === undefined || v === "") {
        metaOffsetRaw.value = 0;
      } else {
        metaOffsetRaw.value = Number(v) || 0;
      }
    },
  });
  const metaSampleStart = ref(0);
  const metaSampleLength = ref(12);
  const metaSaving = ref(false);

  // --- Layout computed ---
  const NUM_TRACKS_ACTUAL = ref(5);
  const NUM_TRACKS = computed(() => NUM_TRACKS_ACTUAL.value);
  const FIELD_WIDTH = computed(() => COLUMN_WIDTH * NUM_TRACKS.value);

  const COL_LABELS = computed(() => {
    const n = NUM_TRACKS.value;
    if (n === 4) return ["←", "↓", "↑", "→"];
    if (n === 5) return ["↙", "↖", "●", "↗", "↘"];
    if (n === 6) return ["←", "↙", "↓", "↑", "↗", "→"];
    if (n === 7) return ["←", "↙", "↓", "●", "↑", "↗", "→"];
    if (n === 8) return ["←", "↙", "↓", "↖", "↗", "↑", "↘", "→"];
    if (n === 10) return ["↙", "↖", "●", "↗", "↘", "↙", "↖", "●", "↗", "↘"];
    return Array.from({ length: n }, (_, i) => String(i + 1));
  });

  const COL_COLORS = computed(() => {
    const n = NUM_TRACKS.value;
    if (n === 5) return [...PIU_PAD_COLORS];
    if (n === 10) return [...PIU_PAD_COLORS, ...PIU_PAD_COLORS];
    if (n === 3) return ["#e040fb", "#448aff", "#69f0ae"];
    if (n === 4) return ["#e040fb", "#448aff", "#ff1744", "#69f0ae"];
    if (n === 6) return ["#ff4081", "#40c4ff", "#ffeb3b", "#40c4ff", "#ff4081", "#ffeb3b"];
    return Array.from(
      { length: n },
      (_, i) => ["#ff4081", "#40c4ff", "#ffeb3b", "#00e676", "#ff9100", "#ce93d8", "#80cbc4", "#ff7043"][i % 8],
    );
  });

  function isHoldLikeNote(n: ChartNoteInput): boolean {
    return (n.noteType === "HoldHead" || n.noteType === "Roll") && n.holdEndRow !== null;
  }

  // --- Derived computed ---
  const noteCount = computed(() => noteRows.value.reduce((sum, r) => sum + r.notes.length, 0));
  const noteStatTapCount = computed(() => {
    let c = 0;
    for (const row of noteRows.value) {
      for (const n of row.notes) {
        if (!isHoldLikeNote(n)) c += 1;
      }
    }
    return c;
  });
  const noteStatHoldCount = computed(() => {
    let c = 0;
    for (const row of noteRows.value) {
      for (const n of row.notes) {
        if (isHoldLikeNote(n)) c += 1;
      }
    }
    return c;
  });
  const noteStatTotalCount = computed(() => noteStatTapCount.value + noteStatHoldCount.value);
  const hasSelection = computed(
    () => selectionStart.value !== null && selectionEnd.value !== null || additionalSelections.value.length > 0,
  );
  const activeChart = computed(() => allCharts.value[activeChartIndex.value]);

  const totalBeats = computed(() => {
    let minBeats = 100;
    if (noteRows.value.length > 0) {
      const maxBeat = noteRows.value.reduce((m, r) => Math.max(m, r.beat), 0);
      minBeats = Math.max(100, maxBeat + 20);
    }
    const dur = waveformDuration.value;
    if (dur > 0) {
      const chartTimeAtFileEnd = dur + metaOffset.value;
      const beatAtAudioEnd = editorTimeToBeat(chartTimeAtFileEnd, bpmChanges.value, bpm.value);
      minBeats = Math.max(minBeats, beatAtAudioEnd + 8);
    }
    return minBeats;
  });

  const scrollbarThumbRatio = computed(() => {
    const visibleBeats = 600 / zoom.value;
    return Math.min(1, Math.max(0.03, visibleBeats / totalBeats.value));
  });

  const scrollbarThumbTop = computed(() => {
    return Math.min(1 - scrollbarThumbRatio.value, Math.max(0, scrollBeat.value / totalBeats.value));
  });

  /** Last known on-disk chart payload (notes + timing + chart props + offset); updated after load / chart save. */
  const editorChartBaselineSerialized = ref("");
  /** Last known on-disk song metadata fields; updated after metadata load / metadata save. */
  const editorMetaBaselineSerialized = ref("");
  /** Fires after chart notes + timing are loaded into the editor (disk → UI). */
  const afterChartNotesLoaded = ref<null | (() => void)>(null);

  return {
    // Canvas
    canvasRef,
    // Chart data
    noteRows,
    allCharts,
    activeChartIndex,
    scrollBeat,
    zoom,
    quantize,
    showBeatLines,
    showTrackGrid,
    playing,
    playStartBeat,
    playStartChartSec,
    audioSeekBase,
    editorPlaybackWallStartMs,
    bpm,
    editorRate,
    undoStack,
    redoStack,
    saving,
    saveMessage,
    currentNoteType,
    holdStartRow,
    holdDragCurrentRow,
    isHoldDragging,
    waveformMinMax,
    waveformDuration,
    waveformPanelOffsetX,
    isWaveformPanelDragging,
    waveformPanelDragStartX,
    waveformPanelDragStartOffset,
    waveformPanelDragState,
    // Sidebar
    sidebarTab,
    // BPM
    bpmChanges,
    newBpmBeat,
    newBpmValue,
    editingBpmChangeIndex,
    editingBpmInputValue,
    offsetEditing,
    chartMeterEditing,
    sampleStartEditing,
    sampleLengthEditing,
    // Other timing segments
    timeSignatures,
    tickcounts,
    comboChanges,
    speedChanges,
    scrollChanges,
    labelChanges,
    // Selection
    selectionStart,
    selectionEnd,
    selectionTrackStart,
    selectionTrackEnd,
    clipboard,
    clipboardBpmChanges,
    isDragging,
    additionalSelections,
    selectionRubberBand,
    // New chart
    showNewChartModal,
    newChartStepsType,
    newChartDifficulty,
    newChartMeter,
    editChartStepsType,
    editChartDifficulty,
    editChartMeter,
    chartPropertiesSaving,
    syncEditChartPropertiesFromActive,
    editorRoutineLayer,
    // Metadata
    showMetadata,
    metaTitle,
    metaSubtitle,
    metaArtist,
    metaGenre,
    metaMusic,
    metaBanner,
    metaBackground,
    metaOffset,
    metaSampleStart,
    metaSampleLength,
    metaSaving,
    // Layout
    NUM_TRACKS_ACTUAL,
    NUM_TRACKS,
    FIELD_WIDTH,
    COL_LABELS,
    COL_COLORS,
    // Derived
    noteCount,
    noteStatTapCount,
    noteStatHoldCount,
    noteStatTotalCount,
    hasSelection,
    activeChart,
    totalBeats,
    scrollbarThumbRatio,
    scrollbarThumbTop,
    editorChartBaselineSerialized,
    editorMetaBaselineSerialized,
    afterChartNotesLoaded,
  };
}

export type EditorState = ReturnType<typeof useEditorState>;
