import { describe, it, expect } from "vitest";
import { resolveAddress, serializeAddress, type ResolveContext } from "./address";

const NOW = new Date(2026, 9, 14, 12, 0, 0); // local time, passes in any TZ

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  repoIds: ["r1", "r2"],
  activeRepoId: "r1",
  agentIds: ["a1", "a2"],
  now: NOW,
  ...over,
});

const params = (qs: string) => new URLSearchParams(qs);

describe("address — opening an address shows the same view (AC-47)", () => {
  it("defaults to the active repo, 30 days, Accept descending and no expanded row", () => {
    expect(resolveAddress(params(""), ctx())).toEqual({
      repoId: "r1",
      range: { kind: "30d" },
      sort: "accept",
      dir: "desc",
      expanded: null,
      resets: [],
    });
  });

  it("restores repo, custom range, sort, direction and expanded row from the address", () => {
    const qs = "repo=r2&range=custom&start=2026-09-01&end=2026-09-30&sort=runs&dir=asc&expanded=a2";
    expect(resolveAddress(params(qs), ctx())).toEqual({
      repoId: "r2",
      range: { kind: "custom", start: "2026-09-01", end: "2026-09-30" },
      sort: "runs",
      dir: "asc",
      expanded: "a2",
      resets: [],
    });
  });

  it("serialises to an address that resolves back to the same state, omitting defaults", () => {
    const state = {
      repoId: "r2",
      range: { kind: "custom" as const, start: "2026-09-01", end: "2026-09-30" },
      sort: "last_run" as const,
      dir: "asc" as const,
      expanded: "a1",
    };
    const qs = serializeAddress(state);
    expect(resolveAddress(params(qs), ctx())).toEqual({ ...state, resets: [] });

    const defaults = { repoId: "r1", range: { kind: "30d" as const }, sort: "accept" as const, dir: "desc" as const, expanded: null };
    expect(serializeAddress(defaults)).toBe("repo=r1");
  });
});

describe("address — an invalid part is reset, the valid parts stay (AC-64)", () => {
  it("replaces each invalid part with its default and names it", () => {
    const qs = "repo=bogus&range=custom&sort=zzz&dir=up&expanded=ghost";
    expect(resolveAddress(params(qs), ctx())).toEqual({
      repoId: "r1", // the active repository
      range: { kind: "30d" },
      sort: "accept",
      dir: "desc",
      expanded: null,
      resets: ["repo", "range", "sort", "dir", "expanded"],
    });
  });

  it("keeps the valid parts when only some are invalid", () => {
    const resolved = resolveAddress(params("repo=r2&range=1d&sort=zzz&expanded=a1"), ctx());
    expect(resolved).toMatchObject({ repoId: "r2", range: { kind: "1d" }, sort: "accept", expanded: "a1" });
    expect(resolved.resets).toEqual(["sort"]);
  });

  it("resets a custom range that the range rules reject (end before start, end in the future, over 366 days)", () => {
    for (const qs of [
      "range=custom&start=2026-09-30&end=2026-09-01",
      "range=custom&start=2026-10-01&end=2026-10-15",
      "range=custom&start=2025-10-13&end=2026-10-14",
    ]) {
      const resolved = resolveAddress(params(qs), ctx());
      expect(resolved.range).toEqual({ kind: "30d" });
      expect(resolved.resets).toEqual(["range"]);
    }
  });

  it("judges nothing it cannot know yet: no reset while the repositories or the agents are still loading", () => {
    const resolved = resolveAddress(params("repo=r9&expanded=a9"), ctx({ repoIds: null, agentIds: null }));
    expect(resolved).toMatchObject({ repoId: "r9", expanded: "a9", resets: [] });
  });
});

describe("address — untrusted values", () => {
  it("never passes an unlisted repository or agent id through, whatever it contains", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const resolved = resolveAddress(params(`repo=${encodeURIComponent(hostile)}&expanded=${encodeURIComponent(hostile)}`), ctx());
    expect(resolved.repoId).toBe("r1");
    expect(resolved.expanded).toBeNull();
    expect(resolved.resets).toEqual(["repo", "expanded"]);
  });

  it("encodes values when writing the address back, so they cannot add parameters", () => {
    const qs = serializeAddress({
      repoId: "r1&sort=runs",
      range: { kind: "30d" },
      sort: "accept",
      dir: "desc",
      expanded: null,
    });
    expect(new URLSearchParams(qs).get("repo")).toBe("r1&sort=runs");
    expect(new URLSearchParams(qs).get("sort")).toBeNull();
  });
});
