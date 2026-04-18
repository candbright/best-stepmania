import { createRouter, createWebHashHistory, createWebHistory } from "vue-router";
import { isTauri } from "@/shared/lib/platform";
import { devInfo } from "@/shared/lib/devLog";
import { titleOptionsMusicGuard } from "@/app/router/titleOptionsMusicGuard";
/** 首屏同步打包，避免懒加载 chunk 未到时的空窗黑屏 */
import TitleScreen from "@/pages/TitleScreen.vue";

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
      component: () => import("@/pages/SelectMusicScreen.vue"),
    },
    {
      path: "/player-options",
      name: "player-options",
      component: () => import("@/pages/PlayerOptionsScreen.vue"),
    },
    {
      path: "/gameplay",
      name: "gameplay",
      component: () => import("@/pages/GameplayScreen.vue"),
    },
    {
      path: "/evaluation",
      name: "evaluation",
      component: () => import("@/pages/EvaluationScreen.vue"),
    },
    {
      path: "/options",
      name: "options",
      component: () => import("@/pages/OptionsScreen.vue"),
    },
    {
      path: "/song-packs",
      name: "song-packs",
      component: () => import("@/pages/SongPacksScreen.vue"),
    },
    {
      path: "/editor-select",
      name: "editor-select",
      component: () => import("@/pages/EditorSongSelectScreen.vue"),
    },
    {
      path: "/editor",
      name: "editor",
      component: () => import("@/pages/EditorScreen.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

router.beforeEach(titleOptionsMusicGuard);

router.afterEach((to) => {
  devInfo("Router", String(to.name ?? to.path), to.fullPath);
});

router.onError((error) => {
  console.error("Router navigation failed:", error);
});

export default router;
