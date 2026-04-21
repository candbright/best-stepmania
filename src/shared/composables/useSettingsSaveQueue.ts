/**
 * Debounced persist for `saveAppConfig`. Use `flushAwait()` when the process may exit
 * immediately after (e.g. window close) so the write finishes before teardown.
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

  async function flushAwait() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await Promise.resolve(saveFn());
  }

  return { schedule, flush, flushAwait };
}
