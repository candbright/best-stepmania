import { onBeforeUnmount, onMounted, ref } from "vue";

type Orientation = "horizontal" | "vertical";

export function useScrollAreaCore(orientation: Orientation) {
  const viewportRef = ref<HTMLElement | null>(null);
  const trackRef = ref<HTMLElement | null>(null);
  const thumbSizePx = ref(0);
  const thumbOffsetPx = ref(0);
  const trackVisible = ref(false);

  let dragging = false;
  let dragStartClient = 0;
  let dragStartScroll = 0;
  let ro: ResizeObserver | null = null;

  function readClientPosition(e: PointerEvent): number {
    return orientation === "horizontal" ? e.clientX : e.clientY;
  }

  function containsThumbClass(target: HTMLElement | null, thumbClassName: string): boolean {
    return target?.classList.contains(thumbClassName) ?? false;
  }

  function metrics() {
    const viewport = viewportRef.value;
    const track = trackRef.value;
    if (!viewport || !track) {
      return {
        scrollSize: 0,
        clientSize: 0,
        scrollOffset: 0,
        maxScroll: 0,
        trackSize: 0,
      };
    }
    const scrollSize = orientation === "horizontal" ? viewport.scrollWidth : viewport.scrollHeight;
    const clientSize = orientation === "horizontal" ? viewport.clientWidth : viewport.clientHeight;
    const scrollOffset = orientation === "horizontal" ? viewport.scrollLeft : viewport.scrollTop;
    const maxScroll = Math.max(0, scrollSize - clientSize);
    const trackSize = orientation === "horizontal" ? track.clientWidth : track.clientHeight;
    return { scrollSize, clientSize, scrollOffset, maxScroll, trackSize };
  }

  function applyViewportScroll(viewport: HTMLElement, value: number) {
    if (orientation === "horizontal") viewport.scrollLeft = value;
    else viewport.scrollTop = value;
  }

  function updateThumbFromScroll() {
    const { scrollSize, clientSize, scrollOffset, maxScroll, trackSize } = metrics();
    if (maxScroll <= 0 || scrollSize <= clientSize) {
      trackVisible.value = false;
      thumbSizePx.value = 0;
      thumbOffsetPx.value = 0;
      return;
    }
    trackVisible.value = true;
    const minThumb = 24;
    const thumbSize = Math.max(minThumb, (clientSize / scrollSize) * trackSize);
    const maxOffset = Math.max(0, trackSize - thumbSize);
    thumbSizePx.value = thumbSize;
    const ratio = maxScroll > 0 ? scrollOffset / maxScroll : 0;
    thumbOffsetPx.value = ratio * maxOffset;
  }

  function onViewportScroll() {
    updateThumbFromScroll();
  }

  function onThumbPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const viewport = viewportRef.value;
    if (!viewport) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    dragStartClient = readClientPosition(e);
    dragStartScroll = orientation === "horizontal" ? viewport.scrollLeft : viewport.scrollTop;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onThumbPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const viewport = viewportRef.value;
    if (!viewport) return;
    const { maxScroll, trackSize } = metrics();
    const maxOffset = Math.max(0, trackSize - thumbSizePx.value);
    if (maxOffset <= 0 || maxScroll <= 0) return;
    const delta = readClientPosition(e) - dragStartClient;
    const deltaScroll = (delta / maxOffset) * maxScroll;
    const nextValue = Math.min(Math.max(0, dragStartScroll + deltaScroll), maxScroll);
    applyViewportScroll(viewport, nextValue);
  }

  function onThumbPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onTrackPointerDown(e: PointerEvent, thumbClassName: string) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (containsThumbClass(target, thumbClassName)) return;
    const viewport = viewportRef.value;
    const track = trackRef.value;
    if (!viewport || !track) return;
    const rect = track.getBoundingClientRect();
    const pointer = orientation === "horizontal" ? e.clientX - rect.left : e.clientY - rect.top;
    const { maxScroll, trackSize } = metrics();
    const maxOffset = Math.max(0, trackSize - thumbSizePx.value);
    if (maxOffset <= 0 || maxScroll <= 0) return;
    const ratio = Math.min(Math.max(0, (pointer - thumbSizePx.value * 0.5) / maxOffset), 1);
    applyViewportScroll(viewport, ratio * maxScroll);
  }

  function nudgeScrollBy(direction: -1 | 1) {
    const viewport = viewportRef.value;
    if (!viewport) return;
    const base = orientation === "horizontal" ? viewport.clientWidth : viewport.clientHeight;
    const step = orientation === "horizontal"
      ? Math.max(36, Math.round(base * 0.12))
      : Math.max(24, Math.round(base * 0.1));
    const current = orientation === "horizontal" ? viewport.scrollLeft : viewport.scrollTop;
    applyViewportScroll(viewport, current + step * direction);
  }

  function bindObservers() {
    ro?.disconnect();
    const viewport = viewportRef.value;
    const track = trackRef.value;
    if (!viewport || !track) return;
    ro = new ResizeObserver(() => updateThumbFromScroll());
    ro.observe(viewport);
    ro.observe(track);
  }

  onMounted(() => {
    bindObservers();
    updateThumbFromScroll();
  });

  onBeforeUnmount(() => {
    ro?.disconnect();
    ro = null;
  });

  return {
    viewportRef,
    trackRef,
    thumbSizePx,
    thumbOffsetPx,
    trackVisible,
    updateThumbFromScroll,
    onViewportScroll,
    onThumbPointerDown,
    onThumbPointerMove,
    onThumbPointerUp,
    onTrackPointerDown,
    nudgeScrollBy,
  };
}
