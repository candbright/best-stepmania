import type { ShortcutId } from "@/shared/lib/engine/keyBindings";

export const OPTIONS_SHORTCUT_SECTIONS: {
  titleKey: string;
  rows: { id: ShortcutId; labelKey: string }[];
}[] = [
  {
    titleKey: "settings.keybindings.sectionGlobal",
    rows: [
      { id: "global.back", labelKey: "settings.keybindings.globalBack" },
      { id: "title.confirm", labelKey: "settings.keybindings.titleConfirm" },
    ],
  },
  {
    titleKey: "settings.keybindings.sectionGameplayScreen",
    rows: [
      { id: "gameplay.devPanel", labelKey: "settings.keybindings.gameplayDevPanel" },
      { id: "gameplay.pause", labelKey: "settings.keybindings.gameplayPause" },
    ],
  },
  {
    titleKey: "settings.keybindings.sectionEditor",
    rows: [
      { id: "editor.undo", labelKey: "settings.keybindings.editorUndo" },
      { id: "editor.redo", labelKey: "settings.keybindings.editorRedo" },
      { id: "editor.save", labelKey: "settings.keybindings.editorSave" },
      { id: "editor.copy", labelKey: "settings.keybindings.editorCopy" },
      { id: "editor.cut", labelKey: "settings.keybindings.editorCut" },
      { id: "editor.paste", labelKey: "settings.keybindings.editorPaste" },
      { id: "editor.selectAll", labelKey: "settings.keybindings.editorSelectAll" },
      { id: "editor.delete", labelKey: "settings.keybindings.editorDelete" },
      { id: "editor.back", labelKey: "settings.keybindings.editorBack" },
      { id: "editor.playPause", labelKey: "settings.keybindings.editorPlayPause" },
      { id: "editor.scrollUp", labelKey: "settings.keybindings.editorScrollUp" },
      { id: "editor.scrollDown", labelKey: "settings.keybindings.editorScrollDown" },
      { id: "editor.quantizeUp", labelKey: "settings.keybindings.editorQuantizeUp" },
      { id: "editor.quantizeDown", labelKey: "settings.keybindings.editorQuantizeDown" },
      { id: "editor.zoomIn", labelKey: "settings.keybindings.editorZoomIn" },
      { id: "editor.zoomOut", labelKey: "settings.keybindings.editorZoomOut" },
      { id: "editor.flipH", labelKey: "settings.keybindings.editorFlipH" },
      { id: "editor.flipV", labelKey: "settings.keybindings.editorFlipV" },
      { id: "editor.flipD", labelKey: "settings.keybindings.editorFlipD" },
      { id: "editor.routineLayer1", labelKey: "settings.keybindings.editorRoutineLayer1" },
      { id: "editor.routineLayer2", labelKey: "settings.keybindings.editorRoutineLayer2" },
      { id: "editor.clearSelection", labelKey: "settings.keybindings.editorClearSelection" },
      { id: "editor.previewPlay", labelKey: "settings.keybindings.editorPreviewPlay" },
      { id: "editor.addBeat", labelKey: "settings.keybindings.editorAddBeat" },
      { id: "editor.deleteBeat", labelKey: "settings.keybindings.editorDeleteBeat" },
    ],
  },
  {
    titleKey: "settings.keybindings.sectionEditorNotes",
    rows: [
      { id: "editor.noteType1", labelKey: "settings.keybindings.editorNoteType1" },
      { id: "editor.noteType2", labelKey: "settings.keybindings.editorNoteType2" },
      { id: "editor.noteType3", labelKey: "settings.keybindings.editorNoteType3" },
      { id: "editor.noteType4", labelKey: "settings.keybindings.editorNoteType4" },
    ],
  },
];
