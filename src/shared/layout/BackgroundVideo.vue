<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { logOptionalRejection } from "@/utils/devLog";

const props = defineProps<{
  videoPath?: string;
  bgImagePath?: string;
  playing?: boolean;
  dimLevel?: number;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const hasVideo = ref(false);
const hasImage = ref(false);

watch(() => props.playing, (val) => {
  if (hasVideo.value && videoRef.value) {
    if (val) videoRef.value.play().catch((e) => logOptionalRejection("backgroundVideo.play", e));
    else videoRef.value.pause();
  }
});

onMounted(() => {
  if (props.videoPath) {
    hasVideo.value = true;
  } else if (props.bgImagePath) {
    hasImage.value = true;
  }
});

onUnmounted(() => {
  void 0;
});
</script>

<template>
  <div class="bg-layer" :style="{ '--dim': (dimLevel ?? 0.6) }">
    <video
      v-if="hasVideo"
      ref="videoRef"
      :src="videoPath"
      class="bg-video"
      loop
      muted
      playsinline
      autoplay
    />
    <div v-else-if="hasImage" class="bg-image" :style="{ backgroundImage: `url(${bgImagePath})` }" />
    <!-- 静态渐变：避免与 NoteField 并行 rAF 抢主线程（无视频/背景图时） -->
    <div v-else class="bg-fallback" aria-hidden="true" />
    <div class="bg-dim" />
  </div>
</template>

<style scoped>
.bg-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}
.bg-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bg-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}
.bg-fallback {
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse 120% 80% at 50% 20%, rgba(45, 20, 80, 0.55) 0%, rgba(8, 8, 20, 1) 55%);
}
.bg-dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, var(--dim, 0.6));
  pointer-events: none;
}
</style>
