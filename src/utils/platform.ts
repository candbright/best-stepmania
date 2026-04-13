/**
 * Platform detection and web-compatible fallbacks for Tauri APIs.
 */

/** Returns true when running inside the Tauri webview (Rust backend available). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}

/**
 * Open a directory picker dialog.
 * - In Tauri: uses the native Tauri dialog plugin.
 * - In web browser: uses the File System Access API (showDirectoryPicker).
 * Returns the selected directory path (Tauri) or a FileSystemDirectoryHandle (web), or null if cancelled.
 */
export async function openDirectoryDialog(title?: string): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title: title ?? "Select Folder" });
    return selected ? (selected as string) : null;
  }

  const pick = typeof window !== "undefined" ? window.showDirectoryPicker : undefined;
  if (typeof pick === "function") {
    try {
      const handle: FileSystemDirectoryHandle = await pick.call(window, { mode: "read" });
      return handle.name; // Return directory name as identifier
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return null;
      throw e;
    }
  }

  throw new Error("Directory picker is not supported in this browser. Please use Chrome or Edge, or the desktop app.");
}

/**
 * Open a file picker dialog.
 * - In Tauri: uses the native Tauri dialog plugin.
 * - In web: uses <input type="file">.
 * Returns the selected file path (Tauri) or null if cancelled.
 */
export async function openFileDialog(options?: {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiple?: boolean;
}): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: false,
      multiple: options?.multiple ?? false,
      title: options?.title ?? "Select File",
      filters: options?.filters,
    });
    return selected ? (selected as string) : null;
  }

  // Web fallback: <input type="file">
  return new Promise<string | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (options?.filters?.length) {
      input.accept = options.filters
        .flatMap((f) => f.extensions.map((e) => `.${e}`))
        .join(",");
    }
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? file.name : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Read all song files from a directory using the browser's File System Access API.
 * Returns an array of { path, content } for .sm and .ssc files found.
 */
export async function readSongFilesFromDirectory(): Promise<Array<{ name: string; path: string; content: string; audioFile?: File; bannerFile?: File }>> {
  const pick = typeof window !== "undefined" ? window.showDirectoryPicker : undefined;
  if (typeof pick !== "function") {
    throw new Error("File System Access API not supported");
  }

  const handle: FileSystemDirectoryHandle = await pick.call(window, { mode: "read" });
  const results: Array<{ name: string; path: string; content: string; audioFile?: File; bannerFile?: File }> = [];

  /** Chromium exposes `values()`; TS `lib.dom` may lag behind. */
  type DirValues = FileSystemDirectoryHandle & {
    values(): AsyncIterableIterator<FileSystemHandle>;
  };

  async function scanDir(dirHandle: FileSystemDirectoryHandle, basePath: string) {
    for await (const entry of (dirHandle as DirValues).values()) {
      const name = entry.name;
      if (entry.kind === "directory") {
        await scanDir(entry as FileSystemDirectoryHandle, `${basePath}/${name}`);
      } else if (entry.kind === "file") {
        const lowerName = name.toLowerCase();
        if (lowerName.endsWith(".sm") || lowerName.endsWith(".ssc")) {
          const file = await (entry as FileSystemFileHandle).getFile();
          const content = await file.text();
          results.push({ name, path: `${basePath}/${name}`, content });
        }
      }
    }
  }

  await scanDir(handle, handle.name);
  return results;
}
