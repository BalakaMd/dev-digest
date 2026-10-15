import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import agentPerformance from "../../../../../messages/en/agentPerformance.json";
import { acceptOf, emptyRangeOverviewOf, overviewOf } from "../../../../test/agent-performance-fixtures";
import { SummaryCards, type SummaryCardsProps } from "./SummaryCards";

afterEach(cleanup);

function renderCards(over: Partial<SummaryCardsProps> = {}) {
  const base = overviewOf();
  const onOpenMostActive = vi.fn();
  const props: SummaryCardsProps = {
    totals: base.totals,
    previousPeriod: base.previous_period,
    buckets: base.buckets,
    rangeLabel: "30D",
    onOpenMostActive,
    ...over,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance }}>
      <SummaryCards {...props} />
    </NextIntlClientProvider>,
  );
  return { onOpenMostActive };
}

const card = (name: string | RegExp) => screen.getByRole("region", { name });

describe("Total runs card (AC-26, AC-4 labels)", () => {
  it("shows the run count, the range in its label and a sparkline whose text equivalent lists the buckets", () => {
    renderCards({
      totals: { ...overviewOf().totals, runs: 7 },
      buckets: [
        { start: "2026-10-12T00:00:00Z", runs: 2 },
        { start: "2026-10-13T00:00:00Z", runs: 0 },
        { start: "2026-10-14T00:00:00Z", runs: 5 },
      ],
      rangeLabel: "1D",
    });
    const runs = card("Total runs (1D)");
    expect(within(runs).getByText("7")).toBeInTheDocument();
    expect(within(runs).getByText("Runs per period: 2, 0, 5")).toBeInTheDocument();
  });

  it("names a custom range by its dates", () => {
    renderCards({ rangeLabel: "2026-09-01 – 2026-09-30" });
    expect(card("Total runs (2026-09-01 – 2026-09-30)")).toBeInTheDocument();
    expect(card("Total cost (2026-09-01 – 2026-09-30)")).toBeInTheDocument();
  });
});

describe("Total cost card (AC-27, AC-66, AC-59)", () => {
  it("shows the total, one line per non-zero cost source with its share, the signed difference and the scope note", () => {
    renderCards({
      totals: {
        ...overviewOf().totals,
        total_cost_usd: 10,
        cost_by_source: { provider: 6, estimate: 3, mixed: 0, unknown: 1 },
      },
      previousPeriod: { total_cost_usd: 11.2, has_runs: true },
    });
    const cost = card("Total cost (30D)");
    expect(within(cost).getByText("$10.00")).toBeInTheDocument();
    expect(within(cost).getByText("−$1.20 vs previous period")).toBeInTheDocument();
    expect(within(cost).getByText("Provider-reported $6.00 (60%)")).toBeInTheDocument();
    expect(within(cost).getByText("DevDigest estimate $3.00 (30%)")).toBeInTheDocument();
    expect(within(cost).getByText("Source unknown $1.00 (10%)")).toBeInTheDocument();
    expect(within(cost).queryByText(/^Mixed/)).not.toBeInTheDocument(); // zero amount: no line
    expect(
      within(cost).getByText("Agent review runs only — eval runs and other model calls are not included"),
    ).toBeInTheDocument();
  });

  it("signs an increase with + and says so when the previous period has no counted run", () => {
    renderCards({
      totals: { ...overviewOf().totals, total_cost_usd: 5 },
      previousPeriod: { total_cost_usd: 4.6, has_runs: true },
    });
    expect(screen.getByText("+$0.40 vs previous period")).toBeInTheDocument();
    cleanup();
    renderCards({ previousPeriod: { total_cost_usd: 0, has_runs: false } });
    expect(screen.getByText("No previous data")).toBeInTheDocument();
    expect(screen.queryByText(/vs previous period/)).not.toBeInTheDocument();
  });

  it('shows "K runs not priced" only while some counted run has no cost', () => {
    renderCards({ totals: { ...overviewOf().totals, not_priced_runs: 3 } });
    expect(screen.getByText("3 runs not priced")).toBeInTheDocument();
    cleanup();
    renderCards({ totals: { ...overviewOf().totals, not_priced_runs: 0 } });
    expect(screen.queryByText(/not priced/)).not.toBeInTheDocument();
  });
});

describe("Avg accept rate card (AC-28)", () => {
  it('shows the whole percentage, a ring of the same value, "of N decisions" and "local runs only"', () => {
    renderCards({ totals: { ...overviewOf().totals, accept: acceptOf(61, 39) } });
    const accept = card("Avg accept rate");
    expect(within(accept).getAllByText("61")).toHaveLength(2); // the figure and the ring's centre
    expect(within(accept).getByRole("img", { name: "Accept rate 61%, Medium (50–69%)" })).toBeInTheDocument();
    expect(within(accept).getByText("of 100 decisions")).toBeInTheDocument();
    expect(within(accept).getByText("local runs only")).toBeInTheDocument();
    expect(within(accept).getByText("Medium (50–69%)")).toBeInTheDocument(); // quality as text (AC-68)
    expect(within(accept).queryByText("Low sample")).not.toBeInTheDocument();
  });

  it('labels a rate over fewer than 10 decisions "Low sample"', () => {
    renderCards({ totals: { ...overviewOf().totals, accept: acceptOf(4, 1) } });
    const accept = card("Avg accept rate");
    expect(within(accept).getByText("Low sample")).toBeInTheDocument();
    expect(within(accept).getByText("of 5 decisions")).toBeInTheDocument();
  });

  it('shows "—" and "No decisions yet" instead of the rate and the ring when there are no decisions', () => {
    renderCards({ totals: { ...overviewOf().totals, accept: acceptOf(0, 0) } });
    const accept = card("Avg accept rate");
    expect(within(accept).getByText("—")).toBeInTheDocument();
    expect(within(accept).getByText("No decisions yet")).toBeInTheDocument();
    expect(within(accept).queryByRole("img")).not.toBeInTheDocument();
    expect(within(accept).queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe("Most-active agent card (AC-29, AC-67)", () => {
  it("shows the agent's name, runs and accept rate with its decisions", () => {
    renderCards();
    const button = screen.getByRole("button", { name: "Show Security Reviewer in the table" });
    expect(within(button).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(button).getByText("142 runs")).toBeInTheDocument();
    expect(within(button).getByText("78% · 45/58")).toBeInTheDocument();
  });

  it("opens that agent's row when activated", () => {
    const { onOpenMostActive } = renderCards();
    fireEvent.click(screen.getByRole("button", { name: "Show Security Reviewer in the table" }));
    expect(onOpenMostActive).toHaveBeenCalledTimes(1);
    expect(onOpenMostActive).toHaveBeenCalledWith("a1");
  });

  it('shows "—" and offers nothing to activate while no agent is most active', () => {
    renderCards({ totals: { ...overviewOf().totals, most_active: null } });
    expect(within(card("Most-active agent")).getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an agent name as text, never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    renderCards({
      totals: {
        ...overviewOf().totals,
        most_active: { agent_id: "a1", name: hostile, runs: 3, accept: acceptOf(3, 1) },
      },
    });
    expect(screen.getByRole("button", { name: `Show ${hostile} in the table` })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("Cards of a repository with no counted run (AC-42)", () => {
  it('show 0 runs and "—" for the accept rate and the most-active agent', () => {
    const o = emptyRangeOverviewOf();
    renderCards({ totals: o.totals, previousPeriod: o.previous_period, buckets: o.buckets });
    expect(within(card("Total runs (30D)")).getByText("0")).toBeInTheDocument();
    expect(within(card("Avg accept rate")).getByText("—")).toBeInTheDocument();
    expect(within(card("Most-active agent")).getByText("—")).toBeInTheDocument();
  });
});

describe("Cards — quality description for assistive technology (AC-68)", () => {
  const BANDS = [
    { band: "High", accept: acceptOf(45, 13), text: "High (≥70%)", percent: 78 },
    { band: "Medium", accept: acceptOf(30, 20), text: "Medium (50–69%)", percent: 60 },
    { band: "Low", accept: acceptOf(5, 15), text: "Low (<50%)", percent: 25 },
  ];
  const mostActive = (accept: ReturnType<typeof acceptOf>) => ({
    ...overviewOf().totals,
    most_active: { agent_id: "a1", name: "Security Reviewer", runs: 142, accept },
  });

  it.each(BANDS)(
    "describes the Most-active button with the $band quality while its name stays unchanged",
    ({ accept, text }) => {
      renderCards({ totals: mostActive(accept) });
      const button = screen.getByRole("button", { name: "Show Security Reviewer in the table" });
      expect(button).toHaveAccessibleDescription(text);
      const id = button.getAttribute("aria-describedby")!;
      expect(document.getElementById(id)).toHaveTextContent(text);
      expect(button.contains(document.getElementById(id))).toBe(false); // sr-only span sits outside the button
    },
  );

  it("gives a low-sample Most-active button no description", () => {
    renderCards({ totals: mostActive(acceptOf(3, 1)) });
    const button = screen.getByRole("button", { name: "Show Security Reviewer in the table" });
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it.each(BANDS.filter((b) => b.band !== "Medium"))(
    "puts the $band quality into the Avg accept ring's name",
    ({ accept, text, percent }) => {
      renderCards({ totals: { ...overviewOf().totals, accept } });
      expect(
        within(card("Avg accept rate")).getByRole("img", { name: `Accept rate ${percent}%, ${text}` }),
      ).toBeInTheDocument();
    },
  );

  it("leaves the quality out of the Avg accept ring's name for a low sample", () => {
    renderCards({ totals: { ...overviewOf().totals, accept: acceptOf(4, 1) } });
    expect(within(card("Avg accept rate")).getByRole("img", { name: "Accept rate 80%" })).toBeInTheDocument();
  });
});

describe("Cards — descriptions on keyboard focus (AC-68, NFR-3)", () => {
  const LONG = "Security and Compliance Reviewer for the Payments Platform (strict mode)";
  const bubbleIn = (el: HTMLElement) => el.parentElement!.querySelector("[data-focus-tip]");

  it("shows the full name and the quality of the Most-active agent while its card is focused", () => {
    renderCards({
      totals: {
        ...overviewOf().totals,
        most_active: { agent_id: "a1", name: LONG, runs: 142, accept: acceptOf(45, 13) },
      },
    });
    const button = screen.getByRole("button", { name: `Show ${LONG} in the table` });
    expect(bubbleIn(button)).toBeNull();
    act(() => button.focus());
    expect(bubbleIn(button)).toHaveTextContent(LONG);
    expect(bubbleIn(button)).toHaveTextContent("High (≥70%)");
    act(() => button.blur());
    expect(bubbleIn(button)).toBeNull();
  });

  it("shows only the full name for a most-active agent with a low sample", () => {
    renderCards({
      totals: {
        ...overviewOf().totals,
        most_active: { agent_id: "a1", name: LONG, runs: 3, accept: acceptOf(3, 1) },
      },
    });
    const button = screen.getByRole("button", { name: `Show ${LONG} in the table` });
    act(() => button.focus());
    expect(bubbleIn(button)).toHaveTextContent(LONG);
    expect(bubbleIn(button)).not.toHaveTextContent(/High|Medium|Low \(/);
  });

  it("shows the quality of the Avg accept rate while its value is focused", () => {
    renderCards();
    const value = card("Avg accept rate").querySelector<HTMLElement>('[tabindex="0"]')!;
    expect(value).toHaveTextContent("61%");
    act(() => value.focus());
    expect(value.querySelector("[data-focus-tip]")).toHaveTextContent("Medium (50–69%)");
    act(() => value.blur());
    expect(value.querySelector("[data-focus-tip]")).toBeNull();
  });
});
