<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useI18n } from "@/i18n";
import { openFileDialog } from "@/utils/platform";
import type { SongPackInfo } from "@/utils/api";

const props = defineProps<{
  show: boolean;
  packs: SongPackInfo[];
  /** Default values for chart info fields */
  defaultTitle?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm", data: {
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
  }): void;
}>();

const { t } = useI18n();

const ROOT_PACK_ID = ".root";
const selectedPack = ref(ROOT_PACK_ID);

// Chart info fields
const songTitle = ref("");
const songArtist = ref("");
const songSubtitle = ref("");
const songGenre = ref("");
const songBpm = ref(120);
const songOffset = ref(0);
const songStepsType = ref("pump-single");
const songDifficulty = ref("Easy");
const songMeter = ref(5);
const createChart = ref(false);
const musicSourcePath = ref("");
const coverSourcePath = ref("");
const backgroundSourcePath = ref("");

// File picker helpers
async function pickMusic() {
  const selected = await openFileDialog({
    title: t("select.pickMusic"),
    filters: [{ name: t("select.audioFiles"), extensions: ["ogg", "mp3", "wav", "flac"] }],
  });
  if (selected && typeof selected === "string") musicSourcePath.value = selected;
}

async function pickCover() {
  const selected = await openFileDialog({
    title: t("select.pickCover"),
    filters: [{ name: t("select.imageFiles"), extensions: ["png", "jpg", "jpeg", "bmp", "webp"] }],
  });
  if (selected && typeof selected === "string") coverSourcePath.value = selected;
}

async function pickBackground() {
  const selected = await openFileDialog({
    title: t("select.pickBackground"),
    filters: [{ name: t("select.imageFiles"), extensions: ["png", "jpg", "jpeg", "bmp", "webp"] }],
  });
  if (selected && typeof selected === "string") backgroundSourcePath.value = selected;
}

function clearMusic() { musicSourcePath.value = ""; }
function clearCover() { coverSourcePath.value = ""; }
function clearBackground() { backgroundSourcePath.value = ""; }

// Watch for defaultTitle changes and update songTitle
watch(() => props.defaultTitle, (newVal) => {
  if (newVal) {
    songTitle.value = newVal;
  }
}, { immediate: true });

// Reset form when modal opens
watch(() => props.show, (isShowing) => {
  if (isShowing) {
    selectedPack.value = ROOT_PACK_ID;
    songTitle.value = props.defaultTitle || "";
    songArtist.value = "";
    songSubtitle.value = "";
    songGenre.value = "";
    songBpm.value = 120;
    songOffset.value = 0;
    songStepsType.value = "pump-single";
    songDifficulty.value = "Easy";
    songMeter.value = 5;
    createChart.value = false;
    musicSourcePath.value = "";
    coverSourcePath.value = "";
    backgroundSourcePath.value = "";
  }
});

const packOptions = computed(() => [
  { name: "", label: t("songPacks.packRoot") },
  ...props.packs.map((p) => ({ name: p.name, label: p.name })),
]);

const difficultyOptions = [
  { value: "Beginner", label: "Beginner" },
  { value: "Easy", label: "Easy" },
  { value: "Medium", label: "Medium" },
  { value: "Hard", label: "Hard" },
  { value: "Expert", label: "Expert" },
  { value: "Edit", label: "Edit" },
];

// Only support pump-single, pump-double, pump-routine
const stepsTypeOptions = [
  { value: "pump-single", label: "Pump Single (5)" },
  { value: "pump-double", label: "Pump Double (10)" },
  { value: "pump-routine", label: "Pump Routine (10)" },
];

function handleConfirm() {
  emit("confirm", {
    packName: selectedPack.value,
    title: songTitle.value,
    artist: songArtist.value,
    subtitle: songSubtitle.value,
    genre: songGenre.value,
    bpm: songBpm.value,
    offset: songOffset.value,
    stepsType: songStepsType.value,
    difficulty: songDifficulty.value,
    meter: songMeter.value,
    createChart: createChart.value,
    musicSourcePath: musicSourcePath.value,
    coverSourcePath: coverSourcePath.value,
    backgroundSourcePath: backgroundSourcePath.value,
  });
}

function handleClose() {
  selectedPack.value = ROOT_PACK_ID;
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="show" class="modal-mask" @click.self="handleClose">
        <div class="create-modal">
          <h3 class="modal-title">{{ t('songPacks.fillSongInfo') }}</h3>

          <!-- Pack selection -->
          <label class="modal-label">{{ t('songPacks.targetPack') }}</label>
          <select v-model="selectedPack" class="modal-input">
            <option v-for="opt in packOptions" :key="opt.name" :value="opt.name">
              {{ opt.label }}
            </option>
          </select>

          <label class="modal-label">{{ t('editor.metaTitle') }} *</label>
          <input
            v-model="songTitle"
            type="text"
            class="modal-input"
            :placeholder="t('songPacks.songTitlePlaceholder')"
          />

          <label class="modal-label">{{ t('editor.metaArtist') }}</label>
          <input
            v-model="songArtist"
            type="text"
            class="modal-input"
            :placeholder="t('songPacks.songArtistPlaceholder')"
          />

          <label class="modal-label">{{ t('editor.metaSubtitle') }}</label>
          <input v-model="songSubtitle" type="text" class="modal-input" />

          <label class="modal-label">{{ t('editor.metaGenre') }}</label>
          <input v-model="songGenre" type="text" class="modal-input" />

          <!-- Music Source -->
          <label class="modal-label">{{ t('select.musicSource') }}</label>
          <div class="path-row">
            <input
              v-model="musicSourcePath"
              type="text"
              class="modal-input path-input"
              :placeholder="t('select.defaultMusicHint')"
            />
            <button class="path-btn" @click="pickMusic">{{ t('common.browse') }}</button>
            <button class="path-btn" @click="clearMusic">{{ t('common.clear') }}</button>
          </div>

          <!-- Cover Source -->
          <label class="modal-label">{{ t('select.coverSource') }}</label>
          <div class="path-row">
            <input
              v-model="coverSourcePath"
              type="text"
              class="modal-input path-input"
              :placeholder="t('select.defaultCoverHint')"
            />
            <button class="path-btn" @click="pickCover">{{ t('common.browse') }}</button>
            <button class="path-btn" @click="clearCover">{{ t('common.clear') }}</button>
          </div>

          <!-- Background Source -->
          <label class="modal-label">{{ t('select.backgroundSource') }}</label>
          <div class="path-row">
            <input
              v-model="backgroundSourcePath"
              type="text"
              class="modal-input path-input"
              :placeholder="t('select.defaultBackgroundHint')"
            />
            <button class="path-btn" @click="pickBackground">{{ t('common.browse') }}</button>
            <button class="path-btn" @click="clearBackground">{{ t('common.clear') }}</button>
          </div>

          <p class="modal-section-hint">{{ t('select.timingDefaultsHint') }}</p>

          <label class="modal-label">{{ t('select.createInitialBpm') }}</label>
          <input
            v-model.number="songBpm"
            type="number"
            class="modal-input"
            min="20"
            max="999"
            step="0.001"
            placeholder="120"
          />

          <label class="modal-label">{{ t('editor.metaOffset') }}</label>
          <input
            v-model.number="songOffset"
            type="number"
            class="modal-input"
            step="0.001"
            placeholder="0"
          />

          <!-- Chart creation checkbox -->
          <label class="modal-label check-label">
            <input type="checkbox" v-model="createChart" class="modal-checkbox" />
            {{ t('songPacks.createInitialChart') }}
          </label>

          <!-- Chart fields (only when createChart is true) -->
          <template v-if="createChart">
            <label class="modal-label">{{ t('editor.stepsType') }}</label>
            <select v-model="songStepsType" class="modal-input">
              <option v-for="opt in stepsTypeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>

            <label class="modal-label">{{ t('editor.difficulty') }}</label>
            <select v-model="songDifficulty" class="modal-input">
              <option v-for="opt in difficultyOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>

            <label class="modal-label">{{ t('editor.meter') }}</label>
            <input
              v-model.number="songMeter"
              type="number"
              class="modal-input"
              min="1"
              max="20"
            />
          </template>

          <div class="modal-actions">
            <button class="modal-btn" @click="handleClose">{{ t('cancel') }}</button>
            <button
              class="modal-btn primary"
              :disabled="!songTitle.trim()"
              @click="handleConfirm"
            >
              {{ t('songPacks.import') }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700&display=swap');

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
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
  box-sizing: border-box;
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

.check-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-top: 0.65rem;
  font-size: 0.8rem;
}

.modal-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--primary-color);
  vertical-align: middle;
  margin-right: 0.4rem;
  cursor: pointer;
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
  cursor: pointer;
}

.modal-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 20%, transparent);
}

.modal-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
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
  font-family: 'Rajdhani', sans-serif;
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

.modal-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
