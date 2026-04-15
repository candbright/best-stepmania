import type { EditorState } from "../useEditorState";
import { BPM_BEAT_MATCH_EPS } from "../constants";

export interface EditorBpmActionsDeps {
  s: EditorState;
  pushUndo: () => void;
}

export function createEditorBpmActions(deps: EditorBpmActionsDeps) {
  const { s, pushUndo } = deps;

  function getBpmAtBeat(beat: number): number {
    let currentBpm = s.bpm.value;
    for (const change of s.bpmChanges.value) {
      if (change.beat <= beat) currentBpm = change.bpm;
      else break;
    }
    return currentBpm;
  }

  function addBpmChangeFromInput() {
    const beat = s.newBpmBeat.value;
    const bpmVal = s.newBpmValue.value;
    if (beat < 0 || bpmVal <= 0) return;
    const existing = s.bpmChanges.value.findIndex((c) => Math.abs(c.beat - beat) < BPM_BEAT_MATCH_EPS);
    if (existing >= 0) {
      s.bpmChanges.value[existing].bpm = bpmVal;
    } else {
      s.bpmChanges.value.push({ beat, bpm: bpmVal });
      s.bpmChanges.value.sort((a, b) => a.beat - b.beat);
    }
    if (Math.abs(beat) < BPM_BEAT_MATCH_EPS) s.bpm.value = bpmVal;
    pushUndo();
  }

  function updateBpmChange(index: number, newBpmVal: number) {
    if (newBpmVal <= 0 || isNaN(newBpmVal)) return;
    if (index >= 0 && index < s.bpmChanges.value.length) {
      const prevVal = s.bpmChanges.value[index].bpm;
      if (Math.abs(prevVal - newBpmVal) < 1e-4) return;
      s.bpmChanges.value[index].bpm = newBpmVal;
      if (index === 0) s.bpm.value = newBpmVal;
      pushUndo();
    }
  }

  function deleteBpmChange(index: number) {
    if (s.bpmChanges.value.length <= 1) return;
    if (index < 0 || index >= s.bpmChanges.value.length) return;
    const entry = s.bpmChanges.value[index];
    if (Math.abs(entry.beat) < BPM_BEAT_MATCH_EPS) return;
    const editing = s.editingBpmChangeIndex.value;
    if (editing === index) {
      s.editingBpmChangeIndex.value = -1;
    } else if (editing > index) {
      s.editingBpmChangeIndex.value = editing - 1;
    }
    s.bpmChanges.value.splice(index, 1);
    s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;
    pushUndo();
  }

  function startEditingBpmChange(index: number) {
    if (index < 0 || index >= s.bpmChanges.value.length) return;
    s.editingBpmChangeIndex.value = index;
    s.editingBpmInputValue.value = String(s.bpmChanges.value[index].bpm);
  }

  function commitBpmEdit() {
    const idx = s.editingBpmChangeIndex.value;
    if (idx < 0 || idx >= s.bpmChanges.value.length) {
      s.editingBpmChangeIndex.value = -1;
      return;
    }
    const newVal = parseFloat(s.editingBpmInputValue.value);
    if (!isNaN(newVal) && newVal > 0) {
      updateBpmChange(idx, newVal);
    }
    s.editingBpmChangeIndex.value = -1;
  }

  function cancelBpmEdit() {
    s.editingBpmChangeIndex.value = -1;
  }

  function mergeBpmAtBeat(beat: number, bpmVal: number) {
    if (bpmVal <= 0 || isNaN(bpmVal)) return;
    const existing = s.bpmChanges.value.findIndex((c) => Math.abs(c.beat - beat) < BPM_BEAT_MATCH_EPS);
    if (existing >= 0) {
      s.bpmChanges.value[existing].bpm = bpmVal;
    } else {
      s.bpmChanges.value.push({ beat, bpm: bpmVal });
      s.bpmChanges.value.sort((a, b) => a.beat - b.beat);
    }
    s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;
  }

  function addBpmChangeAtBeat(beat: number) {
    const currentBpm = getBpmAtBeat(beat);
    const existing = s.bpmChanges.value.findIndex((c) => Math.abs(c.beat - beat) < BPM_BEAT_MATCH_EPS);
    if (existing >= 0) {
      startEditingBpmChange(existing);
      return;
    }
    s.bpmChanges.value.push({ beat, bpm: currentBpm });
    s.bpmChanges.value.sort((a, b) => a.beat - b.beat);
    pushUndo();
    const newIdx = s.bpmChanges.value.findIndex((c) => Math.abs(c.beat - beat) < BPM_BEAT_MATCH_EPS);
    if (newIdx >= 0) {
      startEditingBpmChange(newIdx);
    }
  }

  return {
    getBpmAtBeat,
    addBpmChangeFromInput,
    updateBpmChange,
    deleteBpmChange,
    startEditingBpmChange,
    commitBpmEdit,
    cancelBpmEdit,
    mergeBpmAtBeat,
    addBpmChangeAtBeat,
  };
}
