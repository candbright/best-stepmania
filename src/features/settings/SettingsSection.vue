<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
  }>(),
  { title: "" },
);
</script>

<template>
  <section class="section">
    <slot name="head">
      <h3 v-if="title">{{ title }}</h3>
    </slot>
    <slot />
  </section>
</template>

<style scoped>
.section {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.02));
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1rem 1.25rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}
.section :deep(h3) {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
}
.section :deep(.section-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.section :deep(.section-head h3) {
  margin: 0;
}
.section :deep(.section-head-toggle) {
  margin-left: auto;
  display: inline-flex;
  flex: 0 0 auto;
}
.section :deep(.section-head-actions) {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}
</style>
