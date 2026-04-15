<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

type SelectValue = string | number;

const props = withDefaults(
  defineProps<{
    modelValue: SelectValue;
    options: Array<{ label: string; value: SelectValue; disabled?: boolean }>;
    disabled?: boolean;
    ariaLabel?: string;
    /** Visual style: default (rounded panel), form (modal fields), compact (editor toolbar). */
    variant?: "default" | "form" | "compact";
  }>(),
  {
    disabled: false,
    ariaLabel: "",
    variant: "default",
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: SelectValue): void;
  (e: "triggerKeydown", ev: KeyboardEvent): void;
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});
const menuPlacement = ref<"down" | "up">("down");

const selectedOption = computed(() => props.options.find((o) => o.value === props.modelValue));
const activeIndex = ref(-1);

function closeMenu() {
  open.value = false;
}

function openMenu() {
  if (props.disabled) return;
  open.value = true;
  activeIndex.value = enabledSelectedIndex();
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

function layoutMenu() {
  const trigger = rootRef.value?.querySelector<HTMLElement>(".custom-select-trigger");
  const menu = listRef.value;
  if (!trigger) return;

  const r = trigger.getBoundingClientRect();
  const gap = 6;
  const viewportHeight = window.innerHeight;
  const fallbackMaxHeight = 240;
  const menuHeight = menu?.scrollHeight ?? fallbackMaxHeight;

  const spaceBelow = viewportHeight - r.bottom - gap;
  const spaceAbove = r.top - gap;
  const shouldOpenUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

  menuPlacement.value = shouldOpenUp ? "up" : "down";

  const maxHeight = Math.max(120, Math.min(menuHeight, shouldOpenUp ? spaceAbove : spaceBelow, fallbackMaxHeight));
  const actualMenuHeight = Math.min(menuHeight, maxHeight);

  menuStyle.value = {
    position: "fixed",
    left: `${r.left}px`,
    top: shouldOpenUp
      ? `${r.top - gap - actualMenuHeight}px`
      : `${r.bottom + gap}px`,
    width: `${r.width}px`,
    maxHeight: `${maxHeight}px`,
    "z-index": "14000",
  };
}

function onWindowReposition() {
  if (open.value) layoutMenu();
}

function onDocumentPointerDown(e: PointerEvent) {
  const root = rootRef.value;
  const menu = listRef.value;
  if (!root) return;
  const target = e.target as Node | null;
  if (!target) return;
  if (root.contains(target)) return;
  if (menu?.contains(target)) return;
  closeMenu();
}

function enabledSelectedIndex(): number {
  const idx = props.options.findIndex((o) => o.value === props.modelValue && !o.disabled);
  if (idx >= 0) return idx;
  return props.options.findIndex((o) => !o.disabled);
}

function onOptionPointerMove(idx: number) {
  if (props.options[idx]?.disabled) return;
  activeIndex.value = idx;
}

/** 指针离开列表时高亮回到当前选中项（与原生 select 一致） */
function onMenuPointerLeave() {
  activeIndex.value = enabledSelectedIndex();
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
  emit("triggerKeydown", e);
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
  nextTick(() => {
    layoutMenu();
    listRef.value?.focus();
  });
});

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown, { capture: true });
  window.addEventListener("scroll", onWindowReposition, true);
  window.addEventListener("resize", onWindowReposition);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown, { capture: true });
  window.removeEventListener("scroll", onWindowReposition, true);
  window.removeEventListener("resize", onWindowReposition);
});
</script>

<template>
  <div
    ref="rootRef"
    class="custom-select"
    :class="[`custom-select--${variant}`, { 'is-open': open, 'is-disabled': disabled }]"
  >
    <button
      type="button"
      class="custom-select-trigger"
      data-sfx="move"
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

    <Teleport to="body">
      <ul
        v-if="open"
        ref="listRef"
        class="custom-select-menu"
        :class="[`custom-select-menu--${menuPlacement}`]"
        :style="menuStyle"
        role="listbox"
        tabindex="-1"
        @keydown="onListKeydown"
        @pointerleave="onMenuPointerLeave"
      >
        <li
          v-for="(option, idx) in options"
          :key="`${option.value}`"
          class="custom-select-option"
          :class="{
            'is-active': idx === activeIndex,
            'is-disabled': option.disabled,
          }"
          :data-option-idx="idx"
          role="option"
          :aria-selected="option.value === modelValue"
          @click="selectOption(option.value, option.disabled)"
          @pointermove="onOptionPointerMove(idx)"
        >
          {{ option.label }}
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
  /* Wider than the old 160px cap so settings rows match native <select> comfort. */
  min-width: 12rem;
}

.custom-select--form {
  width: 100%;
  min-width: 0;
}

.custom-select--compact {
  min-width: 0;
}

.custom-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  box-sizing: border-box;
  padding: 0.45rem 0.6rem;
  min-height: 2.35rem;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 76%, white 24%);
  color: var(--text-color);
  font-weight: 600;
  font-size: 0.88rem;
  line-height: 1.35;
}

.custom-select--form .custom-select-trigger {
  padding: 0.45rem 0.65rem;
  min-height: 2.4rem;
  border-radius: var(--control-radius);
  background: var(--surface-elevated);
  font-family: "Rajdhani", system-ui, sans-serif;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.35;
}

.custom-select--compact .custom-select-trigger {
  padding: 0.15rem 0.3rem;
  min-height: 1.55rem;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.25;
}

.custom-select-trigger:disabled {
  opacity: 0.55;
}

.custom-select-caret {
  opacity: 0.9;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.custom-select--compact .custom-select-caret {
  font-size: 0.65rem;
}

.custom-select-menu {
  overflow: auto;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 82%, black 18%);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.34);
  padding: 0.28rem;
  list-style: none;
  box-sizing: border-box;
}

.custom-select-menu--up {
  transform-origin: bottom left;
}

.custom-select-menu--down {
  transform-origin: top left;
}

.custom-select--form .custom-select-menu {
  font-family: "Rajdhani", system-ui, sans-serif;
}

.custom-select-option {
  padding: 0.34rem 0.48rem;
  border-radius: 8px;
  color: var(--text-color);
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1.25;
}

.custom-select--form .custom-select-option {
  font-size: 0.74rem;
}

.custom-select--compact .custom-select-option {
  padding: 0.26rem 0.38rem;
  font-size: 0.65rem;
}

.custom-select-option.is-active {
  background: color-mix(in srgb, var(--primary-color) 26%, transparent);
  color: color-mix(in srgb, var(--text-color) 88%, var(--primary-color) 12%);
}

.custom-select-option.is-disabled {
  opacity: 0.45;
}
</style>
 