<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import MusicPlayer from "@/components/MusicPlayer.vue";
import AppLoadingOverlay from "@/components/AppLoadingOverlay.vue";
import CursorLayer from "@/components/CursorLayer.vue";
import { useGameStore } from "@/stores/game";
import { useBlockingOverlayStore } from "@/stores/blockingOverlay";
import { useGlobalSfxBridge } from "@/composables/useGlobalSfxBridge";
import { useGlobalHotkeys } from "@/composables/useGlobalHotkeys";

const router = useRouter();
const route = useRoute();
const game = useGameStore();
const blockingOverlay = useBlockingOverlayStore();

const stopSfxBridge = useGlobalSfxBridge(game);
const handleGlobalEsc = useGlobalHotkeys(router, route);

onMounted(() => {
  window.addEventListener("keydown", handleGlobalEsc);
});

onUnmounted(() => {
  stopSfxBridge();
  window.removeEventListener("keydown", handleGlobalEsc);
});
</script>

<template>
  <div class="app-shell">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <keep-alive :include="['EditorScreen']">
          <component :is="Component" :key="route.path" />
        </keep-alive>
      </transition>
    </router-view>
    <AppLoadingOverlay
      v-model:open="blockingOverlay.open"
      :message="blockingOverlay.message"
      :error="blockingOverlay.error"
      :show-retry="blockingOverlay.showRetry"
      @cancel="blockingOverlay.invokeCancel"
      @retry="blockingOverlay.invokeRetry"
    />
    <MusicPlayer />
  </div>
  <CursorLayer />
</template>

<style>
.app-shell {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.hide-system-cursor-global,
.hide-system-cursor-global * {
  cursor: none !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
