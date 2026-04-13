import { createRouter, createWebHashHistory, createWebHistory } from "vue-router";
import { isTauri } from "@/utils/platform";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";

const router = createRouter({
  history: isTauri() ? createWebHashHistory() : createWebHistory(),
  routes: [
    {
      path: "/",
      name: "title",
      component: () => import("./screens/TitleScreen.vue"),
    },
    {
      path: "/select-music",
      name: "select-music",
      component: () => import("./screens/SelectMusicScreen.vue"),
    },
    {
      path: "/player-options",
      name: "player-options",
      component: () => import("./screens/PlayerOptionsScreen.vue"),
    },
    {
      path: "/gameplay",
      name: "gameplay",
      component: () => import("./screens/GameplayScreen.vue"),
    },
    {
      path: "/evaluation",
      name: "evaluation",
      component: () => import("./screens/EvaluationScreen.vue"),
    },
    {
      path: "/options",
      name: "options",
      component: () => import("./screens/OptionsScreen.vue"),
    },
    {
      path: "/song-packs",
      name: "song-packs",
      component: () => import("./screens/SongPacksScreen.vue"),
    },
    {
      path: "/editor-select",
      name: "editor-select",
      component: () => import("./screens/EditorSongSelectScreen.vue"),
    },
    {
      path: "/editor",
      name: "editor",
      component: () => import("./screens/EditorScreen.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

router.beforeEach((to, from) => {
  if (from.path === "/" && to.path === "/options") {
    const player = usePlayerStore();
    const session = useSessionStore();
    session.resumeTitleMusicAfterOptions =
      player.status === "playing" || player.status === "loading";
    void player.stopForGame();
    return;
  }
  if (from.path === "/options" && to.path === "/") {
    const player = usePlayerStore();
    const session = useSessionStore();
    const shouldResume = session.resumeTitleMusicAfterOptions;
    session.resumeTitleMusicAfterOptions = false;
    if (shouldResume) {
      void player.resumeAfterGame();
    }
  }
});

router.onError((error) => {
  console.error("Router navigation failed:", error);
});

export default router;
