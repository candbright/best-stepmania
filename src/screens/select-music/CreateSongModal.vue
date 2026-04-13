<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { useModalBottomHintLayout } from "@/composables/useModalBottomHintLayout";
import { useGameStore } from "@/stores/game";
import { usePlayerStore } from "@/stores/player";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
import { openFileDialog } from "@/utils/platform";
import CustomSelect from "@/components/CustomSelect.vue";
import AppNumberField from "@/components/AppNumberField.vue";
import type { Ref } from "vue";

const props = withDefaults(
  defineProps<{
    show: boolean;
    existingPacks: string[];
    /** Shown below the dialog card, above the screen bottom (e.g. keyboard hint). */
    bottomHint?: string;
  }>(),
  { bottomHint: "" },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success", status: string): void;
  (e: "error", status: string): void;
}>();

const game = useGameStore();
const player = usePlayerStore();
const { t } = useI18n();

const modalMaskRef = ref<HTMLElement | null>(null);
const modalCardRef = ref<HTMLElement | null>(null);
const overlayActive = computed(() => props.show);
const { hintVisible } = useModalBottomHintLayout(modalMaskRef, modalCardRef, {
  active: overlayActive,
  hasHint: () => props.bottomHint.trim().length > 0,
});

const creatingSong = ref(false);
const ROOT_PACK_KEY = "__ROOT__";

const createPack = ref(ROOT_PACK_KEY);
const createPackCustom = ref("");
const createTitle = ref("");
const createArtist = ref("");
const createSubtitle = ref("");
const createGenre = ref("");
const createMusicSourcePath = ref("");
const createCoverSourcePath = ref("");
const createBackgroundSourcePath = ref("");
/** Defaults match editor / StepMania conventions when fields are left blank */
const DEFAULT_CREATE_BPM = 120;
const DEFAULT_CREATE_OFFSET = 0;
const DEFAULT_CREATE_SAMPLE_START = 0;
const DEFAULT_CREATE_SAMPLE_LENGTH = 12;
const createBpm = ref<number | "">("");
const createOffset = ref<number | "">("");
const createSampleStart = ref<number | "">("");
const createSampleLength = ref<number | "">("");
/** Chart creation fields */
const createChart = ref(false);
const createStepsType = ref("pump-single");
const createDifficulty = ref("Easy");
const createMeter = ref(5);

const createPackSelectOptions = computed(() => [
  { label: t("select.rootPack"), value: ROOT_PACK_KEY },
  ...props.existingPacks.map((p) => ({ label: p, value: p })),
  { label: t("select.newPack"), value: "__CUSTOM__" },
]);

const createStepsTypeOptions = computed(() => [
  { value: "pump-single", label: t("editor.stepsTypeOption.pump-single") },
  { value: "pump-double", label: t("editor.stepsTypeOption.pump-double") },
  { value: "pump-couple", label: t("editor.stepsTypeOption.pump-couple") },
  { value: "pump-routine", label: t("editor.stepsTypeOption.pump-routine") },
]);

const createDifficultyOptions = computed(() => [
  { value: "Beginner", label: "Beginner" },
  { value: "Easy", label: "Easy" },
  { value: "Medium", label: "Medium" },
  { value: "Hard", label: "Hard" },
  { value: "Expert", label: "Expert" },
  { value: "Edit", label: "Edit" },
]);

function numOrEmptyBridge(r: Ref<number | "">) {
  return computed({
    get: (): number | null => (r.value === "" ? null : r.value),
    set: (v: number | null) => {
      r.value = v === null ? "" : v;
    },
  });
}

const createBpmBridge = numOrEmptyBridge(createBpm);
const createOffsetBridge = numOrEmptyBridge(createOffset);
const createSampleStartBridge = numOrEmptyBridge(createSampleStart);
const createSampleLengthBridge = numOrEmptyBridge(createSampleLength);

async function pickCreateMusic() {
  const selected = await openFileDialog({
    title: t("select.pickMusic"),
    filters: [{ name: t("select.audioFiles"), extensions: ["ogg", "mp3", "wav", "flac"] }],
  });
  if (selected && typeof selected === "string") createMusicSourcePath.value = selected;
}

async function pickCreateCover() {
  const selected = await openFileDialog({
    title: t("select.pickCover"),
    filters: [{ name: t("select.imageFiles"), extensions: ["png", "jpg", "jpeg", "bmp", "webp"] }],
  });
  if (selected && typeof selected === "string") createCoverSourcePath.value = selected;
}

async function pickCreateBackground() {
  const selected = await openFileDialog({
    title: t("select.pickBackground"),
    filters: [{ name: t("select.imageFiles"), extensions: ["png", "jpg", "jpeg", "bmp", "webp"] }],
  });
  if (selected && typeof selected === "string") createBackgroundSourcePath.value = selected;
}

function clearCreateMusic() {
  createMusicSourcePath.value = "";
}

function clearCreateCover() {
  createCoverSourcePath.value = "";
}

function clearCreateBackground() {
  createBackgroundSourcePath.value = "";
}

function finiteOr(v: number | "", fallback: number): number {
  if (v === "") return fallback;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}

async function createSong() {
  try {
    creatingSong.value = true;
    const packName = createPack.value === "__CUSTOM__"
      ? createPackCustom.value.trim()
      : (createPack.value === ROOT_PACK_KEY ? "" : createPack.value);

    const result = await api.createSong({
      packName: packName || undefined,
      title: createTitle.value.trim() || undefined,
      artist: createArtist.value.trim() || undefined,
      subtitle: createSubtitle.value.trim() || undefined,
      genre: createGenre.value.trim() || undefined,
      musicSourcePath: createMusicSourcePath.value.trim() || undefined,
      coverSourcePath: createCoverSourcePath.value.trim() || undefined,
      backgroundSourcePath: createBackgroundSourcePath.value.trim() || undefined,
      bpm: finiteOr(createBpm.value, DEFAULT_CREATE_BPM),
      offset: finiteOr(createOffset.value, DEFAULT_CREATE_OFFSET),
      sampleStart: finiteOr(createSampleStart.value, DEFAULT_CREATE_SAMPLE_START),
      sampleLength: finiteOr(createSampleLength.value, DEFAULT_CREATE_SAMPLE_LENGTH),
      createChart: createChart.value || undefined,
      stepsType: createChart.value ? createStepsType.value : undefined,
      difficulty: createChart.value ? createDifficulty.value : undefined,
      meter: createChart.value ? createMeter.value : undefined,
    });

    await game.refreshSongsList();
    const newSongs = game.songs;
    const newIndex = newSongs.findIndex((s) => s.path === result.songPath);
    const nextIndex = newIndex >= 0
      ? newIndex
      : Math.max(0, Math.min(game.currentSongIndex, newSongs.length - 1));

    if (newSongs.length > 0) {
      await game.selectSong(nextIndex);
      player.setQueue(newSongs, nextIndex);
    }

    emit("success", t("select.createSuccess"));
  } catch (e: unknown) {
    emit("error", t("select.createError") + ": " + String(e));
  } finally {
    creatingSong.value = false;
  }
}

function close() {
  emit("close");
}

// ESC key closes the modal instead of propagating to parent screen
function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.show) {
    e.stopPropagation();
    e.preventDefault();
    close();
  }
}
watch(() => props.show, (val) => {
  if (val) window.addEventListener("keydown", onKeyDown, true);
  else window.removeEventListener("keydown", onKeyDown, true);
});
onUnmounted(() => window.removeEventListener("keydown", onKeyDown, true));
</script>

<template>
  <Teleport v-if="show" to="body">
    <div ref="modalMaskRef" class="form-modal-mask">
      <div class="form-modal-mask-fill" @click.self="close">
        <div
          ref="modalCardRef"
          class="form-modal-shell form-modal-card--wide form-modal--scrollable"
        >
          <header class="form-modal-header">
            <span class="form-modal-title">{{ t('select.createSong') }}</span>
            <button type="button" class="form-modal-close" @click="close">×</button>
          </header>

          <div class="form-modal-body">
            <div class="form-modal-fields">
            <label class="form-modal-label">{{ t('select.targetPack') }}</label>
            <CustomSelect v-model="createPack" variant="form" :options="createPackSelectOptions" />
            <input
              v-if="createPack === '__CUSTOM__'"
              v-model="createPackCustom"
              class="form-modal-input"
              :placeholder="t('select.newPackPlaceholder')"
            />

            <label class="form-modal-label">{{ t('editor.metaTitle') }}</label>
            <input v-model="createTitle" class="form-modal-input" :placeholder="t('select.defaultTitleHint')" />

            <label class="form-modal-label">{{ t('editor.metaArtist') }}</label>
            <input v-model="createArtist" class="form-modal-input" :placeholder="t('select.defaultArtistHint')" />

            <label class="form-modal-label">{{ t('editor.metaSubtitle') }}</label>
            <input v-model="createSubtitle" class="form-modal-input" />

            <label class="form-modal-label">{{ t('editor.metaGenre') }}</label>
            <input v-model="createGenre" class="form-modal-input" />

            <label class="form-modal-label">{{ t('select.musicSource') }}</label>
            <div class="form-modal-path-row">
              <input
                v-model="createMusicSourcePath"
                class="form-modal-input form-modal-path-input"
                :placeholder="t('select.defaultMusicHint')"
              />
              <button type="button" class="form-modal-path-btn" @click="pickCreateMusic">{{ t('common.browse') }}</button>
              <button type="button" class="form-modal-path-btn" @click="clearCreateMusic">{{ t('common.clear') }}</button>
            </div>

            <label class="form-modal-label">{{ t('select.coverSource') }}</label>
            <div class="form-modal-path-row">
              <input
                v-model="createCoverSourcePath"
                class="form-modal-input form-modal-path-input"
                :placeholder="t('select.defaultCoverHint')"
              />
              <button type="button" class="form-modal-path-btn" @click="pickCreateCover">{{ t('common.browse') }}</button>
              <button type="button" class="form-modal-path-btn" @click="clearCreateCover">{{ t('common.clear') }}</button>
            </div>

            <label class="form-modal-label">{{ t('select.backgroundSource') }}</label>
            <div class="form-modal-path-row">
              <input
                v-model="createBackgroundSourcePath"
                class="form-modal-input form-modal-path-input"
                :placeholder="t('select.defaultBackgroundHint')"
              />
              <button type="button" class="form-modal-path-btn" @click="pickCreateBackground">{{ t('common.browse') }}</button>
              <button type="button" class="form-modal-path-btn" @click="clearCreateBackground">{{ t('common.clear') }}</button>
            </div>

            <p class="form-modal-hint">{{ t('select.timingDefaultsHint') }}</p>
            <label class="form-modal-label">{{ t('select.createInitialBpm') }}</label>
            <AppNumberField
              v-model="createBpmBridge"
              input-class="form-modal-input"
              nullable
              :min="20"
              :max="999"
              step="0.001"
              :placeholder="String(DEFAULT_CREATE_BPM)"
            />

            <label class="form-modal-label">{{ t('editor.metaOffset') }}</label>
            <AppNumberField
              v-model="createOffsetBridge"
              input-class="form-modal-input"
              nullable
              step="0.001"
              :placeholder="String(DEFAULT_CREATE_OFFSET)"
            />

            <label class="form-modal-label">{{ t('editor.metaSampleStart') }}</label>
            <AppNumberField
              v-model="createSampleStartBridge"
              input-class="form-modal-input"
              nullable
              :min="0"
              step="0.001"
              :placeholder="String(DEFAULT_CREATE_SAMPLE_START)"
            />

            <label class="form-modal-label">{{ t('editor.metaSampleLength') }}</label>
            <AppNumberField
              v-model="createSampleLengthBridge"
              input-class="form-modal-input"
              nullable
              min="0.01"
              step="0.001"
              :placeholder="String(DEFAULT_CREATE_SAMPLE_LENGTH)"
            />

            <label class="form-modal-check">
              <input type="checkbox" v-model="createChart" />
              {{ t('songPacks.createInitialChart') }}
            </label>

            <template v-if="createChart">
              <label class="form-modal-label">{{ t('editor.stepsType') }}</label>
              <CustomSelect v-model="createStepsType" variant="form" :options="createStepsTypeOptions" />

              <label class="form-modal-label">{{ t('editor.difficulty') }}</label>
              <CustomSelect v-model="createDifficulty" variant="form" :options="createDifficultyOptions" />

              <label class="form-modal-label">{{ t('editor.meter') }}</label>
              <AppNumberField v-model="createMeter" input-class="form-modal-input" :min="1" :max="20" />
            </template>
            </div>
          </div>

          <footer class="form-modal-footer">
            <div class="form-modal-footer-inner">
              <button type="button" class="form-modal-btn" @click="close">{{ t('cancel') }}</button>
              <button
                type="button"
                class="form-modal-btn form-modal-btn--primary"
                :disabled="creatingSong"
                @click="createSong"
              >
                {{ t('confirm') }}
              </button>
            </div>
          </footer>
        </div>
      </div>
      <p v-if="hintVisible" class="form-modal-mask-hint">{{ bottomHint }}</p>
    </div>
  </Teleport>
</template>