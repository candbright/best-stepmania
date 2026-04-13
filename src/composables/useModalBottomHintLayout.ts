import { ref, watch, onUnmounted, nextTick, type Ref } from "vue";

/**
 * Minimum px between dialog card bottom and overlay (game) bottom to show the foot hint.
 * Allows one wrapped line + padding (see .modal-mask-hint).
 */
const MIN_BOTTOM_GAP_PX = 72;

export interface ModalBottomHintLayoutOptions {
  /** Whether the overlay is mounted / visible */
  active: Ref<boolean>;
  /** Whether a bottom hint string should be considered (non-empty) */
  hasHint: () => boolean;
}

/**
 * Shows a modal foot hint only when the vertical gap from the dialog bottom to the
 * overlay bottom (game client area) is large enough. Uses the same coordinate system
 * for both rects (layout viewport — do not mix with visualViewport.height alone).
 */
export function useModalBottomHintLayout(
  maskRef: Ref<HTMLElement | null>,
  cardRef: Ref<HTMLElement | null>,
  options: ModalBottomHintLayoutOptions,
): { hintVisible: Ref<boolean> } {
  const hintVisible = ref(false);

  let ro: ResizeObserver | null = null;

  function remeasure() {
    if (!options.active.value || !options.hasHint()) {
      hintVisible.value = false;
      return;
    }
    const mask = maskRef.value;
    const card = cardRef.value;
    if (!mask || !card) {
      hintVisible.value = false;
      return;
    }
    const maskRect = mask.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    /** Distance from dialog bottom to game / overlay bottom */
    const gap = maskRect.bottom - cardRect.bottom;
    hintVisible.value = gap >= MIN_BOTTOM_GAP_PX;
  }

  function tearDown() {
    ro?.disconnect();
    ro = null;
    window.removeEventListener("resize", remeasure);
    window.visualViewport?.removeEventListener("resize", remeasure);
    window.visualViewport?.removeEventListener("scroll", remeasure);
    hintVisible.value = false;
  }

  function setup() {
    tearDown();
    if (!options.active.value || !options.hasHint()) return;
    void nextTick(() => {
      if (!options.active.value || !options.hasHint()) return;
      remeasure();
      const mask = maskRef.value;
      const card = cardRef.value;
      if (!mask || !card) return;
      ro = new ResizeObserver(remeasure);
      ro.observe(mask);
      ro.observe(card);
      window.addEventListener("resize", remeasure);
      window.visualViewport?.addEventListener("resize", remeasure);
      window.visualViewport?.addEventListener("scroll", remeasure);
    });
  }

  watch(
    () => [options.active.value, options.hasHint()] as const,
    () => {
      setup();
    },
    { flush: "post", immediate: true },
  );

  onUnmounted(() => tearDown());

  return { hintVisible };
}
