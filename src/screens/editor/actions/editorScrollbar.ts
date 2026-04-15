import type { EditorState } from "../useEditorState";

export function createEditorScrollbar(s: EditorState) {
  function handleScrollbarMouseDown(e: MouseEvent) {
    if (s.allCharts.value.length === 0) return;
    const scrollbar = e.currentTarget as HTMLElement;
    const rect = scrollbar.getBoundingClientRect();
    const setPos = (clientY: number) => {
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      s.scrollBeat.value = Math.max(0, ratio * s.totalBeats.value);
    };
    setPos(e.clientY);
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      setPos(ev.clientY);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return { handleScrollbarMouseDown };
}
