import type { Router } from "vue-router";
import type { RouteLocationNormalizedLoaded } from "vue-router";
import { playMenuBack } from "@/shared/lib/sfx";
import { useGameStore } from "@/shared/stores/game";
import { useSessionStore } from "@/shared/stores/session";

type GameStore = ReturnType<typeof useGameStore>;
type SessionStore = ReturnType<typeof useSessionStore>;

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
  game: GameStore,
  session: SessionStore,
) {
  return (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (!game.shortcutMatches(e, "global.back")) return;
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
      if (game.previewReturnToEditor) {
        game.editorWarmResume = true;
        game.previewFromSecond = null;
        game.previewReturnToEditor = false;
        void router.push("/editor");
        return;
      }
      game.resumePlaybackOnReturn = true;
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
  const game = useGameStore();
  const session = useSessionStore();
  return createGlobalEscHandler(router, route, game, session);
}
