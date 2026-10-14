import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import common from "../../../../../messages/en/multiAgentCommon.json";
import columnsMessages from "../../../../../messages/en/multiAgentColumns.json";
import { column, finding, group, XSS } from "@/test/multi-agent-result-fixtures";
import { ColumnsView } from "./ColumnsView";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderColumns(
  columns: AgentColumn[],
  opts: { groups?: FindingGroup[]; onViewTrace?: (id: string) => void; onCancel?: (id: string) => void } = {},
) {
  const onViewTrace = opts.onViewTrace ?? vi.fn();
  const onCancel = opts.onCancel ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentCommon: common, multiAgentColumns: columnsMessages }}>
      <ColumnsView columns={columns} groups={opts.groups ?? []} onViewTrace={onViewTrace} onCancel={onCancel} />
    </NextIntlClientProvider>,
  );
  return { onViewTrace, onCancel };
}

const col = (name: string) => screen.getByRole("region", { name: `${name} results` });

describe("ColumnsView", () => {
  it("shows a running column with status word, elapsed time and the latest log line, not the full log (AC-32)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T10:00:05.000Z"));
    renderColumns([column("r1", { agent_name: "Security", status: "running", score: null, duration_ms: null, cost_usd: null, latest_log: "Reading src/a.ts" })]);
    const c = within(col("Security"));
    expect(c.getByText("running")).toBeInTheDocument();
    expect(c.getByText("Elapsed 5.0 s")).toBeInTheDocument();
    expect(c.getByText("Reading src/a.ts")).toBeInTheDocument();
    // Running: no duration/cost meta line yet.
    expect(c.queryByText(/Duration|Cost/)).not.toBeInTheDocument();
  });

  it("shows a done column with duration, cost, score and a finding card with severity, title and file:line (AC-31)", () => {
    renderColumns([
      column("r1", {
        agent_name: "Security",
        score: 77,
        duration_ms: 12_300,
        cost_usd: 0.0123,
        findings: [finding("f1", { title: "SQL injection", severity: "CRITICAL", file: "src/db.ts", start_line: 7 })],
      }),
    ]);
    const c = within(col("Security"));
    expect(c.getByText("done")).toBeInTheDocument();
    expect(c.getByText("Score 77")).toBeInTheDocument();
    expect(c.getByText("12.3 s · $0.0123")).toBeInTheDocument();
    expect(c.getByText("SQL injection")).toBeInTheDocument();
    expect(c.getByText("src/db.ts:7")).toBeInTheDocument();
    expect(c.getByText("Critical")).toBeInTheDocument();
    expect(c.getByText("1 finding")).toBeInTheDocument();
  });

  it("shows an em dash for an unknown cost and 'Unknown agent' for a null agent name (AC-31, EC-14)", () => {
    renderColumns([column("r1", { agent_name: null, cost_usd: null, duration_ms: 1000 })]);
    const c = within(col("Unknown agent"));
    expect(c.getByRole("heading", { name: "Unknown agent" })).toBeInTheDocument();
    expect(c.getByText("1.0 s · —")).toBeInTheDocument();
    expect(c.getByText("No findings")).toBeInTheDocument();
  });

  it.each([
    ["failed", "Provider returned 429"],
    ["cancelled", "Cancelled by user"],
  ] as const)("shows a %s column with its status and the error text instead of findings (AC-34)", (status, error) => {
    renderColumns([
      column("r1", { agent_name: "Broken", status, error, score: null, findings: [finding("f1", { title: "Should not show" })] }),
      column("r2", { agent_name: "Fine", findings: [finding("f2", { title: "Kept result" })] }),
    ]);
    const bad = within(col("Broken"));
    expect(bad.getByText(status)).toBeInTheDocument();
    expect(bad.getByText(error)).toBeInTheDocument();
    expect(bad.queryByText("Should not show")).not.toBeInTheDocument();
    // The other column keeps its result.
    expect(within(col("Fine")).getByText("Kept result")).toBeInTheDocument();
  });

  it("falls back to a fixed message when a failed column has no recorded error (AC-34)", () => {
    renderColumns([column("r1", { agent_name: "Broken", status: "failed", error: null })]);
    expect(within(col("Broken")).getByText("No error text was recorded.")).toBeInTheDocument();
  });

  it("names the other agents that flagged the same location, including an unknown one (AC-31, EC-15)", () => {
    const f1 = finding("f1", { title: "Mine" });
    renderColumns(
      [
        column("r1", { agent_name: "Security", findings: [f1] }),
        column("r2", { agent_name: "Style", findings: [finding("f2")] }),
        column("r3", { agent_name: null, findings: [finding("f3")] }),
      ],
      { groups: [group("g1", [["f1", "r1"], ["f2", "r2"], ["f3", "r3"]])] },
    );
    expect(within(col("Security")).getByText("also flagged by Style, Unknown agent")).toBeInTheDocument();
    // A finding that sits in no group carries no marker.
    cleanup();
    renderColumns([column("r1", { agent_name: "Security", findings: [f1] })]);
    expect(screen.queryByText(/also flagged by/)).not.toBeInTheDocument();
  });

  it("calls onViewTrace with the run id for any status, and offers Cancel only while running (AC-35, AC-54)", () => {
    const { onViewTrace, onCancel } = renderColumns([
      column("run-a", { agent_name: "A", status: "running", latest_log: null }),
      column("run-b", { agent_name: "B", status: "done" }),
      column("run-c", { agent_name: "C", status: "failed", error: "x" }),
      column("run-d", { agent_name: "D", status: "cancelled", error: "y" }),
    ]);
    expect(screen.getAllByRole("button", { name: /^Cancel / })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel A" }));
    expect(onCancel).toHaveBeenCalledWith("run-a");

    for (const [name, id] of [["A", "run-a"], ["B", "run-b"], ["C", "run-c"], ["D", "run-d"]]) {
      fireEvent.click(screen.getByRole("button", { name: `View trace for ${name}` }));
      expect(onViewTrace).toHaveBeenLastCalledWith(id);
    }
    expect(onViewTrace).toHaveBeenCalledTimes(4);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("puts every column in a focusable, named scroll container so it is reachable by keyboard (AC-60)", () => {
    renderColumns([column("r1"), column("r2"), column("r3")]);
    const scroller = screen.getByRole("region", { name: "Agent results, one column per agent" });
    expect(scroller).toHaveAttribute("tabindex", "0");
    scroller.focus();
    expect(scroller).toHaveFocus();
    expect(within(scroller).getAllByRole("region")).toHaveLength(3);
  });

  it('marks a decided finding with plain "Accepted" / "Dismissed" and leaves an undecided one unmarked (AC-40)', () => {
    renderColumns([
      column("r1", {
        agent_name: "Security",
        findings: [
          finding("f1", { title: "Took it", accepted_at: "2026-10-10T11:00:00.000Z" }),
          finding("f2", { title: "Dropped it", dismissed_at: "2026-10-10T11:00:00.000Z" }),
          finding("f3", { title: "Still open" }),
        ],
      }),
    ]);
    const item = (title: string) => screen.getByText(title).closest("li") as HTMLElement;
    const accepted = within(item("Took it"));
    expect(accepted.getByText("Accepted")).toBeInTheDocument();
    expect(accepted.queryByText("Dismissed")).not.toBeInTheDocument();
    const dismissed = within(item("Dropped it"));
    expect(dismissed.getByText("Dismissed")).toBeInTheDocument();
    expect(dismissed.queryByText("Accepted")).not.toBeInTheDocument();
    const open = within(item("Still open"));
    expect(open.queryByText("Accepted")).not.toBeInTheDocument();
    expect(open.queryByText("Dismissed")).not.toBeInTheDocument();
    expect(screen.getAllByText(/^(Accepted|Dismissed)$/)).toHaveLength(2);
  });

  it("makes the latest log line and each finding keyboard-focusable and exposes their full text (NFR-4, EC-15)", () => {
    const longLog = "Reading src/very/long/path/to/some/deeply/nested/module/file.ts and then analysing every call site";
    const longTitle = "A very long finding title that would be truncated on a narrow column";
    renderColumns([
      column("r1", { agent_name: "Runner", status: "running", latest_log: longLog }),
      column("r2", {
        agent_name: "Done",
        findings: [finding("f1", { title: longTitle, file: "src/deep/file.ts", start_line: 42 })],
      }),
    ]);
    const log = within(col("Runner")).getByLabelText(longLog);
    expect(log).toHaveAttribute("tabindex", "0");
    expect(log).toHaveAttribute("title", longLog);
    log.focus();
    expect(log).toHaveFocus();

    const item = within(col("Done")).getByRole("listitem");
    expect(item).toHaveAttribute("tabindex", "0");
    expect(item).toHaveAttribute("title", `${longTitle} — src/deep/file.ts:42`);
    item.focus();
    expect(item).toHaveFocus();
  });

  it("renders untrusted names, titles, errors and log lines as text, never as markup (security)", () => {
    renderColumns([
      column("r1", { agent_name: `Agent ${XSS}`, status: "running", latest_log: `log ${XSS}`, findings: [] }),
      column("r2", { agent_name: "Done", findings: [finding("f1", { title: `title ${XSS}`, file: `f${XSS}.ts` })] }),
      column("r3", { agent_name: "Bad", status: "failed", error: `err ${XSS}` }),
    ]);
    expect(screen.getByText(`log ${XSS}`)).toBeInTheDocument();
    expect(screen.getByText(`title ${XSS}`)).toBeInTheDocument();
    expect(screen.getByText(`err ${XSS}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `Agent ${XSS}` })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("ColumnsView — agent colour (NFR-5)", () => {
  it("marks each column with its agent colour, and the name stays in the heading", () => {
    renderColumns([
      column("r1", { agent_name: "Security" }),
      column("r2", { agent_name: "Performance" }),
    ]);
    const colorOf = (name: string) => col(name).querySelector("[data-agent-color]")?.getAttribute("data-agent-color");
    expect(colorOf("Security")).toBe("#ef4444");
    expect(colorOf("Performance")).toBe("#f59e0b");
    expect(within(col("Security")).getByRole("heading", { name: "Security" })).toBeInTheDocument();
    expect(within(col("Performance")).getByRole("heading", { name: "Performance" })).toBeInTheDocument();
  });
});
