import type { EditorState } from "../useEditorState";

export function createEditorScrollbar(s: EditorState) {
  let draggingThumb = false;
  let dragThumbOffsetRatio = 0;

  function setBeatByRatio(rawRatio: number) {
    const ratio = Math.max(0, Math.min(1, rawRatio));
    s.scrollBeat.value = Math.max(0, ratio * s.totalBeats.value);
  }

  function ratioFromClientY(scrollbarEl: HTMLElement, clientY: number) {
    const rect = scrollbarEl.getBoundingClientRect();
    if (rect.height <= 0) return 0;
    return (clientY - rect.top) / rect.height;
  }

  function handleScrollbarTrackPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (s.allCharts.value.length === 0) return;
    const scrollbarEl = e.currentTarget as HTMLElement;
    setBeatByRatio(ratioFromClientY(scrollbarEl, e.clientY));
  }

  function handleScrollbarThumbPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (s.allCharts.value.length === 0) return;
    const thumbEl = e.currentTarget as HTMLElement;
    const scrollbarEl = thumbEl.parentElement as HTMLElement | null;
    if (!scrollbarEl) return;
    e.preventDefault();
    e.stopPropagation();
    const trackRatio = ratioFromClientY(scrollbarEl, e.clientY);
    const topRatio = s.scrollbarThumbTop.value;
    dragThumbOffsetRatio = trackRatio - topRatio;
    draggingThumb = true;
    thumbEl.setPointerCapture(e.pointerId);
  }

  function handleScrollbarThumbPointerMove(e: PointerEvent) {
    if (!draggingThumb) return;
    const thumbEl = e.currentTarget as HTMLElement;
    const scrollbarEl = thumbEl.parentElement as HTMLElement | null;
    if (!scrollbarEl) return;
    e.preventDefault();
    const raw = ratioFromClientY(scrollbarEl, e.clientY) - dragThumbOffsetRatio;
    const maxTop = Math.max(0, 1 - s.scrollbarThumbRatio.value);
    const clampedTop = Math.max(0, Math.min(maxTop, raw));
    setBeatByRatio(clampedTop);
  }

  function handleScrollbarThumbPointerUp(e: PointerEvent) {
    if (!draggingThumb) return;
    draggingThumb = false;
    const thumbEl = e.currentTarget as HTMLElement;
    try {
      thumbEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function nudgeScrollBy(direction: -1 | 1) {
    const step = Math.max(1, s.totalBeats.value * 0.04);
    s.scrollBeat.value = Math.max(0, Math.min(s.totalBeats.value, s.scrollBeat.value + step * direction));
  }

  return {
    handleScrollbarTrackPointerDown,
    handleScrollbarThumbPointerDown,
    handleScrollbarThumbPointerMove,
    handleScrollbarThumbPointerUp,
    nudgeScrollBy,
  };
}
