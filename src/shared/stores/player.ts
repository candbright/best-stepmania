/**
 * 全局音乐播放器 Store
 * 参考网易云/Spotify 架构：状态机驱动，单 IPC 进度轮询，防竞态。
 * 支持两种播放模式：
 * 1. 默认音乐模式：使用 Web Audio API 程序生成，无需加载
 * 2. 普通音乐模式：通过 Tauri IPC 控制 Rust 后端播放
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { SongListItem } from "@/utils/api";
import * as api from "@/utils/api";
import { getDefaultMusicTrack } from "@/entities/player/defaultMusic";
import { logOptionalRejection } from "@/utils/devLog";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused";

export const usePlayerStore = defineStore("player", () => {
  // --- 状态 ---
  const status = ref<PlayerStatus>("idle");
  const queue = ref<SongListItem[]>([]);
  const queueIndex = ref(-1);
  const currentMusicPath = ref<string | null>(null);
  const progress = ref(0);       // 0-1
  const duration = ref(0);       // 秒，加载后固定
  const currentTime = ref(0);    // 秒
  
  // 默认音乐模式
  const isDefaultMusic = ref(false);
  
  // Web Audio API 节点（用于默认音乐播放）
  let audioContext: AudioContext | null = null;
  let defaultMusicSource: AudioBufferSourceNode | null = null;
  let defaultMusicStartTime = 0; // audioContext.currentTime when playback started
  let defaultMusicStartOffset = 0; // offset when playback was last started

  // 防竞态：每次 loadAndPlay 递增，旧请求检测到 id 不匹配则丢弃
  let loadAbortId = 0;
  let activeAudioRequestToken: number | null = null;
  /** Menu / preview progress: lower frequency + merged IPC reduces WebView ↔ Rust traffic. */
  const PROGRESS_POLL_MS = 250;
  // 进度轮询句柄
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  // 防止 playNext 在歌曲结束时被多次调用
  let songEndTriggered = false;
  // 预加载进行中的路径集合
  const preloadingSet = new Set<string>();
  // 歌曲目录 -> 音频文件路径缓存（减少切歌 IPC 和卡顿）
  const musicPathCache = new Map<string, string>();
  // 时长缓存（避免重复 IPC 调用）
  const durationCache = new Map<string, number>();

  // --- 计算属性 ---
  const currentSong = computed(() =>
    queueIndex.value >= 0 ? queue.value[queueIndex.value] ?? null : null
  );
  /** 多于一首时可循环切歌；仅一首时上一首仅在已过 3s 时用于回到开头（与 playPrev 一致） */
  const hasPrev = computed(
    () =>
      queueIndex.value >= 0 &&
      queue.value.length > 0 &&
      (queue.value.length > 1 || currentTime.value > 3)
  );
  const hasNext = computed(() => queueIndex.value >= 0 && queue.value.length > 1);

  // --- 等待音频加载完成 ---
  function waitForLoadComplete(timeoutMs = 10000, signal?: AbortSignal): Promise<void> {
    // 如果不在加载状态，直接返回
    if (status.value !== "loading") return Promise.resolve();
    if (signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const startTime = performance.now();
      const done = () => { clearInterval(checkInterval); resolve(); };
      const checkInterval = setInterval(() => {
        if (signal?.aborted || status.value !== "loading") { done(); return; }
        if (performance.now() - startTime > timeoutMs) done(); // 超时保护
      }, 50);
      signal?.addEventListener("abort", done, { once: true });
    });
  }

  // --- 进度轮询（100ms 间隔）---
  function startProgressPoll() {
    stopProgressPoll();
    songEndTriggered = false;
    progressTimer = setInterval(async () => {
      if (status.value !== "playing") return;
      
      try {
        if (isDefaultMusic.value) {
          // 默认音乐模式：使用 Web Audio API 时间（BufferSource 已 loop，仅做取模展示）
          if (!audioContext) return;
          const elapsed = audioContext.currentTime - defaultMusicStartTime;
          const raw = defaultMusicStartOffset + elapsed;
          const d = duration.value;
          currentTime.value = d > 0 ? raw % d : raw;
          progress.value = d > 0 ? currentTime.value / d : 0;
        } else {
          // 普通音乐模式：单次 IPC 取 time + duration
          const playback = await api.audioGetPlaybackState();
          if (status.value !== "playing") return;
          const t = playback.time;
          currentTime.value = t;
          if (duration.value <= 0) {
            const cached = currentMusicPath.value ? durationCache.get(currentMusicPath.value) : undefined;
            const fromBackend = playback.duration;
            duration.value = cached ?? fromBackend;
            if (cached === undefined && currentMusicPath.value && fromBackend > 0) {
              durationCache.set(currentMusicPath.value, fromBackend);
            }
          }
          const d = duration.value;
          progress.value = d > 0 ? Math.min(1, t / d) : 0;
          if (d > 0 && t >= d - 0.3 && !songEndTriggered) {
            songEndTriggered = true;
            await advanceAfterQueueTrackEnd();
          }
        }
      } catch (e: unknown) {
        logOptionalRejection("player.progressPoll", e);
      }
    }, PROGRESS_POLL_MS);
  }

  function stopProgressPoll() {
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  // --- 默认音乐播放控制 ---
  function getAudioContextInstance(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    return audioContext;
  }

  async function playDefaultMusic(): Promise<void> {
    // 停止之前的播放
    stopDefaultMusic();
    
    const track = await getDefaultMusicTrack();
    const ctx = getAudioContextInstance();
    
    // 确保 AudioContext 处于运行状态
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    
    // 创建音频源节点
    const source = ctx.createBufferSource();
    source.buffer = track.audioBuffer;
    source.loop = true;
    source.connect(ctx.destination);
    
    // 开始播放
    defaultMusicStartTime = ctx.currentTime;
    defaultMusicStartOffset = 0;
    source.start(0);
    
    defaultMusicSource = source;
    isDefaultMusic.value = true;
    duration.value = track.duration;
    currentTime.value = 0;
    progress.value = 0;
  }

  function stopDefaultMusic(): void {
    if (defaultMusicSource) {
      try {
        defaultMusicSource.stop();
      } catch (e: unknown) {
        logOptionalRejection("player.defaultMusic.stop", e);
      }
      defaultMusicSource.disconnect();
      defaultMusicSource = null;
    }
    defaultMusicStartTime = 0;
    defaultMusicStartOffset = 0;
  }

  async function pauseDefaultMusic(): Promise<void> {
    if (!isDefaultMusic.value || !defaultMusicSource || !audioContext) return;
    
    // 记录当前播放位置
    const elapsed = audioContext.currentTime - defaultMusicStartTime;
    defaultMusicStartOffset += elapsed;
    
    // 停止但保持节点连接
    try {
      defaultMusicSource.stop();
    } catch (e: unknown) {
      logOptionalRejection("player.defaultMusic.pauseStop", e);
    }
    defaultMusicSource.disconnect();
    defaultMusicSource = null;
  }

  async function resumeDefaultMusic(): Promise<void> {
    if (!isDefaultMusic.value || defaultMusicSource) return;
    
    const track = await getDefaultMusicTrack();
    const ctx = getAudioContextInstance();
    
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    
    // 从记录的偏移位置继续播放
    const source = ctx.createBufferSource();
    source.buffer = track.audioBuffer;
    source.loop = true;
    source.connect(ctx.destination);
    
    defaultMusicStartTime = ctx.currentTime;
    source.start(0, defaultMusicStartOffset % track.duration);
    
    defaultMusicSource = source;
  }

  // --- 核心加载函数 ---
  async function resolveMusicPath(songPath: string): Promise<string> {
    const cached = musicPathCache.get(songPath);
    if (cached) return cached;
    const musicPath = await api.getSongMusicPath(songPath);
    musicPathCache.set(songPath, musicPath);
    return musicPath;
  }

  async function loadAndPlay(idx: number, autoplay = true) {
    if (idx < 0 || idx >= queue.value.length) return;
    const myId = ++loadAbortId;
    activeAudioRequestToken = myId;
    const song = queue.value[idx];

    // 立即更新 UI 状态
    queueIndex.value = idx;
    status.value = "loading";
    currentTime.value = 0;
    progress.value = 0;
    duration.value = 0;
    songEndTriggered = false;
    stopProgressPoll();

    // 切歌后立即停止旧预览，避免新歌加载/缓冲期间旧歌继续播放
    await api.audioStop(myId).catch((e) => logOptionalRejection("player.loadAndPlay.audioStop", e));

    try {
      const musicPath = await resolveMusicPath(song.path);
      if (myId !== loadAbortId) return;

      currentMusicPath.value = musicPath;

      if (autoplay) {
        const length = song.sampleLength > 0 ? song.sampleLength : 120;
        await api.audioPreview(musicPath, 0, length, myId);
        if (myId !== loadAbortId) {
          // 旧请求可能已经触发了播放，若当前已切到别的歌则立刻停止
          if (queueIndex.value !== idx) {
            await api.audioStop(myId).catch((e) => logOptionalRejection("player.loadAndPlay.raceStop1", e));
          }
          return;
        }
        // 获取真实时长
        duration.value = await api.audioGetDuration();
        if (myId !== loadAbortId) {
          if (queueIndex.value !== idx) {
            await api.audioStop(myId).catch((e) => logOptionalRejection("player.loadAndPlay.raceStop2", e));
          }
          return;
        }
        status.value = "playing";
        startProgressPoll();
      } else {
        status.value = "paused";
      }

      // 后台预加载相邻歌曲（不影响当前播放）
      preloadNeighbors(idx);
    } catch (e: unknown) {
      logOptionalRejection("player.loadAndPlay", e);
      if (myId === loadAbortId) status.value = "idle";
    }
  }

  /**
   * 加载并播放整首曲目（非菜单预览）。使用 `audio_load` + 从头 `play`，
   * 供从编辑器等场景返回列表时需要完整背景音乐时使用。
   */
  async function loadAndPlayFull(idx: number, autoplay = true) {
    if (idx < 0 || idx >= queue.value.length) return;
    const myId = ++loadAbortId;
    activeAudioRequestToken = myId;
    const song = queue.value[idx];

    queueIndex.value = idx;
    status.value = "loading";
    currentTime.value = 0;
    progress.value = 0;
    duration.value = 0;
    songEndTriggered = false;
    stopProgressPoll();

    if (isDefaultMusic.value) {
      stopDefaultMusic();
      isDefaultMusic.value = false;
    }

    await api.audioStop(myId).catch((e) => logOptionalRejection("player.loadAndPlayFull.audioStop", e));

    try {
      const musicPath = await resolveMusicPath(song.path);
      if (myId !== loadAbortId) return;

      currentMusicPath.value = musicPath;

      const info = await api.audioLoad(musicPath);
      if (myId !== loadAbortId) {
        if (queueIndex.value !== idx) {
          await api.audioStop(myId).catch((e) => logOptionalRejection("player.loadAndPlayFull.raceStop1", e));
        }
        return;
      }

      duration.value = info.duration > 0 ? info.duration : await api.audioGetDuration();
      if (currentMusicPath.value && duration.value > 0) {
        durationCache.set(currentMusicPath.value, duration.value);
      }

      if (autoplay) {
        await api.audioSeek(0, myId);
        if (myId !== loadAbortId) {
          if (queueIndex.value !== idx) {
            await api.audioStop(myId).catch((e) => logOptionalRejection("player.loadAndPlayFull.raceStop2", e));
          }
          return;
        }
        await api.audioPlay(myId);
        if (myId !== loadAbortId) {
          if (queueIndex.value !== idx) {
            await api.audioStop(myId).catch((e) => logOptionalRejection("player.loadAndPlayFull.raceStop3", e));
          }
          return;
        }
        status.value = "playing";
        startProgressPoll();
      } else {
        status.value = "paused";
      }

      preloadNeighbors(idx);
    } catch (e: unknown) {
      logOptionalRejection("player.loadAndPlayFull", e);
      if (myId === loadAbortId) status.value = "idle";
    }
  }

  function preloadNeighbors(idx: number) {
    // 预加载前后各 2 首
    for (const off of [-1, 1, -2, 2]) {
      const target = queue.value[idx + off];
      if (!target || preloadingSet.has(target.path)) continue;
      preloadingSet.add(target.path);
      resolveMusicPath(target.path)
        .then(mp => api.audioPreload(mp))
        .catch((e) => logOptionalRejection("player.preloadNeighbor", e))
        .finally(() => preloadingSet.delete(target.path));
    }
  }

  // --- 公开方法 ---

  /**
   * 队列曲目自然结束：多首时无缝切到下一首（末首回到第一首），单曲则暂停在结尾。
   */
  async function advanceAfterQueueTrackEnd() {
    await api.audioPause(activeAudioRequestToken ?? undefined).catch((e) =>
      logOptionalRejection("player.advanceAfterQueueTrackEnd.pause", e),
    );
    stopProgressPoll();
    const n = queue.value.length;
    if (queueIndex.value < 0 || n === 0) {
      status.value = "idle";
      return;
    }
    if (n === 1) {
      songEndTriggered = false;
      status.value = "paused";
      currentTime.value = duration.value;
      progress.value = 1;
      return;
    }
    const next = (queueIndex.value + 1) % n;
    songEndTriggered = false;
    await loadAndPlay(next, true);
  }

  /** 设置播放队列并从指定索引开始播放 */
  function setQueue(songs: SongListItem[], startIndex = 0) {
    if (songs.length === 0) {
      ++loadAbortId;
      activeAudioRequestToken = null;
      queue.value = [];
      queueIndex.value = -1;
      status.value = "idle";
      return;
    }

    const clampedIndex = Math.max(0, Math.min(startIndex, songs.length - 1));
    const sameQueue =
      queue.value.length === songs.length &&
      queue.value.every((s, i) => s.path === songs[i]?.path);

    queue.value = songs;

    // 队列和索引都没变化时不重复触发加载，避免切页面卡顿
    if (sameQueue && queueIndex.value === clampedIndex) {
      return;
    }

    loadAndPlay(clampedIndex);
  }

  /**
   * 仅同步队列与索引，不触发重新播放。
   * 用于曲库刷新时保持当前播放曲目，避免界面层直接写 store 内部字段。
   */
  function syncQueuePreserveCurrent(songs: SongListItem[], desiredSongPath: string | null, fallbackIndex = queueIndex.value) {
    if (songs.length === 0) {
      queue.value = [];
      queueIndex.value = -1;
      return;
    }
    queue.value = songs;
    if (desiredSongPath) {
      const idx = songs.findIndex((song) => song.path === desiredSongPath);
      if (idx >= 0) {
        queueIndex.value = idx;
        return;
      }
    }
    const clamped = Math.max(0, Math.min(fallbackIndex, songs.length - 1));
    queueIndex.value = clamped;
  }

  /**
   * 切换到指定索引的歌曲，立即取消旧加载，只加载最新选中的。
   * `fullTrack` 为 true 时使用整轨 `audio_load` + 从头播放（非菜单预览时长截断）。
   */
  function playSongAt(idx: number, fullTrack = false) {
    if (idx < 0 || idx >= queue.value.length) return;
    if (fullTrack) {
      void loadAndPlayFull(idx, true);
    } else {
      void loadAndPlay(idx);
    }
  }

  async function playNext() {
    // 暂停当前歌曲
    await api.audioPause(activeAudioRequestToken ?? undefined).catch((e) =>
      logOptionalRejection("player.playNext.pause", e),
    );
    stopProgressPoll();
    const n = queue.value.length;
    if (queueIndex.value < 0 || n === 0) return;
    if (n === 1) {
      status.value = "paused";
      return;
    }
    const next = (queueIndex.value + 1) % n;
    songEndTriggered = false;
    await loadAndPlay(next, true);
  }

  async function playPrev() {
    const n = queue.value.length;
    if (queueIndex.value < 0 || n === 0) return;
    // 如果已播放超过 3 秒，回到当前歌曲开头（参考网易云）
    if (currentTime.value > 3) {
      await api.audioSeek(0, activeAudioRequestToken ?? undefined);
      currentTime.value = 0;
      progress.value = 0;
      songEndTriggered = false;
    } else if (n > 1) {
      const prev = (queueIndex.value - 1 + n) % n;
      songEndTriggered = false;
      await loadAndPlay(prev, true);
    }
  }

  async function togglePlayPause() {
    if (status.value === "playing") {
      // 暂停
      if (isDefaultMusic.value) {
        await pauseDefaultMusic();
      } else {
        await api.audioPause(activeAudioRequestToken ?? undefined);
      }
      status.value = "paused";
      stopProgressPoll();
    } else if (status.value === "paused") {
      // 恢复
      if (isDefaultMusic.value) {
        await resumeDefaultMusic();
      } else {
        await api.audioPlay(activeAudioRequestToken ?? undefined);
      }
      status.value = "playing";
      songEndTriggered = false;
      startProgressPoll();
    } else if (status.value === "idle" && queueIndex.value >= 0) {
      await loadAndPlay(queueIndex.value, true);
    }
  }

  // seek 节流：避免拖拽时发送大量 IPC
  let seekThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  async function seekTo(ratio: number) {
    const d = duration.value;
    if (d <= 0) return;
    const targetSec = ratio * d;
    // 立即更新 UI（乐观更新）
    currentTime.value = targetSec;
    progress.value = ratio;
    songEndTriggered = false;
    
    if (isDefaultMusic.value) {
      // 默认音乐模式：调整播放偏移
      if (audioContext && defaultMusicSource) {
        const elapsed = audioContext.currentTime - defaultMusicStartTime;
        defaultMusicStartOffset = targetSec - elapsed;
      }
    } else {
      // 节流：最后一次 seek 后 80ms 才实际发送 IPC
      if (seekThrottleTimer) clearTimeout(seekThrottleTimer);
      seekThrottleTimer = setTimeout(async () => {
        seekThrottleTimer = null;
        try {
          await api.audioSeek(targetSec, activeAudioRequestToken ?? undefined);
        } catch (e: unknown) {
          logOptionalRejection("player.seekTo.audioSeek", e);
        }
      }, 80);
    }
  }

  /** 进入游戏前：暂停预览，递增 abortId 使所有挂起请求失效 */
  async function stopForGame() {
    const token = ++loadAbortId;
    activeAudioRequestToken = token;
    stopProgressPoll();
    if (isDefaultMusic.value) {
      await pauseDefaultMusic();
    } else {
      await api.audioStop(token).catch((e) => logOptionalRejection("player.stopForGame.audioStop", e));
    }
    status.value = "paused";
  }

  /**
   * 主界面进入设置：正在播放时用暂停保留进度；加载中仍走 stopForGame，避免设置在后台开始出声。
   */
  async function pauseTitleMusicForOptions() {
    if (isDefaultMusic.value && status.value === "playing") {
      stopProgressPoll();
      await pauseDefaultMusic();
      status.value = "paused";
      return;
    }
    if (!isDefaultMusic.value && status.value === "playing") {
      stopProgressPoll();
      await api.audioPause(activeAudioRequestToken ?? undefined)
        .catch((e) => logOptionalRejection("player.pauseTitleMusicForOptions.audioPause", e));
      status.value = "paused";
      return;
    }
    await stopForGame();
  }

  /** 从设置回到主界面：当前曲目从头播放，不保留暂停进度。 */
  async function resumeTitleMusicAfterOptions() {
    if (isDefaultMusic.value) {
      await playDefaultMusic();
      status.value = "playing";
      startProgressPoll();
    } else if (queueIndex.value >= 0) {
      await loadAndPlay(queueIndex.value, true);
    }
  }

  /**
   * Eagerly resolve and cache music paths for all songs so switching is instant.
   * Also pre-decode the first batch of audio files into the backend cache.
   */
  function preloadAll(songs: SongListItem[]) {
    // Phase 1: resolve all music paths (lightweight IPC, caches string mapping)
    for (const song of songs) {
      resolveMusicPath(song.path).catch((e) => logOptionalRejection("player.preloadAll.resolvePath", e));
    }
    // Phase 2: preload audio data for the first 10 songs around current index
    const center = Math.max(0, queueIndex.value);
    const indices: number[] = [];
    for (let off = 0; indices.length < Math.min(10, songs.length); off++) {
      if (center + off < songs.length) indices.push(center + off);
      if (off > 0 && center - off >= 0) indices.push(center - off);
    }
    for (const i of indices) {
      const song = songs[i];
      if (!song) continue;
      resolveMusicPath(song.path)
        .then(mp => api.audioPreload(mp))
        .catch((e) => logOptionalRejection("player.preloadAll.preload", e));
    }
  }

  function cleanup() {
    const token = ++loadAbortId;
    activeAudioRequestToken = token;
    stopProgressPoll();
    if (isDefaultMusic.value) {
      stopDefaultMusic();
      isDefaultMusic.value = false;
    } else {
      api.audioStop(token).catch((e) => logOptionalRejection("player.cleanup.audioStop", e));
    }
    status.value = "idle";
  }

  /** Sync player status with actual audio backend state (fixes desync on screen transitions) */
  async function syncWithBackend() {
    try {
      const isPlaying = await api.audioIsPlaying();
      if (isPlaying && status.value !== 'playing') {
        status.value = 'playing';
        startProgressPoll();
      } else if (!isPlaying && status.value === 'playing') {
        status.value = 'paused';
        stopProgressPoll();
      }
    } catch (e: unknown) {
      logOptionalRejection("player.syncWithBackend", e);
    }
  }

  return {
    status, queue, queueIndex, currentSong,
    currentMusicPath, progress, duration, currentTime,
    isDefaultMusic,
    hasPrev, hasNext,
    setQueue, playSongAt, playNext, playPrev,
    syncQueuePreserveCurrent,
    togglePlayPause, seekTo, stopForGame, pauseTitleMusicForOptions, resumeTitleMusicAfterOptions, cleanup,
    syncWithBackend, preloadAll, playDefaultMusic,
    waitForLoadComplete,
  };
});
