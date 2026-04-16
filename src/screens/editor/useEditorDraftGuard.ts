import { computed, nextTick, ref, watch } from "vue";
import { defaultQuantizeFromTimeSignatures } from "./quantizeFromTimeSignature";
import type { EditorState } from "./useEditorState";
import type { EditorCanvas } from "./useEditorCanvas";
import type { useGameStore } from "@/shared/stores/game";
import type { EditorChartBackupStored } from "@/screens/editor/editorChartBackup";
import {
  applyEditorChartBackupToState,
  clearEditorChartBackup,
  editorBackupMatchesDisk,
  readEditorChartBackup,
  serializeEditorChartPersist,
  serializeEditorMetaPersist,
  writeEditorChartBackup,
} from "@/screens/editor/editorChartBackup";

type GameStore = ReturnType<typeof useGameStore>;

export function useEditorDraftGuard(deps: {
  s: EditorState;
  canvas: EditorCanvas;
  game: GameStore;
  reseedUndoStackAfterHydrate: () => void;
  saveToFile: () => Promise<boolean>;
  saveMetadata: () => Promise<boolean>;
}) {
  const { s, canvas, game, reseedUndoStackAfterHydrate, saveToFile, saveMetadata } = deps;

  const draftChartSerialized = ref("");
  const draftMetaSerialized = ref("");
  const showBackupRestoreModal = ref(false);
  const pendingBackupForModal = ref<EditorChartBackupStored | null>(null);
  const showUnsavedExitModal = ref(false);
  let unsavedExitResolve: ((v: boolean) => void) | null = null;
  let backupDebounce: ReturnType<typeof setTimeout> | null = null;

  function bumpDraftFromState() {
    draftChartSerialized.value = serializeEditorChartPersist(s);
    draftMetaSerialized.value = serializeEditorMetaPersist(s);
  }

  function syncDraftToDiskBaselines() {
    draftChartSerialized.value = s.editorChartBaselineSerialized.value;
    draftMetaSerialized.value = s.editorMetaBaselineSerialized.value;
  }

  const isChartDirty = computed(() => draftChartSerialized.value !== s.editorChartBaselineSerialized.value);
  const isMetaDirty = computed(() => draftMetaSerialized.value !== s.editorMetaBaselineSerialized.value);
  const isDirty = computed(() => isChartDirty.value || isMetaDirty.value);

  function scheduleBackupWrite() {
    if (backupDebounce !== null) clearTimeout(backupDebounce);
    backupDebounce = setTimeout(() => {
      backupDebounce = null;
      bumpDraftFromState();
      const song = game.currentSong;
      if (!song || s.allCharts.value.length === 0) return;
      if (!isDirty.value) {
        clearEditorChartBackup(song.path, s.activeChartIndex.value);
        return;
      }
      writeEditorChartBackup(s, song.path, s.activeChartIndex.value);
    }, 600);
  }

  watch(
    [
      () => s.noteRows.value,
      () => s.bpmChanges.value,
      () => s.timeSignatures.value,
      () => s.tickcounts.value,
      () => s.comboChanges.value,
      () => s.speedChanges.value,
      () => s.scrollChanges.value,
      () => s.labelChanges.value,
      () => s.editChartStepsType.value,
      () => s.editChartDifficulty.value,
      () => s.editChartMeter.value,
      () => s.metaTitle.value,
      () => s.metaSubtitle.value,
      () => s.metaArtist.value,
      () => s.metaGenre.value,
      () => s.metaMusic.value,
      () => s.metaBanner.value,
      () => s.metaBackground.value,
      () => s.metaSampleStart.value,
      () => s.metaSampleLength.value,
      () => s.metaOffset.value,
      () => s.scrollBeat.value,
      () => s.zoom.value,
      () => s.quantize.value,
      () => s.showBeatLines.value,
      () => s.editorRoutineLayer.value,
    ],
    () => {
      scheduleBackupWrite();
    },
    { deep: true },
  );

  function offerBackupDraftIfNeeded() {
    const song = game.currentSong;
    if (!song || s.allCharts.value.length === 0) return;
    const idx = s.activeChartIndex.value;
    const backup = readEditorChartBackup(song.path, idx);
    if (!backup) return;
    if (
      editorBackupMatchesDisk(backup, s.editorChartBaselineSerialized.value, s.editorMetaBaselineSerialized.value)
    ) {
      clearEditorChartBackup(song.path, idx);
      return;
    }
    pendingBackupForModal.value = backup;
    showBackupRestoreModal.value = true;
  }

  function onAfterEditorSnapshotReady() {
    syncDraftToDiskBaselines();
    offerBackupDraftIfNeeded();
  }

  function onBackupRestoreLoad() {
    const song = game.currentSong;
    const b = pendingBackupForModal.value;
    if (!song || !b) {
      showBackupRestoreModal.value = false;
      return;
    }
    applyEditorChartBackupToState(s, b);
    s.quantize.value = defaultQuantizeFromTimeSignatures(s.timeSignatures.value);
    reseedUndoStackAfterHydrate();
    bumpDraftFromState();
    showBackupRestoreModal.value = false;
    pendingBackupForModal.value = null;
    void nextTick(() => {
      canvas.resizeCanvas();
    });
  }

  function onBackupRestoreUseDisk() {
    const song = game.currentSong;
    if (song) clearEditorChartBackup(song.path, s.activeChartIndex.value);
    showBackupRestoreModal.value = false;
    pendingBackupForModal.value = null;
  }

  function installEditorBackGuard() {
    game.setEditorBackGuard(async () => {
      if (!isDirty.value) return true;
      return await new Promise<boolean>((resolve) => {
        unsavedExitResolve = resolve;
        showUnsavedExitModal.value = true;
      });
    });
  }

  function uninstallEditorBackGuard() {
    game.setEditorBackGuard(null);
    if (unsavedExitResolve) {
      unsavedExitResolve(false);
      unsavedExitResolve = null;
    }
    showUnsavedExitModal.value = false;
  }

  async function onUnsavedSaveAndLeave() {
    const song = game.currentSong;
    if (!song) return;
    if (isChartDirty.value) {
      const chartOk = await saveToFile();
      if (!chartOk) return;
    }
    if (isMetaDirty.value) {
      const metaOk = await saveMetadata();
      if (!metaOk) return;
    }
    clearEditorChartBackup(song.path, s.activeChartIndex.value);
    bumpDraftFromState();
    showUnsavedExitModal.value = false;
    const r = unsavedExitResolve;
    unsavedExitResolve = null;
    r?.(true);
  }

  function onUnsavedDiscardAndLeave() {
    const song = game.currentSong;
    if (song) clearEditorChartBackup(song.path, s.activeChartIndex.value);
    showUnsavedExitModal.value = false;
    const r = unsavedExitResolve;
    unsavedExitResolve = null;
    r?.(true);
  }

  /** Exit without writing SM/SSC; force current editor state into localStorage backup for next session. */
  function onUnsavedStashAndLeave() {
    const song = game.currentSong;
    if (!song || s.allCharts.value.length === 0) {
      showUnsavedExitModal.value = false;
      const r = unsavedExitResolve;
      unsavedExitResolve = null;
      r?.(true);
      return;
    }
    writeEditorChartBackup(s, song.path, s.activeChartIndex.value);
    showUnsavedExitModal.value = false;
    const r = unsavedExitResolve;
    unsavedExitResolve = null;
    r?.(true);
  }

  function onUnsavedCancel() {
    showUnsavedExitModal.value = false;
    const r = unsavedExitResolve;
    unsavedExitResolve = null;
    r?.(false);
  }

  function disposeDraftGuard() {
    if (backupDebounce !== null) {
      clearTimeout(backupDebounce);
      backupDebounce = null;
    }
  }

  return {
    showBackupRestoreModal,
    showUnsavedExitModal,
    onAfterEditorSnapshotReady,
    onBackupRestoreLoad,
    onBackupRestoreUseDisk,
    installEditorBackGuard,
    uninstallEditorBackGuard,
    onUnsavedSaveAndLeave,
    onUnsavedDiscardAndLeave,
    onUnsavedStashAndLeave,
    onUnsavedCancel,
    disposeDraftGuard,
  };
}
