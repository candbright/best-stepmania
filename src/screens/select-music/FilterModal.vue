<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "@/i18n";
import BaseFormModal from "@/shared/ui/BaseFormModal.vue";
import BaseSelect from "@/shared/ui/BaseSelect.vue";
import BaseNumberField from "@/shared/ui/BaseNumberField.vue";

/** Same three modes as TitleScreen → enter game (pump only; no dance charts in this flow). */
const STEPS_TYPE_OPTIONS = ["pump-single", "pump-double", "pump-routine"] as const;

const props = withDefaults(
  defineProps<{
    diffMin: number | null;
    diffMax: number | null;
    searchQuery: string;
    filterPack: string;
    existingPacks: string[];
    /** When true, show steps-type filter (editor song select). */
    showStepsTypeFilter?: boolean;
    filterStepsType?: string;
    /** Shown below the dialog card, above the screen bottom (e.g. keyboard hint). */
    bottomHint?: string;
    showFavoritesOnly?: boolean;
  }>(),
  {
    showStepsTypeFilter: false,
    filterStepsType: "",
    bottomHint: "",
    showFavoritesOnly: false,
  },
);

const emit = defineEmits<{
  (e: "update:diffMin", v: number | null): void;
  (e: "update:diffMax", v: number | null): void;
  (e: "update:searchQuery", v: string): void;
  (e: "update:filterPack", v: string): void;
  (e: "update:filterStepsType", v: string): void;
  (e: "update:showFavoritesOnly", v: boolean): void;
  (e: "apply"): void;
  (e: "clear"): void;
  (e: "close"): void;
}>();

const { t } = useI18n();

const localDiffMin = ref<number | null>(props.diffMin);
const localDiffMax = ref<number | null>(props.diffMax);
const localSearch = ref(props.searchQuery);
const localPack = ref(props.filterPack);
const localStepsType = ref(props.filterStepsType);
const localShowFavoritesOnly = ref(props.showFavoritesOnly);

const hasActiveFilter = computed(() => {
  const steps = props.showStepsTypeFilter && localStepsType.value.trim() !== "";
  return (
    localDiffMin.value !== null ||
    localDiffMax.value !== null ||
    localSearch.value.trim() !== "" ||
    localPack.value !== "" ||
    steps ||
    localShowFavoritesOnly.value
  );
});

function apply() {
  emit("update:diffMin", localDiffMin.value);
  emit("update:diffMax", localDiffMax.value);
  emit("update:searchQuery", localSearch.value.trim());
  emit("update:filterPack", localPack.value);
  emit("update:filterStepsType", localStepsType.value.trim());
  emit("update:showFavoritesOnly", localShowFavoritesOnly.value);
  emit("apply");
  emit("close");
}

function clearAll() {
  localDiffMin.value = null;
  localDiffMax.value = null;
  localSearch.value = "";
  localPack.value = "";
  localStepsType.value = "";
  localShowFavoritesOnly.value = false;
  emit("clear");
}

function stepsTypeOptionLabel(st: string): string {
  const key = `stepsType.${st}`;
  const translated = t(key);
  return translated === key ? st : translated;
}

const packFilterOptions = computed(() => [
  { label: "—", value: "" },
  ...props.existingPacks.map((p) => ({ label: p, value: p })),
]);

const stepsTypeFilterOptions = computed(() => [
  { label: t("select.filterStepsTypeAll"), value: "" },
  ...STEPS_TYPE_OPTIONS.map((st) => ({
    value: st,
    label: stepsTypeOptionLabel(st),
  })),
]);
</script>

<template>
  <BaseFormModal
    :model-value="true"
    :title="t('select.filter')"
    :bottom-hint="bottomHint"
    width="min(500px, 92vw)"
    :close-on-esc="true"
    :close-on-overlay="true"
    @close="emit('close')"
  >
    <div class="filter-form">
      <label class="form-modal-label">{{ t('select.searchPlaceholder') }}</label>
      <input
        v-model="localSearch"
        class="form-modal-input"
        :placeholder="t('select.searchPlaceholder')"
        @keydown.enter="apply"
        autofocus
      />

      <label class="form-modal-label">{{ t('select.filterDifficulty') }}</label>
      <div class="form-modal-diff-row">
        <BaseNumberField
          v-model="localDiffMin"
          nullable
          input-class="form-modal-input form-modal-diff-input"
          :placeholder="t('select.filterDiffMinPlaceholder')"
          :min="1"
          :max="99"
        />
        <span class="form-modal-diff-sep">~</span>
        <BaseNumberField
          v-model="localDiffMax"
          nullable
          input-class="form-modal-input form-modal-diff-input"
          :placeholder="t('select.filterDiffMaxPlaceholder')"
          :min="1"
          :max="99"
        />
      </div>

      <label class="form-modal-label">{{ t('select.filterPack') }}</label>
      <BaseSelect v-model="localPack" variant="form" :options="packFilterOptions" />

      <label class="form-modal-label form-modal-label--switch">{{ t('select.onlyFavorites') }}</label>
      <label class="slide-switch slide-switch--spaced">
        <input v-model="localShowFavoritesOnly" type="checkbox" class="slide-switch-input" />
        <span class="slide-switch-track">
          <span class="slide-switch-thumb" />
        </span>
      </label>

      <template v-if="showStepsTypeFilter">
        <label class="form-modal-label">{{ t('select.filterStepsType') }}</label>
        <BaseSelect v-model="localStepsType" variant="form" :options="stepsTypeFilterOptions" />
      </template>
    </div>

    <template #footer>
      <div class="form-modal-footer-inner form-modal-footer-inner--spread">
        <button type="button" class="form-modal-btn" @click="clearAll" :disabled="!hasActiveFilter">
          {{ t('select.clearFilter') }}
        </button>
        <button type="button" class="form-modal-btn form-modal-btn--primary" @click="apply">
          {{ t('confirm') }}
        </button>
      </div>
    </template>
  </BaseFormModal>
</template>

<style scoped>
.filter-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-modal-label--switch {
  margin-top: 0.25rem;
}

.slide-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}

.slide-switch--spaced {
  margin-bottom: 0.25rem;
}

.slide-switch-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  margin: 0;
  cursor: pointer;
}

.slide-switch-track {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border-color) 78%, var(--section-bg));
  border: 1px solid var(--border-color);
  transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
  display: flex;
  align-items: center;
  padding: 2px;
  box-sizing: border-box;
}

.slide-switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-muted);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.32);
  transform: translateX(0);
  transition: transform 0.18s, background 0.18s, box-shadow 0.18s;
}

.slide-switch-input:checked + .slide-switch-track {
  background: color-mix(in srgb, var(--primary-color) 26%, var(--section-bg));
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 18%, transparent);
}

.slide-switch-input:checked + .slide-switch-track .slide-switch-thumb {
  transform: translateX(20px);
  background: var(--primary-color);
  box-shadow: 0 0 10px var(--primary-color-glow);
}

.slide-switch-input:focus-visible + .slide-switch-track {
  box-shadow: var(--focus-ring);
}
</style>
