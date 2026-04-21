import {
  SONG_SELECT_PANEL_MIN_DETAIL_PX,
  SONG_SELECT_PANEL_WIDTH_DEFAULT_PX,
} from "@/shared/constants/songSelectPanel";
import { setAppCursorResizeColActive } from "@/shared/lib/appCursorOverride";
import { onUnmounted, ref } from "vue";

export {
  SONG_SELECT_PANEL_MIN_DETAIL_PX,
  SONG_SELECT_PANEL_WIDTH_DEFAULT_PX,
} from "@/shared/constants/songSelectPanel";

export interface PanelResizeOptions {
  /** Initial panel width in pixels */
  initialWidth?: number;
  /** Minimum panel width in pixels (default: {@link SONG_SELECT_PANEL_WIDTH_DEFAULT_PX}, independent of persisted width) */
  minPanelWidth?: number;
  /** Minimum detail panel width in pixels */
  minDetailPanelWidth?: number;
  /** CSS selector for the resize container */
  containerSelector?: string;
  /** Called once when a resize drag ends (after width is clamped). Use to persist. */
  onResizeCommit?: (widthPx: number) => void;
}

export interface UsePanelResizeReturn {
  songPanelWidth: ReturnType<typeof ref<number>>;
  isDragging: ReturnType<typeof ref<boolean>>;
  resizeHandleRef: ReturnType<typeof ref<HTMLElement | null>>;
  startDrag: (e: MouseEvent) => void;
  onDrag: (e: MouseEvent) => void;
  stopDrag: () => void;
  onResizeHandleMouseEnter: () => void;
  onResizeHandleMouseLeave: () => void;
}

const DEFAULT_MIN_DETAIL_PANEL_WIDTH = SONG_SELECT_PANEL_MIN_DETAIL_PX;
const DEFAULT_INITIAL_WIDTH = SONG_SELECT_PANEL_WIDTH_DEFAULT_PX;

/**
 * Shared panel resize logic for song selection pages.
 * Provides drag-to-resize functionality for split panel layouts.
 */
export function usePanelResize(options: PanelResizeOptions = {}): UsePanelResizeReturn {
  const initialWidth = options.initialWidth ?? DEFAULT_INITIAL_WIDTH;
  const minPanelWidth = options.minPanelWidth ?? DEFAULT_INITIAL_WIDTH;
  const minDetailPanelWidth = options.minDetailPanelWidth ?? DEFAULT_MIN_DETAIL_PANEL_WIDTH;
  const containerSelector = options.containerSelector ?? ".sms-body";
  const onResizeCommit = options.onResizeCommit;

  const songPanelWidth = ref(initialWidth);
  const isDragging = ref(false);
  const resizeHandleRef = ref<HTMLElement | null>(null);

  const startDrag = (_e: MouseEvent) => {
    isDragging.value = true;
    setAppCursorResizeColActive("panelColResizeDrag", true);
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    document.body.style.userSelect = "none";
  };

  const onDrag = (e: MouseEvent) => {
    if (!isDragging.value) return;
    const container = document.querySelector(containerSelector) as HTMLElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    const maxWidth = containerRect.width - minDetailPanelWidth;
    songPanelWidth.value = Math.max(minPanelWidth, Math.min(newWidth, maxWidth));
  };

  const stopDrag = () => {
    const wasDragging = isDragging.value;
    if (!wasDragging) {
      document.body.style.userSelect = "";
      return;
    }
    isDragging.value = false;
    setAppCursorResizeColActive("panelColResizeDrag", false);
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.body.style.userSelect = "";
    onResizeCommit?.(songPanelWidth.value);
  };

  onUnmounted(() => {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.body.style.userSelect = "";
    isDragging.value = false;
    setAppCursorResizeColActive("panelColResizeDrag", false);
    setAppCursorResizeColActive("panelColResizeHover", false);
  });

  const onResizeHandleMouseEnter = () => {
    setAppCursorResizeColActive("panelColResizeHover", true);
  };

  /** Always clear hover on leave; drag uses `panelColResizeDrag` so cursor stays correct while dragging off the strip. */
  const onResizeHandleMouseLeave = () => {
    setAppCursorResizeColActive("panelColResizeHover", false);
  };

  return {
    songPanelWidth,
    isDragging,
    resizeHandleRef,
    startDrag,
    onDrag,
    stopDrag,
    onResizeHandleMouseEnter,
    onResizeHandleMouseLeave,
  };
}
