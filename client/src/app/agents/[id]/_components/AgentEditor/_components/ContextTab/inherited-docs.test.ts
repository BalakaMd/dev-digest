import { describe, it, expect } from "vitest";
import { inheritedDocs } from "./inherited-docs";

describe("inheritedDocs (AC-46)", () => {
  it("lists enabled skills' documents in skill link order, each skill's in its own order", () => {
    expect(
      inheritedDocs(
        [
          { name: "rubric", enabled: true, context_docs: ["b.md", "a.md"] },
          { name: "gate", enabled: true, context_docs: ["c.md"] },
        ],
        [],
      ),
    ).toEqual([
      { path: "b.md", via: "rubric" },
      { path: "a.md", via: "rubric" },
      { path: "c.md", via: "gate" },
    ]);
  });

  it("leaves out globally disabled skills", () => {
    expect(inheritedDocs([{ name: "off", enabled: false, context_docs: ["a.md"] }], [])).toEqual([]);
  });

  it("drops a document the agent attaches itself, and a repeat from a later skill (first one wins)", () => {
    expect(
      inheritedDocs(
        [
          { name: "first", enabled: true, context_docs: ["own.md", "x.md"] },
          { name: "second", enabled: true, context_docs: ["x.md", "y.md"] },
        ],
        ["own.md"],
      ),
    ).toEqual([
      { path: "x.md", via: "first" },
      { path: "y.md", via: "second" },
    ]);
  });

  it("tolerates skills without attachments", () => {
    expect(inheritedDocs([{ name: "plain", enabled: true }], [])).toEqual([]);
  });
});
