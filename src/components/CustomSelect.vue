<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

type SelectValue = string | number;

const props = withDefaults(
  defineProps<{
    modelValue: SelectValue;
    options: Array<{ label: string; value: SelectValue; disabled?: boolean }>;
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  {
    disabled: false,
    ariaLabel: "",
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: SelectValue): void;
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

const selectedOption = computed(() => props.options.find((o) => o.value === props.modelValue));
const activeIndex = ref(-1);

function closeMenu() {
  open.value = false;
}

function openMenu() {
  if (props.disabled) return;
  open.value = true;
  const idx = props.options.findIndex((o) => o.value === props.modelValue && !o.disabled);
  activeIndex.value = idx >= 0 ? idx : props.options.findIndex((o) => !o.disabled);
}

function toggleMenu() {
  if (open.value) {
    closeMenu();
  } else {
    openMenu();
  }
}

function selectOption(value: SelectValue, disabled?: boolean) {
  if (disabled) return;
  emit("update:modelValue", value);
  closeMenu();
}

function onDocumentPointerDown(e: PointerEvent) {
  const root = rootRef.value;
  if (!root) return;
  const target = e.target as Node | null;
  if (target && !root.contains(target)) closeMenu();
}

function moveActive(delta: number) {
  if (!open.value) return;
  const enabled = props.options
    .map((o, idx) => ({ ...o, idx }))
    .filter((o) => !o.disabled);
  if (!enabled.length) return;

  const current = enabled.findIndex((o) => o.idx === activeIndex.value);
  const next = current < 0 ? 0 : (current + delta + enabled.length) % enabled.length;
  activeIndex.value = enabled[next]!.idx;
  nextTick(() => {
    const list = listRef.value;
    const item = list?.querySelector<HTMLElement>(`[data-option-idx="${activeIndex.value}"]`);
    item?.scrollIntoView({ block: "nearest" });
  });
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (props.disabled) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleMenu();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value) openMenu();
    moveActive(1);
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) openMenu();
    moveActive(-1);
  }
}

function onListKeydown(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeMenu();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveActive(1);
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    moveActive(-1);
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (activeIndex.value >= 0) {
      const option = props.options[activeIndex.value];
      if (option) selectOption(option.value, option.disabled);
    }
  }
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  nextTick(() => listRef.value?.focus());
});

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown, { capture: true });
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown, { capture: true });
});
</script>

<template>
  <div ref="rootRef" class="custom-select" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <button
      type="button"
      class="custom-select-trigger"
      :disabled="disabled"
      :aria-label="ariaLabel || undefined"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <span class="custom-select-label">{{ selectedOption?.label ?? "" }}</span>
      <span class="custom-select-caret">▾</span>
    </button>

    <ul
      v-if="open"
      ref="listRef"
      class="custom-select-menu"
      role="listbox"
      tabindex="-1"
      @keydown="onListKeydown"
    >
      <li
        v-for="(option, idx) in options"
        :key="`${option.value}`"
        class="custom-select-option"
        :class="{
          'is-selected': option.value === modelValue,
          'is-active': idx === activeIndex,
          'is-disabled': option.disabled,
        }"
        :data-option-idx="idx"
        role="option"
        :aria-selected="option.value === modelValue"
        @click="selectOption(option.value, option.disabled)"
        @mousemove="activeIndex = idx"
      >
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
  min-width: 160px;
}

.custom-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 76%, white 24%);
  color: var(--text-color);
  font-weight: 600;
  font-size: 0.82rem;
  line-height: 1.08;
}

.custom-select-trigger:disabled {
  opacity: 0.55;
}

.custom-select-caret {
  opacity: 0.9;
  font-size: 0.75rem;
}

.custom-select-menu {
  position: absolute;
  z-index: 1200;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  max-height: 240px;
  overflow: auto;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 82%, black 18%);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.34);
  padding: 0.35rem;
  list-style: none;
}

.custom-select-option {
  padding: 0.46rem 0.56rem;
  border-radius: 8px;
  color: var(--text-color);
  font-size: 0.86rem;
}

.custom-select-option.is-active,
.custom-select-option.is-selected {
  background: color-mix(in srgb, var(--primary-color) 26%, transparent);
  color: color-mix(in srgb, var(--text-color) 88%, var(--primary-color) 12%);
}

.custom-select-option.is-disabled {
  opacity: 0.45;
}
</style>
