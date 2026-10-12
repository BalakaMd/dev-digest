import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import common from "../../../../../../messages/en/multiAgentCommon.json";
import tabs from "../../../../../../messages/en/multiAgentTabs.json";
import prReview from "../../../../../../messages/en/prReview.json";
import { finding, XSS } from "@/test/multi-agent-result-fixtures";
import { ResultFindingCard, type ResultFindingCardProps } from "./ResultFindingCard";

afterEach(cleanup);

function renderCard(f: FindingRecord, props: Partial<ResultFindingCardProps> = {}) {
  const onAccept = props.onAccept ?? vi.fn();
  const onDismiss = props.onDismiss ?? vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ multiAgentCommon: common, multiAgentTabs: tabs, prReview }}>
        <ResultFindingCard finding={f} {...props} onAccept={onAccept} onDismiss={onDismiss} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onAccept, onDismiss };
}

const header = (title: string | RegExp) => screen.getByRole("button", { name: title });

describe("ResultFindingCard", () => {
  it("is collapsed by default and shows confidence, rationale and suggested fix once expanded (AC-37, AC-38)", () => {
    renderCard(
      finding("f1", { title: "Unbounded loop", confidence: 0.86, rationale: "The loop never ends.", suggestion: "Add a limit." }),
    );
    expect(header(/Unbounded loop/)).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("src/a.ts:10-12")).toBeInTheDocument();
    expect(screen.getByText("86% confidence")).toBeInTheDocument();
    expect(screen.queryByText("The loop never ends.")).not.toBeInTheDocument();

    fireEvent.click(header(/Unbounded loop/));
    expect(header(/Unbounded loop/)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The loop never ends.")).toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText("Add a limit.")).toBeInTheDocument();
  });

  it("omits the suggested-fix section when the finding has none (AC-38)", () => {
    renderCard(finding("f1"), { defaultExpanded: true });
    expect(screen.queryByText("Suggested fix")).not.toBeInTheDocument();
  });

  it("calls onAccept and onDismiss with the finding id, and disables both while a decision is pending (AC-40)", () => {
    const { onAccept, onDismiss } = renderCard(finding("f7"), { defaultExpanded: true });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith("f7");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("f7");
    cleanup();

    const pending = renderCard(finding("f7"), { defaultExpanded: true, pending: true });
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(pending.onAccept).not.toHaveBeenCalled();
  });

  it("shows a decision state and reflects it as pressed (AC-40)", () => {
    renderCard(finding("f1", { accepted_at: "2026-10-10T10:00:00Z" }), { defaultExpanded: true });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveAttribute("aria-pressed", "false");
  });

  it("enables 'Turn into eval case' only after a decision, with a reason while it is disabled (AC-41)", () => {
    renderCard(finding("f1"), { defaultExpanded: true });
    const undecided = screen.getByRole("button", { name: "Turn into eval case" });
    expect(undecided).toBeDisabled();
    expect(undecided).toHaveAccessibleDescription(/accept or dismiss this finding first/i);
    cleanup();

    renderCard(finding("f1", { dismissed_at: "2026-10-10T10:00:00Z" }), { defaultExpanded: true });
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });

  it("shows 'Learn' disabled with a 'not available yet' description and no 'Reply to author' (AC-43)", () => {
    renderCard(finding("f1"), { defaultExpanded: true });
    const learn = screen.getByRole("button", { name: "Learn" });
    expect(learn).toBeDisabled();
    expect(learn).toHaveAccessibleDescription("not available yet");
    expect(screen.queryByText(/reply to author/i)).not.toBeInTheDocument();
  });

  it("lists the other agents that flagged the same location (AC-57)", () => {
    renderCard(finding("f1"), { alsoFlaggedBy: ["Style", "Unknown agent"] });
    expect(screen.getByText("also flagged by Style, Unknown agent")).toBeInTheDocument();
    cleanup();
    renderCard(finding("f1"), { alsoFlaggedBy: [] });
    expect(screen.queryByText(/also flagged by/)).not.toBeInTheDocument();
  });

  it("renders untrusted title, rationale and suggestion as inert text with no image element (security)", () => {
    renderCard(
      finding("f1", { title: `Title ${XSS}`, rationale: `Why ${XSS}`, suggestion: `Fix ${XSS}`, file: `f${XSS}.ts` }),
      { defaultExpanded: true },
    );
    expect(screen.getByText(`Title ${XSS}`)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("[onerror]")).toBeNull();
  });
});
