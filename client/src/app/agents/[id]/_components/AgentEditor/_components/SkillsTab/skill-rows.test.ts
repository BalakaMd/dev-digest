import { describe, it, expect } from "vitest";
import type { AgentSkillDetail, SkillSummary } from "@devdigest/shared";
import { buildRows, countActive, matchesName, moveRow, toSkillIds, toggleRow } from "./skill-rows";

const skill = (name: string, extra: Partial<SkillSummary> = {}): SkillSummary => ({
  id: `id-${name}`,
  name,
  description: `${name} description`,
  type: "rubric",
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  agent_count: 0,
  ...extra,
});
const link = (sk: SkillSummary, order: number): AgentSkillDetail => ({ ...sk, order });

const ALL = [skill("zeta"), skill("alpha"), skill("mid", { enabled: false }), skill("beta")];

describe("skill-rows", () => {
  it("lists linked skills first in link order, then the rest alphabetically", () => {
    const rows = buildRows(ALL, [link(ALL[0]!, 1), link(ALL[3]!, 0)]);
    expect(rows.map((r) => [r.name, r.enabled])).toEqual([
      ["beta", true],
      ["zeta", true],
      ["alpha", false],
      ["mid", false],
    ]);
  });

  it("appends a newly enabled skill to the end of the prompt order", () => {
    const rows = buildRows(ALL, [link(ALL[3]!, 0)]);
    const next = toggleRow(rows, "id-alpha", true);
    expect(toSkillIds(next)).toEqual(["id-beta", "id-alpha"]);
  });

  it("disabling unlinks the skill and returns it to the alphabetical tail", () => {
    const rows = buildRows(ALL, [link(ALL[0]!, 0), link(ALL[3]!, 1)]);
    const next = toggleRow(rows, "id-zeta", false);
    expect(toSkillIds(next)).toEqual(["id-beta"]);
    expect(next.map((r) => r.name)).toEqual(["beta", "alpha", "mid", "zeta"]);
  });

  it("moves only among enabled rows", () => {
    const rows = buildRows(ALL, [link(ALL[0]!, 0), link(ALL[3]!, 1)]);
    expect(toSkillIds(moveRow(rows, 1, 0))).toEqual(["id-beta", "id-zeta"]);
    // Index 2 is a disabled row — no place in the prompt to move to.
    expect(moveRow(rows, 0, 2)).toBe(rows);
    expect(moveRow(rows, 2, 0)).toBe(rows);
  });

  it("counts only skills that actually reach the prompt", () => {
    const rows = buildRows(ALL, [link(ALL[2]!, 0), link(ALL[3]!, 1)]);
    // "mid" is linked but globally disabled.
    expect(countActive(rows)).toBe(1);
  });

  it("filters by name, case-insensitively", () => {
    const [row] = buildRows([skill("Secret-Leakage-Gate")], []);
    expect(matchesName(row!, "leakage")).toBe(true);
    expect(matchesName(row!, "perf")).toBe(false);
    expect(matchesName(row!, "  ")).toBe(true);
  });
});
