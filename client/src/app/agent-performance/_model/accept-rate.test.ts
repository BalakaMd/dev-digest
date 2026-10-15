import { describe, it, expect } from "vitest";
import { acceptDescriptionKey, acceptTone, wholePercent } from "./accept-rate";

const settled = (rate: number | null) => ({ rate, low_sample: false });

describe("acceptTone — colour by the unrounded rate (AC-68)", () => {
  it("is green at 70 %, amber just below it, red just below 50 %", () => {
    expect(acceptTone(settled(0.7))).toBe("high");
    expect(acceptTone(settled(0.699))).toBe("medium"); // rounds to 70 for display, still amber
    expect(acceptTone(settled(0.499))).toBe("low"); // rounds to 50 for display, still red
  });

  it("is neutral for a low sample whatever the rate, and none when there is no rate", () => {
    expect(acceptTone({ rate: 1, low_sample: true })).toBe("neutral");
    expect(acceptTone({ rate: 0, low_sample: true })).toBe("neutral");
    expect(acceptTone({ rate: null, low_sample: false })).toBe("none");
  });
});

describe("acceptDescriptionKey (AC-68)", () => {
  it("describes the three coloured tones and nothing else", () => {
    expect(acceptDescriptionKey("high")).toBe("high");
    expect(acceptDescriptionKey("medium")).toBe("medium");
    expect(acceptDescriptionKey("low")).toBe("low");
    expect(acceptDescriptionKey("neutral")).toBeNull();
    expect(acceptDescriptionKey("none")).toBeNull();
  });
});

describe("wholePercent", () => {
  it("rounds only for display", () => {
    expect(wholePercent(45 / 58)).toBe(78);
    expect(wholePercent(0.699)).toBe(70);
  });
});
