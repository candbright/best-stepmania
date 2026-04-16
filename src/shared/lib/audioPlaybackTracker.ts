import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as api from "@/utils/api";

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

const DEFAULT_DEVICE_CHECK_INTERVAL_MS = 5000;

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

  async function setupEventListener() {
    if (eventTracking.unlisten) return;
    eventTracking.unlisten = await listen<AudioPlaybackEventPayload>("audio-playback", (ev) => {
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
      if (options.getIsActive()) {
        const duration = options.getDuration();
        if (duration > 0) {
          const elapsed = performance.now() / 1000 - eventTracking.localTimeAtEvent;
          const currentTime = eventTracking.lastEventTime + elapsed;
          options.onPlaybackSnapshot(currentTime, duration);

          if (currentTime >= duration - 0.3) {
            options.onTrackEnd();
            return;
          }
        }
      }
      eventTracking.rafHandle = requestAnimationFrame(tick);
    };
    eventTracking.rafHandle = requestAnimationFrame(tick);
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
    startLocalTracking();
  }

  function stop() {
    stopDevicePolling();
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
