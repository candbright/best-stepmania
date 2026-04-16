<script setup lang="ts">
defineProps<{
  side: "p1" | "p2";
  whoLabel: string;
  lifePercent: number;
  lifeClass: string;
}>();
</script>

<template>
  <div class="hud-life-cluster" :class="side === 'p1' ? 'hud-life-p1' : 'hud-life-p2'">
    <span class="hud-life-who">{{ whoLabel }}</span>
    <div class="hud-life-wrap hud-life-wrap--top">
      <div class="hud-life-track">
        <div class="hud-life-fill" :style="{ width: lifePercent + '%' }" :class="lifeClass" />
        <div class="hud-life-shine" />
      </div>
      <div class="hud-life-label">{{ lifePercent }}%</div>
    </div>
  </div>
</template>

<style scoped>
.hud-life-cluster {
  flex: 0 1 min(42vw, 20rem);
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 8rem;
}
.hud-life-p2 {
  flex-direction: row-reverse;
  text-align: right;
}
.hud-life-p2 .hud-life-label {
  text-align: left;
}
.hud-life-who {
  flex: 0 0 auto;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.38);
  text-transform: uppercase;
  max-width: 4.2rem;
  line-height: 1.15;
}
.hud-life-p1 .hud-life-who {
  color: color-mix(in srgb, var(--text-color) 55%, transparent);
}
.hud-life-p2 .hud-life-who {
  color: #80deea;
}
.hud-life-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.hud-life-wrap--top {
  flex: 1;
}
.hud-life-track {
  flex: 1;
  height: 0.3125rem;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}
.hud-life-fill {
  height: 100%;
  border-radius: 3px;
  transition:
    width 0.15s ease,
    background 0.3s ease;
}
.hud-life-fill.life-high {
  background: linear-gradient(90deg, #00e676, #69f0ae);
}
.hud-life-fill.life-mid {
  background: linear-gradient(90deg, #ffab00, #ffd740);
}
.hud-life-fill.life-low {
  background: linear-gradient(90deg, #ff1744, #ff5252);
  animation: lifePulse 0.5s ease infinite;
}
@keyframes lifePulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.hud-life-shine {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.1), transparent);
  border-radius: 3px 3px 0 0;
  pointer-events: none;
}
.hud-life-label {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 2.2em;
  text-align: right;
}
</style>
