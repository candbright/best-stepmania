import { describe, expect, it } from "vitest";
import { computeSkinSquareScaleXY } from "./skins";

describe("computeSkinSquareScaleXY", () => {
  it("fits different skin glyph bounds to the same square frame without gaps", () => {
    const tetrisScale = computeSkinSquareScaleXY(0.7, 0.56);
    const mechanicalScale = computeSkinSquareScaleXY(0.82, 0.8);
    const musicalScale = computeSkinSquareScaleXY(0.72, 0.86);

    expect(0.7 * tetrisScale.sx).toBeCloseTo(0.86, 6);
    expect(0.56 * tetrisScale.sy).toBeCloseTo(0.86, 6);
    expect(0.82 * mechanicalScale.sx).toBeCloseTo(0.86, 6);
    expect(0.8 * mechanicalScale.sy).toBeCloseTo(0.86, 6);
    expect(0.72 * musicalScale.sx).toBeCloseTo(0.86, 6);
    expect(0.86 * musicalScale.sy).toBeCloseTo(0.86, 6);
  });
});
