import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Conflict } from "@devdigest/shared";
import common from "../../../../../messages/en/multiAgentCommon.json";
import disagree from "../../../../../messages/en/multiAgentDisagree.json";
import { conflict, take, XSS } from "@/test/multi-agent-result-fixtures";
import { DisagreeBlock } from "./DisagreeBlock";

afterEach(cleanup);

function renderBlock(conflicts: Conflict[], running?: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentCommon: common, multiAgentDisagree: disagree }}>
      <DisagreeBlock conflicts={conflicts} running={running} />
    </NextIntlClientProvider>,
  );
}

const rows = () => within(screen.getByRole("list", { name: "Finding locations and what each agent said" })).getAllByRole("listitem");
const toggle = () => screen.getByRole("switch", { name: "Show only conflicts" });

describe("DisagreeBlock", () => {
  it("renders one row per conflict, with file:line, the row title and one cell per agent (AC-44)", () => {
    renderBlock([
      conflict("g1", [take("r1"), take("r2")], { file: "src/a.ts", line: 10, title: "Row one" }),
      conflict("g2", [take("r1"), take("r2")], { file: "src/b.ts", line: 3, title: "Row two" }),
    ]);
    expect(screen.getByRole("heading", { name: "Where agents disagree" })).toBeInTheDocument();
    const r = rows();
    expect(r).toHaveLength(2);
    expect(within(r[0]!).getByText("src/a.ts:10")).toBeInTheDocument();
    expect(within(r[0]!).getByText("Row one")).toBeInTheDocument();
    expect(within(r[0]!).getByText("Agent r1")).toBeInTheDocument();
    expect(within(r[0]!).getByText("Agent r2")).toBeInTheDocument();
    expect(within(r[1]!).getByText("src/b.ts:3")).toBeInTheDocument();
  });

  it("shows a flagged cell with severity and title, and '+N more' only when N is at least 1 (AC-45)", () => {
    renderBlock([
      conflict("g1", [
        take("r1", { state: "flagged", severity: "CRITICAL", title: "SQL injection", more_count: 2 }),
        take("r2", { state: "flagged", severity: "WARNING", title: "Weak query", more_count: 0 }),
      ]),
    ]);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Weak query")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.queryByText(/\+0 more/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/more$/)).toHaveLength(1);
  });

  it("shows 'did not flag' with the agent's summary line, and leaves the line out when the summary is empty (AC-45)", () => {
    renderBlock([
      conflict("g1", [
        take("r1", { state: "did_not_flag", agent_summary: "Looked fine overall." }),
        take("r2", { state: "did_not_flag", agent_summary: null }),
        take("r3", { state: "did_not_flag", agent_summary: "   " }),
      ]),
    ]);
    expect(screen.getAllByText("did not flag")).toHaveLength(3);
    expect(screen.getAllByText(/Agent summary:/)).toHaveLength(1);
    expect(screen.getByText("Agent summary: Looked fine overall.")).toBeInTheDocument();
  });

  it("shows running, failed and cancelled cells as a status word (AC-45)", () => {
    renderBlock([
      conflict("g1", [take("r1", { state: "running" }), take("r2", { state: "failed" }), take("r3", { state: "cancelled" })]),
    ]);
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
    expect(screen.queryByText("did not flag")).not.toBeInTheDocument();
  });

  it("falls back to 'Unknown agent' for a cell without an agent name (EC-14)", () => {
    renderBlock([conflict("g1", [take("r1", { agent_name: null })])]);
    expect(screen.getByText("Unknown agent")).toBeInTheDocument();
  });

  it("starts with 'Show only conflicts' off and, once on, hides rows that are not conflicts (AC-46)", () => {
    renderBlock([
      conflict("g1", [take("r1")], { title: "Real conflict", is_conflict: true }),
      conflict("g2", [take("r1")], { title: "Agreement", is_conflict: false }),
    ]);
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(rows()).toHaveLength(2);

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Real conflict")).toBeInTheDocument();
    expect(screen.queryByText("Agreement")).not.toBeInTheDocument();

    fireEvent.click(toggle());
    expect(rows()).toHaveLength(2);
  });

  it("tells apart 'nothing to compare' from 'no conflicts among the findings' (AC-47)", () => {
    renderBlock([]);
    expect(screen.getByText("No findings to compare.")).toBeInTheDocument();
    cleanup();

    renderBlock([conflict("g1", [take("r1")], { is_conflict: false })]);
    fireEvent.click(toggle());
    expect(screen.getByText(/No conflicts: the agents that finished agree/)).toBeInTheDocument();
    expect(screen.queryByText("No findings to compare.")).not.toBeInTheDocument();
  });

  it("shows the 'incomplete' notice while an agent still runs, from a running cell or the running prop, and not otherwise (AC-48)", () => {
    renderBlock([conflict("g1", [take("r1", { state: "running" })])]);
    expect(screen.getByText(/Incomplete: some agents are still running/)).toBeInTheDocument();
    cleanup();

    renderBlock([], true);
    expect(screen.getByText(/Incomplete: some agents are still running/)).toBeInTheDocument();
    cleanup();

    renderBlock([conflict("g1", [take("r1", { state: "flagged", severity: "WARNING", title: "t" })])], false);
    expect(screen.queryByText(/Incomplete:/)).not.toBeInTheDocument();
  });

  it("renders untrusted titles, names and summaries as text, never as markup (security)", () => {
    renderBlock([
      conflict(
        "g1",
        [
          take("r1", { agent_name: `Agent ${XSS}`, state: "flagged", severity: "WARNING", title: `cell ${XSS}` }),
          take("r2", { state: "did_not_flag", agent_summary: `sum ${XSS}` }),
        ],
        { title: `row ${XSS}`, file: `f${XSS}.ts` },
      ),
    ]);
    expect(screen.getByText(`row ${XSS}`)).toBeInTheDocument();
    expect(screen.getByText(`cell ${XSS}`)).toBeInTheDocument();
    expect(screen.getByText(`Agent summary: sum ${XSS}`)).toBeInTheDocument();
    expect(screen.getByText(`Agent ${XSS}`)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
