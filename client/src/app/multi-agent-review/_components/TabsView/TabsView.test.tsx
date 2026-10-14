import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import common from "../../../../../messages/en/multiAgentCommon.json";
import tabs from "../../../../../messages/en/multiAgentTabs.json";
import prReview from "../../../../../messages/en/prReview.json";
import { column, finding, group, XSS } from "@/test/multi-agent-result-fixtures";
import { TabsView, type TabsViewProps } from "./TabsView";

afterEach(cleanup);

function renderTabs(columns: AgentColumn[], props: Partial<TabsViewProps> & { groups?: FindingGroup[] } = {}) {
  const onAccept = props.onAccept ?? vi.fn();
  const onDismiss = props.onDismiss ?? vi.fn();
  const onViewTrace = props.onViewTrace ?? vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ multiAgentCommon: common, multiAgentTabs: tabs, prReview }}>
        <TabsView groups={[]} {...props} columns={columns} onAccept={onAccept} onDismiss={onDismiss} onViewTrace={onViewTrace} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onAccept, onDismiss, onViewTrace };
}

describe("TabsView", () => {
  it("labels each tab with the agent name and its score, or its status while it has no score (AC-37)", () => {
    renderTabs([
      column("r1", { agent_name: "Security", score: 91 }),
      column("r2", { agent_name: "Style", score: null, status: "running" }),
      column("r3", { agent_name: "Perf", score: null, status: "failed", error: "boom" }),
      column("r4", { agent_name: null, score: null, status: "cancelled" }),
    ]);
    const list = screen.getByRole("tablist", { name: "Agents" });
    const names = within(list).getAllByRole("tab").map((t) => t.textContent);
    expect(names).toEqual(["Security91", "Stylerunning", "Perffailed", "Unknown agentcancelled"]);
  });

  it("selects the first tab, and switching shows that agent's summary and findings (AC-37, AC-38)", () => {
    renderTabs([
      column("r1", { agent_name: "Security", summary: "Security summary", findings: [finding("f1", { title: "Leaked key" })] }),
      column("r2", { agent_name: "Style", summary: "Style summary", findings: [finding("f2", { title: "Naming nit" })] }),
    ]);
    expect(screen.getByRole("tab", { name: /Security/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Security summary")).toBeInTheDocument();
    expect(screen.getByText("Leaked key")).toBeInTheDocument();
    expect(screen.queryByText("Naming nit")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Style/ }));
    expect(screen.getByRole("tab", { name: /Style/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(/Style/);
    expect(screen.getByText("Style summary")).toBeInTheDocument();
    expect(screen.getByText("Naming nit")).toBeInTheDocument();
    expect(screen.queryByText("Leaked key")).not.toBeInTheDocument();
  });

  it("shows the error text of a failed agent and an empty-findings message (AC-34, AC-37)", () => {
    renderTabs([
      column("r1", { agent_name: "Broken", status: "failed", error: "Provider returned 429", score: null }),
    ]);
    expect(screen.getByText("This agent run failed: Provider returned 429")).toBeInTheDocument();
    expect(screen.getByText("No findings from this agent.")).toBeInTheDocument();
  });

  it("opens the trace of the selected agent run (AC-35)", () => {
    const { onViewTrace } = renderTabs([column("r1", { agent_name: "A" }), column("r2", { agent_name: "B" })]);
    fireEvent.click(screen.getByRole("tab", { name: /B/ }));
    fireEvent.click(screen.getByRole("button", { name: "View trace of B" }));
    expect(onViewTrace).toHaveBeenCalledWith("r2");
  });

  it("expands a finding and sends Accept / Dismiss with its id through the callbacks (AC-38, AC-40)", () => {
    const { onAccept, onDismiss } = renderTabs([
      column("r1", { findings: [finding("f1", { title: "Leaked key", confidence: 0.5, rationale: "Because." })] }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Leaked key/ }));
    expect(screen.getByText("50% confidence")).toBeInTheDocument();
    expect(screen.getByText("Because.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith("f1");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("f1");
  });

  it("disables the actions of a finding whose decision is in flight (AC-40)", () => {
    renderTabs([column("r1", { findings: [finding("f1", { title: "Leaked key" })] })], {
      pendingFindingIds: new Set(["f1"]),
    });
    fireEvent.click(screen.getByRole("button", { name: /Leaked key/ }));
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("marks findings that other agents flagged at the same location (AC-57)", () => {
    renderTabs(
      [
        column("r1", { agent_name: "Security", findings: [finding("f1")] }),
        column("r2", { agent_name: null, findings: [finding("f2")] }),
      ],
      { groups: [group("g1", [["f1", "r1"], ["f2", "r2"]])] },
    );
    expect(screen.getByText("also flagged by Unknown agent")).toBeInTheDocument();
  });

  it("renders an untrusted summary, error, title and agent name as text with no image element (security)", () => {
    renderTabs([
      column("r1", { agent_name: `Agent ${XSS}`, summary: `sum ${XSS}`, findings: [finding("f1", { title: `title ${XSS}` })] }),
      column("r2", { agent_name: "Broken", status: "failed", error: `err ${XSS}`, score: null }),
    ]);
    expect(screen.getByText(`sum ${XSS}`)).toBeInTheDocument();
    expect(screen.getByText(`title ${XSS}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Broken/ }));
    expect(screen.getByText(`This agent run failed: err ${XSS}`)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("TabsView — agent colour (NFR-5)", () => {
  it("puts an agent mark in each tab, and in the summary of the selected one, with the name still as text", () => {
    renderTabs([
      column("r1", { agent_name: "Security", score: 91 }),
      column("r2", { agent_name: "Performance", score: 70 }),
    ]);
    const colorIn = (el: HTMLElement) => el.querySelector("[data-agent-color]")?.getAttribute("data-agent-color");
    expect(colorIn(screen.getByRole("tab", { name: /Security/ }))).toBe("#ef4444");
    expect(colorIn(screen.getByRole("tab", { name: /Performance/ }))).toBe("#f59e0b");
    // Summary of the selected agent (Security) carries the same colour; its name is text.
    expect(colorIn(screen.getByRole("region", { name: "Security" }))).toBe("#ef4444");
    fireEvent.click(screen.getByRole("tab", { name: /Performance/ }));
    expect(colorIn(screen.getByRole("region", { name: "Performance" }))).toBe("#f59e0b");
    expect(screen.getByRole("tab", { name: /Performance/ })).toHaveTextContent("Performance70");
  });
});
