import { defineStore } from "pinia";
import { ref } from "vue";

interface RandomPickResult {
  picked: string | null;
  empty: boolean;
  reset: boolean;
}

type RandomFn = () => number;

function fingerprintOf(scope: readonly string[]): string {
  return scope.join("\u0001");
}

export function createRandomBagPicker(randomFn: RandomFn = Math.random) {
  let activeFingerprint = "";
  let remaining: string[] = [];

  function resetForScope(scope: readonly string[]): void {
    remaining = [...scope];
    activeFingerprint = fingerprintOf(scope);
  }

  function pick(scope: readonly string[]): RandomPickResult {
    if (scope.length === 0) {
      activeFingerprint = "";
      remaining = [];
      return { picked: null, empty: true, reset: false };
    }

    const nextFingerprint = fingerprintOf(scope);
    const scopeChanged = nextFingerprint !== activeFingerprint;
    if (scopeChanged) {
      resetForScope(scope);
    }

    let reset = false;
    if (remaining.length === 0) {
      resetForScope(scope);
      reset = true;
    }

    const pickIndex = Math.floor(randomFn() * remaining.length);
    const [picked] = remaining.splice(pickIndex, 1);
    return { picked: picked ?? null, empty: false, reset };
  }

  function clear(): void {
    activeFingerprint = "";
    remaining = [];
  }

  return { pick, clear };
}

export const useSongRandomStore = defineStore("songRandom", () => {
  const picker = createRandomBagPicker();
  const lastPickedPath = ref<string | null>(null);

  function pickFromFiltered(filteredPaths: readonly string[]): RandomPickResult {
    const result = picker.pick(filteredPaths);
    lastPickedPath.value = result.picked;
    return result;
  }

  function clearState(): void {
    picker.clear();
    lastPickedPath.value = null;
  }

  return {
    lastPickedPath,
    pickFromFiltered,
    clearState,
  };
});
