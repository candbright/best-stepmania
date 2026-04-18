import type { Router } from "vue-router";
import type { RouteLocationNormalizedLoaded } from "vue-router";
import { playMenuBack } from "@/shared/lib/sfx";
import { useSessionStore } from "@/shared/stores/session";
import { useSettingsStore } from "@/shared/stores/settings";
import { mergeShortcutBindings, eventMatchesBinding, type ShortcutId } from "@/shared/lib/engine/keyBindings";

type SessionStore = ReturnType<typeof useSessionStore>;
type SettingsStore = ReturnType<typeof useSettingsStore>;

function shortcutMatches(settings: SettingsStore, e: KeyboardEvent, id: ShortcutId): boolean {
  const binding = mergeShortcutBindings(settings.shortcutOverrides)[id];
  return eventMatchesBinding(e, binding);
}

function shouldIgnoreEscTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === "INPUT" && (target as HTMLInputElement).type !== "range") return true;
  if (tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return true;
  return false;
}

/**
 * Global Back shortcut: mirrors legacy Esc routing rules.
 */
export function createGlobalEscHandler(
  router: Router,
  route: RouteLocationNormalizedLoaded,
  settings: SettingsStore,
  session: SessionStore,
) {
  return (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (!shortcutMatches(settings, e, "global.back")) return;
    if (shouldIgnoreEscTarget(e.target as HTMLElement | null)) return;

    if (route.path === "/editor") {
      return;
    }

    if (route.path === "/select-music") {
      e.preventDefault();
      playMenuBack();
      session.openPlayModeSelectAfterTitleEnter = true;
      void router.push("/");
      return;
    }

    if (route.path === "/player-options") {
      e.preventDefault();
      playMenuBack();
      if (session.previewReturnToEditor) {
        session.editorWarmResume = true;
        session.previewFromSecond = null;
        session.previewReturnToEditor = false;
        session.editorPreviewAnchorSecond = null;
        void router.push("/editor");
        return;
      }
      session.resumePlaybackOnReturn = true;
      void router.push("/select-music");
      return;
    }

    const backMap: Record<string, string> = {
      "/options": "/",
      "/song-packs": "/options",
      "/editor-select": "/",
      "/evaluation": "/player-options",
    };

    const targetPath = backMap[route.path];
    if (!targetPath || targetPath === route.path) return;

    e.preventDefault();
    playMenuBack();
    void router.push(targetPath);
  };
}

export function useGlobalHotkeys(router: Router, route: RouteLocationNormalizedLoaded) {
  const settings = useSettingsStore();
  const session = useSessionStore();
  return createGlobalEscHandler(router, route, settings, session);
}
