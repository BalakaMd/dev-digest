import { describe, it, expect } from "vitest";
import type { AgentSkillDetail, SkillSummary } from "@devdigest/shared";
import {
  arrangeRows,
  buildRows,
  countActive,
  dropIndexAt,
  matchesName,
  moveRow,
  promptPositions,
  stepTarget,
  toSkillIds,
  toggleRow,
} from "./skill-rows";

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

  it("toggling a skill on links it in place — its position sets its prompt slot", () => {
    // [beta✓, zeta✓, alpha, mid] → enabling alpha keeps it third, so it goes last.
    const rows = buildRows(ALL, [link(ALL[3]!, 0), link(ALL[0]!, 1)]);
    const next = toggleRow(rows, "id-alpha", true);
    expect(next.map((r) => r.name)).toEqual(["beta", "zeta", "alpha", "mid"]);
    expect(toSkillIds(next)).toEqual(["id-beta", "id-zeta", "id-alpha"]);
  });

  it("toggling a skill off unlinks it without moving it", () => {
    const rows = buildRows(ALL, [link(ALL[0]!, 0), link(ALL[3]!, 1)]);
    const next = toggleRow(rows, "id-zeta", false);
    expect(toSkillIds(next)).toEqual(["id-beta"]);
    expect(next.map((r) => r.name)).toEqual(["zeta", "beta", "alpha", "mid"]);
  });

  it("re-enabling a skill that stayed in place restores its old prompt slot", () => {
    const rows = buildRows(ALL, [link(ALL[0]!, 0), link(ALL[3]!, 1)]);
    const next = toggleRow(toggleRow(rows, "id-zeta", false), "id-zeta", true);
    expect(toSkillIds(next)).toEqual(["id-zeta", "id-beta"]);
  });

  it("moves only enabled rows, to any position", () => {
    const rows = buildRows(ALL, [link(ALL[0]!, 0), link(ALL[3]!, 1)]);
    expect(toSkillIds(moveRow(rows, 1, 0))).toEqual(["id-beta", "id-zeta"]);
    // Moving zeta below a disabled row keeps the prompt order but moves the row.
    expect(moveRow(rows, 0, 2).map((r) => r.name)).toEqual(["beta", "alpha", "zeta", "mid"]);
    // Index 2 is a disabled row — it cannot be dragged.
    expect(moveRow(rows, 2, 0)).toBe(rows);
  });

  it("↑/↓ step over disabled rows to the next enabled one", () => {
    const rows = toggleRow(buildRows(ALL, [link(ALL[3]!, 0), link(ALL[0]!, 1)]), "id-mid", true);
    // [beta✓, zeta✓, alpha, mid✓]
    expect(stepTarget(rows, 3, -1)).toBe(1);
    expect(toSkillIds(moveRow(rows, 3, 1))).toEqual(["id-beta", "id-mid", "id-zeta"]);
    expect(stepTarget(rows, 0, -1)).toBeNull();
    expect(stepTarget(rows, 3, 1)).toBeNull();
    expect(promptPositions(rows).get("id-mid")).toBe(3);
  });

  it("keeps the user's layout across a refetch that agrees with it", () => {
    const server = buildRows(ALL, [link(ALL[3]!, 0), link(ALL[1]!, 1)]);
    // The user saw alpha enabled at the bottom: [beta✓, mid, zeta, alpha✓].
    const layout = ["id-beta", "id-mid", "id-zeta", "id-alpha"];
    expect(arrangeRows(server, layout).map((r) => r.name)).toEqual(["beta", "mid", "zeta", "alpha"]);
  });

  it("drops a stale layout whose prompt order disagrees with the server", () => {
    const server = buildRows(ALL, [link(ALL[3]!, 0), link(ALL[1]!, 1)]);
    const layout = ["id-alpha", "id-beta", "id-mid", "id-zeta"];
    expect(arrangeRows(server, layout)).toBe(server);
  });

  it("puts skills missing from the layout at the end", () => {
    const server = buildRows(ALL, []);
    expect(arrangeRows(server, ["id-zeta"]).map((r) => r.name)).toEqual(["zeta", "alpha", "beta", "mid"]);
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

describe("dropIndexAt", () => {
  const tops = [100, 152, 204];

  it("lands on the row under the pointer", () => {
    expect(dropIndexAt(tops, 170)).toBe(1);
    expect(dropIndexAt(tops, 230)).toBe(2);
  });

  it("clamps above the first row and below the last", () => {
    expect(dropIndexAt(tops, 20)).toBe(0);
    expect(dropIndexAt(tops, 900)).toBe(2);
  });
});
