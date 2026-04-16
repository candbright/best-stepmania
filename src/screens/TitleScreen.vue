<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/i18n";
import { useGameStore } from "@/shared/stores/game";
import { useSessionStore } from "@/shared/stores/session";
import { usePlayerStore } from "@/shared/stores/player";
import { useBlockingOverlayStore } from "@/shared/stores/blockingOverlay";
import { onBeforeMount, onMounted, onUnmounted, ref, watch, nextTick, computed } from "vue";
import { applyGameplayRhythmSfxSettings, playMenuMove, playMenuConfirm, playMenuBack, setUiSfxVolume } from "@/shared/lib/sfx";
import * as api from "@/utils/api";
import { initScoringConfig } from "@/engine/types";
import { isTauri } from "@/utils/platform";
import { applyWindowPreset, closeTauriMainWindow, tryCloseWebTab } from "@/shared/services/tauri/window";
import { applyPlayModeSelection } from "@/utils/applyPlayModeSelection";
import { PlayModeStrip } from "@/entities";
import type { SessionPlayMode } from "@/utils/chartPlayMode";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const game = useGameStore();
const session = useSessionStore();
const player = usePlayerStore();
const blockingOverlay = useBlockingOverlayStore();

const needsBootstrap = computed(() => !game.configLoaded || !game.profileId);

const hasCachedSongs = game.songs.length > 0;
const scanDone = ref(hasCachedSongs);
const scanCount = ref(hasCachedSongs ? game.songs.length : 0);
const scanError = ref<string | null>(null);
const scanning = ref(!hasCachedSongs);
const showModeSelect = ref(false);
if (session.openPlayModeSelectAfterTitleEnter) {
  showModeSelect.value = true;
  session.openPlayModeSelectAfterTitleEnter = false;
}

const TITLE_MODE_ORDER: readonly SessionPlayMode[] = ["pump-single", "pump-double", "pump-routine"];
const MAIN_MENU_COUNT = 4;
const MODE_MENU_COUNT = 4;

const mainMenuFocusIndex = ref(0);
const modeMenuFocusIndex = ref(0);

function isMainActionDisabled(i: number): boolean {
  return (i === 0 || i === 1) && !scanDone.value;
}

function isModeActionDisabled(i: number): boolean {
  return i >= 0 && i <= 2 && !scanDone.value;
}

function firstEnabledMainIndex(): number {
  for (let i = 0; i < MAIN_MENU_COUNT; i++) {
    if (!isMainActionDisabled(i)) return i;
  }
  return 0;
}

function firstEnabledModeIndex(): number {
  for (let i = 0; i < MODE_MENU_COUNT; i++) {
    if (!isModeActionDisabled(i)) return i;
  }
  return MODE_MENU_COUNT - 1;
}

function moveMenuFocus(len: number, current: number, delta: number, disabled: (i: number) => boolean): number {
  let i = current;
  for (let s = 0; s < len; s++) {
    i = (i + delta + len) % len;
    if (!disabled(i)) return i;
  }
  return current;
}

function syncMenuFocusToEnabledState() {
  if (showModeSelect.value) {
    if (isModeActionDisabled(modeMenuFocusIndex.value)) {
      modeMenuFocusIndex.value = firstEnabledModeIndex();
    }
  }
}

watch(
  showModeSelect,
  (m) => {
    if (m) modeMenuFocusIndex.value = firstEnabledModeIndex();
    else mainMenuFocusIndex.value = 0;
  },
  { immediate: true },
);

watch(scanDone, () => {
  if (scanDone.value && !showModeSelect.value) {
    mainMenuFocusIndex.value = 0;
  }
  syncMenuFocusToEnabledState();
});

const titleRootRef = ref<HTMLElement | null>(null);
const contentCardRef = ref<HTMLElement | null>(null);
const hintVisible = ref(false);
const hintCenterTopPx = ref(0);
let titleHintLayoutCleanup: (() => void) | null = null;

/** Hide hint when gap below card is smaller than this (room for one line + margin) */
const MIN_TITLE_HINT_GAP_PX = 72;

function teardownTitleHintLayout() {
  titleHintLayoutCleanup?.();
  titleHintLayoutCleanup = null;
}

function measureTitleHint() {
  if (!scanDone.value) {
    hintVisible.value = false;
    return;
  }
  const root = titleRootRef.value;
  const card = contentCardRef.value;
  if (!root || !card) {
    hintVisible.value = false;
    return;
  }
  const gameBottom = root.getBoundingClientRect().bottom;
  const cardBottom = card.getBoundingClientRect().bottom;
  const gap = gameBottom - cardBottom;
  if (gap < MIN_TITLE_HINT_GAP_PX) {
    hintVisible.value = false;
    return;
  }
  hintCenterTopPx.value = (cardBottom + gameBottom) / 2;
  hintVisible.value = true;
}

function setupTitleHintLayout() {
  teardownTitleHintLayout();
  if (!scanDone.value) {
    hintVisible.value = false;
    return;
  }
  void nextTick(() => {
    requestAnimationFrame(() => {
      const root = titleRootRef.value;
      const card = contentCardRef.value;
      if (!root || !card) {
        hintVisible.value = false;
        return;
      }
      measureTitleHint();
      const ro = new ResizeObserver(measureTitleHint);
      ro.observe(root);
      ro.observe(card);
      const onWin = () => measureTitleHint();
      window.addEventListener("resize", onWin);
      window.visualViewport?.addEventListener("resize", onWin);
      window.visualViewport?.addEventListener("scroll", onWin);
      titleHintLayoutCleanup = () => {
        ro.disconnect();
        window.removeEventListener("resize", onWin);
        window.visualViewport?.removeEventListener("resize", onWin);
        window.visualViewport?.removeEventListener("scroll", onWin);
      };
    });
  });
}

const titleHintAnchorStyle = computed(() => ({
  top: `${hintCenterTopPx.value}px`,
}));

watch(
  () => [scanDone.value, showModeSelect.value] as const,
  () => {
    setupTitleHintLayout();
  },
  { flush: "post" },
);

/** 外链等：`?modePick=1` 时直接打开模式选择。 */
function applyPlayModeSelectReturnIntent() {
  const q = route.query.modePick;
  const fromQuery = q === "1" || (Array.isArray(q) && q[0] === "1");
  if (fromQuery) {
    showModeSelect.value = true;
    void router.replace({ path: "/" });
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollScanStatus() {
  try {
    const status = await api.getScanStatus();
    scanning.value = status.scanning;
    scanCount.value = status.totalFound;
    scanError.value = status.error;
    if (status.done) {
      if (status.error) {
        stopPolling();
        scanning.value = false;
        throw new Error(status.error);
      }

      scanDone.value = true;
      stopPolling();

      // 首次进入游戏：确保歌曲列表已加载到 store。
      // 之后页面切换不重复加载，只有曲库变更操作才刷新。
      // 注意：status.done=true 时必须确保 scanSongs 已执行完成，
      // 否则 getSongList 可能返回空数组。使用 force 确保重新扫描。
      if (game.songs.length === 0) {
        await game.loadSongs(undefined, { force: true });
      }

      if (game.songs.length > 0 && player.queue.length === 0) {
        // 初始化播放队列但不立即播放，等待用户进入选歌界面
        player.setQueue(game.songs, 0);
      }
    }
  } catch (error: unknown) {
    stopPolling();
    scanning.value = false;
    throw error;
  }
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Core startup work (config, profile, first library poll). Throws on failure. */
async function runTitleBootstrap(): Promise<void> {
  blockingOverlay.updateMessage(t("loadingPhase.appConfig"));
  blockingOverlay.setProgress(10);
  await game.loadAppConfig();
  applyGameplayRhythmSfxSettings({
    effectVolume: game.effectVolume ?? 90,
    metronomeSfxEnabled: game.metronomeSfxEnabled ?? true,
    metronomeSfxVolume: game.metronomeSfxVolume ?? 100,
    metronomeSfxStyle: game.metronomeSfxStyle ?? "bright",
    rhythmSfxEnabled: game.rhythmSfxEnabled ?? true,
    rhythmSfxVolume: game.rhythmSfxVolume ?? 100,
    rhythmSfxStyle: game.rhythmSfxStyle ?? "bright",
  });
  // normal：须传入持久化宽高才会 setSize（与 useAppSettingsSync 一致）
  await applyWindowPreset(
    game.windowDisplayPreset,
    game.windowDisplayPreset === "normal" && game.windowWidth != null && game.windowHeight != null
      ? { width: game.windowWidth, height: game.windowHeight }
      : null,
  );
  blockingOverlay.updateMessage(t("loadingPhase.appAudio"));
  blockingOverlay.setProgress(22);
  // 首次进入时立即把配置里的音量同步到音频后端，避免“设置值”与“实际音量”不一致。
  await api.audioSetVolume((game.musicVolume ?? 70) / 100, (game.masterVolume ?? 80) / 100);
  setUiSfxVolume((game.uiSfxVolume ?? 70) / 100);
  // Apply saved theme
  document.body.setAttribute("data-theme", game.theme || "default");
  // Apply saved UI scale
  document.documentElement.style.fontSize = `${(game.uiScale ?? 1) * 16}px`;
  blockingOverlay.updateMessage(t("loadingPhase.appScoring"));
  blockingOverlay.setProgress(38);
  // Load scoring constants from Rust backend (single source of truth)
  await initScoringConfig();
  blockingOverlay.updateMessage(t("loadingPhase.appProfile"));
  blockingOverlay.setProgress(55);
  await game.initProfile();

  // 已有曲库缓存时，回到主界面不再重新触发扫描/加载流程。
  if (game.songs.length > 0) {
    scanDone.value = true;
    scanning.value = false;
    scanCount.value = game.songs.length;
    blockingOverlay.setProgress(100);
  } else {
    blockingOverlay.updateMessage(t("loadingPhase.appLibrary"));
    blockingOverlay.setProgress(72);
    await pollScanStatus();
    blockingOverlay.setProgress(scanDone.value ? 100 : 88);
    if (!scanDone.value) {
      pollTimer = setInterval(pollScanStatus, 300);
    }
  }
}

async function bootstrapTitleScreen(): Promise<void> {
  try {
    await runTitleBootstrap();
    blockingOverlay.hide();
  } catch (error: unknown) {
    console.error("Title screen bootstrap failed:", error);
    const msg = error instanceof Error ? error.message : String(error);
    scanError.value = msg;
    scanning.value = false;
    blockingOverlay.setFailed(t("loadingOverlay.bootstrapFailed"), () => {
      blockingOverlay.clearError();
      blockingOverlay.show({
        message: t("loadingPhase.appEnter"),
        onCancel: () => {},
        showCancel: false,
      });
      scanError.value = null;
      void bootstrapTitleScreen();
    });
    blockingOverlay.patchHandlers({
      onCancel: () => {
        blockingOverlay.hide();
      },
    });
  }
}

onBeforeMount(() => {
  if (needsBootstrap.value) {
    blockingOverlay.show({
      message: t("loadingPhase.appEnter"),
      onCancel: () => {},
      showCancel: false,
    });
    blockingOverlay.setProgress(3);
  } else {
    // Returning to title should not flash the global blocking overlay.
    blockingOverlay.hide();
  }
});

onMounted(() => {
  if (needsBootstrap.value) {
    void bootstrapTitleScreen();
  } else {
    // Ensure overlay is not left open from another screen.
    blockingOverlay.hide();
    // Returning to title: re-check scan status in case it was left in a scanning state
    if (!scanDone.value) {
      void pollScanStatus();
    }
  }
  applyPlayModeSelectReturnIntent();
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  teardownTitleHintLayout();
  stopPolling();
  blockingOverlay.hide();
  window.removeEventListener("keydown", onKeyDown);
});

function onKeyDown(e: KeyboardEvent) {
  if (showModeSelect.value && game.shortcutMatches(e, "global.back")) {
    e.preventDefault();
    playMenuBack();
    cancelModeSelect();
    return;
  }

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const delta = e.key === "ArrowDown" ? 1 : -1;
    if (showModeSelect.value) {
      e.preventDefault();
      const prev = modeMenuFocusIndex.value;
      modeMenuFocusIndex.value = moveMenuFocus(
        MODE_MENU_COUNT,
        prev,
        delta,
        isModeActionDisabled,
      );
      if (modeMenuFocusIndex.value !== prev) playMenuMove();
    } else {
      e.preventDefault();
      const prev = mainMenuFocusIndex.value;
      mainMenuFocusIndex.value = moveMenuFocus(
        MAIN_MENU_COUNT,
        prev,
        delta,
        isMainActionDisabled,
      );
      if (mainMenuFocusIndex.value !== prev) playMenuMove();
    }
    return;
  }

  if (game.shortcutMatches(e, "title.confirm")) {
    e.preventDefault();
    if (showModeSelect.value) {
      let i = modeMenuFocusIndex.value;
      if (isModeActionDisabled(i)) i = firstEnabledModeIndex();
      if (i <= 2) {
        playMenuConfirm();
        void selectMode(TITLE_MODE_ORDER[i]!);
      } else {
        playMenuBack();
        cancelModeSelect();
      }
    } else {
      let i = mainMenuFocusIndex.value;
      if (isMainActionDisabled(i)) i = firstEnabledMainIndex();
      playMenuConfirm();
      if (i === 0) startGame();
      else if (i === 1) openEditorSelect();
      else if (i === 2) openOptions();
      else void exitApp();
    }
  }
}

function startGame() {
  showModeSelect.value = true;
}

async function selectMode(mode: SessionPlayMode) {
  await applyPlayModeSelection(game, player, mode);
  router.push("/select-music");
}

function cancelModeSelect() {
  showModeSelect.value = false;
}

function openEditorSelect() {
  router.push("/editor-select");
}

function openOptions() {
  router.push("/options");
}

async function exitApp() {
  if (isTauri()) {
    try {
      await closeTauriMainWindow();
    } catch (e: unknown) {
      console.error("Failed to close Tauri window:", e);
    }
    return;
  }
  tryCloseWebTab(t("title.webExitUnavailable"));
}
</script>

<template>
  <div ref="titleRootRef" class="title-screen">
    <div class="background">
      <div class="bg-rays" />
    </div>
    <Transition name="title-hint">
      <div
        v-if="hintVisible"
        class="bg-hint-anchor"
        :style="titleHintAnchorStyle"
        aria-hidden="true"
      >
        <p class="bg-hint">{{ t('title.hint') }}</p>
      </div>
    </Transition>
    <div ref="contentCardRef" class="content">
      <h1 class="logo">
        <span class="best">Best</span><span class="sm">StepMania</span>
      </h1>

      <div class="content-main">
        <div class="scan-status">
          <template v-if="scanning">
            <span class="scan-spinner">&#x27F3;</span>
            <span class="scan-text">
              {{ scanCount > 0 ? t('title.scanCount').replace('{0}', scanCount.toString()) : t('title.scanning') }}
            </span>
          </template>
          <template v-else-if="scanError">
            <span class="scan-error">&#x26A0; {{ scanError }}</span>
          </template>
          <template v-else-if="scanDone">
            <span class="scan-ok">&#x2713; {{ t('title.scanDone').replace('{0}', scanCount.toString()) }}</span>
          </template>
        </div>

        <div class="menu">
          <Transition name="title-menu-panel" mode="out-in">
            <div v-if="showModeSelect" key="modes" class="menu-panel">
              <PlayModeStrip
                layout="title"
                :current="game.playMode"
                :disabled="!scanDone"
                :keyboard-highlight-index="modeMenuFocusIndex < 3 ? modeMenuFocusIndex : null"
                @pick="selectMode"
              />
              <button
                class="menu-item back-btn"
                :class="{ 'menu-keyboard-focus': modeMenuFocusIndex === 3 }"
                type="button"
                @click="cancelModeSelect"
              >
                {{ t('back') }}
              </button>
            </div>
            <div v-else key="main" class="menu-panel">
              <div class="menu-heading-slot" />
              <button
                class="menu-item primary"
                :class="{ 'menu-keyboard-focus': mainMenuFocusIndex === 0 }"
                type="button"
                @click="startGame"
                :disabled="!scanDone"
              >
                {{ t('title.gameStart') }}
              </button>
              <button
                class="menu-item editor-btn"
                :class="{ 'menu-keyboard-focus': mainMenuFocusIndex === 1 }"
                type="button"
                @click="openEditorSelect"
                :disabled="!scanDone"
              >
                ✎ {{ t('title.editChart') }}
              </button>
              <button
                class="menu-item"
                :class="{ 'menu-keyboard-focus': mainMenuFocusIndex === 2 }"
                type="button"
                @click="openOptions"
              >
                {{ t('title.options') }}
              </button>
              <button
                class="menu-item"
                :class="{ 'menu-keyboard-focus': mainMenuFocusIndex === 3 }"
                type="button"
                @click="exitApp"
              >
                {{ t('title.exit') }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;600;700&display=swap');

.title-screen {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  position: relative; font-family: 'Rajdhani', sans-serif;
}
/* 卡片底与游戏底之间垂直居中；间距过小时由脚本隐藏 */
.bg-hint-anchor {
  position: absolute;
  left: 50%;
  z-index: 3;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.bg-hint {
  margin: 0;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.28);
  animation: hintBlink 2s ease-in-out infinite;
}
@keyframes hintBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.title-hint-enter-active,
.title-hint-leave-active {
  transition:
    opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}
.title-hint-enter-from,
.title-hint-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 12px));
}
.background {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 30%, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 70%);
  z-index: 0; overflow: hidden;
}
.bg-rays {
  position: absolute;
  width: 200vmax;
  height: 200vmax;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: repeating-conic-gradient(from 0deg at 50% 50%, color-mix(in srgb, var(--primary-color) 8%, transparent) 0deg, transparent 4deg, transparent 10deg);
  animation: raysSpin 60s linear infinite;
}
@keyframes raysSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
.content {
  position: relative; z-index: 2; text-align: center;
  display: flex; flex-direction: column; align-items: center;
  /* 单一纵向节奏：区块之间等距，避免再叠一层 margin */
  gap: 1.5rem;
  padding: 1.75rem 2.5rem 2rem;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(10,10,18,0.62), rgba(10,10,18,0.32));
  box-shadow: 0 24px 80px rgba(0,0,0,0.36);
  backdrop-filter: blur(10px);
}
.logo {
  font-family: 'Orbitron', sans-serif;
  font-size: 3.5rem; font-weight: 900; letter-spacing: -0.02em; line-height: 1;
}
.best { color: var(--accent-secondary); }
.sm { color: var(--text-color); }
.content-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  /* 扫描文案紧贴菜单区，与 Logo 间距仍由 .content gap 控制 */
  gap: 0.55rem;
}
.scan-status {
  min-height: 1.5rem;
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.82rem;
}
.scan-spinner {
  display: inline-block; color: color-mix(in srgb, var(--primary-color) 80%, transparent);
  animation: spin 1s linear infinite; font-size: 1rem;
}
@keyframes spin { to { transform: rotate(360deg); } }
.scan-text { color: rgba(255,255,255,0.4); }
.scan-ok { color: #69f0ae; }
.scan-error { color: #ff5252; }
.menu {
  display: flex;
  flex-direction: column;
  min-width: 300px;
  width: min(320px, 100%);
  /* 标题槽 + 4 行按钮 + gap；与模式选择同结构，避免切换时外框高度跳变 */
  min-height: calc(1.35rem + 4 * 3.125rem + 3 * 0.75rem);
}
.menu-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}
.title-menu-panel-enter-active,
.title-menu-panel-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.title-menu-panel-enter-from {
  opacity: 0;
  transform: translateY(14px);
}
.title-menu-panel-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
.menu {
  display: flex;
  flex-direction: column;
  min-width: 300px;
  width: min(320px, 100%);
  /* 标题槽 + 4 行按钮 + gap；与模式选择同结构，避免切换时外框高度跳变 */
  min-height: calc(1.35rem + 4 * 3.125rem + 3 * 0.75rem);
}
.menu-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}
.menu-heading-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-height: 1.35rem;
  margin: 0;
  padding-bottom: 0.05rem;
}
.menu-heading-slot .mode-hint {
  min-height: 1.35rem;
  line-height: 1.35rem;
}
.menu-heading-slot:empty::before {
  content: "\00a0";
  display: block;
  min-height: 1.35rem;
  line-height: 1.35rem;
  visibility: hidden;
}
.menu-item {
  min-height: 50px;
  padding: 0.875rem 1.2rem; font-size: 1rem; font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.15em; border: 1px solid var(--border-color);
  border-radius: 12px; background: var(--section-bg);
  color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.15s ease;
  appearance: none;
  -webkit-appearance: none;
  background-clip: padding-box;
  -webkit-background-clip: padding-box;
  overflow: hidden;
}
.menu-item:hover:not(:disabled):not(.mode-card) {
  background: rgba(255,255,255,0.09); color: var(--text-color);
  border-color: rgba(255,255,255,0.25); transform: scale(1.02);
}
.menu-item.primary {
  background: linear-gradient(135deg, var(--primary-color), var(--accent-secondary));
  border: none;
  color: var(--text-on-primary);
  box-shadow: 0 4px 24px var(--primary-color-glow);
}
.menu-item.primary:hover:not(:disabled) {
  filter: brightness(1.15); transform: scale(1.03);
  box-shadow: 0 6px 32px var(--primary-color-glow);
}
.menu-item.editor-btn {
  background: linear-gradient(135deg, #ff9800, #ff5722);
  border: none;
  color: var(--text-on-primary);
  box-shadow: 0 4px 24px rgba(255, 152, 0, 0.25);
}
.menu-item.editor-btn:hover:not(:disabled) {
  filter: brightness(1.15); transform: scale(1.03);
  box-shadow: 0 6px 32px rgba(255, 152, 0, 0.4);
}
.menu-item:disabled { opacity: 0.35; cursor: not-allowed; }
.menu-item::-moz-focus-inner {
  border: 0;
  padding: 0;
}
.menu-item:focus {
  outline: none;
}
.menu-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 75%, white);
  outline-offset: 2px;
}
.menu-item.menu-keyboard-focus:not(:disabled) {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--primary-color) 75%, white),
    inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}
.menu-item.primary.menu-keyboard-focus:not(:disabled) {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--primary-color) 75%, white),
    0 4px 24px var(--primary-color-glow);
}
.menu-item.editor-btn.menu-keyboard-focus:not(:disabled) {
  box-shadow:
    0 0 0 3px color-mix(in srgb, #ff9800 80%, white),
    0 4px 24px rgba(255, 152, 0, 0.35);
}
.mode-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.mode-label {
  font-weight: 700; letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--text-color) 85%, transparent);
}
.menu-item.mode-card {
  border: none;
  color: var(--text-on-primary);
}
.menu-item.mode-card .mode-label {
  color: var(--text-on-primary);
}
.menu-item.mode-card:hover:not(:disabled) {
  background: rgba(255,255,255,0.15);
  filter: none;
  transform: scale(1.02);
}
/* 单板 */
.menu-item.mode-pump-single {
  background: linear-gradient(135deg, #00e5ff 0%, #00838f 100%);
  box-shadow: 0 4px 22px color-mix(in srgb, #00e5ff 35%, transparent);
}
.menu-item.mode-pump-single:hover:not(:disabled) {
  box-shadow: 0 6px 28px color-mix(in srgb, #00e5ff 45%, transparent);
}
/* 双板 */
.menu-item.mode-pump-double {
  background: linear-gradient(135deg, #b388ff 0%, #5e35b1 100%);
  box-shadow: 0 4px 22px color-mix(in srgb, #b388ff 32%, transparent);
}
.menu-item.mode-pump-double:hover:not(:disabled) {
  box-shadow: 0 6px 28px color-mix(in srgb, #b388ff 42%, transparent);
}
/* 协作 / routine */
.menu-item.mode-pump-routine {
  background: linear-gradient(135deg, #ffca28 0%, #f57c00 100%);
  box-shadow: 0 4px 22px color-mix(in srgb, #ff9800 30%, transparent);
}
.menu-item.mode-pump-routine:hover:not(:disabled) {
  box-shadow: 0 6px 28px color-mix(in srgb, #ff9800 40%, transparent);
}
</style>
