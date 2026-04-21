import { nextTick, onActivated, onDeactivated, onMounted, onUnmounted, type Ref } from "vue";
import * as api from "@/shared/api";
import { setAppCursorResizeColActive } from "@/shared/lib/appCursorOverride";
import { logDebug } from "@/shared/lib/devLog";
import type { EditorState } from "./useEditorState";
import type { EditorCanvas } from "./useEditorCanvas";
import EditorToolbar from "./EditorToolbar.vue";
import EditorStatusBar from "./EditorStatusBar.vue";

export interface UseEditorScreenLifecycleOptions {
  s: EditorState;
  canvas: EditorCanvas;
  editorToolbarRef: Ref<InstanceType<typeof EditorToolbar> | null>;
  editorStatusBarRef: Ref<InstanceType<typeof EditorStatusBar> | null>;
  installEditorBackGuard: () => void;
  uninstallEditorBackGuard: () => void;
  disposeDraftGuard: () => void;
  onAfterEditorSnapshotReady: () => void;
  handleEditorWindowResize: () => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  handleEditorActivate: () => void | Promise<void>;
}

/** Vertical wheel (or horizontal trackpad delta) scrolls these strips sideways; needs non-passive listener. */
function editorHorizontalWheelOnEl(el: HTMLElement, e: WheelEvent) {
  if (el.scrollWidth <= el.clientWidth + 1) return;
  const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (raw === 0) return;
  let px = raw;
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) px *= 16;
  else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) px *= el.clientWidth;
  e.preventDefault();
  el.scrollLeft += px;
}

export function useEditorScreenLifecycle(opts: UseEditorScreenLifecycleOptions) {
  const {
    s,
    canvas,
    editorToolbarRef,
    editorStatusBarRef,
    installEditorBackGuard,
    uninstallEditorBackGuard,
    disposeDraftGuard,
    onAfterEditorSnapshotReady,
    handleEditorWindowResize,
    handleKeyDown,
    handleMouseMove,
    handleMouseUp,
    handleEditorActivate,
  } = opts;

  let editorHorizontalWheelCleanups: Array<() => void> = [];

  function attachWindowListeners() {
    window.addEventListener("resize", handleEditorWindowResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function detachWindowListeners() {
    window.removeEventListener("resize", handleEditorWindowResize);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  onMounted(() => {
    s.afterChartNotesLoaded.value = onAfterEditorSnapshotReady;
    void nextTick(() => {
      const attach = (el: HTMLElement | null) => {
        if (!el) return;
        const fn = (e: WheelEvent) => editorHorizontalWheelOnEl(el, e);
        el.addEventListener("wheel", fn, { passive: false });
        editorHorizontalWheelCleanups.push(() => {
          el.removeEventListener("wheel", fn);
        });
      };
      attach(editorToolbarRef.value?.getScrollTrackEl() ?? null);
      attach(editorStatusBarRef.value?.getScrollTrackEl() ?? null);
    });
  });

  onActivated(() => {
    installEditorBackGuard();
    attachWindowListeners();
    void handleEditorActivate();
  });

  onDeactivated(() => {
    uninstallEditorBackGuard();
    setAppCursorResizeColActive("editorWaveformColResize", false);
    s.playing.value = false;
    detachWindowListeners();
    canvas.destroyCanvas();
    api.audioStop().catch((e) => logDebug("Optional", "editor.deactivate.audioStop", e));
    api.audioSetRate(1.0).catch((e) => logDebug("Optional", "editor.deactivate.audioSetRate", e));
  });

  onUnmounted(() => {
    s.afterChartNotesLoaded.value = null;
    uninstallEditorBackGuard();
    setAppCursorResizeColActive("editorWaveformColResize", false);
    disposeDraftGuard();
    editorHorizontalWheelCleanups.forEach((off) => off());
    editorHorizontalWheelCleanups = [];
    detachWindowListeners();
    canvas.destroyCanvas();
    api.audioStop().catch((e) => logDebug("Optional", "editor.unmount.audioStop", e));
    api.audioSetRate(1.0).catch((e) => logDebug("Optional", "editor.unmount.audioSetRate", e));
  });
}
