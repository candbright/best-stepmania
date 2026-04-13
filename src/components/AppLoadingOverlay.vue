<script setup lang="ts">
/**
 * Full-screen loading shell: theme-aware glass background, spinner, indeterminate bar, version footer.
 * ESC still cancels (emit) or closes the window when escExitsApp is true — no on-screen hint.
 */
import { watch, onUnmounted } from "vue";
import { useI18n } from "@/i18n";
import { isTauri } from "@/utils/platform";
import { logOptionalRejection } from "@/utils/devLog";
import { APP_VERSION } from "@/constants/appMeta";

const open = defineModel<boolean>("open", { default: false });

const props = withDefaults(
  defineProps<{
    message: string;
    /** Error state: show retry, different styling */
    error?: boolean;
    showCancel?: boolean;
    showRetry?: boolean;
    /** When true and ESC pressed in Tauri, close the app window */
    escExitsApp?: boolean;
  }>(),
  {
    error: false,
    showCancel: true,
    showRetry: false,
    escExitsApp: false,
  },
);

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
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => getCurrentWindow().close())
        .catch((e) => {
          logOptionalRejection("appLoadingOverlay.window.close", e);
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
        <div class="app-load-card">
          <div v-if="!error" class="app-load-spinner" aria-hidden="true" />
          <div v-else class="app-load-error-icon" aria-hidden="true">!</div>

          <p class="app-load-message">{{ message }}</p>

          <div v-if="!error" class="app-load-bar" aria-hidden="true">
            <div class="app-load-bar-inner" />
          </div>

          <div class="app-load-actions">
            <button v-if="showRetry && error" type="button" class="app-load-btn primary" @click="onRetry">
              {{ t("loadingOverlay.retry") }}
            </button>
            <button v-if="showCancel" type="button" class="app-load-btn ghost" @click="onCancel">
              {{ t("cancel") }}
            </button>
          </div>
        </div>
        <footer class="app-load-footer">
          <span class="app-load-version">Best-StepMania v{{ APP_VERSION }}</span>
        </footer>
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  box-sizing: border-box;
}

.app-load-backdrop {
  position: absolute;
  inset: 0;
  /* Follows body data-theme via main.css (--bg-gradient-*, --bg-color, --primary-color) */
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--bg-gradient-start) 88%, transparent) 0%,
    color-mix(in srgb, var(--bg-color) 82%, transparent) 45%,
    color-mix(in srgb, var(--primary-color) 18%, var(--bg-gradient-end)) 100%
  );
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
}

.app-load-drag-strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  z-index: 1;
  -webkit-app-region: drag;
  app-region: drag;
}

.app-load-card {
  position: relative;
  z-index: 2;
  width: min(420px, 100%);
  padding: 2rem 1.75rem 1.5rem;
  border-radius: 20px;
  background: color-mix(in srgb, var(--section-bg) 55%, var(--bg-color));
  border: 1px solid var(--border-color);
  box-shadow:
    0 24px 80px color-mix(in srgb, var(--primary-color) 12%, rgba(0, 0, 0, 0.5)),
    inset 0 1px 0 color-mix(in srgb, var(--text-color) 8%, transparent);
  text-align: center;
}

.app-load-spinner {
  width: 52px;
  height: 52px;
  margin: 0 auto 1.25rem;
  border-radius: 50%;
  border: 3px solid color-mix(in srgb, var(--text-color) 14%, transparent);
  border-top-color: var(--primary-color);
  animation: app-load-spin 0.78s linear infinite;
}

@keyframes app-load-spin {
  to {
    transform: rotate(360deg);
  }
}

.app-load-error-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background: rgba(255, 82, 82, 0.2);
  border: 2px solid rgba(255, 107, 107, 0.7);
  color: #ff8a80;
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 48px;
}

.app-load-message {
  margin: 0 0 1.25rem;
  font-size: 0.95rem;
  line-height: 1.55;
  color: color-mix(in srgb, var(--text-color) 92%, transparent);
  white-space: pre-line;
}

.app-load-bar {
  height: 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text-color) 10%, transparent);
  overflow: hidden;
  margin-bottom: 1.25rem;
}

.app-load-bar-inner {
  height: 100%;
  width: 40%;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--primary-color) 35%, transparent),
    var(--primary-color),
    color-mix(in srgb, var(--primary-color-hover) 80%, var(--primary-color))
  );
  animation: app-load-bar 1.4s ease-in-out infinite;
}

@keyframes app-load-bar {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}

.app-load-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.app-load-btn {
  padding: 0.5rem 1.1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s, opacity 0.15s;
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
  filter: brightness(1.08);
}

.app-load-btn.ghost {
  background: var(--surface-elevated);
  color: color-mix(in srgb, var(--text-color) 90%, transparent);
  border: 1px solid var(--border-color);
}

.app-load-btn.ghost:hover {
  background: color-mix(in srgb, var(--primary-color) 12%, var(--surface-elevated));
}

.app-load-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: 0.75rem;
  text-align: center;
  pointer-events: none;
}

.app-load-version {
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.app-load-fade-enter-active,
.app-load-fade-leave-active {
  transition: opacity 0.28s ease;
}
.app-load-fade-enter-active .app-load-card,
.app-load-fade-leave-active .app-load-card {
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.app-load-fade-enter-from,
.app-load-fade-leave-to {
  opacity: 0;
}
.app-load-fade-enter-from .app-load-card,
.app-load-fade-leave-to .app-load-card {
  transform: translateY(12px) scale(0.98);
  opacity: 0;
}
</style>
