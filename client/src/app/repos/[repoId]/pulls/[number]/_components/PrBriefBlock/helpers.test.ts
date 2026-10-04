import { describe, it, expect } from "vitest";
import { briefDiffHref, formatCompactCount, formatCostUsd, isRtl } from "./helpers";

describe("briefDiffHref", () => {
  it("builds the Files-changed deep link with an encoded file and a numeric line", () => {
    expect(briefDiffHref("repo-1", 42, "src/app.ts", 7)).toBe(
      "/repos/repo-1/pulls/42?tab=diff&file=src%2Fapp.ts&line=7",
    );
    expect(briefDiffHref("repo-1", 42, "src/app.ts")).toBe("/repos/repo-1/pulls/42?tab=diff&file=src%2Fapp.ts");
  });

  it("encodes model-supplied path characters so they cannot add query params or break out of the URL", () => {
    const href = briefDiffHref("repo-1", 42, "a&line=1&tab=x#frag?z=%2F ü.ts", 3);
    // Only the builder's own `&` separators survive; the path's are percent-encoded.
    const [, query] = href.split("?");
    expect(href).not.toContain("#");
    expect(query!.split("&")).toHaveLength(3);
    expect(new URLSearchParams(query).get("file")).toBe("a&line=1&tab=x#frag?z=%2F ü.ts");
    expect(new URLSearchParams(query).get("tab")).toBe("diff");
  });
});

describe("isRtl", () => {
  it("is true only for Hebrew", () => {
    expect(isRtl("Hebrew")).toBe(true);
    expect(isRtl("English")).toBe(false);
    expect(isRtl("Ukrainian")).toBe(false);
  });
});

describe("formatCompactCount", () => {
  it("keeps small numbers and abbreviates thousands and millions", () => {
    expect(formatCompactCount(950)).toBe("950");
    expect(formatCompactCount(8200)).toBe("8.2K");
    expect(formatCompactCount(1300)).toBe("1.3K");
    expect(formatCompactCount(1_250_000)).toBe("1.3M");
  });
});

describe("formatCostUsd", () => {
  it("uses three decimals under a dollar, two above, and marks tiny costs", () => {
    expect(formatCostUsd(0.0142)).toBe("$0.014");
    expect(formatCostUsd(2.5)).toBe("$2.50");
    expect(formatCostUsd(0.0001)).toBe("<$0.001");
  });
});
