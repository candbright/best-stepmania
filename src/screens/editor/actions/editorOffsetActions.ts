import type { EditorState, EditorUndoSnapshot } from "../useEditorState";

export interface EditorOffsetActionsDeps {
  s: EditorState;
  pushUndo: () => void;
}

export function createEditorOffsetActions(deps: EditorOffsetActionsDeps) {
  const { s, pushUndo } = deps;

  function lastSnapshotOrNull(): EditorUndoSnapshot | null {
    const idx = s.undoStack.value.length - 1;
    if (idx < 0) return null;
    return s.undoStack.value[idx] ?? null;
  }

  function coerceFinite(value: unknown, fallback: number): number {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function startNumericEdit(
    editing: { active: boolean; previousValue: number },
    current: number,
  ) {
    editing.active = true;
    editing.previousValue = current;
  }

  function commitNumericEdit(
    editing: { active: boolean; previousValue: number },
    current: number,
  ) {
    if (!editing.active) return;
    const prev = editing.previousValue;
    editing.active = false;
    editing.previousValue = 0;
    if (Math.abs(prev - current) > 1e-6) {
      pushUndo();
    }
  }

  function cancelNumericEdit(
    editing: { active: boolean; previousValue: number },
    setValue: (value: number) => void,
  ) {
    if (!editing.active) return;
    setValue(editing.previousValue);
    editing.active = false;
    editing.previousValue = 0;
  }

  function onNumericValueChanged(
    editing: { active: boolean; previousValue: number },
    current: number,
    fallbackPrevious: () => number,
  ) {
    if (!editing.active) {
      const prev = fallbackPrevious();
      if (Math.abs(prev - current) <= 1e-6) return;
      pushUndo();
      editing.active = true;
      editing.previousValue = current;
      return;
    }
    const prev = editing.previousValue;
    if (Math.abs(prev - current) <= 1e-6) return;
    pushUndo();
    editing.previousValue = current;
  }

  function startEditingOffset() {
    startNumericEdit(s.offsetEditing.value, s.metaOffset.value);
  }

  function commitOffsetChange() {
    commitNumericEdit(s.offsetEditing.value, s.metaOffset.value);
  }

  function cancelOffsetEdit() {
    cancelNumericEdit(s.offsetEditing.value, (value) => {
      s.metaOffset.value = value;
    });
  }

  /**
   * Record offset edits as atomic undo steps as soon as value changes.
   * This covers stepper +/- clicks that may not blur the input immediately.
   */
  function onOffsetValueChanged() {
    onNumericValueChanged(s.offsetEditing.value, s.metaOffset.value, () => {
      const snap = lastSnapshotOrNull();
      return coerceFinite(snap?.offset, s.metaOffset.value);
    });
  }

  function startEditingChartMeter() {
    startNumericEdit(s.chartMeterEditing.value, s.editChartMeter.value);
  }

  function commitChartMeterChange() {
    commitNumericEdit(s.chartMeterEditing.value, s.editChartMeter.value);
  }

  function cancelChartMeterEdit() {
    cancelNumericEdit(s.chartMeterEditing.value, (value) => {
      s.editChartMeter.value = value;
    });
  }

  function onChartMeterValueChanged() {
    onNumericValueChanged(s.chartMeterEditing.value, s.editChartMeter.value, () => {
      const snap = lastSnapshotOrNull();
      return coerceFinite(snap?.chartMeter, s.editChartMeter.value);
    });
  }

  function startEditingSampleStart() {
    startNumericEdit(s.sampleStartEditing.value, s.metaSampleStart.value);
  }

  function commitSampleStartChange() {
    commitNumericEdit(s.sampleStartEditing.value, s.metaSampleStart.value);
  }

  function cancelSampleStartEdit() {
    cancelNumericEdit(s.sampleStartEditing.value, (value) => {
      s.metaSampleStart.value = value;
    });
  }

  function onSampleStartValueChanged() {
    onNumericValueChanged(s.sampleStartEditing.value, s.metaSampleStart.value, () => {
      const snap = lastSnapshotOrNull();
      return coerceFinite(snap?.sampleStart, s.metaSampleStart.value);
    });
  }

  function startEditingSampleLength() {
    startNumericEdit(s.sampleLengthEditing.value, s.metaSampleLength.value);
  }

  function commitSampleLengthChange() {
    commitNumericEdit(s.sampleLengthEditing.value, s.metaSampleLength.value);
  }

  function cancelSampleLengthEdit() {
    cancelNumericEdit(s.sampleLengthEditing.value, (value) => {
      s.metaSampleLength.value = value;
    });
  }

  function onSampleLengthValueChanged() {
    onNumericValueChanged(s.sampleLengthEditing.value, s.metaSampleLength.value, () => {
      const snap = lastSnapshotOrNull();
      return coerceFinite(snap?.sampleLength, s.metaSampleLength.value);
    });
  }

  return {
    startEditingOffset,
    commitOffsetChange,
    cancelOffsetEdit,
    onOffsetValueChanged,
    startEditingChartMeter,
    commitChartMeterChange,
    cancelChartMeterEdit,
    onChartMeterValueChanged,
    startEditingSampleStart,
    commitSampleStartChange,
    cancelSampleStartEdit,
    onSampleStartValueChanged,
    startEditingSampleLength,
    commitSampleLengthChange,
    cancelSampleLengthEdit,
    onSampleLengthValueChanged,
  };
}
