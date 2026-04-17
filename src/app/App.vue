<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { MusicPlayer } from "@/widgets";
import { AppLoadingOverlay } from "@/shared/ui";
import { CursorLayer } from "@/shared/layout";
import { useSettingsStore } from "@/shared/stores/settings";
import { useBlockingOverlayStore } from "@/shared/stores/blockingOverlay";
import { useGlobalSfxBridge } from "@/shared/composables/useGlobalSfxBridge";
import { useGlobalHotkeys } from "@/shared/composables/useGlobalHotkeys";

const router = useRouter();
const route = useRoute();
const settings = useSettingsStore();
const blockingOverlay = useBlockingOverlayStore();

const loadingWindowDragStripEnabled = computed(() => settings.windowDisplayPreset !== "borderless");

const stopSfxBridge = useGlobalSfxBridge(settings);
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
      :show-cancel="blockingOverlay.showCancel"
      :progress="blockingOverlay.progress"
      :window-drag-strip-enabled="loadingWindowDragStripEnabled"
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
  /* mount 首帧即有底色，避免在 router-view 内容就绪前透出“纯黑”感 */
  background: var(--bg-color);
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
