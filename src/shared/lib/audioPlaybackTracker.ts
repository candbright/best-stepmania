import type { UnlistenFn } from "@tauri-apps/api/event";
import * as api from "@/shared/api";
import { listenAudioPlayback } from "@/shared/services/tauri/audioEvents";

export interface AudioPlaybackEventPayload {
  event: string;
  time: number;
  duration: number;
  is_playing: boolean;
}

interface AudioPlaybackTrackerOptions {
  deviceCheckIntervalMs?: number;
  getIsActive: () => boolean;
  getShouldResumeAfterDeviceSwitch: () => boolean;
  getRequestToken: () => number | null;
  getDuration: () => number;
  onPlaybackSnapshot: (time: number, duration: number) => void;
  onPauseWhilePlaying: () => void;
  onTrackEnd: () => void;
}

interface DevicePollState {
  lastDeviceId: string | null;
  timer: ReturnType<typeof setInterval> | null;
}

interface EventTrackingState {
  unlisten: UnlistenFn | null;
  rafHandle: number | null;
  localTimeAtEvent: number;
  lastEventTime: number;
}

interface EnginePollState {
  timer: ReturnType<typeof setInterval> | null;
}

const DEFAULT_DEVICE_CHECK_INTERVAL_MS = 5000;
/** 用引擎时间重锚 RAF 外推，避免纯墙钟漂移；EOF 仅由引擎快照判定 */
const ENGINE_POLL_MS = 300;

/**
 * 自然结束容差（秒）：`time`/`duration` 同源但 mixer 以源采样步进、轨末停播时
 * 二者差值在数帧量级；短曲 duration 的离散化相对更大。不含旧版「墙钟 ≥ duration-0.3」类判据。
 */
function eofEpsilonSec(durationSec: number): number {
  const assumedSr = 48_000;
  const posStep = 1 / assumedSr;
  const estSamples = Math.max(1, durationSec * assumedSr);
  const durationSnapErr = 1 / estSamples;
  const slack = 0.046;
  const cappedSnap = Math.min(0.055, 12 * durationSnapErr + 4 * posStep);
  return Math.min(0.17, slack + cappedSnap);
}

export function createAudioPlaybackTracker(options: AudioPlaybackTrackerOptions) {
  const devicePoll: DevicePollState = {
    lastDeviceId: null,
    timer: null,
  };

  const eventTracking: EventTrackingState = {
    unlisten: null,
    rafHandle: null,
    localTimeAtEvent: 0,
    lastEventTime: 0,
  };

  const enginePoll: EnginePollState = {
    timer: null,
  };

  async function setupEventListener() {
    if (eventTracking.unlisten) return;
    eventTracking.unlisten = await listenAudioPlayback<AudioPlaybackEventPayload>((ev) => {
      const { event: type, time, duration } = ev.payload;
      eventTracking.lastEventTime = time;
      eventTracking.localTimeAtEvent = performance.now() / 1000;

      if (type === "play" || type === "pause" || type === "seek") {
        options.onPlaybackSnapshot(time, duration);
      }

      if (type === "pause" && options.getIsActive()) {
        options.onPauseWhilePlaying();
      }
    });
  }

  function stopLocalTracking() {
    if (eventTracking.rafHandle !== null) {
      cancelAnimationFrame(eventTracking.rafHandle);
      eventTracking.rafHandle = null;
    }
  }

  function startLocalTracking() {
    stopLocalTracking();
    const tick = () => {
      // RAF 仅平滑进度；EOF 仅由引擎轮询判定。
      if (options.getIsActive()) {
        const duration = options.getDuration();
        if (duration > 0) {
          const elapsed = performance.now() / 1000 - eventTracking.localTimeAtEvent;
          const currentTime = eventTracking.lastEventTime + elapsed;
          options.onPlaybackSnapshot(currentTime, duration);
        }
      }
      eventTracking.rafHandle = requestAnimationFrame(tick);
    };
    eventTracking.rafHandle = requestAnimationFrame(tick);
  }

  function stopEnginePoll() {
    if (enginePoll.timer !== null) {
      clearInterval(enginePoll.timer);
      enginePoll.timer = null;
    }
  }

  function startEnginePoll() {
    stopEnginePoll();
    enginePoll.timer = setInterval(() => {
      void tickEngineFromBackend();
    }, ENGINE_POLL_MS);
  }

  async function tickEngineFromBackend() {
    if (!options.getIsActive()) return;
    try {
      const state = await api.audioGetPlaybackState();
      const engineDuration =
        state.duration > 0 ? state.duration : options.getDuration();
      eventTracking.lastEventTime = state.time;
      eventTracking.localTimeAtEvent = performance.now() / 1000;
      options.onPlaybackSnapshot(state.time, engineDuration);

      const eps = eofEpsilonSec(engineDuration);
      if (
        !state.isPlaying &&
        engineDuration > 0 &&
        state.time >= engineDuration - eps
      ) {
        options.onTrackEnd();
      }
    } catch {
      // Transient IPC failures during teardown / stream rebuild.
    }
  }

  async function checkAudioDevice() {
    try {
      const devices = await api.audioListDevices();
      const defaultDevice = devices.find((device) => device.isDefault);
      const currentId = defaultDevice?.id ?? null;

      if (devicePoll.lastDeviceId !== null && currentId !== null && currentId !== devicePoll.lastDeviceId) {
        devicePoll.lastDeviceId = currentId;
        await api.audioRebuildStream();
        if (options.getShouldResumeAfterDeviceSwitch()) {
          await api.audioPlay(options.getRequestToken() ?? undefined);
        }
      } else if (devicePoll.lastDeviceId === null) {
        devicePoll.lastDeviceId = currentId;
      }
    } catch {
      // Ignore transient device enumeration / rebuild failures.
    }
  }

  function stopDevicePolling() {
    if (devicePoll.timer !== null) {
      clearInterval(devicePoll.timer);
      devicePoll.timer = null;
    }
  }

  function startDevicePolling() {
    stopDevicePolling();
    void checkAudioDevice();
    devicePoll.timer = setInterval(
      checkAudioDevice,
      options.deviceCheckIntervalMs ?? DEFAULT_DEVICE_CHECK_INTERVAL_MS,
    );
  }

  function start() {
    startDevicePolling();
    void setupEventListener();
    startEnginePoll();
    void tickEngineFromBackend();
    startLocalTracking();
  }

  function stop() {
    stopDevicePolling();
    stopEnginePoll();
    stopLocalTracking();
  }

  function dispose() {
    stop();
    if (eventTracking.unlisten) {
      eventTracking.unlisten();
      eventTracking.unlisten = null;
    }
  }

  return {
    start,
    stop,
    dispose,
    startDevicePolling,
    stopDevicePolling,
  };
}
