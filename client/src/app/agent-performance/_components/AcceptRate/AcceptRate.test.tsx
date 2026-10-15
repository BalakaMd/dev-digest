import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import agentPerformance from "../../../../../messages/en/agentPerformance.json";
import { acceptOf } from "../../../../test/agent-performance-fixtures";
import { AcceptRate } from "./AcceptRate";

afterEach(cleanup);

function renderRate(accept: Parameters<typeof AcceptRate>[0]["accept"], focusable = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance }}>
      <AcceptRate accept={accept} focusable={focusable} />
    </NextIntlClientProvider>,
  );
}

describe("AcceptRate — percentage with decisions (AC-32)", () => {
  it('shows "78% · 45/58" and no Low sample label for a settled rate', () => {
    renderRate(acceptOf(45, 13));
    expect(screen.getByText("78% · 45/58")).toBeInTheDocument();
    expect(screen.queryByText("Low sample")).not.toBeInTheDocument();
  });

  it('adds the text label "Low sample" when there are fewer than 10 decisions', () => {
    renderRate(acceptOf(3, 2));
    expect(screen.getByText("60% · 3/5")).toBeInTheDocument();
    expect(screen.getByText("Low sample")).toBeInTheDocument();
  });
});

describe("AcceptRate — quality by text, not by colour alone (AC-68, NFR-3)", () => {
  it.each([
    [acceptOf(7, 3), "High (≥70%)", "var(--ok)"],
    [acceptOf(699, 301), "Medium (50–69%)", "var(--warn)"], // 69.9 %: shown as 70% but still amber
    [acceptOf(499, 501), "Low (<50%)", "var(--crit)"],
  ])("describes %o as %s on hover and to assistive technology, and colours it", (accept, description, colour) => {
    const { container } = renderRate(accept);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("title", description); // hover
    expect(screen.getByText(description)).toBeInTheDocument(); // visually hidden text for assistive technology
    expect(root.style.color).toBe(colour);
  });

  it("uses a neutral colour and no quality description for a low sample", () => {
    const { container } = renderRate(acceptOf(5, 0));
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute("title");
    expect(screen.queryByText(/High|Medium|Low \(/)).not.toBeInTheDocument();
    expect(root.style.color).toBe("var(--text-muted)");
  });
});

describe("AcceptRate — no rate (AC-31)", () => {
  it('shows "—", never 0%', () => {
    const { container } = renderRate(acceptOf(0, 0));
    expect(container).toHaveTextContent("—");
    expect(container).not.toHaveTextContent("0%");
  });
});

describe("AcceptRate — quality description on keyboard focus (AC-68, NFR-3)", () => {
  /** The visible bubble; the sr-only text (always present) is a different node. */
  const bubble = (container: HTMLElement) => container.querySelector("[data-focus-tip]");
  const stop = (container: HTMLElement) => container.querySelector<HTMLElement>('[tabindex="0"]')!;

  it.each([
    [acceptOf(7, 3), "High (≥70%)"],
    [acceptOf(699, 301), "Medium (50–69%)"],
    [acceptOf(499, 501), "Low (<50%)"],
  ])("is a tab stop that shows %o as %s while focused, and hides it on blur and on Escape", (accept, description) => {
    const { container } = renderRate(accept, true);
    expect(bubble(container)).toBeNull();

    act(() => stop(container).focus());
    expect(bubble(container)).toHaveTextContent(description);
    expect(bubble(container)).toHaveAttribute("aria-hidden", "true"); // assistive technology keeps the sr-only text
    expect(screen.getByText(description, { selector: ':not([data-focus-tip] *)' })).toBeInTheDocument();

    act(() => stop(container).blur());
    expect(bubble(container)).toBeNull();

    act(() => stop(container).focus());
    expect(bubble(container)).not.toBeNull();
    fireEvent.keyDown(stop(container), { key: "Escape" });
    expect(bubble(container)).toBeNull();
  });

  it("offers no tab stop and no description for a low sample", () => {
    const { container } = renderRate(acceptOf(5, 0), true);
    expect(container.querySelector('[tabindex="0"]')).toBeNull();
    expect(bubble(container)).toBeNull();
  });

  it("is not a tab stop unless asked to (it may sit inside another interactive element)", () => {
    const { container } = renderRate(acceptOf(7, 3));
    expect(container.querySelector('[tabindex="0"]')).toBeNull();
  });
});
