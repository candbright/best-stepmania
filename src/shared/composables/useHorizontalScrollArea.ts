import { useScrollAreaCore } from "@/shared/composables/useScrollAreaCore";

export function useHorizontalScrollArea() {
  const core = useScrollAreaCore("horizontal");

  return {
    viewportRef: core.viewportRef,
    trackRef: core.trackRef,
    thumbWidthPx: core.thumbSizePx,
    thumbLeftPx: core.thumbOffsetPx,
    trackVisible: core.trackVisible,
    updateThumbFromScroll: core.updateThumbFromScroll,
    onViewportScroll: core.onViewportScroll,
    onThumbPointerDown: core.onThumbPointerDown,
    onThumbPointerMove: core.onThumbPointerMove,
    onThumbPointerUp: core.onThumbPointerUp,
    onTrackPointerDown: (e: PointerEvent) => core.onTrackPointerDown(e, "hscroll-thumb"),
    nudgeScrollBy: core.nudgeScrollBy,
  };
}
