import { onUnmounted, ref } from "vue";

export interface PanelResizeOptions {
  /** Initial panel width in pixels */
  initialWidth?: number;
  /** Minimum panel width in pixels */
  minPanelWidth?: number;
  /** Minimum detail panel width in pixels */
  minDetailPanelWidth?: number;
  /** CSS selector for the resize container */
  containerSelector?: string;
}

export interface UsePanelResizeReturn {
  songPanelWidth: ReturnType<typeof ref<number>>;
  isDragging: ReturnType<typeof ref<boolean>>;
  resizeHandleRef: ReturnType<typeof ref<HTMLElement | null>>;
  startDrag: (e: MouseEvent) => void;
  onDrag: (e: MouseEvent) => void;
  stopDrag: () => void;
}

const DEFAULT_MIN_PANEL_WIDTH = 200;
const DEFAULT_MIN_DETAIL_PANEL_WIDTH = 400;
const DEFAULT_INITIAL_WIDTH = 320;

/**
 * Shared panel resize logic for song selection screens.
 * Provides drag-to-resize functionality for split panel layouts.
 */
export function usePanelResize(options: PanelResizeOptions = {}): UsePanelResizeReturn {
  const {
    initialWidth = DEFAULT_INITIAL_WIDTH,
    minPanelWidth = DEFAULT_MIN_PANEL_WIDTH,
    minDetailPanelWidth = DEFAULT_MIN_DETAIL_PANEL_WIDTH,
    containerSelector = ".sms-body",
  } = options;

  const songPanelWidth = ref(initialWidth);
  const isDragging = ref(false);
  const resizeHandleRef = ref<HTMLElement | null>(null);

  const startDrag = (_e: MouseEvent) => {
    isDragging.value = true;
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
    if (!isDragging.value) {
      document.body.style.userSelect = "";
      return;
    }
    isDragging.value = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.body.style.userSelect = "";
  };

  onUnmounted(() => {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.body.style.userSelect = "";
    isDragging.value = false;
  });

  return {
    songPanelWidth,
    isDragging,
    resizeHandleRef,
    startDrag,
    onDrag,
    stopDrag,
  };
}
