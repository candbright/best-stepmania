<script setup lang="ts">
defineProps<{
  side: "p1" | "p2";
  score: number;
  combo: number;
  scoreLabel: string;
}>();
</script>

<template>
  <div class="hud-score" :class="side === 'p1' ? 'hud-score--p1' : 'hud-score--p2'">
    <div class="hud-score-val">{{ score.toLocaleString() }}</div>
    <div class="hud-score-label">{{ scoreLabel }}</div>
    <div v-if="combo > 0" class="hud-combo">{{ combo }}x</div>
  </div>
</template>

<style scoped>
.hud-score {
  flex: 0 0 auto;
  text-align: right;
}
.hud-score--p1 {
  text-align: left;
  align-self: flex-start;
}
.hud-score--p2 {
  text-align: right;
  align-self: flex-end;
}
.hud-score-val {
  font-size: 1.25rem;
  font-weight: 900;
  font-family: "Orbitron", sans-serif;
  color: color-mix(in srgb, var(--text-color) 85%, transparent);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.hud-score-label {
  font-size: 0.5rem;
  color: var(--text-subtle);
  letter-spacing: 0.25em;
  text-transform: uppercase;
}
.hud-combo {
  font-family: "Orbitron", sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-color, #00e5ff);
  opacity: 0.9;
  margin-top: 0.1rem;
}
</style>
