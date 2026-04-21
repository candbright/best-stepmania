import { describe, expect, it } from "vitest";
import { createRandomBagPicker } from "./songRandom";

describe("createRandomBagPicker", () => {
  it("picks without replacement and resets when depleted", () => {
    const values = [0.1, 0.8, 0.2];
    let cursor = 0;
    const picker = createRandomBagPicker(() => {
      const next = values[cursor] ?? 0;
      cursor += 1;
      return next;
    });

    const first = picker.pick(["a", "b"]);
    const second = picker.pick(["a", "b"]);
    const third = picker.pick(["a", "b"]);

    expect(first.empty).toBe(false);
    expect(second.empty).toBe(false);
    expect([first.picked, second.picked].sort()).toEqual(["a", "b"]);
    expect(third.reset).toBe(true);
    expect(["a", "b"]).toContain(third.picked);
  });

  it("rebuilds bag immediately when filtered scope changes", () => {
    const picker = createRandomBagPicker(() => 0);
    const first = picker.pick(["song-1", "song-2"]);
    const second = picker.pick(["song-3"]);

    expect(first.picked).toBe("song-1");
    expect(second.picked).toBe("song-3");
    expect(second.reset).toBe(false);
  });

  it("returns empty result when filtered scope is empty", () => {
    const picker = createRandomBagPicker(() => 0);
    const result = picker.pick([]);

    expect(result.empty).toBe(true);
    expect(result.picked).toBeNull();
  });
});
