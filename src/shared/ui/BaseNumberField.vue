<script setup lang="ts">
import { ref, watch } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    nullable?: boolean;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    disabled?: boolean;
    placeholder?: string;
    inputmode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
    /** Merged onto the outer host (e.g. form-modal-input) so focus ring matches native fields. */
    inputClass?: string;
    /** When false, parent updates only on blur (matches native @change-style flows). */
    emitWhileTyping?: boolean;
    /** Hide +/- steppers (rare compact fields). */
    hideSteppers?: boolean;
  }>(),
  {
    nullable: false,
    inputClass: "",
    emitWhileTyping: true,
    hideSteppers: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: number | null];
  step: [direction: 1 | -1];
}>();

const isFocused = ref(false);
const text = ref("");

function syncTextFromModel() {
  const v = props.modelValue;
  if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) {
    text.value = "";
    return;
  }
  text.value = String(v);
}

watch(
  () => props.modelValue,
  () => {
    if (isFocused.value) return;
    syncTextFromModel();
  },
  { immediate: true },
);

function numericStep(): number {
  const s = props.step;
  if (s === undefined || s === "") return 1;
  const n = typeof s === "number" ? s : parseFloat(String(s));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseBound(v: number | string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function clamp(n: number): number {
  let x = n;
  const lo = parseBound(props.min);
  const hi = parseBound(props.max);
  if (lo !== undefined) x = Math.max(x, lo);
  if (hi !== undefined) x = Math.min(x, hi);
  return x;
}

function normalizeFloat(n: number): number {
  return parseFloat(n.toPrecision(12));
}

function baseForStep(): number {
  if (props.modelValue !== null && Number.isFinite(props.modelValue)) {
    return props.modelValue;
  }
  const lo = parseBound(props.min);
  if (lo !== undefined) return lo;
  return 0;
}

function onStepPointerDown(e: PointerEvent, direction: 1 | -1) {
  e.preventDefault();
  e.stopPropagation();
  emit("step", direction);
  stepBy(direction);
}

function stepBy(direction: 1 | -1) {
  if (props.disabled) return;
  const st = numericStep();
  const raw = baseForStep() + st * direction;
  let next = normalizeFloat(raw);
  next = clamp(next);
  emit("update:modelValue", next);
  if (isFocused.value) {
    text.value = String(next);
  } else {
    syncTextFromModel();
  }
}

function onFocus() {
  isFocused.value = true;
  syncTextFromModel();
}

function isIntermediateRaw(raw: string): boolean {
  return raw === "" || raw === "-" || raw === "+" || raw === "." || raw === "-." || raw === "+.";
}

function parseCompleteRaw(raw: string): number | null {
  const trimmed = raw.trim();
  if (isIntermediateRaw(trimmed)) return null;
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function emitFromRaw(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "+") {
    if (props.nullable) emit("update:modelValue", null);
    return;
  }
  const n = parseCompleteRaw(trimmed);
  if (n !== null) emit("update:modelValue", clamp(normalizeFloat(n)));
}

function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value;
  if (props.emitWhileTyping) emitFromRaw(text.value);
}

function onBlur() {
  isFocused.value = false;
  const trimmed = text.value.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "+") {
    if (props.nullable) {
      emit("update:modelValue", null);
    } else {
      const fb = props.min !== undefined && props.min !== "" ? Number(props.min) : 0;
      emit("update:modelValue", Number.isFinite(fb) ? clamp(fb) : 0);
    }
  } else {
    const n = parseCompleteRaw(trimmed);
    if (n === null) {
      if (props.nullable) {
        emit("update:modelValue", null);
      } else {
        const fb = props.min !== undefined && props.min !== "" ? Number(props.min) : 0;
        emit("update:modelValue", Number.isFinite(fb) ? clamp(fb) : 0);
      }
    } else {
      emit("update:modelValue", clamp(normalizeFloat(n)));
    }
  }
  syncTextFromModel();
}
</script>

<template>
  <div
    :class="['app-number-field-host', inputClass]"
  >
    <input
      type="text"
      v-bind="$attrs"
      class="app-number-field-native"
      :value="text"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :placeholder="placeholder"
      :inputmode="inputmode"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
    />
    <div v-if="!hideSteppers && !disabled" class="app-number-spin" aria-hidden="true">
      <button
        type="button"
        class="app-number-spin-btn"
        data-sfx="move"
        tabindex="-1"
        @pointerdown="onStepPointerDown($event, 1)"
      >
        +
      </button>
      <button
        type="button"
        class="app-number-spin-btn"
        data-sfx="move"
        tabindex="-1"
        @pointerdown="onStepPointerDown($event, -1)"
      >
        −
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-number-field-host {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  gap: 0;
}

.app-number-field-native {
  flex: 1;
  min-width: 0;
  margin: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: inherit;
  font-weight: inherit;
  font-family: inherit;
  line-height: inherit;
  outline: none;
  box-shadow: none;
  padding: 0;
  /* Native spinners use OS cursor; remove them. */
  appearance: textfield;
  -moz-appearance: textfield;
}

.app-number-field-native::-webkit-outer-spin-button,
.app-number-field-native::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.app-number-field-host:focus-within {
  border-color: var(--primary-color);
  box-shadow: var(--focus-ring);
}

.app-number-spin {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  overflow: hidden;
}

.app-number-spin-btn {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 0.35rem;
  border: none;
  background: color-mix(in srgb, var(--surface-elevated, rgba(255, 255, 255, 0.04)) 55%, transparent);
  color: color-mix(in srgb, var(--text-color) 72%, transparent);
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-number-spin-btn + .app-number-spin-btn {
  border-top: 1px solid var(--border-color);
}

.app-number-spin-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary-color) 18%, transparent);
  color: var(--text-color);
}

.app-number-spin-btn:active:not(:disabled) {
  background: color-mix(in srgb, var(--primary-color) 28%, transparent);
}
</style>
