<script setup lang="ts">
interface Props {
  primaryLabel: string;
  primaryDisabled?: boolean;
  hintText?: string;
}

interface Emits {
  (e: "primary"): void;
}

withDefaults(defineProps<Props>(), {
  primaryDisabled: false,
  hintText: "",
});

const emit = defineEmits<Emits>();
</script>

<template>
  <div class="action-row">
    <button class="play-btn" :disabled="primaryDisabled" @click="emit('primary')">
      {{ primaryLabel }}
    </button>
    <slot name="secondary" />
  </div>
  <div v-if="hintText" class="no-chart-hint">{{ hintText }}</div>
</template>

<style scoped>
.action-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem 1.25rem;
}
.play-btn {
  flex: 1;
  padding: 0.85rem;
  font-family: "Orbitron", sans-serif;
  font-size: 0.85rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-color-hover) 100%);
  border: none;
  border-radius: 10px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 4px 20px var(--primary-color-glow);
}
.play-btn:hover {
  filter: brightness(1.12);
  box-shadow: 0 6px 28px var(--primary-color-glow);
  transform: translateY(-1px);
}
.play-btn:active {
  transform: translateY(0);
}
.play-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(0.2);
  box-shadow: none;
}

.no-chart-hint {
  padding: 0 1.25rem 1rem;
  color: color-mix(in srgb, #ff8a80 55%, var(--text-muted));
  font-size: 0.75rem;
}

@media (max-width: 880px) {
  .action-row {
    flex-wrap: wrap;
  }
  .play-btn {
    flex: 1 1 100%;
    width: 100%;
  }
}
</style>
