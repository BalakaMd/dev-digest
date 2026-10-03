import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("sidebar nav — Project Context (AC-51)", () => {
  const workspace = NAV.find((g) => g.section === "WORKSPACE")!;
  const item = workspace?.items.find((i) => i.label === "Project Context");

  it('has a "Project Context" item in the WORKSPACE group that opens the active repository\'s context page', () => {
    expect(item).toBeDefined();
    expect(item!.href).toBe("/repos/:repoId/context");
  });

  it("is highlighted for its own route and not for the neighbouring ones", () => {
    expect(activeKeyFor("/repos/r1/context")).toBe(item!.key);
    expect(activeKeyFor("/repos/r1/pulls")).not.toBe(item!.key);
    expect(activeKeyFor("/repos/r1/conventions")).not.toBe(item!.key);
  });
});
