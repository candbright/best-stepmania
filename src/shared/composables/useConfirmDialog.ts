import { ref } from "vue";

export interface ConfirmDialogRequest {
  title: string;
  message: string;
  bullets?: string[];
  confirmText: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Shared confirm flow: open, busy state, run action, close.
 */
export function useConfirmDialog() {
  const open = ref(false);
  const title = ref("");
  const message = ref("");
  const bullets = ref<string[]>([]);
  const confirmText = ref("");
  const busy = ref(false);
  let pendingRun: (() => void | Promise<void>) | null = null;

  function requestConfirm(req: ConfirmDialogRequest) {
    title.value = req.title;
    message.value = req.message;
    bullets.value = req.bullets ?? [];
    confirmText.value = req.confirmText;
    pendingRun = req.onConfirm;
    open.value = true;
  }

  function close() {
    if (busy.value) return;
    open.value = false;
    pendingRun = null;
  }

  async function accept() {
    const run = pendingRun;
    if (!run) return;
    busy.value = true;
    try {
      await run();
      open.value = false;
      pendingRun = null;
    } finally {
      busy.value = false;
    }
  }

  return {
    open,
    title,
    message,
    bullets,
    confirmText,
    busy,
    requestConfirm,
    close,
    accept,
  };
}
