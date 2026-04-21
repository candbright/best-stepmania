<script setup lang="ts">
interface Props {
  refreshing?: boolean;
  hasActiveFilter?: boolean;
  activeFilterCount?: number;
  sortLabel?: string;
  refreshTitle: string;
  filterLabel: string;
  randomTitle?: string;
}

interface Emits {
  (e: "refresh"): void;
  (e: "openFilter"): void;
  (e: "cycleSort"): void;
  (e: "randomPick"): void;
}

withDefaults(defineProps<Props>(), {
  refreshing: false,
  hasActiveFilter: false,
  activeFilterCount: 0,
  sortLabel: "",
  randomTitle: "",
});

const emit = defineEmits<Emits>();
</script>

<template>
  <button class="tb-icon-btn" :title="randomTitle" @click="emit('randomPick')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  </button>

  <button class="tb-icon-btn" :title="refreshTitle" :disabled="refreshing" @click="emit('refresh')">
    <svg
      v-if="!refreshing"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
    <span v-else class="spinner">&#x27F3;</span>
  </button>

  <button class="tb-btn filter-btn" :class="{ active: hasActiveFilter }" @click="emit('openFilter')">
    {{ filterLabel }}
    <span v-if="activeFilterCount > 0" class="filter-badge">{{ activeFilterCount }}</span>
  </button>

  <button class="tb-btn sort-btn" @click="emit('cycleSort')">{{ sortLabel }}</button>

  <div class="topbar-extra">
    <slot />
  </div>
</template>

<style scoped>
.tb-btn {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  font-family: "Rajdhani", sans-serif;
  transition: all 0.15s;
}
.tb-btn:hover {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}
.tb-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.tb-btn.active {
  background: color-mix(in srgb, var(--primary-color) 18%, var(--section-bg));
  border-color: var(--primary-color);
  color: var(--text-color);
}

.topbar-extra {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.topbar-extra :deep(.tb-btn) {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  font-family: "Rajdhani", sans-serif;
  transition: all 0.15s;
}

.topbar-extra :deep(.tb-btn:hover) {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}

.topbar-extra :deep(.tb-btn:disabled) {
  opacity: 0.3;
  cursor: not-allowed;
}

.topbar-extra :deep(.tb-icon-btn) {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.topbar-extra :deep(.tb-icon-btn:hover:not(:disabled)) {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}

.topbar-extra :deep(.tb-icon-btn:disabled) {
  opacity: 0.3;
  cursor: not-allowed;
}

.tb-icon-btn {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.tb-icon-btn:hover:not(:disabled) {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}
.tb-icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.sort-btn,
.filter-btn {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
}
.filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.filter-badge {
  margin-left: 0.35rem;
  min-width: 1.15em;
  padding: 0.04rem 0.32rem;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  background: color-mix(in srgb, var(--accent-secondary) 35%, transparent);
  color: var(--text-on-primary);
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
