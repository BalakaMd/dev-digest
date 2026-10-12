import { describe, it, expect } from "vitest";
import { agentTone, toneBackground } from "./agent-tone";

const FALLBACK = ["#ec4899", "#f97316", "#6366f1", "#06b6d4", "#84cc16", "#eab308"];

describe("agentTone — keyword decides colour and icon", () => {
  it.each([
    ["Security Reviewer", "#ef4444", "Shield"],
    ["PERFORMANCE", "#f59e0b", "Zap"],
    ["API Contract Reviewer", "#a855f7", "Users"],
  ] as const)("%s → %s / %s (case-insensitive)", (name, color, icon) => {
    expect(agentTone({ id: "x", name })).toEqual({ color, icon });
  });

  it("the keyword beats whatever the id would hash to", () => {
    const tones = ["a", "b", "c", "d", "e", "f", "g"].map((id) => agentTone({ id, name: "Security" }));
    for (const t of tones) expect(t).toEqual({ color: "#ef4444", icon: "Shield" });
  });
});

describe("agentTone — fallback for unrecognised names", () => {
  it("uses the Cpu icon and one of the fallback colours", () => {
    for (const id of ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]) {
      const t = agentTone({ id, name: "Zeta" });
      expect(t.icon).toBe("Cpu");
      expect(FALLBACK).toContain(t.color);
    }
  });

  it("is stable: the same id always gives the same colour, whatever the name", () => {
    expect(agentTone({ id: "agent-42", name: "Zeta" })).toEqual(agentTone({ id: "agent-42", name: "Omega" }));
    expect(agentTone({ id: "agent-42", name: "Zeta" })).toEqual(agentTone({ id: "agent-42", name: "Zeta" }));
  });

  it("without an id it is deterministic by name, and spreads across more than one colour", () => {
    expect(agentTone({ name: "Zeta" })).toEqual(agentTone({ name: "Zeta" }));
    const colors = new Set(["Alpha", "Beta", "Gamma", "Delta", "Omega", "Zeta"].map((name) => agentTone({ name }).color));
    expect(colors.size).toBeGreaterThan(1);
    for (const c of colors) expect(FALLBACK).toContain(c);
  });

  it("copes with a missing name and id", () => {
    const t = agentTone({ id: null, name: null });
    expect(t.icon).toBe("Cpu");
    expect(FALLBACK).toContain(t.color);
  });
});

describe("toneBackground", () => {
  it("mixes the colour into a translucent tint", () => {
    expect(toneBackground("#ef4444")).toBe("color-mix(in srgb, #ef4444 14%, transparent)");
  });
});
