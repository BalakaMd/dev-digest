/**
 * Model-written markdown is untrusted (AC-14, AC-25, NFR-2): raw HTML must not
 * reach the DOM, links must not become clickable, images must not load.
 * `react-markdown` renders **bold** as its own <strong> node, so bold text is
 * asserted separately from the surrounding prose (client/INSIGHTS.md).
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TourMarkdown } from "./TourMarkdown";

describe("TourMarkdown", () => {
  it("does not render raw HTML or script elements", () => {
    const { container } = render(
      <TourMarkdown language="English">
        {'Before <script>window.hacked = 1</script> <img src="x" onerror="alert(1)"> <b>raw</b> after'}
      </TourMarkdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
  });

  it("renders a markdown link as plain text with no anchor", () => {
    const { container } = render(
      <TourMarkdown language="English">{"See[the docs](https://evil.example/x) for details"}</TourMarkdown>,
    );
    expect(screen.getByText("the docs")).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toContain("evil.example");
  });

  it("renders a markdown image as its alt text, without an <img>", () => {
    const { container } = render(
      <TourMarkdown language="English">{"![architecture sketch](https://evil.example/p.png)"}</TourMarkdown>,
    );
    expect(screen.getByText("architecture sketch")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("evil.example");
  });

  it("still renders ordinary markdown: bold and inline code, asserted separately", () => {
    render(<TourMarkdown language="English">{"The **entry** point is `main.ts` in the repo."}</TourMarkdown>);
    expect(screen.getByText("entry").tagName).toBe("STRONG");
    expect(screen.getByText("main.ts").tagName).toBe("CODE");
    expect(screen.getByText(/point is/)).toBeTruthy();
  });
});
