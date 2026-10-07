import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

function renderFocus(items: PrBrief["review_focus"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocus items={items} language="English" repoId="repo-1" number={7} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewFocus", () => {
  it("shows a counted heading and one path:line link per item, in stored order, with the reason", () => {
    renderFocus([
      { file: "src/b.ts", line: 20, reason: "Second by file, first by importance." },
      { file: "src/a.ts", line: 3, reason: "Edge case." },
    ]);
    expect(screen.getByRole("heading", { name: "Review focus — read these first 2" })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["src/b.ts:20", "src/a.ts:3"]);
    expect(links[0]).toHaveAccessibleName("src/b.ts line 20");
    expect(links[0]).toHaveAttribute("href", "/repos/repo-1/pulls/7?tab=diff&file=src%2Fb.ts&line=20");
    expect(screen.getByText("Edge case.")).toBeInTheDocument();
  });

  it("shows the noFocus message and no links for an empty list", () => {
    renderFocus([]);
    expect(screen.getByText(messages.noFocus)).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders the reason as plain text, never markup or a link", () => {
    const { container } = renderFocus([
      { file: "src/a.ts", line: 1, reason: "<b>bold</b> <a href='https://evil.example'>x</a> [y](https://evil.example)" },
    ]);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("a[href^='https://evil.example']")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText(/<b>bold<\/b>/)).toBeInTheDocument();
  });
});
