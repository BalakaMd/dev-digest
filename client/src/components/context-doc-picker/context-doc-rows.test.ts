import { describe, it, expect } from "vitest";
import { entry } from "../../test/context-docs-fixtures";
import { simulateBudget } from "./budget";
import {
  arrangeRows,
  attachedPaths,
  buildRows,
  countAttached,
  countAvailable,
  dropIndexAt,
  injectedRows,
  matchesPath,
  move,
  stepTarget,
  toggle,
} from "./context-doc-rows";

const DOCS = [
  entry("docs/zeta.md"),
  entry("specs/api.md"),
  entry("docs/alpha.md"),
  entry("insights/learned.md"),
  entry("specs/auth.md"),
];

describe("buildRows — order (AC-11)", () => {
  it("lists attached rows in attachment order, then inherited ones, then the rest by path", () => {
    const rows = buildRows({
      docs: DOCS,
      attached: ["specs/auth.md", "docs/zeta.md"],
      inherited: [{ path: "insights/learned.md", via: "rubric" }],
    });
    expect(rows.map((r) => r.path)).toEqual([
      "specs/auth.md",
      "docs/zeta.md",
      "insights/learned.md",
      "docs/alpha.md",
      "specs/api.md",
    ]);
    expect(rows.map((r) => r.attached)).toEqual([true, true, false, false, false]);
  });

  it("labels an inherited row with the skill it comes from; the first skill wins", () => {
    const rows = buildRows({
      docs: DOCS,
      attached: [],
      inherited: [
        { path: "docs/alpha.md", via: "first-skill" },
        { path: "docs/alpha.md", via: "second-skill" },
      ],
    });
    expect(rows.find((r) => r.path === "docs/alpha.md")).toMatchObject({ via: "first-skill", attached: false });
  });

  it("shows a document that is both attached and inherited once, as attached", () => {
    const rows = buildRows({
      docs: DOCS,
      attached: ["docs/alpha.md"],
      inherited: [{ path: "docs/alpha.md", via: "rubric" }],
    });
    const alpha = rows.filter((r) => r.path === "docs/alpha.md");
    expect(alpha).toHaveLength(1);
    expect(alpha[0]).toMatchObject({ attached: true, via: null });
  });

  it("carries the anatomy of a row: name, parent folder, type, source, tokens", () => {
    const rows = buildRows({
      docs: [entry("docs/guides/setup.md", { source: "local", tokens: 321, type: "docs" })],
      attached: [],
    });
    expect(rows[0]).toMatchObject({
      name: "setup.md",
      folder: "docs/guides",
      type: "docs",
      local: true,
      tokens: 321,
      tooLarge: false,
      missing: false,
    });
  });

  it("lists an overridden path once: the local copy is the row, the repository document is dropped", () => {
    const rows = buildRows({
      docs: [
        entry("docs/a.md", { overridden: true, tokens: 10 }),
        entry("docs/a.md", { source: "local", overrides_repo: true, tokens: 42 }),
      ],
      attached: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ local: true, overridesRepo: true, tokens: 42 });
  });

  it("an attached overridden path is one attached, non-missing row whose tokens are the copy's (AC-16)", () => {
    const rows = buildRows({
      docs: [
        entry("docs/a.md", { overridden: true, tokens: 10 }),
        entry("docs/a.md", { source: "local", overrides_repo: true, tokens: 42 }),
      ],
      attached: ["docs/a.md"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attached: true, missing: false, tokens: 42 });
    expect(injectedRows(rows).map((r) => r.tokens)).toEqual([42]);
  });

  it("carries the copy's too-large state, not the repository document's (AC-16)", () => {
    const rows = buildRows({
      docs: [
        entry("docs/a.md", { overridden: true, tokens: 10 }),
        entry("docs/a.md", { source: "local", overrides_repo: true, too_large: true, tokens: null }),
      ],
      attached: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ overridesRepo: true, tooLarge: true, tokens: null });
  });

  it("flags too-large documents", () => {
    const rows = buildRows({ docs: [entry("docs/big.md", { too_large: true, tokens: null })], attached: [] });
    expect(rows[0]).toMatchObject({ tooLarge: true, tokens: null });
  });
});

describe("buildRows — missing attached paths (AC-45)", () => {
  const rows = buildRows({ docs: DOCS, attached: ["docs/gone.md", "specs/api.md"] });

  it("turns an attached path that is not listed into a checked, missing row, in attachment order", () => {
    expect(rows[0]).toMatchObject({ path: "docs/gone.md", missing: true, attached: true });
    expect(rows[1]).toMatchObject({ path: "specs/api.md", missing: false, attached: true });
  });

  it("counts the missing row among the attached ones", () => {
    expect(countAttached(rows)).toBe(2);
  });

  it("unchecking it detaches it from the saved list", () => {
    expect(attachedPaths(toggle(rows, "docs/gone.md", false))).toEqual(["specs/api.md"]);
  });

  it("is never injected into a run", () => {
    expect(injectedRows(rows).map((r) => r.path)).toEqual(["specs/api.md"]);
  });
});

describe("filter (AC-15)", () => {
  const rows = buildRows({ docs: DOCS, attached: [] });

  it("matches the path case-insensitively, as a substring", () => {
    expect(rows.filter((r) => matchesPath(r, "API")).map((r) => r.path)).toEqual(["specs/api.md"]);
    expect(rows.filter((r) => matchesPath(r, "docs/")).map((r) => r.path)).toEqual(["docs/alpha.md", "docs/zeta.md"]);
  });

  it("matches everything for an empty or blank query", () => {
    expect(rows.filter((r) => matchesPath(r, "")).length).toBe(rows.length);
    expect(rows.filter((r) => matchesPath(r, "   ")).length).toBe(rows.length);
  });
});

describe("toggle / move / stepTarget", () => {
  const rows = buildRows({ docs: DOCS, attached: ["specs/auth.md", "docs/zeta.md"] });

  it("toggling flips a row in place and keeps the layout", () => {
    const next = toggle(rows, "docs/alpha.md", true);
    expect(next.map((r) => r.path)).toEqual(rows.map((r) => r.path));
    expect(attachedPaths(next)).toEqual(["specs/auth.md", "docs/zeta.md", "docs/alpha.md"]);
  });

  it("a toggle that changes nothing returns the same rows", () => {
    expect(toggle(rows, "specs/auth.md", true)).toBe(rows);
  });

  it("moving an attached row changes the attachment order", () => {
    expect(attachedPaths(move(rows, 0, 1))).toEqual(["docs/zeta.md", "specs/auth.md"]);
  });

  it("an unattached row cannot be moved", () => {
    expect(move(rows, 3, 0)).toBe(rows);
  });

  it("↑/↓ target the neighbouring ATTACHED row and stop at the ends", () => {
    expect(stepTarget(rows, 0, 1)).toBe(1);
    expect(stepTarget(rows, 1, -1)).toBe(0);
    expect(stepTarget(rows, 0, -1)).toBeNull();
    expect(stepTarget(rows, 1, 1)).toBeNull();
  });

  it("dropIndexAt picks the last row whose top is at or above the pointer", () => {
    expect(dropIndexAt([0, 50, 100], 70)).toBe(1);
    expect(dropIndexAt([0, 50, 100], -10)).toBe(0);
    expect(dropIndexAt([0, 50, 100], 500)).toBe(2);
  });

  it("arrangeRows keeps the layout the user last saw while it agrees with the attached order", () => {
    const layout = ["specs/auth.md", "docs/zeta.md", "specs/api.md", "docs/alpha.md", "insights/learned.md"];
    expect(arrangeRows(rows, layout).map((r) => r.path)).toEqual(layout);
    expect(arrangeRows(rows, null)).toBe(rows);
  });

  it("arrangeRows drops a stale layout whose attached order disagrees with the server's", () => {
    expect(arrangeRows(rows, ["docs/zeta.md", "specs/auth.md"])).toBe(rows);
  });
});

describe("counters", () => {
  it("N counts attached rows; M counts rows that can be attached", () => {
    const rows = buildRows({ docs: DOCS, attached: ["specs/auth.md"] });
    expect(countAttached(rows)).toBe(1);
    expect(countAvailable(rows)).toBe(5);
  });
});

describe("budget (AC-47)", () => {
  it("sums what fits and skips a whole document that would exceed the limit, then tries the next", () => {
    const out = simulateBudget(
      [
        { path: "a.md", tokens: 5000 },
        { path: "b.md", tokens: 4000 },
        { path: "c.md", tokens: 2500 },
        { path: "d.md", tokens: 500 },
      ],
      8000,
    );
    expect(out).toEqual({ total: 8000, skipped: ["b.md"] });
  });

  it("a document that exactly reaches the limit still fits", () => {
    expect(simulateBudget([{ path: "a.md", tokens: 8000 }], 8000)).toEqual({ total: 8000, skipped: [] });
  });

  it("injectedRows leaves out too-large documents and keeps attached before inherited", () => {
    const rows = buildRows({
      docs: [entry("docs/big.md", { too_large: true, tokens: null }), entry("docs/a.md"), entry("docs/b.md")],
      attached: ["docs/big.md", "docs/b.md"],
      inherited: [{ path: "docs/a.md", via: "rubric" }],
    });
    expect(injectedRows(rows).map((r) => r.path)).toEqual(["docs/b.md", "docs/a.md"]);
  });
});
