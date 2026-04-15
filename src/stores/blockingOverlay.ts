import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

/**
 * Single full-screen blocking load overlay (App.vue hosts {@link AppLoadingOverlay}).
 * Avoids stacking multiple Teleport overlays across route transitions.
 */
export const useBlockingOverlayStore = defineStore("blockingOverlay", () => {
  const open = ref(false);
  const message = ref("");
  const error = ref(false);
  const showRetry = ref(false);
  /** 0–100 when known; null = indeterminate animation */
  const progress = ref<number | null>(null);
  const showCancel = ref(true);
  const onCancel = shallowRef<(() => void) | null>(null);
  const onRetry = shallowRef<(() => void) | null>(null);

  function show(opts: {
    message: string;
    onCancel: () => void;
    onRetry?: (() => void) | null;
    showCancel?: boolean;
  }): void {
    open.value = true;
    error.value = false;
    showRetry.value = false;
    message.value = opts.message;
    onCancel.value = opts.onCancel;
    onRetry.value = opts.onRetry ?? null;
    progress.value = null;
    showCancel.value = opts.showCancel ?? true;
  }

  function patchHandlers(opts: {
    onCancel?: () => void;
    onRetry?: (() => void) | null;
  }): void {
    if (opts.onCancel !== undefined) {
      onCancel.value = opts.onCancel;
    }
    if (opts.onRetry !== undefined) {
      onRetry.value = opts.onRetry;
    }
  }

  function updateMessage(msg: string): void {
    message.value = msg;
  }

  function setProgress(p: number | null): void {
    progress.value = p;
  }

  function clearError(): void {
    error.value = false;
    showRetry.value = false;
  }

  function setFailed(msg: string, retry: () => void): void {
    error.value = true;
    showRetry.value = true;
    message.value = msg;
    onRetry.value = retry;
    progress.value = null;
    showCancel.value = true;
  }

  function hide(): void {
    open.value = false;
    error.value = false;
    showRetry.value = false;
    onCancel.value = null;
    onRetry.value = null;
    progress.value = null;
    showCancel.value = true;
  }

  function invokeCancel(): void {
    onCancel.value?.();
  }

  function invokeRetry(): void {
    onRetry.value?.();
  }

  return {
    open,
    message,
    error,
    showRetry,
    progress,
    showCancel,
    show,
    patchHandlers,
    updateMessage,
    setProgress,
    clearError,
    setFailed,
    hide,
    invokeCancel,
    invokeRetry,
  };
});
