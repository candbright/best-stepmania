<script setup lang="ts">
/**
 * Full-screen loading: backdrop + 文案 + 进度条（确定/不确定）+ 必要操作按钮。
 */
import { watch, onUnmounted, computed } from "vue";
import { useI18n } from "@/i18n";
import { isTauri } from "@/utils/platform";
import { closeTauriMainWindow, logCloseMainWindowFailure } from "@/services/tauri/window";

const open = defineModel<boolean>("open", { default: false });

const props = withDefaults(
  defineProps<{
    message: string;
    error?: boolean;
    showCancel?: boolean;
    showRetry?: boolean;
    progress?: number | null;
    escExitsApp?: boolean;
  }>(),
  {
    error: false,
    showCancel: true,
    showRetry: false,
    progress: null,
    escExitsApp: false,
  },
);

const barInnerClass = computed(() => ({
  "app-load-bar-inner": true,
  "app-load-bar-inner--determinate": props.progress != null && !props.error,
}));

const barInnerStyle = computed(() => {
  if (props.progress == null || props.error) return {};
  const p = Math.max(0, Math.min(100, props.progress));
  return {
    width: `${p}%`,
    transform: "none",
    animation: "none",
  };
});

const emit = defineEmits<{
  cancel: [];
  retry: [];
}>();

const { t } = useI18n();

let escHandler: ((e: KeyboardEvent) => void) | null = null;

function attachEsc() {
  detachEsc();
  escHandler = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open.value) return;
    e.preventDefault();
    e.stopPropagation();
    if (props.escExitsApp && isTauri()) {
      void closeTauriMainWindow().catch((e: unknown) => {
        logCloseMainWindowFailure("appLoadingOverlay.window.close", e);
        emit("cancel");
      });
      return;
    }
    emit("cancel");
  };
  window.addEventListener("keydown", escHandler, true);
}

function detachEsc() {
  if (escHandler) {
    window.removeEventListener("keydown", escHandler, true);
    escHandler = null;
  }
}

watch(
  () => open.value,
  (v) => {
    if (v) attachEsc();
    else detachEsc();
  },
  { immediate: true },
);

onUnmounted(() => detachEsc());

function onCancel() {
  emit("cancel");
}
function onRetry() {
  emit("retry");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="app-load-fade">
      <div
        v-if="open"
        class="app-load-overlay"
        role="alertdialog"
        aria-busy="true"
        :aria-label="message"
      >
        <div class="app-load-backdrop" aria-hidden="true" />
        <div class="app-load-drag-strip" data-tauri-drag-region />
        <div class="app-load-panel">
          <p class="app-load-message" :class="{ 'app-load-message--error': error }">{{ message }}</p>
          <div v-if="!error" class="app-load-bar" aria-hidden="true">
            <div :class="barInnerClass" :style="barInnerStyle" />
          </div>
          <div v-if="(showRetry && error) || showCancel" class="app-load-actions">
            <button v-if="showRetry && error" type="button" class="app-load-btn primary" @click="onRetry">
              {{ t("loadingOverlay.retry") }}
            </button>
            <button v-if="showCancel" type="button" class="app-load-btn ghost" @click="onCancel">
              {{ t("cancel") }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-load-overlay {
  position: fixed;
  inset: 0;
  z-index: 100002;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  box-sizing: border-box;
}

.app-load-backdrop {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--bg-gradient-start) 88%, transparent) 0%,
    color-mix(in srgb, var(--bg-color) 82%, transparent) 45%,
    color-mix(in srgb, var(--primary-color) 18%, var(--bg-gradient-end)) 100%
  );
  backdrop-filter: blur(12px) saturate(1.1);
  -webkit-backdrop-filter: blur(12px) saturate(1.1);
}

.app-load-drag-strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  z-index: 1;
  -webkit-app-region: drag;
  app-region: drag;
}

.app-load-panel {
  position: relative;
  z-index: 2;
  width: min(360px, 100%);
  padding: 1.25rem 1.25rem 1rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--section-bg) 50%, var(--bg-color));
  border: 1px solid var(--border-color);
  text-align: center;
}

.app-load-message {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: color-mix(in srgb, var(--text-color) 90%, transparent);
  white-space: pre-line;
}

.app-load-message--error {
  color: color-mix(in srgb, #ff8a80 55%, var(--text-color));
}

.app-load-bar {
  height: 3px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text-color) 10%, transparent);
  overflow: hidden;
}

.app-load-bar-inner {
  height: 100%;
  width: 36%;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--primary-color) 35%, transparent),
    var(--primary-color),
    color-mix(in srgb, var(--primary-color-hover) 80%, var(--primary-color))
  );
  animation: app-load-bar 1.35s ease-in-out infinite;
}

.app-load-bar-inner--determinate {
  width: 0%;
  min-width: 0;
  animation: none;
  transition: width 0.32s ease-out;
}

@keyframes app-load-bar {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(320%);
  }
}

.app-load-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1rem;
}

.app-load-btn {
  padding: 0.45rem 1rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: filter 0.15s, background 0.15s;
}

.app-load-btn.primary {
  background: linear-gradient(
    135deg,
    var(--primary-color),
    color-mix(in srgb, var(--primary-color) 72%, #000)
  );
  color: var(--text-on-primary);
}

.app-load-btn.primary:hover {
  filter: brightness(1.06);
}

.app-load-btn.ghost {
  background: var(--surface-elevated);
  color: color-mix(in srgb, var(--text-color) 88%, transparent);
  border: 1px solid var(--border-color);
}

.app-load-btn.ghost:hover {
  background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-elevated));
}

.app-load-fade-enter-active,
.app-load-fade-leave-active {
  transition: opacity 0.2s ease;
}
.app-load-fade-enter-from,
.app-load-fade-leave-to {
  opacity: 0;
}
</style>
