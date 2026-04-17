import { computed } from "vue";
import type { useSessionStore } from "@/shared/stores/session";
import type { useSettingsStore } from "@/shared/stores/settings";
import { formatBinding, mergeShortcutBindings, type ShortcutId } from "@/shared/lib/engine/keyBindings";
import { routineColorHex } from "@/shared/constants/routinePlayerColors";
import type { EditorState } from "./useEditorState";

const NOTE_STATS_TAP_COLOR = "#4fc3f7";
const NOTE_STATS_HOLD_COLOR = "#ffb74d";

export function useEditorScreenChrome(
  session: ReturnType<typeof useSessionStore>,
  settings: ReturnType<typeof useSettingsStore>,
  s: Pick<
    EditorState,
    | "activeChart"
    | "allCharts"
    | "noteStatTapCount"
    | "noteStatHoldCount"
    | "noteStatTotalCount"
  >,
) {
  const isPumpRoutineChart = computed(() => s.activeChart.value?.stepsType === "pump-routine");
  const routineP1Accent = computed(() => routineColorHex(session.routineP1ColorId) ?? "#00bfff");
  const routineP2Accent = computed(() => routineColorHex(session.routineP2ColorId) ?? "#ff4444");

  const editorToolbarEditingEnabled = computed(() => s.allCharts.value.length > 0);

  const noteStatsTapPct = computed(() => {
    const tot = s.noteStatTotalCount.value;
    if (tot <= 0) return 0;
    return Math.round((s.noteStatTapCount.value / tot) * 1000) / 10;
  });

  const noteStatsHoldPct = computed(() => {
    const tot = s.noteStatTotalCount.value;
    if (tot <= 0) return 0;
    return Math.round((s.noteStatHoldCount.value / tot) * 1000) / 10;
  });

  const noteStatsDonutStyle = computed(() => {
    const tot = s.noteStatTotalCount.value;
    if (tot <= 0) {
      return { background: "conic-gradient(rgba(255,255,255,0.12) 0deg 360deg)" };
    }
    const tapDeg = (s.noteStatTapCount.value / tot) * 360;
    return {
      background: `conic-gradient(${NOTE_STATS_TAP_COLOR} 0deg ${tapDeg}deg, ${NOTE_STATS_HOLD_COLOR} ${tapDeg}deg 360deg)`,
    };
  });

  function sc(id: ShortcutId): string {
    const binding = mergeShortcutBindings(settings.shortcutOverrides)[id];
    const formatted = formatBinding(binding);
    return formatted ? ` (${formatted})` : "";
  }

  function toggleRhythmSfx() {
    settings.rhythmSfxEnabled = !settings.rhythmSfxEnabled;
  }

  function toggleMetronomeSfx() {
    settings.metronomeSfxEnabled = !settings.metronomeSfxEnabled;
  }

  return {
    NOTE_STATS_TAP_COLOR,
    NOTE_STATS_HOLD_COLOR,
    isPumpRoutineChart,
    routineP1Accent,
    routineP2Accent,
    editorToolbarEditingEnabled,
    noteStatsTapPct,
    noteStatsHoldPct,
    noteStatsDonutStyle,
    sc,
    toggleRhythmSfx,
    toggleMetronomeSfx,
  };
}
