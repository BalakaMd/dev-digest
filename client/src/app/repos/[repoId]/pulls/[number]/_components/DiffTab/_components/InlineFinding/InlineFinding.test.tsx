import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { InlineFinding } from "./InlineFinding";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A **live** Stripe key is committed in source.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function renderFinding(f: FindingRecord, onAction = vi.fn(), pending = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages }}>
      <InlineFinding finding={f} pending={pending} onAction={onAction} />
    </NextIntlClientProvider>,
  );
}

describe("InlineFinding", () => {
  it("shows the title and the rationale", () => {
    renderFinding(finding());
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    // Markdown renders the rationale; "live" is its own text node (inside <strong>).
    expect(screen.getByText("live")).toBeInTheDocument();
    expect(screen.getByText(/Stripe key is committed in source\./)).toBeInTheDocument();
  });

  (
    [
      ["CRITICAL", "blocker"],
      ["WARNING", "warning"],
      ["SUGGESTION", "suggestion"],
    ] as const
  ).forEach(([severity, word]) => {
    it(`shows the severity word "${word}" for ${severity}`, () => {
      renderFinding(finding({ severity }));
      expect(screen.getByText(word)).toBeInTheDocument();
    });
  });

  it("calls onAction('accept') when Accept is clicked", () => {
    const onAction = vi.fn();
    renderFinding(finding(), onAction);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
  });

  it("calls onAction('dismiss') when Dismiss (labelled Reject) is clicked", () => {
    const onAction = vi.fn();
    renderFinding(finding(), onAction);
    fireEvent.click(screen.getByText("Reject"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it("starts expanded, showing the rationale and actions, and collapses to one line on header click", () => {
    renderFinding(finding());
    expect(screen.getByText(/Stripe key is committed in source\./)).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hardcoded Stripe secret key"));

    expect(screen.queryByText(/Stripe key is committed in source\./)).not.toBeInTheDocument();
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
    // the one-line header (title + severity word) is still there
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("shows the accepted tag and mutes the card when accepted", () => {
    const { container } = renderFinding(finding({ accepted_at: "2026-01-01T00:00:00Z" }));
    expect(screen.getByText("accepted")).toBeInTheDocument();
    const card = container.querySelector("[data-finding-id='f1']") as HTMLElement;
    expect(card.style.opacity).toBe("0.65");
  });

  it("shows the dismissed tag and mutes the card when dismissed", () => {
    const { container } = renderFinding(finding({ dismissed_at: "2026-01-01T00:00:00Z" }));
    expect(screen.getByText("dismissed")).toBeInTheDocument();
    const card = container.querySelector("[data-finding-id='f1']") as HTMLElement;
    expect(card.style.opacity).toBe("0.65");
  });

  it("is not muted (full opacity) when neither accepted nor dismissed", () => {
    const { container } = renderFinding(finding());
    const card = container.querySelector("[data-finding-id='f1']") as HTMLElement;
    expect(card.style.opacity).toBe("1");
  });
});
