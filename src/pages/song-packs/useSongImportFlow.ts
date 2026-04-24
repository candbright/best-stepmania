import { ref, type Ref } from "vue";
import * as api from "@/shared/api";
import type { SongPackInfo } from "@/shared/api";
import { isTauri, openDirectoryDialog } from "@/shared/lib/platform";

type ImportSongPayload = {
  packName: string;
  title: string;
  artist: string;
  subtitle: string;
  genre: string;
  bpm: number;
  offset: number;
  stepsType: string;
  difficulty: string;
  meter: number;
  createChart: boolean;
  musicSourcePath: string;
  coverSourcePath: string;
  backgroundSourcePath: string;
  chartSourcePath: string;
};

type ImportSongDefaults = {
  title: string;
  artist: string;
  subtitle: string;
  genre: string;
  bpm: number;
  offset: number;
  musicSourcePath: string;
  coverSourcePath: string;
  backgroundSourcePath: string;
  chartSourcePath: string;
};

function createEmptyDefaults(): ImportSongDefaults {
  return {
    title: "",
    artist: "",
    subtitle: "",
    genre: "",
    bpm: 120,
    offset: 0,
    musicSourcePath: "",
    coverSourcePath: "",
    backgroundSourcePath: "",
    chartSourcePath: "",
  };
}

export function useSongImportFlow(params: {
  packs: Ref<SongPackInfo[]>;
  importing: Ref<boolean>;
  importingAction: Ref<"pack" | "song" | "createPack" | null>;
  songsInPack: (packName: string) => { title: string }[];
  showStatus: (msg: string, ok?: boolean) => void;
  refreshSongs: () => Promise<void>;
  t: (key: string) => string;
}) {
  const showImportSongModal = ref(false);
  const songSourcePath = ref("");
  const importSongError = ref("");
  const importSongDefaults = ref<ImportSongDefaults>(createEmptyDefaults());

  function hasDuplicateSongNameInPack(packName: string, songName: string): boolean {
    const normalized = songName.trim().toLocaleLowerCase();
    if (!normalized) return false;
    return params.songsInPack(packName).some((song) => (song.title || "").trim().toLocaleLowerCase() === normalized);
  }

  async function startImportSong() {
    if (params.importing.value) return;
    params.importingAction.value = "song";
    const selected = await openDirectoryDialog(params.t("songPacks.selectSongDirectory"));
    if (!selected || typeof selected !== "string") {
      params.importingAction.value = null;
      return;
    }
    if (!isTauri()) {
      params.showStatus(params.t("select.importWebNotSupported"), false);
      params.importingAction.value = null;
      return;
    }

    params.importing.value = true;
    try {
      importSongError.value = "";
      songSourcePath.value = selected;
      const sourceInfo = await api.inspectSongImportSource(selected);
      importSongDefaults.value = {
        title: sourceInfo.title?.trim() || sourceInfo.folderName?.trim() || "",
        artist: sourceInfo.artist ?? "",
        subtitle: sourceInfo.subtitle ?? "",
        genre: sourceInfo.genre ?? "",
        bpm: Number.isFinite(sourceInfo.bpm) ? sourceInfo.bpm : 120,
        offset: Number.isFinite(sourceInfo.offset) ? sourceInfo.offset : 0,
        musicSourcePath: sourceInfo.musicSourcePath ?? "",
        coverSourcePath: sourceInfo.coverSourcePath ?? "",
        backgroundSourcePath: sourceInfo.backgroundSourcePath ?? "",
        chartSourcePath: sourceInfo.chartSourcePath ?? "",
      };
      showImportSongModal.value = true;
    } catch (e: unknown) {
      params.showStatus(`${params.t("songPacks.songImportFailed")}: ${String(e)}`, false);
    } finally {
      params.importing.value = false;
      if (!showImportSongModal.value) params.importingAction.value = null;
    }
  }

  async function handleImportSongConfirm(data: ImportSongPayload) {
    if (!songSourcePath.value) return;

    importSongError.value = "";
    params.importing.value = true;
    try {
      const targetPack = data.packName === "" ? ".root" : (data.packName || ".root");
      if (hasDuplicateSongNameInPack(targetPack, data.title)) {
        importSongError.value = params.t("songPacks.duplicateSongName");
        return;
      }

      const prepareResult = await api.prepareSongImport(songSourcePath.value, targetPack);
      await api.createChartForImported(
        prepareResult.songDir,
        data.title,
        data.artist,
        data.subtitle,
        data.genre,
        data.bpm,
        data.offset,
        data.stepsType,
        data.difficulty,
        data.meter,
        data.createChart,
        data.musicSourcePath,
        data.coverSourcePath,
        data.backgroundSourcePath,
        data.chartSourcePath,
      );
      showImportSongModal.value = false;
      importSongError.value = "";
      params.showStatus(params.t("songPacks.songImported"));
      await params.refreshSongs();
      const pack = params.packs.value.find((item) => item.name === targetPack);
      if (pack) {
        pack.songCount = params.songsInPack(pack.name).length;
      }
    } catch (e: unknown) {
      importSongError.value = params.t("songPacks.songImportFailed");
      params.showStatus(`${params.t("songPacks.songImportFailed")}: ${String(e)}`, false);
    } finally {
      params.importing.value = false;
      closeImportSongModal();
    }
  }

  function closeImportSongModal() {
    showImportSongModal.value = false;
    importSongError.value = "";
    params.importingAction.value = null;
    params.importing.value = false;
    songSourcePath.value = "";
    importSongDefaults.value = createEmptyDefaults();
  }

  return {
    showImportSongModal,
    importSongError,
    importSongDefaults,
    startImportSong,
    handleImportSongConfirm,
    closeImportSongModal,
  };
}
