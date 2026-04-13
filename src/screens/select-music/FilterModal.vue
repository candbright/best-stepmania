<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "@/i18n";
import { useModalBottomHintLayout } from "@/composables/useModalBottomHintLayout";

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
</script>

<template>
  <Teleport to="body">
    <div ref="modalMaskRef" class="modal-mask">
      <div class="modal-mask-fill" @click.self="emit('close')">
      <div ref="modalCardRef" class="filter-modal">
        <div class="modal-header">
          <span class="modal-title">{{ t('select.filter') }}</span>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>

        <div class="modal-body">
          <label class="modal-label">{{ t('select.searchPlaceholder') }}</label>
          <input
            v-model="localSearch"
            class="modal-input"
            :placeholder="t('select.searchPlaceholder')"
            @keydown.enter="apply"
            autofocus
          />

          <label class="modal-label">{{ t('select.filterDifficulty') }}</label>
          <div class="diff-row">
            <input
              v-model.number="localDiffMin"
              class="modal-input diff-input"
              type="number"
              :placeholder="t('select.filterDiffMinPlaceholder')"
              min="1"
              max="99"
            />
            <span class="diff-sep">~</span>
            <input
              v-model.number="localDiffMax"
              class="modal-input diff-input"
              type="number"
              :placeholder="t('select.filterDiffMaxPlaceholder')"
              min="1"
              max="99"
            />
          </div>

          <label class="modal-label">{{ t('select.filterPack') }}</label>
          <select v-model="localPack" class="modal-input">
            <option value="">—</option>
            <option v-for="p in existingPacks" :key="p" :value="p">{{ p }}</option>
          </select>

          <template v-if="showStepsTypeFilter">
            <label class="modal-label">{{ t('select.filterStepsType') }}</label>
            <select v-model="localStepsType" class="modal-input">
              <option value="">{{ t('select.filterStepsTypeAll') }}</option>
              <option
                v-for="st in STEPS_TYPE_OPTIONS"
                :key="st"
                :value="st"
              >
                {{ stepsTypeOptionLabel(st) }}
              </option>
            </select>
          </template>
        </div>

        <div class="modal-footer">
          <button class="modal-btn" @click="clearAll" :disabled="!hasActiveFilter">
            {{ t('select.clearFilter') }}
          </button>
          <button class="modal-btn primary" @click="apply">
            {{ t('confirm') }}
          </button>
        </div>
      </div>
      </div>
      <p v-if="hintVisible" class="modal-mask-hint">{{ bottomHint }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700;900&display=swap');

.modal-mask {
  position: fixed; inset: 0; z-index: 200;
  background: color-mix(in srgb, var(--bg-color) 45%, #000);
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.15s ease;
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
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.filter-modal {
  width: min(420px, calc(100vw - 2rem));
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-color) 96%, var(--surface-elevated));
  border: 1px solid color-mix(in srgb, var(--primary-color) 32%, var(--border-color));
  font-family: 'Rajdhani', sans-serif;
  color: var(--text-color);
  box-shadow: 0 24px 80px color-mix(in srgb, var(--bg-color) 40%, #000);
  animation: slideUp 0.2s ease;
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
}
.modal-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.85rem;
  letter-spacing: 0.1em;
  color: var(--text-color);
}
.close-btn {
  background: none; border: none;
  color: var(--text-subtle);
  font-size: 1.1rem; cursor: pointer; padding: 0 0.25rem;
}
.close-btn:hover { color: var(--text-color); }

.modal-body { padding: 0.75rem 1.25rem; }

.modal-label {
  display: block; margin-top: 0.75rem; margin-bottom: 0.3rem;
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.08em; text-transform: uppercase;
}

.modal-input {
  width: 100%; padding: 0.45rem 0.65rem; border-radius: 7px;
  border: 1px solid var(--border-color);
  background: var(--surface-elevated);
  color: var(--text-color);
  font-family: 'Rajdhani', sans-serif; font-size: 0.88rem;
  box-sizing: border-box; outline: none;
}
.modal-input:focus {
  border-color: var(--primary-color);
  box-shadow: var(--focus-ring);
}
.modal-input::placeholder { color: var(--text-subtle); }
.modal-input::-webkit-inner-spin-button { opacity: 0.4; }

.diff-row {
  display: flex; align-items: center; gap: 0.5rem;
}
.diff-input { flex: 1; text-align: center; }
.diff-sep { color: var(--text-subtle); font-size: 0.9rem; user-select: none; }

.modal-footer {
  display: flex; justify-content: space-between; gap: 0.5rem;
  padding: 0.75rem 1.25rem 1rem;
  border-top: 1px solid var(--border-color);
}
.modal-btn {
  padding: 0.45rem 0.9rem; border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--section-bg);
  color: var(--text-muted);
  cursor: pointer; font-family: 'Rajdhani', sans-serif; font-size: 0.85rem; font-weight: 600;
  transition: all 0.15s;
}
.modal-btn:hover:not(:disabled) { background: var(--surface-elevated); color: var(--text-color); }
.modal-btn.primary {
  border: none;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-color-hover) 100%);
  color: var(--text-color);
  margin-left: auto;
  box-shadow: 0 4px 16px var(--primary-color-glow);
}
.modal-btn.primary:hover { filter: brightness(1.12); }
.modal-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
