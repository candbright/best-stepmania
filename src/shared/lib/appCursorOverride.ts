/** Reasons for forcing horizontal resize cursor; `useCursorLayer` reads `document.documentElement.dataset.appCursorOverride`. */
export type AppCursorResizeColReason =
  | "panelColResizeDrag"
  | "panelColResizeHover"
  | "editorWaveformColResize";

const flags: Record<AppCursorResizeColReason, boolean> = {
  panelColResizeDrag: false,
  panelColResizeHover: false,
  editorWaveformColResize: false,
};

function syncDataset(): void {
  const el = document.documentElement;
  if (flags.panelColResizeDrag || flags.panelColResizeHover || flags.editorWaveformColResize) {
    el.dataset.appCursorOverride = "resize-x";
  } else {
    delete el.dataset.appCursorOverride;
  }
}

/** Toggle horizontal resize glyph on the custom cursor layer (splitter hover/drag, editor waveform). */
export function setAppCursorResizeColActive(reason: AppCursorResizeColReason, active: boolean): void {
  flags[reason] = active;
  syncDataset();
}
