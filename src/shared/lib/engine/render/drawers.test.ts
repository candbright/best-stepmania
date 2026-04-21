import { describe, expect, it, vi, beforeEach } from "vitest";
import { drawHoldDrawer, drawReceptorDrawer, type RenderDrawerDeps } from "./drawers";
import type { HoldState, PanelConfig } from "@/shared/lib/engine";

const drawArrowWithSkinMock = vi.fn();
const drawPumpPanelWithSkinMock = vi.fn();

vi.mock("./skins", () => ({
  drawArrowWithSkin: (...args: unknown[]) => drawArrowWithSkinMock(...args),
  drawPumpPanelWithSkin: (...args: unknown[]) => drawPumpPanelWithSkinMock(...args),
}));

function createCanvasStub(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    set lineWidth(_v: number) {},
    set strokeStyle(_v: string) {},
    set fillStyle(_v: string) {},
    set font(_v: string) {},
    set textAlign(_v: CanvasTextAlign) {},
    set textBaseline(_v: CanvasTextBaseline) {},
    set shadowColor(_v: string) {},
    set shadowBlur(_v: number) {},
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
}

function createDeps(): RenderDrawerDeps {
  return {
    numTracks: 4,
    noteHeight: 20,
    qualityLevel: "high",
    getPlayerConfig: () => ({ noteStyle: "default" }) as never,
    getTrackColor: () => "#fff",
    getTrackDirection: () => "left",
    getPumpDirection: () => null,
    getColumnLabel: () => "L",
    isCenterColumn: () => false,
    getEffectsForTrack: () => ({ sudden: false, hidden: false, rotate: false }),
  };
}

describe("drawReceptorDrawer", () => {
  beforeEach(() => {
    drawArrowWithSkinMock.mockClear();
    drawPumpPanelWithSkinMock.mockClear();
  });

  it("uses rotated directional rendering for receptor arrows", () => {
    const canvas = createCanvasStub();
    const deps = createDeps();

    drawReceptorDrawer(canvas, 0, 0, 0, false, "#fff", 64, 32, 1, deps);

    expect(drawArrowWithSkinMock).toHaveBeenCalledTimes(1);
    const keepParallelArg = drawArrowWithSkinMock.mock.calls[0]?.[10];
    expect(keepParallelArg).toBe(false);
  });

  it("uses same pump note box size for center and directional lanes", async () => {
    const { drawNoteDrawer } = await import("./drawers");
    const canvas = createCanvasStub();
    const deps: RenderDrawerDeps = {
      ...createDeps(),
      numTracks: 5,
      getPumpDirection: (col) => (col === 2 ? null : "upLeft"),
      getTrackDirection: () => null,
    };
    const recSize = 50;
    drawNoteDrawer(canvas, 0, 0, 0, 64, recSize, "Tap", undefined, deps);
    drawNoteDrawer(canvas, 0, 0, 2, 64, recSize, "Tap", undefined, deps);

    const directionalSize = drawArrowWithSkinMock.mock.calls[0]?.[3] as number;
    const centerSize = drawPumpPanelWithSkinMock.mock.calls[0]?.[3] as number;
    expect(directionalSize).toBeCloseTo(recSize * 0.9, 6);
    expect(centerSize).toBeCloseTo(recSize * 0.9, 6);
  });
});

describe("drawHoldDrawer", () => {
  it("matches hold body width to starting key width and keeps body outside head", () => {
    const createLinearGradient = vi.fn(() => ({
      addColorStop: vi.fn(),
    }));
    const fillRect = vi.fn();
    const canvas = {
      ...createCanvasStub(),
      createLinearGradient,
      fillRect,
    } as unknown as CanvasRenderingContext2D;
    const deps = createDeps();
    const hold: HoldState = {
      track: 0,
      startRow: 0,
      endRow: 16,
      endSecond: 2,
      active: false,
      held: false,
      finished: false,
      letGo: false,
      isRoll: false,
      lastRollTick: 0,
    };
    const panel: PanelConfig = {
      player: 1,
      startTrack: 0,
      numTracks: 4,
      x: 0,
      width: 256,
      receptorY: 100,
      noteScale: 1,
      speedMod: "x1.00",
      reverse: false,
    };
    const engine = {
      notes: [{ track: 0, row: 0, second: 1 }],
      judgment: { isNoteJudged: () => false },
      getChartPlayheadSeconds: () => 0.5,
      getNoteY: (sec: number) => (sec === 1 ? 120 : 220),
    } as unknown as Parameters<typeof drawHoldDrawer>[1];

    drawHoldDrawer(canvas, engine, hold, 10, 100, 400, 64, 40, panel, deps);

    const bodyDraw = fillRect.mock.calls.find((call) => (call[2] as number) > 10 && (call[2] as number) < 20);
    expect(bodyDraw?.[2]).toBeCloseTo(14.0727, 3);
    // head center is 120; head-bottom edge offset is 40*0.9*0.36*(0.86/0.88) ~= 12.665
    expect(bodyDraw?.[1]).toBeCloseTo(132.665, 3);
  });
});
