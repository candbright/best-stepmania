import { createRouter, createWebHashHistory, createWebHistory } from "vue-router";
import { isTauri } from "@/utils/platform";
import { titleOptionsMusicGuard } from "@/router/titleOptionsMusicGuard";
/** 首屏同步打包，避免懒加载 chunk 未到时的空窗黑屏 */
import TitleScreen from "./screens/TitleScreen.vue";

const router = createRouter({
  history: isTauri() ? createWebHashHistory() : createWebHistory(),
  routes: [
    {
      path: "/",
      name: "title",
      component: TitleScreen,
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

router.beforeEach(titleOptionsMusicGuard);

router.onError((error) => {
  console.error("Router navigation failed:", error);
});

export default router;
