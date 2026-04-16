import type { NavigationGuard } from "vue-router";
import { usePlayerStore } from "@/shared/stores/player";
import { useSessionStore } from "@/shared/stores/session";

/** Pause / resume title music when entering or leaving the options screen from the title route. */
export const titleOptionsMusicGuard: NavigationGuard = (to, from) => {
  if (from.path === "/" && to.path === "/options") {
    const player = usePlayerStore();
    const session = useSessionStore();
    session.resumeTitleMusicAfterOptions = player.status === "playing" || player.status === "loading";
    void player.pauseTitleMusicForOptions();
    return;
  }
  if (from.path === "/options" && to.path === "/") {
    const player = usePlayerStore();
    const session = useSessionStore();
    const shouldResume = session.resumeTitleMusicAfterOptions;
    session.resumeTitleMusicAfterOptions = false;
    if (shouldResume) {
      void player.resumeTitleMusicAfterOptions();
    }
  }
};
