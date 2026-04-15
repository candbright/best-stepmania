import type { InjectionKey } from "vue";
import type { ConfirmDialogRequest } from "@/composables/useConfirmDialog";

export interface OptionsPanelSfx {
  playControlClickSfx: () => void;
  playToggleClickSfx: () => void;
  playSliderClickSfx: () => void;
  previewUiSfxFromSettings: () => void;
  previewRhythmSfxFromSettings: () => void;
  previewMetronomeSfxFromSettings: () => void;
}

export const OPTIONS_PANEL_SFX: InjectionKey<OptionsPanelSfx> = Symbol("optionsPanelSfx");

export interface OptionsDialogContext {
  requestConfirm: (req: ConfirmDialogRequest) => void;
}

export const OPTIONS_DIALOG: InjectionKey<OptionsDialogContext> = Symbol("optionsDialog");
