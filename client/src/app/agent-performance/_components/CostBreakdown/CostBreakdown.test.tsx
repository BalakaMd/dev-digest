import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import agentPerformance from "../../../../../messages/en/agentPerformance.json";
import { overviewOf } from "../../../../test/agent-performance-fixtures";
import { CostBreakdown } from "./CostBreakdown";

afterEach(cleanup);

function renderBreakdown(overview: ReturnType<typeof overviewOf>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance }}>
      <CostBreakdown overview={overview} />
    </NextIntlClientProvider>,
  );
}

/** Legend rows of a panel as [name, amount, percent] text. */
const legendOf = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole("listitem")
    .map((li) => Array.from(li.querySelectorAll("span:not([aria-hidden])")).map((s) => s.textContent));

describe("CostBreakdown — two donuts with text legends (AC-38, NFR-3)", () => {
  it('shows "By agent" and "By model", each legend listing every slice with its amount and whole-percent share', () => {
    renderBreakdown(
      overviewOf({
        totals: { ...overviewOf().totals, total_cost_usd: 8.74 },
        cost_by_agent: [
          { agent_id: "a1", name: "Security Reviewer", cost_usd: 5.68 },
          { agent_id: "a2", name: "Style Reviewer", cost_usd: 3.06 },
        ],
        cost_by_model: [
          { model: "gpt-4.1", cost_usd: 6.1 },
          { model: "gpt-4o", cost_usd: 2.64 },
        ],
      }),
    );
    expect(screen.getByRole("heading", { name: "Cost breakdown" })).toBeInTheDocument();
    expect(legendOf(screen.getByRole("region", { name: "By agent" }))).toEqual([
      ["Security Reviewer", "$5.680", "65%"],
      ["Style Reviewer", "$3.060", "35%"],
    ]);
    expect(legendOf(screen.getByRole("region", { name: "By model" }))).toEqual([
      ["gpt-4.1", "$6.100", "70%"],
      ["gpt-4o", "$2.640", "30%"],
    ]);
  });

  it('names the slices of a deleted agent and of an unknown model "Deleted agent" and "Unknown model"', () => {
    renderBreakdown(
      overviewOf({
        cost_by_agent: [{ agent_id: null, name: null, cost_usd: 1 }],
        cost_by_model: [{ model: null, cost_usd: 1 }],
        totals: { ...overviewOf().totals, total_cost_usd: 1 },
      }),
    );
    expect(within(screen.getByRole("region", { name: "By agent" })).getByText("Deleted agent")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "By model" })).getByText("Unknown model")).toBeInTheDocument();
  });

  it("renders a model name as text, never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    renderBreakdown(overviewOf({ cost_by_model: [{ model: hostile, cost_usd: 8.74 }] }));
    expect(within(screen.getByRole("region", { name: "By model" })).getByText(hostile)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("CostBreakdown — more than 6 slices (AC-51)", () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ agent_id: `a${i}`, name: `Agent ${i}`, cost_usd: 8 - i }));

  it("draws the 6 largest slices plus one Other segment while the legend still lists all 8", () => {
    renderBreakdown(
      overviewOf({ totals: { ...overviewOf().totals, total_cost_usd: 36 }, cost_by_agent: eight, cost_by_model: [] }),
    );
    const panel = screen.getByRole("region", { name: "By agent" });
    expect(legendOf(panel)).toHaveLength(8);
    // recharts draws one sector per donut segment: 6 + "Other"
    expect(panel.querySelectorAll(".recharts-pie-sector")).toHaveLength(7);
  });
});

describe("CostBreakdown — nothing priced (AC-39, Q-3)", () => {
  it('replaces the charts with "No priced runs in this period" when no counted run has a cost', () => {
    renderBreakdown(
      overviewOf({
        totals: { ...overviewOf().totals, runs: 4, not_priced_runs: 4, total_cost_usd: 0 },
        cost_by_agent: [],
        cost_by_model: [],
      }),
    );
    expect(screen.getByText("No priced runs in this period")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "By agent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "By model" })).not.toBeInTheDocument();
  });

  it("still shows the legends, at $0.000 and 0%, when the priced runs were free", () => {
    renderBreakdown(
      overviewOf({
        totals: { ...overviewOf().totals, runs: 2, not_priced_runs: 0, total_cost_usd: 0 },
        cost_by_agent: [{ agent_id: "a1", name: "Free Agent", cost_usd: 0 }],
        cost_by_model: [{ model: "free-model", cost_usd: 0 }],
      }),
    );
    expect(screen.queryByText("No priced runs in this period")).not.toBeInTheDocument();
    expect(legendOf(screen.getByRole("region", { name: "By agent" }))).toEqual([["Free Agent", "$0.000", "0%"]]);
  });
});

describe("CostBreakdown — full legend name on keyboard focus (NFR-3)", () => {
  const LONG = "Security and Compliance Reviewer for the Payments Platform (strict mode)";

  it("makes each legend entry a tab stop that shows the full name while focused", () => {
    renderBreakdown(
      overviewOf({
        totals: { ...overviewOf().totals, total_cost_usd: 8 },
        cost_by_agent: [
          { agent_id: "a1", name: LONG, cost_usd: 5 },
          { agent_id: "a2", name: "Style Reviewer", cost_usd: 3 },
        ],
        cost_by_model: [{ model: "gpt-4.1", cost_usd: 8 }],
      }),
    );
    const entries = within(screen.getByRole("region", { name: "By agent" })).getAllByRole("listitem");
    expect(entries.every((li) => li.getAttribute("tabindex") === "0")).toBe(true);
    const long = entries[0]!;
    expect(long.querySelector("[data-focus-tip]")).toBeNull();

    act(() => long.focus());
    expect(long.querySelector("[data-focus-tip]")).toHaveTextContent(LONG);
    expect(entries[1]!.querySelector("[data-focus-tip]")).toBeNull(); // only the focused entry
    fireEvent.keyDown(long, { key: "Escape" });
    expect(long.querySelector("[data-focus-tip]")).toBeNull();
  });
});
