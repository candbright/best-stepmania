import { ref } from "vue";
import type { Router } from "vue-router";
import { ensureMinElapsed } from "@/utils/loadingGate";
import { primeEditorEntryResources } from "./editorEntryPrefetch";

interface BlockingOverlayLike {
  show: (options: { message: string; onCancel: () => void; onRetry: null }) => void;
  hide: () => void;
  updateMessage: (message: string) => void;
  setFailed: (message: string, onRetry: () => void) => void;
}

interface SessionLike {
  clearEditorEntryPrime: () => void;
}

interface UseEditorEntryNavigationOptions {
  canEditCurrentSong: () => boolean;
  router: Router;
  session: SessionLike;
  blockingOverlay: BlockingOverlayLike;
  t: (key: string, ...args: unknown[]) => string;
}

export function useEditorEntryNavigation(options: UseEditorEntryNavigationOptions) {
  const pendingEditorRouteQuery = ref<Record<string, string> | undefined>(undefined);
  const editorNavHandoffToEditor = ref(false);
  let editorLoadAbortCtrl: AbortController | null = null;

  function cancelEditorNavLoad() {
    editorLoadAbortCtrl?.abort();
    editorLoadAbortCtrl = null;
    editorNavHandoffToEditor.value = false;
    options.session.clearEditorEntryPrime();
    options.blockingOverlay.hide();
  }

  async function navigateToEditorWithPrefetch(routeQuery?: Record<string, string>) {
    if (!options.canEditCurrentSong()) return;
    pendingEditorRouteQuery.value = routeQuery;
    editorNavHandoffToEditor.value = false;
    editorLoadAbortCtrl = new AbortController();
    options.blockingOverlay.show({
      message: options.t("loadingPhase.preparing"),
      onCancel: cancelEditorNavLoad,
      onRetry: null,
    });
    const started = performance.now();
    try {
      await primeEditorEntryResources(
        (msg) => options.blockingOverlay.updateMessage(msg),
        options.t,
        editorLoadAbortCtrl.signal,
      );
      if (editorLoadAbortCtrl?.signal.aborted) return;
      options.blockingOverlay.updateMessage(options.t("loadingPhase.navigate"));
      editorNavHandoffToEditor.value = true;
      await options.router.push({ path: "/editor", query: routeQuery ?? {} });
    } catch (e: unknown) {
      editorNavHandoffToEditor.value = false;
      if (e instanceof DOMException && e.name === "AbortError") {
        editorLoadAbortCtrl = null;
        options.blockingOverlay.hide();
        return;
      }
      console.error(e);
      options.session.clearEditorEntryPrime();
      options.blockingOverlay.setFailed(options.t("loadingOverlay.failed"), () => {
        void navigateToEditorWithPrefetch(pendingEditorRouteQuery.value);
      });
    } finally {
      if (editorLoadAbortCtrl?.signal.aborted) {
        editorLoadAbortCtrl = null;
        return;
      }
      await ensureMinElapsed(started, 1500);
      editorLoadAbortCtrl = null;
    }
  }

  function openEditor() {
    void navigateToEditorWithPrefetch();
  }

  function onUnmountedEditorEntryNavigation() {
    editorLoadAbortCtrl?.abort();
    editorLoadAbortCtrl = null;
    if (editorNavHandoffToEditor.value) {
      editorNavHandoffToEditor.value = false;
      return;
    }
    options.session.clearEditorEntryPrime();
    options.blockingOverlay.hide();
  }

  return {
    cancelEditorNavLoad,
    navigateToEditorWithPrefetch,
    openEditor,
    onUnmountedEditorEntryNavigation,
  };
}
