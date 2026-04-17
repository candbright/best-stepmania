<script setup lang="ts">
import { useI18n } from "@/shared/i18n";

defineProps<{
  gameState: string;
  savingScore: boolean;
}>();

const { t } = useI18n();

</script>

<template>
  <transition name="fade">
    <div v-if="gameState === 'finished'" class="overlay-result cleared">
      <div class="result-lines">
        <div class="result-tag">{{ t('gameplay.resultStage') }}</div>
        <div class="result-main">{{ t('gameplay.resultCleared') }}</div>
      </div>
      <div v-if="savingScore" class="result-saving">{{ t('gameplay.saving') }}</div>
    </div>
    <div v-else-if="gameState === 'failed'" class="overlay-result failed">
      <div class="result-lines">
        <div class="result-tag">{{ t('gameplay.resultGame') }}</div>
        <div class="result-main">{{ t('gameplay.resultOver') }}</div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.overlay-result {
  position: absolute; inset: 0; z-index: 30;
  display: flex; align-items: center; justify-content: center;
  animation: fadeIn 0.4s ease;
  flex-direction: column;
}
.overlay-result.cleared { background: rgba(0, 100, 50, 0.35); }
.overlay-result.failed  { background: rgba(120, 0, 20, 0.35); }
.result-lines { text-align: center; }
.result-tag {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.1rem; font-weight: 700;
  letter-spacing: 0.4em;
  color: var(--text-muted);
  margin-bottom: 0.2rem;
}
.result-main {
  font-family: 'Orbitron', sans-serif;
  font-size: 4rem; font-weight: 900;
  letter-spacing: 0.08em;
  animation: resultPulse 1.2s ease infinite;
}
.overlay-result.cleared .result-main {
  color: #69f0ae;
  text-shadow: 0 0 60px rgba(105,240,174,0.6);
}
.overlay-result.failed .result-main {
  color: #ff5252;
  text-shadow: 0 0 60px rgba(255,82,82,0.6);
}
.result-saving {
  margin-top: 1rem;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.8rem; color: var(--text-subtle);
  letter-spacing: 0.15em;
}

@keyframes resultPulse { 0%,100% { opacity: 0.8; } 50% { opacity: 1; } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
