import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const RISKS: PrBrief["risks"] = [
  {
    kind: "security",
    title: "Unchecked token",
    explanation: "The token is read without a check.",
    severity: "high",
    file_refs: ["src/auth.ts", "src/a b&c.ts"],
  },
  { kind: "perf", title: "N+1 query", explanation: "Loops over rows.", severity: "low", file_refs: [] },
];

function renderRisks(risks: PrBrief["risks"], language: PrBrief["language"] = "English") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas risks={risks} language={language} repoId="repo-1" number={7} />
    </NextIntlClientProvider>,
  );
}

describe("RiskAreas", () => {
  it("lists rows in stored order with severity text, file links, and an explanation that toggles", () => {
    renderRisks(RISKS);
    const toggles = screen.getAllByRole("button");
    expect(toggles.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Show details: Unchecked token",
      "Show details: N+1 query",
    ]);
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "src/auth.ts" })).toHaveAttribute(
      "href",
      "/repos/repo-1/pulls/7?tab=diff&file=src%2Fauth.ts",
    );

    const first = toggles[0]!;
    expect(first).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(first.getAttribute("aria-controls")!)!;
    expect(panel).toHaveAttribute("hidden");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    expect(panel).toHaveTextContent("The token is read without a check.");
  });

  it("renders model text as plain text and builds links only through the encoded href builder", () => {
    const evil: PrBrief["risks"] = [
      {
        kind: "x",
        title: "<img src=x onerror=alert(1)> **bold**",
        explanation: "<script>window.hacked = 1</script> [click](https://evil.example/x)",
        severity: "medium",
        file_refs: ["a&line=1#x.ts"],
      },
    ];
    const { container } = renderRisks(evil);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)> **bold**")).toBeInTheDocument();
    expect(screen.getByText(/\[click\]\(https:\/\/evil\.example\/x\)/)).toBeInTheDocument();
    // the only anchors are the in-app file links, with the path percent-encoded
    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "/repos/repo-1/pulls/7?tab=diff&file=a%26line%3D1%23x.ts",
    ]);
  });
});
