import { describe, it, expect } from "vitest";
import { repoSwitchHref } from "./helpers";

describe("repoSwitchHref — the sidebar repository selector (SPEC-10 AC-62)", () => {
  it("stays on Agent Performance, keeps range and sort, sets the repository and drops the expanded row", () => {
    const href = repoSwitchHref("/agent-performance", "?repo=r1&range=1d&sort=runs&dir=asc&expanded=a1", "r2");
    const [path, query] = href.split("?");
    expect(path).toBe("/agent-performance");
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      repo: "r2",
      range: "1d",
      sort: "runs",
      dir: "asc",
    });
  });

  it("adds the repository when the address has none", () => {
    expect(repoSwitchHref("/agent-performance", "", "r2")).toBe("/agent-performance?repo=r2");
  });

  it("keeps a custom range intact", () => {
    const href = repoSwitchHref("/agent-performance", "?repo=r1&range=custom&start=2026-09-01&end=2026-09-30", "r2");
    const q = new URLSearchParams(href.split("?")[1]);
    expect([q.get("range"), q.get("start"), q.get("end")]).toEqual(["custom", "2026-09-01", "2026-09-30"]);
  });

  it("opens the repository's pull requests from every other page, as before", () => {
    expect(repoSwitchHref("/repos/r1/pulls", "?x=1", "r2")).toBe("/repos/r2/pulls");
    expect(repoSwitchHref("/ci-runs", "", "r2")).toBe("/repos/r2/pulls");
  });
});
