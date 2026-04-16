<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useI18n } from "@/i18n";
import { openFileDialog } from "@/utils/platform";
import type { SongPackInfo } from "@/utils/api";
import { BaseModal } from "@/shared/ui";
import { BaseSelect } from "@/shared/ui";
import { BaseNumberField } from "@/shared/ui";

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
  { name: ROOT_PACK_ID, label: t("songPacks.packRoot") },
  ...props.packs.map((p) => ({ name: p.name, label: p.name })),
]);

const packSelectDropdownOptions = computed(() =>
  packOptions.value.map((o) => ({ value: o.name, label: o.label })),
);

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

function onOpenChange(open: boolean) {
  if (!open) handleClose();
}
</script>

<template>
  <BaseModal
    :model-value="show"
    :title="t('songPacks.fillSongInfo')"
    width="min(520px, 92vw)"
    :body-scrollable="true"
    @update:model-value="onOpenChange"
  >
    <div class="form-modal-fields">
      <label class="form-modal-label">{{ t('songPacks.targetPack') }}</label>
      <BaseSelect v-model="selectedPack" variant="form" :options="packSelectDropdownOptions" />

      <label class="form-modal-label">{{ t('editor.metaTitle') }} *</label>
      <input
        v-model="songTitle"
        type="text"
        class="form-modal-input"
        :placeholder="t('songPacks.songTitlePlaceholder')"
      />

      <label class="form-modal-label">{{ t('editor.metaArtist') }}</label>
      <input
        v-model="songArtist"
        type="text"
        class="form-modal-input"
        :placeholder="t('songPacks.songArtistPlaceholder')"
      />

      <label class="form-modal-label">{{ t('editor.metaSubtitle') }}</label>
      <input v-model="songSubtitle" type="text" class="form-modal-input" />

      <label class="form-modal-label">{{ t('editor.metaGenre') }}</label>
      <input v-model="songGenre" type="text" class="form-modal-input" />

      <label class="form-modal-label">{{ t('select.musicSource') }}</label>
      <div class="form-modal-path-row">
        <input
          v-model="musicSourcePath"
          type="text"
          class="form-modal-input form-modal-path-input"
          :placeholder="t('select.defaultMusicHint')"
        />
        <button type="button" class="form-modal-path-btn" @click="pickMusic">{{ t('common.browse') }}</button>
        <button type="button" class="form-modal-path-btn" @click="clearMusic">{{ t('common.clear') }}</button>
      </div>

      <label class="form-modal-label">{{ t('select.coverSource') }}</label>
      <div class="form-modal-path-row">
        <input
          v-model="coverSourcePath"
          type="text"
          class="form-modal-input form-modal-path-input"
          :placeholder="t('select.defaultCoverHint')"
        />
        <button type="button" class="form-modal-path-btn" @click="pickCover">{{ t('common.browse') }}</button>
        <button type="button" class="form-modal-path-btn" @click="clearCover">{{ t('common.clear') }}</button>
      </div>

      <label class="form-modal-label">{{ t('select.backgroundSource') }}</label>
      <div class="form-modal-path-row">
        <input
          v-model="backgroundSourcePath"
          type="text"
          class="form-modal-input form-modal-path-input"
          :placeholder="t('select.defaultBackgroundHint')"
        />
        <button type="button" class="form-modal-path-btn" @click="pickBackground">{{ t('common.browse') }}</button>
        <button type="button" class="form-modal-path-btn" @click="clearBackground">{{ t('common.clear') }}</button>
      </div>

      <p class="form-modal-hint">{{ t('select.timingDefaultsHint') }}</p>

      <label class="form-modal-label">{{ t('select.createInitialBpm') }}</label>
      <BaseNumberField
        v-model="songBpm"
        input-class="form-modal-input"
        :min="20"
        :max="999"
        step="0.001"
        placeholder="120"
      />

      <label class="form-modal-label">{{ t('editor.metaOffset') }}</label>
      <BaseNumberField v-model="songOffset" input-class="form-modal-input" step="0.001" placeholder="0" />

      <div class="form-modal-check">
        <span>{{ t('songPacks.createInitialChart') }}</span>
        <label class="toggle-switch">
          <input type="checkbox" v-model="createChart" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <template v-if="createChart">
        <label class="form-modal-label">{{ t('editor.stepsType') }}</label>
        <BaseSelect v-model="songStepsType" variant="form" :options="stepsTypeOptions" />

        <label class="form-modal-label">{{ t('editor.difficulty') }}</label>
        <BaseSelect v-model="songDifficulty" variant="form" :options="difficultyOptions" />

        <label class="form-modal-label">{{ t('editor.meter') }}</label>
        <BaseNumberField v-model="songMeter" input-class="form-modal-input" :min="1" :max="20" />
      </template>
    </div>

    <template #footer>
      <div class="form-modal-footer-inner">
        <button type="button" class="form-modal-btn" @click="handleClose">{{ t('cancel') }}</button>
        <button
          type="button"
          class="form-modal-btn form-modal-btn--primary"
          :disabled="!songTitle.trim()"
          @click="handleConfirm"
        >
          {{ t('songPacks.import') }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.form-modal-check {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.toggle-switch { position: relative; width: 36px; height: 20px; cursor: pointer; flex-shrink: 0; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: rgba(255,255,255,0.1); border-radius: 22px; transition: 0.2s; }
.toggle-slider::before { content: ""; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: rgba(255,255,255,0.5); border-radius: 50%; transition: 0.2s; }
.toggle-switch input:checked + .toggle-slider { background: var(--primary-color); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); background: var(--text-on-primary); }
</style>
