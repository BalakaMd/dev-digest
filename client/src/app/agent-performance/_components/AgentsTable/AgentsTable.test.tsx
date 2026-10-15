import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentPerformanceRow } from "@devdigest/shared";
import agentPerformance from "../../../../../messages/en/agentPerformance.json";
import { installFetch, apiError } from "../../../../test/context-docs-fixtures";
import { acceptOf, detailOf, idleRowOf, rowOf } from "../../../../test/agent-performance-fixtures";
import type { SortColumn, SortDir } from "../../_model/constants";
import { AgentsTable } from "./AgentsTable";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const APPLIED = { from: "2026-09-14T10:00:00.000Z", to: "2026-10-14T10:00:00.000Z" };

interface Harness {
  rows: AgentPerformanceRow[];
  sort?: SortColumn;
  dir?: SortDir;
  expanded?: string | null;
  onSort?: (c: SortColumn) => void;
}

/** The table is controlled; this wrapper owns the expansion like the page's address does. */
function Controlled({ rows, sort = "accept", dir = "desc", expanded = null, onSort = () => {} }: Harness) {
  const [open, setOpen] = React.useState<string | null>(expanded);
  return (
    <AgentsTable
      rows={rows}
      sort={sort}
      dir={dir}
      onSort={onSort}
      expandedId={open}
      onToggle={(id) => setOpen((cur) => (cur === id ? null : id))}
      repoId="r1"
      applied={APPLIED}
    />
  );
}

function renderTable(props: Harness) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance }}>
        <Controlled {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Agent names in table order. */
const order = () =>
  screen.getAllByRole("button", { name: /^Show details of / }).map((b) => b.getAttribute("aria-label")!.replace("Show details of ", ""));

/** The column header cell that holds a sort button. */
const headerOf = (column: string) => screen.getByRole("button", { name: `Sort by ${column}` }).closest("th")!;

const ROWS = [
  rowOf("a1", "Security Reviewer", { runs: 142, accept: acceptOf(45, 13), avg_cost_usd: 0.04, avg_duration_ms: 6200, cost_per_accepted_usd: 0.09 }),
  rowOf("a2", "Style Reviewer", { runs: 87, accept: acceptOf(3, 2), enabled: false }),
];

describe("AgentsTable — columns and cells (AC-30, AC-32)", () => {
  it("has the nine columns, with the sortable ones as buttons", () => {
    renderTable({ rows: ROWS });
    for (const name of ["Agent", "Failed", "Cost / accepted"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    for (const name of ["Runs", "Avg cost", "Avg dur.", "Accept", "Last run"]) {
      expect(screen.getByRole("button", { name: `Sort by ${name}` })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("columnheader")).toHaveLength(9);
    expect(headerOf("Runs")).toBeInTheDocument();
  });

  it('shows the numbers of a row, "Disabled" next to a disabled agent, and the Accept cell as "78% · 45/58"', () => {
    renderTable({ rows: ROWS });
    const security = screen.getByRole("button", { name: "Show details of Security Reviewer" }).closest("tr")!;
    expect(within(security).getByText("142")).toBeInTheDocument();
    expect(within(security).getByText("$0.04")).toBeInTheDocument();
    expect(within(security).getByText("6.2s")).toBeInTheDocument();
    expect(within(security).getByText("78% · 45/58")).toBeInTheDocument();
    expect(within(security).getByText("$0.09")).toBeInTheDocument();
    expect(within(security).queryByText("Disabled")).not.toBeInTheDocument();

    const style = screen.getByRole("button", { name: "Show details of Style Reviewer" }).closest("tr")!;
    expect(within(style).getByText("Disabled")).toBeInTheDocument();
    expect(within(style).getByText("Low sample")).toBeInTheDocument(); // 5 decisions
  });

  it("describes the Accept column in its header", () => {
    renderTable({ rows: ROWS });
    expect(screen.getByText("Accepted / (accepted + dismissed), local runs only")).toBeInTheDocument();
  });

  it("renders an agent name as text, in full on focus via its title", () => {
    const hostile = '<img src=x onerror="alert(1)"> and a very long name that would be truncated';
    renderTable({ rows: [rowOf("a1", hostile)] });
    const button = screen.getByRole("button", { name: `Show details of ${hostile}` });
    expect(button).toHaveAttribute("title", hostile);
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("AgentsTable — null values and idle agents (AC-31, AC-44)", () => {
  it('shows "—" for every null value, never 0, and Runs 0 / Failed 0 for an agent with no counted run', () => {
    renderTable({ rows: [idleRowOf("a9", "Idle Agent")] });
    const row = screen.getByRole("button", { name: "Show details of Idle Agent" }).closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    // Agent, Runs, Failed, Avg cost, Avg dur., Accept, Cost / accepted, Last run, View
    expect(cells.slice(1).map((c) => c.textContent)).toEqual(["0", "0", "—", "—", "—", "—", "—", "View"]);
  });
});

describe("AgentsTable — sorting (AC-33, AC-34, AC-52, NFR-3)", () => {
  const rows = [
    rowOf("a1", "Bravo", { runs: 5, accept: acceptOf(6, 4) }),
    rowOf("a2", "Alpha", { runs: 9, accept: acceptOf(90, 10) }),
    rowOf("a3", "Charlie", { runs: 0, accept: acceptOf(0, 0), avg_cost_usd: null }),
    rowOf("a4", "Delta", { runs: 7, accept: acceptOf(2, 0) }),
  ];

  it("orders by Accept descending by default: settled rates, then low samples, then no rate", () => {
    renderTable({ rows });
    expect(order()).toEqual(["Alpha", "Bravo", "Delta", "Charlie"]);
    expect(headerOf("Accept")).toHaveAttribute("aria-sort", "descending");
    expect(headerOf("Runs")).toHaveAttribute("aria-sort", "none");
  });

  it("orders by the chosen column and direction, rows without a value last, and exposes the state", () => {
    renderTable({ rows, sort: "avg_cost", dir: "asc" });
    expect(order().at(-1)).toBe("Charlie");
    expect(headerOf("Avg cost")).toHaveAttribute("aria-sort", "ascending");
  });

  it("reports the column when a sort header is activated", () => {
    const onSort = vi.fn();
    renderTable({ rows, onSort });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Runs" }));
    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith("runs");
  });
});

describe("AgentsTable — View (AC-36)", () => {
  it("links each row to its agent's editor page", () => {
    renderTable({ rows: ROWS });
    expect(screen.getByRole("link", { name: "View Security Reviewer" })).toHaveAttribute("href", "/agents/a1");
  });
});

describe("AgentsTable — expanding a row (AC-35, AC-60)", () => {
  it("reads that agent once for the overview's applied range and shows cost by model, findings, runs by source and cost by source", async () => {
    const fx = installFetch({ "GET /agents/a1/performance": detailOf(ROWS[0]!) });
    renderTable({ rows: ROWS });
    const toggle = screen.getByRole("button", { name: "Show details of Security Reviewer" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(fx.requests).toHaveLength(0); // nothing is read until a row is expanded

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const byModel = await screen.findByRole("region", { name: "Cost by model" });
    expect(within(byModel).getByText("gpt-4.1 · $0.50")).toBeInTheDocument();
    expect(within(byModel).getByText("Unknown model · $0.25")).toBeInTheDocument();
    const findings = screen.getByRole("region", { name: "Findings" });
    expect(within(findings).getByText("Accepted: 45")).toBeInTheDocument();
    expect(within(findings).getByText("Dismissed: 13")).toBeInTheDocument();
    expect(within(findings).getByText("Undecided: 7")).toBeInTheDocument();
    const runs = screen.getByRole("region", { name: "Counted runs" });
    expect(within(runs).getByText("Local: 8")).toBeInTheDocument();
    expect(within(runs).getByText("CI: 2")).toBeInTheDocument();
    const bySource = screen.getByRole("region", { name: "Cost by source" });
    expect(within(bySource).getByText("Provider-reported $0.50 (67%)")).toBeInTheDocument();

    expect(fx.requests).toHaveLength(1);
    const [req] = fx.requests;
    expect(req!.method).toBe("GET");
    const q = new URLSearchParams(req!.search);
    expect(Object.fromEntries(q)).toEqual({ repoId: "r1", from: APPLIED.from, to: APPLIED.to });

    fireEvent.click(toggle); // collapse
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Cost by model" })).not.toBeInTheDocument();
  });

  it("shows placeholders and no number while the read is in flight", async () => {
    let release!: (v: unknown) => void;
    installFetch({ "GET /agents/a1/performance": () => new Promise((r) => (release = r)) });
    renderTable({ rows: ROWS, expanded: "a1" });
    const loading = await screen.findByRole("status", { name: "Loading details…" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent("");
    expect(screen.queryByText(/Accepted:/)).not.toBeInTheDocument();
    release(detailOf(ROWS[0]!));
    expect(await screen.findByText("Accepted: 45")).toBeInTheDocument();
  });

  it("shows an error with Retry inside the row only, leaves the other rows alone, and recovers on Retry", async () => {
    let calls = 0;
    installFetch({
      "GET /agents/a1/performance": () => (++calls === 1 ? apiError(500, "boom") : detailOf(ROWS[0]!)),
    });
    renderTable({ rows: ROWS, expanded: "a1" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load the details of this agent.");
    // the rest of the table is untouched
    expect(screen.getByRole("button", { name: "Show details of Style Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Accepted: 45")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(calls).toBe(2));
  });
});

describe("AgentsTable — descriptions on keyboard focus (AC-68, NFR-3)", () => {
  const LONG = "Security and Compliance Reviewer for the Payments Platform (strict mode)";
  const rows = [
    rowOf("a1", LONG, { accept: acceptOf(45, 13) }),
    rowOf("a2", "Style Reviewer", { accept: acceptOf(3, 2) }),
  ];
  const bubbleIn = (el: HTMLElement) => el.closest("tr")!.querySelector("[data-focus-tip]");
  const rowOfAgent = (name: string) => screen.getByRole("button", { name: `Show details of ${name}` }).closest("tr")!;

  it("shows the quality of the accept value when it is focused and hides it on blur and Escape; a low sample has none", () => {
    renderTable({ rows });
    const cell = within(rowOfAgent(LONG)).getByText("78% · 45/58").closest<HTMLElement>('[tabindex="0"]')!;
    expect(bubbleIn(cell)).toBeNull();

    act(() => cell.focus());
    expect(bubbleIn(cell)).toHaveTextContent("High (≥70%)");
    act(() => cell.blur());
    expect(bubbleIn(cell)).toBeNull();
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: "Escape" });
    expect(bubbleIn(cell)).toBeNull();

    const low = rowOfAgent("Style Reviewer");
    expect(within(low).getByText("60% · 3/5")).toBeInTheDocument();
    expect(low.querySelector('[tabindex="0"]')).toBeNull(); // nothing to describe, so no extra tab stop
  });

  it("shows the full agent name when the row's expand button is focused", () => {
    renderTable({ rows });
    const toggle = screen.getByRole("button", { name: `Show details of ${LONG}` });
    expect(bubbleIn(toggle)).toBeNull();
    act(() => toggle.focus());
    expect(bubbleIn(toggle)).toHaveTextContent(LONG);
    act(() => toggle.blur());
    expect(bubbleIn(toggle)).toBeNull();
  });
});
