<script setup lang="ts">
import { useI18n } from "@/i18n";

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "resume"): void;
  (e: "quit"): void;
  (e: "quitToSelect"): void;
}>();

const { t } = useI18n();

function resumeMenu() {
  emit("resume");
}

function quitMenu() {
  emit("quit");
}

function quitToSelectMusicMenu() {
  emit("quitToSelect");
}
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="overlay-pause" @click="resumeMenu">
      <div class="pause-card" @click.stop>
        <div class="pause-title">{{ t('gameplay.paused') }}</div>
        <div class="pause-divider" />
        <button class="pause-btn primary" @click="resumeMenu">{{ t('gameplay.resume') }}</button>
        <button class="pause-btn" @click="quitMenu">{{ t('gameplay.quit') }}</button>
        <button class="pause-btn" @click="quitToSelectMusicMenu">{{ t('eval.selectMusic') }}</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;600;700&display=swap');

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.overlay-pause {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(2px);
  font-family: 'Rajdhani', sans-serif;
}
.pause-card {
  width: min(420px, 86vw);
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 94%, #000);
  box-shadow: 0 16px 40px rgba(0,0,0,0.45);
}
.pause-title {
  text-align: center;
  font-size: 1rem;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.2em;
  color: color-mix(in srgb, var(--text-color) 88%, transparent);
}
.pause-divider {
  height: 1px;
  margin: 0.8rem 0 1rem;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--text-color) 20%, transparent), transparent);
}
.pause-btn {
  width: 100%;
  margin-top: 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--section-bg);
  color: color-mix(in srgb, var(--text-color) 88%, transparent);
  padding: 0.62rem 0.75rem;
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
}
.pause-btn.primary {
  background: linear-gradient(135deg, var(--primary-color), var(--accent-secondary));
  border-color: transparent;
  color: var(--text-on-primary);
}
.pause-btn:hover { filter: brightness(1.08); }
</style>
