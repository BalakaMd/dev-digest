import { describe, it, expect } from "vitest";
import { serializedContext } from "./serialize";

describe("serializedContext (AC-81)", () => {
  it("is the ## Project context heading followed by one `- <path>` line per document, in attachment order", () => {
    expect(serializedContext(["specs/b.md", "docs/a.md"])).toBe("## Project context\n- specs/b.md\n- docs/a.md");
  });

  it("is just the heading when nothing is attached", () => {
    expect(serializedContext([])).toBe("## Project context");
  });
});
