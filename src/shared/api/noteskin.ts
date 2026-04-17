import { invoke } from "./core";

export interface NoteSkinColors {
  left: string;
  down: string;
  up: string;
  right: string;
  mine: string;
  holdBody: string;
  holdCap: string;
  receptorIdle: string;
  receptorActive: string;
  judgmentLine: string;
}

export interface NoteSkinSnapshot {
  name: string;
  noteWidth: number;
  noteHeight: number;
  receptorWidth: number;
  receptorHeight: number;
  holdBodyWidth: number;
  supportsRotation: boolean;
  colors: NoteSkinColors;
}

export async function listNoteskins(): Promise<string[]> {
  return invoke<string[]>("list_noteskins");
}

export async function getNoteskin(name: string): Promise<NoteSkinSnapshot> {
  return invoke<NoteSkinSnapshot>("get_noteskin", { name });
}

export async function loadNoteskinsFromDir(dir: string): Promise<number> {
  return invoke<number>("load_noteskins_from_dir", { dir });
}
