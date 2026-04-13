<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { useModalBottomHintLayout } from "@/composables/useModalBottomHintLayout";
import { useGameStore } from "@/stores/game";
import { usePlayerStore } from "@/stores/player";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
import { openFileDialog } from "@/utils/platform";

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
  <div v-if="show" ref="modalMaskRef" class="modal-mask">
    <div class="modal-mask-fill" @click.self="close">
    <div ref="modalCardRef" class="create-modal">
      <h3 class="modal-title">{{ t('select.createSong') }}</h3>

      <label class="modal-label">{{ t('select.targetPack') }}</label>
      <select v-model="createPack" class="modal-input">
        <option :value="ROOT_PACK_KEY">{{ t('select.rootPack') }}</option>
        <option v-for="p in existingPacks" :key="p" :value="p">{{ p }}</option>
        <option value="__CUSTOM__">{{ t('select.newPack') }}</option>
      </select>
      <input v-if="createPack === '__CUSTOM__'" v-model="createPackCustom" class="modal-input" :placeholder="t('select.newPackPlaceholder')" />

      <label class="modal-label">{{ t('editor.metaTitle') }}</label>
      <input v-model="createTitle" class="modal-input" :placeholder="t('select.defaultTitleHint')" />

      <label class="modal-label">{{ t('editor.metaArtist') }}</label>
      <input v-model="createArtist" class="modal-input" :placeholder="t('select.defaultArtistHint')" />

      <label class="modal-label">{{ t('editor.metaSubtitle') }}</label>
      <input v-model="createSubtitle" class="modal-input" />

      <label class="modal-label">{{ t('editor.metaGenre') }}</label>
      <input v-model="createGenre" class="modal-input" />

      <label class="modal-label">{{ t('select.musicSource') }}</label>
      <div class="path-row">
        <input v-model="createMusicSourcePath" class="modal-input path-input" :placeholder="t('select.defaultMusicHint')" />
        <button class="path-btn" @click="pickCreateMusic">{{ t('common.browse') }}</button>
        <button class="path-btn" @click="clearCreateMusic">{{ t('common.clear') }}</button>
      </div>

      <label class="modal-label">{{ t('select.coverSource') }}</label>
      <div class="path-row">
        <input v-model="createCoverSourcePath" class="modal-input path-input" :placeholder="t('select.defaultCoverHint')" />
        <button class="path-btn" @click="pickCreateCover">{{ t('common.browse') }}</button>
        <button class="path-btn" @click="clearCreateCover">{{ t('common.clear') }}</button>
      </div>

      <label class="modal-label">{{ t('select.backgroundSource') }}</label>
      <div class="path-row">
        <input v-model="createBackgroundSourcePath" class="modal-input path-input" :placeholder="t('select.defaultBackgroundHint')" />
        <button class="path-btn" @click="pickCreateBackground">{{ t('common.browse') }}</button>
        <button class="path-btn" @click="clearCreateBackground">{{ t('common.clear') }}</button>
      </div>

      <p class="modal-section-hint">{{ t('select.timingDefaultsHint') }}</p>
      <label class="modal-label">{{ t('select.createInitialBpm') }}</label>
      <input
        v-model.number="createBpm"
        class="modal-input"
        type="number"
        min="20"
        max="999"
        step="0.001"
        :placeholder="String(DEFAULT_CREATE_BPM)"
      />

      <label class="modal-label">{{ t('editor.metaOffset') }}</label>
      <input
        v-model.number="createOffset"
        class="modal-input"
        type="number"
        step="0.001"
        :placeholder="String(DEFAULT_CREATE_OFFSET)"
      />

      <label class="modal-label">{{ t('editor.metaSampleStart') }}</label>
      <input
        v-model.number="createSampleStart"
        class="modal-input"
        type="number"
        min="0"
        step="0.001"
        :placeholder="String(DEFAULT_CREATE_SAMPLE_START)"
      />

      <label class="modal-label">{{ t('editor.metaSampleLength') }}</label>
      <input
        v-model.number="createSampleLength"
        class="modal-input"
        type="number"
        min="0.01"
        step="0.001"
        :placeholder="String(DEFAULT_CREATE_SAMPLE_LENGTH)"
      />

      <label class="modal-label">
        <input type="checkbox" v-model="createChart" class="modal-checkbox" />
        {{ t('songPacks.createInitialChart') }}
      </label>

      <template v-if="createChart">
        <label class="modal-label">{{ t('editor.stepsType') }}</label>
        <select v-model="createStepsType" class="modal-input">
          <option value="pump-single">{{ t('editor.stepsTypeOption.pump-single') }}</option>
          <option value="pump-double">{{ t('editor.stepsTypeOption.pump-double') }}</option>
          <option value="pump-couple">{{ t('editor.stepsTypeOption.pump-couple') }}</option>
          <option value="pump-routine">{{ t('editor.stepsTypeOption.pump-routine') }}</option>
        </select>

        <label class="modal-label">{{ t('editor.difficulty') }}</label>
        <select v-model="createDifficulty" class="modal-input">
          <option value="Beginner">Beginner</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
          <option value="Expert">Expert</option>
          <option value="Edit">Edit</option>
        </select>

        <label class="modal-label">{{ t('editor.meter') }}</label>
        <input
          v-model.number="createMeter"
          class="modal-input"
          type="number"
          min="1"
          max="20"
        />
      </template>

      <div class="modal-actions">
        <button class="modal-btn" @click="close">{{ t('cancel') }}</button>
        <button class="modal-btn primary" :disabled="creatingSong" @click="createSong">{{ t('confirm') }}</button>
      </div>
    </div>
    </div>
    <p v-if="hintVisible" class="modal-mask-hint">{{ bottomHint }}</p>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700;900&display=swap');

.modal-mask {
  position: fixed; /* fix absolute position bug when scrolling */
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
}
.modal-mask-fill {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}
.modal-mask-hint {
  flex-shrink: 0;
  margin: 0;
  padding: 0.35rem 1.25rem max(0.85rem, env(safe-area-inset-bottom, 0px));
  text-align: center;
  font-size: 0.68rem;
  font-family: 'Rajdhani', sans-serif;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--text-subtle) 90%, transparent);
  pointer-events: none;
  line-height: 1.35;
}

.create-modal {
  width: min(520px, calc(100vw - 2rem));
  max-height: 80vh;
  overflow-y: auto;
  border-radius: 12px;
  padding: 1rem;
  background: var(--bg-color, #08080f);
  border: 1px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
  font-family: 'Rajdhani', sans-serif;
  color: var(--text-color);
}

.modal-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
  letter-spacing: 0.08em;
  color: var(--text-color);
}

.modal-section-hint {
  margin: 0.65rem 0 0.15rem;
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--primary-color) 35%, var(--text-muted));
  line-height: 1.35;
}

.modal-label {
  display: block;
  margin-top: 0.55rem;
  margin-bottom: 0.25rem;
  font-size: 0.72rem;
  color: color-mix(in srgb, var(--primary-color) 28%, var(--text-color));
}

.modal-input {
  width: 100%;
  padding: 0.42rem 0.55rem;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  color: var(--text-color);
  font-family: 'Rajdhani', sans-serif;
  box-sizing: border-box;
}

.modal-input:focus {
  outline: none;
  border-color: var(--primary-color); 
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 20%, transparent);
}

.path-row {
  display: flex;
  gap: 0.35rem;
}

.path-input {
  flex: 1;
}

.path-btn {
  min-width: 2rem;
  padding: 0 0.5rem;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.08);
  color: var(--text-color);
  cursor: pointer;
}
.path-btn:hover {
  background: rgba(255,255,255,0.15);
}

.modal-actions {
  margin-top: 0.95rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.modal-btn {
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  color: var(--text-color);
  cursor: pointer;
  font-family: 'Rajdhani', sans-serif;
}
.modal-btn:hover {
  background: rgba(255,255,255,0.12);
}

.modal-btn.primary {
  border: none;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-secondary) 100%);
  color: var(--text-on-primary);
}
.modal-btn.primary:hover {
  filter: brightness(1.15);
}

.modal-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--primary-color);
  vertical-align: middle;
  margin-right: 0.4rem;
  cursor: pointer;
}

.modal-label:has(.modal-checkbox) {
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-top: 0.65rem;
  font-size: 0.8rem;
  color: color-mix(in srgb, var(--primary-color) 28%, var(--text-color));
}

.modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>