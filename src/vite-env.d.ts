/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected in vite.config.ts from root package.json `version`. */
  readonly VITE_APP_VERSION: string;
}

/** Tauri injects this in the webview; optional File System Access API in Chromium. */
interface Window {
  __TAURI_INTERNALS__?: unknown;
  showDirectoryPicker?(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
