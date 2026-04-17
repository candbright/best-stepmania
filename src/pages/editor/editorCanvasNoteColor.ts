// Editor canvas: note / receptor color (pump-routine vs column palette).

import { routineColorHex, type RoutinePlayerColorId } from "@/shared/constants/routinePlayerColors";

/** Match NoteField.vue pump-routine coloring: layer 1/2 from note, else infer from 5|5 panel halves. */
export function editorCanvasNoteColor(
  track: number,
  routineLayer: 1 | 2 | null | undefined,
  isPumpRoutine: boolean,
  numTracks: number,
  colColors: readonly string[],
  routineP1ColorId: RoutinePlayerColorId,
  routineP2ColorId: RoutinePlayerColorId,
): string {
  if (!isPumpRoutine) {
    return colColors[track % colColors.length]!;
  }
  if (routineLayer === 1 || routineLayer === 2) {
    const id = routineLayer === 2 ? routineP2ColorId : routineP1ColorId;
    return routineColorHex(id) ?? colColors[track % colColors.length]!;
  }
  if (numTracks === 10) {
    const id = track < 5 ? routineP1ColorId : routineP2ColorId;
    return routineColorHex(id) ?? colColors[track % colColors.length]!;
  }
  return colColors[track % colColors.length]!;
}
