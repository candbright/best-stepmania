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
const canvasRef = ref<HTMLCanvasElement | null>(null);
const hasVideo = ref(false);
const hasImage = ref(false);
let animFrame = 0;
let particleTime = 0;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
}

const particles: Particle[] = [];
const PARTICLE_COUNT = 60;

function initParticles(w: number, h: number) {
  particles.length = 0;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -Math.random() * 0.5 - 0.2,
      size: Math.random() * 3 + 1,
      alpha: Math.random() * 0.3 + 0.05,
      hue: Math.random() * 60 + 250,
    });
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
  particleTime += dt;
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, w * 0.8);
  grad.addColorStop(0, "rgba(30, 10, 60, 0.4)");
  grad.addColorStop(1, "rgba(5, 5, 15, 0.8)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (const p of particles) {
    p.x += p.vx + Math.sin(particleTime * 0.5 + p.y * 0.01) * 0.3;
    p.y += p.vy;
    if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
    if (p.x < -10) p.x = w + 10;
    if (p.x > w + 10) p.x = -10;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.alpha})`;
    ctx.fill();
  }
}

let lastTime = 0;
function animate(time: number) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dt = lastTime ? (time - lastTime) / 1000 : 0.016;
  lastTime = time;
  drawParticles(ctx, canvas.width, canvas.height, dt);
  animFrame = requestAnimationFrame(animate);
}

function startFallback() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initParticles(canvas.width, canvas.height);
  lastTime = 0;
  animFrame = requestAnimationFrame(animate);
}

function stopFallback() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = 0; }
}

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

  if (!hasVideo.value && !hasImage.value) {
    startFallback();
  }
});

onUnmounted(() => {
  stopFallback();
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
    <canvas v-else ref="canvasRef" class="bg-canvas" />
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
.bg-canvas {
  width: 100%;
  height: 100%;
}
.bg-dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, var(--dim, 0.6));
  pointer-events: none;
}
</style>
