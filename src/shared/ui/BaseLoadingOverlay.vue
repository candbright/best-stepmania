<script setup lang="ts">
/**
 * Full-screen loading: backdrop + 文案 + 进度条（确定/不确定）+ 必要操作按钮�?
 */
import { watch, onUnmounted, computed } from "vue";
import { useI18n } from "@/shared/i18n";
import { isTauri } from "@/shared/lib/platform";
import { closeTauriMainWindow, logCloseMainWindowFailure } from "@/shared/services/tauri/window";

const open = defineModel<boolean>("open", { default: false });

const props = withDefaults(
  defineProps<{
    message: string;
    error?: boolean;
    showCancel?: boolean;
    showRetry?: boolean;
    progress?: number | null;
    escExitsApp?: boolean;
    /** When false, omit `data-tauri-drag-region` (native hit-test may ignore CSS no-drag). */
    windowDragStripEnabled?: boolean;
  }>(),
  {
    error: false,
    showCancel: true,
    showRetry: false,
    progress: null,
    escExitsApp: false,
    windowDragStripEnabled: true,
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
        <div v-if="windowDragStripEnabled" class="app-load-drag-strip" data-tauri-drag-region />
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
  overflow: hidden;
  /* Fallback for environments where color-mix is not supported */
  background-color: #0b0b1a;
  background:
    radial-gradient(140% 120% at 8% 8%, rgba(124, 58, 237, 0.24) 0%, transparent 46%),
    radial-gradient(120% 100% at 88% 18%, rgba(244, 63, 94, 0.2) 0%, transparent 55%),
    linear-gradient(145deg, #171733 0%, #0b0b1a 45%, #05050f 100%);
  background:
    radial-gradient(
      140% 120% at 8% 8%,
      color-mix(in srgb, var(--primary-color) 28%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      120% 100% at 88% 18%,
      color-mix(in srgb, #f43f5e 20%, transparent) 0%,
      transparent 55%
    ),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--bg-gradient-start) 86%, #0f0f23) 0%,
      color-mix(in srgb, var(--bg-color) 90%, #090915) 45%,
      color-mix(in srgb, var(--bg-gradient-end) 82%, #05050f) 100%
    );
  backdrop-filter: blur(14px) saturate(1.15);
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
}

.app-load-backdrop::before {
  content: "";
  position: absolute;
  inset: -10%;
  background:
    radial-gradient(circle at 24% 28%, rgba(124, 58, 237, 0.3) 0%, transparent 42%),
    radial-gradient(circle at 74% 66%, rgba(167, 139, 250, 0.28) 0%, transparent 44%);
  background:
    radial-gradient(
      circle at 24% 28%,
      color-mix(in srgb, var(--primary-color) 35%, transparent) 0%,
      transparent 42%
    ),
    radial-gradient(
      circle at 74% 66%,
      color-mix(in srgb, #a78bfa 30%, transparent) 0%,
      transparent 44%
    );
  opacity: 0.7;
  filter: blur(30px);
  animation: app-load-aurora 9s ease-in-out infinite alternate;
}

.app-load-backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.06) 0px,
      rgba(255, 255, 255, 0.06) 1px,
      transparent 2px,
      transparent 5px
    ),
    linear-gradient(180deg, rgba(96, 165, 250, 0.06) 0%, transparent 30%, rgba(244, 114, 182, 0.07) 100%);
  background:
    repeating-linear-gradient(
      180deg,
      color-mix(in srgb, #ffffff 7%, transparent) 0px,
      color-mix(in srgb, #ffffff 7%, transparent) 1px,
      transparent 2px,
      transparent 5px
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, #60a5fa 6%, transparent) 0%,
      transparent 30%,
      color-mix(in srgb, #f472b6 7%, transparent) 100%
    );
  opacity: 0.28;
  mix-blend-mode: screen;
  pointer-events: none;
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
  padding: 0.75rem 1rem;
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

@keyframes app-load-aurora {
  0% {
    transform: translate3d(-1.5%, -1%, 0) scale(1);
  }
  100% {
    transform: translate3d(1.5%, 1%, 0) scale(1.05);
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

@media (prefers-reduced-motion: reduce) {
  .app-load-backdrop::before {
    animation: none;
  }
}
</style>
