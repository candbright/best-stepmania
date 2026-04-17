/**
 * Single debounced entry for persisting app config from settings pages.
 * Call `flush()` from the screen's `onUnmounted` after stopping reactive sync.
 */
export function useSettingsSaveQueue(saveFn: () => void | Promise<void>, debounceMs = 800) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void Promise.resolve(saveFn());
    }, debounceMs);
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void Promise.resolve(saveFn());
  }

  return { schedule, flush };
}
