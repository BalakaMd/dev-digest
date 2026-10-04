import { describe, it, expect } from "vitest";
import { entry } from "../../../../../../test/context-docs-fixtures";
import { resolveSelection } from "./doc-groups";

/** An overridden path is listed twice: the repository document and the local copy. */
const REPO = entry("docs/a.md", { overridden: true });
const COPY = entry("docs/a.md", { source: "local", overrides_repo: true });
const OTHER = entry("docs/b.md");

describe("resolveSelection — an overridden path (AC-13)", () => {
  const docs = [REPO, COPY, OTHER];

  it("selects the local copy when the URL carries no source, whatever the list order", () => {
    expect(resolveSelection(docs, "docs/a.md", null)).toBe(COPY);
    expect(resolveSelection([COPY, REPO, OTHER], "docs/a.md", null)).toBe(COPY);
  });

  it("selects the overridden repository row for an explicit source=repo", () => {
    expect(resolveSelection(docs, "docs/a.md", "repo")).toBe(REPO);
  });

  it("selects the copy for an explicit source=local", () => {
    expect(resolveSelection(docs, "docs/a.md", "local")).toBe(COPY);
  });
});
