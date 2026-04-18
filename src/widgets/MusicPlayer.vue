<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { usePlayerStore } from "@/shared/stores/player";
import { useLibraryStore } from "@/shared/stores/library";
import { useSettingsStore } from "@/shared/stores/settings";
import { useSessionStore } from "@/shared/stores/session";
import { useRoute } from "vue-router";
import { useI18n } from "@/shared/i18n";
import * as api from "@/shared/api";
import { logDebug } from "@/shared/lib/devLog";

const player = usePlayerStore();
const library = useLibraryStore();
const settings = useSettingsStore();
const session = useSessionStore();
const route = useRoute();
const { t } = useI18n();

const visible = computed(() =>
  route.path === "/" && (library.songs.length > 0 || player.isDefaultMusic)
);

// Sync player status with audio backend when player becomes visible
watch(visible, async (v) => {
  if (v) await player.syncWithBackend();
});

function formatTime(sec: number) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── 进度条：支持点击 + 拖拽 ──
const isDragging = ref(false);
const progressBarRef = ref<HTMLElement | null>(null);

function getRatioFromEvent(e: MouseEvent): number {
  const bar = progressBarRef.value;
  if (!bar) return 0;
  const rect = bar.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
}

function onProgressMouseDown(e: MouseEvent) {
  isDragging.value = true;
  player.seekTo(getRatioFromEvent(e));
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
}

function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return;
  player.seekTo(getRatioFromEvent(e));
}

function onDragEnd(e: MouseEvent) {
  if (!isDragging.value) return;
  isDragging.value = false;
  player.seekTo(getRatioFromEvent(e));
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);
}

// ── 音量控制 ──
const showVolume = ref(false);
const isMinimized = ref(false);
const volumeValue = computed(() => settings.musicVolume ?? 70);

function onVolumeChange(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  settings.musicVolume = v;
  api.audioSetVolume(v / 100, (settings.masterVolume ?? 80) / 100).catch((e) =>
    logDebug("Optional", "musicPlayer.audioSetVolume", e),
  );
}

onUnmounted(() => {
  if (!isDragging.value) return;
  isDragging.value = false;
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);
});

const artHue = computed(() => (player.queueIndex * 47 + 120) % 360);

const defaultTrackTitle = computed(() => t("player.defaultTrackTitle"));
const defaultTrackArtist = computed(() => t("player.defaultTrackArtist"));

watch(isMinimized, (v) => {
  if (v) showVolume.value = false;
});

watch(
  () => player.queueIndex,
  (idx) => {
    if (idx < 0) return;
    // 标题页会用随机起点 `setQueue` 预热队列；若此处同步 session，选模式时会被当成「已选歌」而跳过随机首曲。
    if (route.path === "/") return;
    if (session.currentSongIndex !== idx) {
      session.setCurrentSongIndexFromPlayer(idx);
    }
  },
  { immediate: true },
);
</script>
<template>
  <transition name="player-slide">
    <div v-if="visible" class="music-player" :class="{ minimized: isMinimized }">
      <div class="player-art">
        <div class="art-color" :style="{ background: `hsl(${artHue}, 55%, 22%)` }" />
        <div class="art-icon">&#x266B;</div>
        <div v-if="player.status === 'playing'" class="art-wave">
          <span /><span /><span />
        </div>
      </div>
      <div v-if="!isMinimized" class="player-info">
        <div class="player-title-wrap">
          <span
            class="player-title"
            :class="{ marquee: (!player.isDefaultMusic && (player.currentSong?.title?.length ?? 0) > 18) }"
            :title="player.isDefaultMusic ? defaultTrackTitle : player.currentSong?.title"
          >
            {{ player.isDefaultMusic ? defaultTrackTitle : (player.currentSong?.title ?? '—') }}
          </span>
        </div>
        <div class="player-artist">{{ player.isDefaultMusic ? defaultTrackArtist : (player.currentSong?.artist ?? '') }}</div>
        <div
          ref="progressBarRef"
          class="player-progress"
          :class="{ dragging: isDragging }"
          @mousedown.prevent="onProgressMouseDown"
        >
          <div class="progress-track" />
          <div class="progress-fill" :style="{ width: (player.progress * 100).toFixed(2) + '%' }" />
          <div class="progress-thumb" :class="{ visible: isDragging }" :style="{ left: (player.progress * 100).toFixed(2) + '%' }" />
        </div>
        <div class="player-time">
          <span>{{ formatTime(player.currentTime) }}</span>
          <span>{{ formatTime(player.duration) }}</span>
        </div>
      </div>
      <div class="player-controls">
        <button class="ctrl-btn mini-btn" @click="isMinimized = !isMinimized" :title="isMinimized ? t('player.expandPlayer') : t('player.minimizePlayer')">
          <svg v-if="isMinimized" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>
        </button>
        <button v-if="!isMinimized" class="ctrl-btn" :disabled="!player.hasPrev" @click="player.playPrev()" :title="t('player.previous')">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
        </button>
        <button class="ctrl-btn play-btn" @click="player.togglePlayPause()">
          <span v-if="player.status === 'loading'" class="spin">&#x27F3;</span>
          <svg v-else-if="player.status === 'playing'" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button v-if="!isMinimized" class="ctrl-btn" :disabled="!player.hasNext" @click="player.playNext()" :title="t('player.next')">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z"/></svg>
        </button>
        <div v-if="!isMinimized" class="volume-wrap">
          <button class="ctrl-btn vol-btn" @click="showVolume = !showVolume" :title="t('player.volume')">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path v-if="volumeValue === 0" d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18L19 19.27 20.27 18 5.27 3 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>
              <path v-else-if="volumeValue < 50" d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05A4.5 4.5 0 0 0 18.5 12zM5 9v6h4l5 5V4L9 9H5z"/>
              <path v-else d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z"/>
            </svg>
          </button>
          <transition name="vol-pop">
            <div v-if="showVolume" class="volume-popup">
              <input type="range" min="0" max="100" :value="volumeValue" @input="onVolumeChange" class="vol-slider" />
              <span class="vol-label">{{ volumeValue }}</span>
            </div>
          </transition>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700&display=swap');
.music-player { position:fixed;top:12px;right:12px;z-index:1000;display:flex;align-items:center;gap:10px;padding:8px 10px 8px 8px;background:color-mix(in srgb, var(--bg-color) 92%, #000);border:1px solid color-mix(in srgb, var(--primary-color) 22%, transparent);border-radius:14px;backdrop-filter:blur(20px);box-shadow:0 4px 32px rgba(0,0,0,0.55);font-family:'Rajdhani',sans-serif;width:min(340px,calc(100vw - 24px));color:var(--text-color);user-select:none; }
.music-player.minimized { width:auto; max-width:220px; padding:8px; gap:8px; }
.player-art { width:42px;height:42px;border-radius:9px;flex-shrink:0;position:relative;overflow:hidden; }
.art-color { position:absolute;inset:0; }
.art-icon { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:rgba(255,255,255,0.25); }
.art-wave { position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;gap:2px;padding-bottom:6px; }
.art-wave span { display:block;width:3px;border-radius:2px;background:rgba(255,255,255,0.6);animation:wave 0.8s ease-in-out infinite; }
.art-wave span:nth-child(1) { height:8px;animation-delay:0s; }
.art-wave span:nth-child(2) { height:14px;animation-delay:0.15s; }
.art-wave span:nth-child(3) { height:8px;animation-delay:0.3s; }
@keyframes wave { 0%,100%{transform:scaleY(1);}50%{transform:scaleY(1.8);} }
.player-info { flex:1;min-width:0;display:flex;flex-direction:column;gap:2px; }
.player-title-wrap { overflow:hidden;width:100%; }
.player-title { display:inline-block;font-size:0.83rem;font-weight:700;color:var(--text-color);white-space:nowrap; }
.player-title.marquee { animation:marquee 8s linear infinite; }
@keyframes marquee { 0%{transform:translateX(0);}40%{transform:translateX(0);}100%{transform:translateX(-60%);} }
.player-artist { font-size:0.68rem;color:rgba(255,255,255,0.32);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.player-progress { height:5px;background:transparent;border-radius:3px;cursor:pointer;position:relative;margin-top:3px;padding:4px 0; }
.progress-track { position:absolute;inset:4px 0;background:rgba(255,255,255,0.08);border-radius:3px; }
.progress-fill { position:absolute;top:4px;left:0;height:calc(100% - 8px);background:linear-gradient(90deg,var(--primary-color),var(--accent-secondary));border-radius:3px;pointer-events:none; }
.progress-thumb { position:absolute;top:50%;transform:translate(-50%,-50%);width:10px;height:10px;background:var(--text-on-primary);border-radius:50%;box-shadow:0 0 6px var(--primary-color-glow);pointer-events:none;opacity:0;transition:opacity 0.15s; }
.progress-thumb.visible, .player-progress:hover .progress-thumb { opacity:1; }
.player-progress.dragging .progress-fill { transition:none; }
.player-time { display:flex;justify-content:space-between;font-size:0.6rem;color:rgba(255,255,255,0.22);font-variant-numeric:tabular-nums; }
.player-controls { display:flex;align-items:center;gap:3px;flex-shrink:0; }
.mini-btn { background:color-mix(in srgb, var(--primary-color) 12%, transparent); color:color-mix(in srgb, var(--primary-color) 55%, var(--text-color)); }
.ctrl-btn { width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);cursor:pointer;transition:all 0.15s;padding:0; }
.ctrl-btn svg { width:16px;height:16px; }
.ctrl-btn:hover:not(:disabled) { background:color-mix(in srgb, var(--primary-color) 25%, transparent);color:var(--text-color); }
.ctrl-btn:disabled { opacity:0.18;cursor:not-allowed; }
.play-btn { width:34px;height:34px;background:linear-gradient(135deg,var(--primary-color),var(--accent-secondary));color:var(--text-on-primary);box-shadow:0 2px 12px var(--primary-color-glow); }
.play-btn:hover { filter:brightness(1.2); }
.spin { display:inline-block;animation:spin 1s linear infinite;font-size:1rem; }
@keyframes spin { to{transform:rotate(360deg);} }
.volume-wrap { position:relative; }
.volume-popup { position:absolute;top:calc(100% + 8px);right:0;transform:none;background:color-mix(in srgb, var(--bg-color) 96%, #000);border:1px solid color-mix(in srgb, var(--primary-color) 25%, transparent);border-radius:10px;padding:8px;display:flex;align-items:center;gap:8px;min-width:126px;max-width:min(220px,calc(100vw - 32px));z-index:10; }
.vol-slider { width:86px;height:4px;accent-color:var(--primary-color);cursor:pointer; }
.vol-label { font-size:0.65rem;color:rgba(255,255,255,0.45);font-variant-numeric:tabular-nums;min-width:22px;text-align:right; }
.vol-pop-enter-active,.vol-pop-leave-active { transition:all 0.2s; }
.vol-pop-enter-from,.vol-pop-leave-to { opacity:0;transform:translateY(-4px); }
.player-slide-enter-active,.player-slide-leave-active { transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1); }
.player-slide-enter-from,.player-slide-leave-to { opacity:0;transform:translateY(-12px) scale(0.95); }
</style>