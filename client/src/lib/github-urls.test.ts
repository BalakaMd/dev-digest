/**
 * NFR-2 / AC-30: the Onboarding Tour "Open" link is built from the repo identity
 * plus an indexed path — never a model-supplied URL. Path and branch segments
 * must be encoded so a hostile name cannot break out of the blob path.
 */
import { describe, it, expect } from "vitest";
import { githubFileUrl } from "./github-urls";

describe("githubFileUrl", () => {
  it("builds https://github.com/<full_name>/blob/<branch>/<path> and keeps '/' separators", () => {
    expect(githubFileUrl("acme/app", "main", "src/lib/index.ts")).toBe(
      "https://github.com/acme/app/blob/main/src/lib/index.ts",
    );
  });

  it("encodes special characters in each path segment", () => {
    const url = githubFileUrl("acme/app", "main", "docs/my file#1?.md");
    expect(url).toBe("https://github.com/acme/app/blob/main/docs/my%20file%231%3F.md");
    expect(url).not.toContain("#");
    expect(url).not.toContain("?");
  });

  it("encodes a hostile path so it cannot add a query, fragment, or leave the host", () => {
    const url = githubFileUrl("acme/app", "main", "a/../b%2Fc/<script>x</script>");
    expect(url.startsWith("https://github.com/acme/app/blob/main/")).toBe(true);
    expect(url).not.toMatch(/[<>"'\s]/);
    // a literal "%" is escaped, so a pre-encoded "%2F" is not interpreted as "/"
    expect(url).toContain("b%252Fc");
    expect(new URL(url).host).toBe("github.com");
    expect(new URL(url).search).toBe("");
    expect(new URL(url).hash).toBe("");
  });

  it("encodes the branch segments too, keeping '/' in branch names like feature/x", () => {
    expect(githubFileUrl("acme/app", "feature/a b#c", "README.md")).toBe(
      "https://github.com/acme/app/blob/feature/a%20b%23c/README.md",
    );
  });
});
