<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useI18n } from "@/i18n";
import { useModalBottomHintLayout } from "@/composables/useModalBottomHintLayout";
import CustomSelect from "@/components/CustomSelect.vue";
import AppNumberField from "@/components/AppNumberField.vue";

/** Same three modes as TitleScreen → enter game (pump only; no dance charts in this flow). */
const STEPS_TYPE_OPTIONS = [
  "pump-single",
  "pump-double",
  "pump-routine",
] as const;

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
  }>(),
  {
    showStepsTypeFilter: false,
    filterStepsType: "",
    bottomHint: "",
  },
);

const emit = defineEmits<{
  (e: "update:diffMin", v: number | null): void;
  (e: "update:diffMax", v: number | null): void;
  (e: "update:searchQuery", v: string): void;
  (e: "update:filterPack", v: string): void;
  (e: "update:filterStepsType", v: string): void;
  (e: "apply"): void;
  (e: "clear"): void;
  (e: "close"): void;
}>();

const { t } = useI18n();

const modalMaskRef = ref<HTMLElement | null>(null);
const modalCardRef = ref<HTMLElement | null>(null);
const overlayActive = ref(true);
const { hintVisible } = useModalBottomHintLayout(modalMaskRef, modalCardRef, {
  active: overlayActive,
  hasHint: () => props.bottomHint.trim().length > 0,
});

const localDiffMin = ref<number | null>(props.diffMin);
const localDiffMax = ref<number | null>(props.diffMax);
const localSearch = ref(props.searchQuery);
const localPack = ref(props.filterPack);
const localStepsType = ref(props.filterStepsType);

const hasActiveFilter = computed(() => {
  const steps =
    props.showStepsTypeFilter && localStepsType.value.trim() !== "";
  return (
    localDiffMin.value !== null ||
    localDiffMax.value !== null ||
    localSearch.value.trim() !== "" ||
    localPack.value !== "" ||
    steps
  );
});

// Real-time updates - emit changes immediately
watch(localSearch, (v) => emit("update:searchQuery", v.trim()));
watch(localPack, (v) => emit("update:filterPack", v));
watch(localDiffMin, (v) => emit("update:diffMin", v));
watch(localDiffMax, (v) => emit("update:diffMax", v));
watch(localStepsType, (v) => emit("update:filterStepsType", v.trim()));

function apply() {
  emit("apply");
  emit("close");
}

function clearAll() {
  localDiffMin.value = null;
  localDiffMax.value = null;
  localSearch.value = "";
  localPack.value = "";
  localStepsType.value = "";
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

/** 捕获阶段优先于 App 全局 Esc，只关弹框不触发选歌页返回 */
function onEscKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  emit("close");
}

onMounted(() => {
  window.addEventListener("keydown", onEscKey, true);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onEscKey, true);
});
</script>

<template>
  <Teleport to="body">
    <div ref="modalMaskRef" class="form-modal-mask">
      <div class="form-modal-mask-fill" @click.self="emit('close')">
        <div ref="modalCardRef" class="form-modal-shell form-modal-card">
          <header class="form-modal-header">
            <span class="form-modal-title">{{ t('select.filter') }}</span>
            <button type="button" class="form-modal-close" @click="emit('close')">×</button>
          </header>

          <div class="form-modal-body">
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
              <AppNumberField
                v-model="localDiffMin"
                nullable
                input-class="form-modal-input form-modal-diff-input"
                :placeholder="t('select.filterDiffMinPlaceholder')"
                :min="1"
                :max="99"
              />
              <span class="form-modal-diff-sep">~</span>
              <AppNumberField
                v-model="localDiffMax"
                nullable
                input-class="form-modal-input form-modal-diff-input"
                :placeholder="t('select.filterDiffMaxPlaceholder')"
                :min="1"
                :max="99"
              />
            </div>

            <label class="form-modal-label">{{ t('select.filterPack') }}</label>
            <CustomSelect v-model="localPack" variant="form" :options="packFilterOptions" />

            <template v-if="showStepsTypeFilter">
              <label class="form-modal-label">{{ t('select.filterStepsType') }}</label>
              <CustomSelect v-model="localStepsType" variant="form" :options="stepsTypeFilterOptions" />
            </template>
          </div>

          <footer class="form-modal-footer">
            <div class="form-modal-footer-inner form-modal-footer-inner--spread">
              <button type="button" class="form-modal-btn" @click="clearAll" :disabled="!hasActiveFilter">
                {{ t('select.clearFilter') }}
              </button>
              <button type="button" class="form-modal-btn form-modal-btn--primary" @click="apply">
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
