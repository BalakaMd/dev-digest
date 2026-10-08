import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCompare, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../messages/en/eval.json";
import common from "../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../lib/toast";
import { apiError, installFetch, type RecordedRequest } from "../../../../test/context-docs-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/eval/a1",
  useSearchParams: () => new URLSearchParams(),
}));
// The app shell is chrome; this test is about the agent view.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AgentEvalView } from "./AgentEvalView";

beforeEach(() => push.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const run = (id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id,
  agent_id: "a1",
  agent_version: 7,
  status: "done",
  error: null,
  started_at: "2026-05-29T09:14:00Z",
  finished_at: "2026-05-29T09:15:00Z",
  cases_total: 20,
  cases_done: 20,
  cases_errored: 0,
  cases_passed: 17,
  recall: 0.82,
  precision: 0.91,
  citation_accuracy: 0.95,
  cost_usd: 0.23,
  duration_ms: 1000,
  ...over,
});

const agent = (id: string, name: string): Agent => ({ id, name, model: "gpt-4.1", provider: "openrouter", enabled: true }) as unknown as Agent;

const CASES = [{ id: "c1" }, { id: "c2" }];

const compareOf = (over: Partial<EvalCompare> = {}): EvalCompare =>
  ({
    older: run("p"),
    newer: run("n"),
    flipped: [{ case_id: "c1", case_name: "stripe-key-leak", expectation_types: ["must_find"], from: "passed", to: "failed" }],
    ...over,
  }) as unknown as EvalCompare;

/** Routes the endpoints the view reads; `runs` answers both run queries (filtered by `days`). */
function setup(runs: EvalSuiteRun[] | ((req: RecordedRequest) => EvalSuiteRun[]), extra: Record<string, unknown> = {}) {
  return installFetch({
    "GET /agents/a1": agent("a1", "Security Reviewer"),
    "GET /agents": [agent("a1", "Security Reviewer"), agent("a2", "Style Mentor")],
    "GET /agents/a1/eval-cases": CASES,
    "GET /agents/a1/eval-runs": (req: RecordedRequest) => (typeof runs === "function" ? runs(req) : runs),
    ...extra,
  } as never);
}

function renderView(props: Partial<React.ComponentProps<typeof AgentEvalView>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <ToastProvider>
          <AgentEvalView agentId="a1" {...props} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const THREE = [
  run("r7", { agent_version: 7, started_at: "2026-05-29T09:14:00Z", recall: 0.82, precision: 0.91 }),
  run("r6", { agent_version: 6, started_at: "2026-05-27T16:40:00Z", recall: 0.78, precision: 0.93, cases_passed: 16, cost_usd: 0.21 }),
  run("r5", { agent_version: 5, started_at: "2026-05-25T11:02:00Z", recall: 0.8, precision: 0.92, cases_passed: 16, cost_usd: null }),
];

describe("AgentEvalView — header and tiles (AC-37, 27, 64)", () => {
  it("shows the agent, metric tiles with signed pp deltas, Run eval and an All agents link", async () => {
    setup(THREE);
    renderView();
    expect(await screen.findByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All agents/ })).toHaveAttribute("href", "/eval");
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();
    expect(screen.getByText("2 eval cases", { exact: false })).toBeInTheDocument();
    const recall = within(await screen.findByTestId("metric-tile-recall"));
    expect(recall.getByText("82%")).toBeInTheDocument();
    expect(recall.getByText("▲ 4 pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-tile-precision")).getByText("▼ 2 pt")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/gold set|traces/i);
  });

  it("shows no delta with a single completed run (EC-19)", async () => {
    setup([THREE[0]!]);
    renderView();
    const recall = within(await screen.findByTestId("metric-tile-recall"));
    expect(recall.getByText("82%")).toBeInTheDocument();
    expect(recall.queryByText(/pt$/)).toBeNull();
    expect(screen.queryByTestId("regression-banner")).toBeNull();
  });
});

describe("AgentEvalView — run history (AC-28, 45, 67, Q-6)", () => {
  it("lists runs newest first with version, metrics, passed/scored, cost and errored count", async () => {
    setup([
      THREE[1]!,
      run("r7", { started_at: "2026-05-29T09:14:00Z", cases_errored: 2, cases_passed: 15, cost_usd: null }),
      THREE[2]!,
    ]);
    renderView();
    const first = within(await screen.findByTestId("history-row-r7"));
    const rows = screen.getAllByTestId(/^history-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["history-row-r7", "history-row-r6", "history-row-r5"]);
    expect(first.getByText("2026-05-29 09:14")).toBeInTheDocument();
    expect(first.getByText("v7")).toBeInTheDocument();
    expect(first.getByText("82%")).toBeInTheDocument();
    expect(first.getByText("15/18")).toBeInTheDocument();
    expect(first.getByText("2 errored")).toBeInTheDocument();
    // A run with no errored case shows 0, not a dash (AC-67).
    expect(within(screen.getByTestId("history-row-r6")).getByText("0 errored")).toBeInTheDocument();
    // Unknown cost renders "—", never $0 (AC-76).
    expect(first.getAllByText("—").length).toBeGreaterThan(0);
    expect(first.queryByText("$0.00")).toBeNull();
    expect(within(screen.getByTestId("history-row-r6")).getByText("$0.21")).toBeInTheDocument();
  });

  it("shows failed and running runs with their status, without a selection checkbox, and keeps them out of the tiles", async () => {
    setup([
      run("live", { status: "running", cases_done: 3, cases_total: 8, started_at: "2026-05-30T10:00:00Z", recall: null, precision: null, citation_accuracy: null, cases_passed: 0 }),
      run("bad", { status: "failed", error: "missing key", started_at: "2026-05-29T10:00:00Z", recall: null, precision: null, citation_accuracy: null }),
      THREE[1]!,
    ]);
    renderView();
    expect(await screen.findByTestId("history-row-live")).toBeInTheDocument();
    expect(within(screen.getByTestId("history-row-live")).getByText("running 3/8")).toBeInTheDocument();
    expect(within(screen.getByTestId("history-row-bad")).getByText("failed: missing key")).toBeInTheDocument();
    expect(within(screen.getByTestId("history-row-live")).queryByRole("checkbox")).toBeNull();
    expect(within(screen.getByTestId("history-row-bad")).queryByRole("checkbox")).toBeNull();
    expect(within(screen.getByTestId("history-row-r6")).getByRole("checkbox")).toBeInTheDocument();
    // tiles come from the only completed run (r6, 78%)
    expect(within(screen.getByTestId("metric-tile-recall")).getByText("78%")).toBeInTheDocument();
  });

  it("shows an empty message when the period has no runs", async () => {
    setup([]);
    renderView();
    expect(await screen.findByText("No runs in this period.")).toBeInTheDocument();
    expect(screen.getByText("No completed runs in this period.")).toBeInTheDocument();
  });
});

describe("AgentEvalView — period filter (AC-55)", () => {
  it("opens on 30 days and sends days=30; 7, 90 and all change the request", async () => {
    const { requests } = setup(THREE);
    renderView();
    const select = await screen.findByRole("combobox", { name: "Period" });
    expect(select).toHaveValue("30");
    await waitFor(() => expect(requests.some((r) => r.search.includes("days=30"))).toBe(true));
    fireEvent.change(select, { target: { value: "7" } });
    await waitFor(() => expect(requests.some((r) => r.search.includes("days=7"))).toBe(true));
    fireEvent.change(select, { target: { value: "90" } });
    await waitFor(() => expect(requests.some((r) => r.search.includes("days=90"))).toBe(true));
    const before = requests.length;
    fireEvent.change(select, { target: { value: "all" } });
    await waitFor(() => expect(requests.length).toBeGreaterThan(before));
    const last = requests.filter((r) => r.path === "/agents/a1/eval-runs" && !r.search.includes("limit")).at(-1)!;
    expect(last.search).not.toContain("days");
  });
});

describe("AgentEvalView — agent switcher (AC-56)", () => {
  it("lists the agents and navigates to the picked agent's view", async () => {
    setup(THREE);
    renderView();
    const sw = await screen.findByRole("combobox", { name: "Agent" });
    await waitFor(() => expect(within(sw).getAllByRole("option")).toHaveLength(2));
    fireEvent.change(sw, { target: { value: "a2" } });
    expect(push).toHaveBeenCalledWith("/eval/a2");
  });
});

describe("AgentEvalView — Compare (AC-30)", () => {
  it("is enabled only with exactly two selected completed runs and hands them over older-first", async () => {
    setup(THREE);
    const onCompare = vi.fn();
    renderView({ onCompare });
    const btn = await screen.findByRole("button", { name: "Compare" });
    expect(btn).toBeDisabled();
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(btn).toBeDisabled();
    fireEvent.click(boxes[2]!);
    expect(btn).toBeEnabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(boxes[1]!);
    expect(btn).toBeDisabled();
    fireEvent.click(boxes[1]!);
    fireEvent.click(btn);
    expect(onCompare).toHaveBeenCalledTimes(1);
    const [older, newer] = onCompare.mock.calls[0] as [EvalSuiteRun, EvalSuiteRun];
    expect([older.id, newer.id]).toEqual(["r5", "r7"]);
  });

  it("gives every checkbox an accessible name", async () => {
    setup(THREE);
    renderView();
    expect(await screen.findByRole("checkbox", { name: "Select run 2026-05-29 09:14" })).toBeInTheDocument();
  });

  it("exposes onOpenRun as a keyboard-reachable button on each run", async () => {
    setup(THREE);
    const onOpenRun = vi.fn();
    renderView({ onOpenRun });
    fireEvent.click(await screen.findByRole("button", { name: "Open run 2026-05-27 16:40" }));
    expect(onOpenRun.mock.calls[0]?.[0].id).toBe("r6");
  });
});

describe("AgentEvalView — Compare modal and run drawer (S15)", () => {
  it("opens the compare modal for the two selected runs and closes it again", async () => {
    setup(THREE, { "GET /eval/compare": compareOf({ recall: { older: 0.8, newer: 0.82, delta_pp: 2 } as never }) });
    renderView();
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[2]!);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Compare runs · v5 → v7")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens a run's case results in a drawer", async () => {
    setup(THREE, { "GET /eval-runs/r6": { run: THREE[1], cases: [] } });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Open run 2026-05-27 16:40" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("This run has no case results.")).toBeInTheDocument();
  });
});

describe("AgentEvalView — regression banner (AC-42, EC-19)", () => {
  it("names each lowered metric with its drop in pp and the cases that went passed → failed", async () => {
    const { requests } = setup(THREE);
    renderView();
    const select = await screen.findByRole("combobox", { name: "Period" });
    expect(select).toHaveValue("30");
    await waitFor(() => expect(requests.some((r) => r.search.includes("days=30"))).toBe(true));
    fireEvent.change(select, { target: { value: "7" } });
    await waitFor(() => expect(requests.some((r) => r.search.includes("days=7"))).toBe(true));
    fireEvent.change(select, { target: { value: "90" } });
    await waitFor(() => expect(requests.some((r) => r.search.includes("days=90"))).toBe(true));
    const before = requests.length;
    fireEvent.change(select, { target: { value: "all" } });
    await waitFor(() => expect(requests.length).toBeGreaterThan(before));
    const last = requests.filter((r) => r.path === "/agents/a1/eval-runs" && !r.search.includes("limit")).at(-1)!;
    expect(last.search).not.toContain("days");
  });
});

describe("AgentEvalView — agent switcher (AC-56)", () => {
  it("lists the agents and navigates to the picked agent's view", async () => {
    setup(THREE);
    renderView();
    const sw = await screen.findByRole("combobox", { name: "Agent" });
    await waitFor(() => expect(within(sw).getAllByRole("option")).toHaveLength(2));
    fireEvent.change(sw, { target: { value: "a2" } });
    expect(push).toHaveBeenCalledWith("/eval/a2");
  });
});

describe("AgentEvalView — Compare (AC-30)", () => {
  it("is enabled only with exactly two selected completed runs and hands them over older-first", async () => {
    setup(THREE);
    const onCompare = vi.fn();
    renderView({ onCompare });
    const btn = await screen.findByRole("button", { name: "Compare" });
    expect(btn).toBeDisabled();
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(btn).toBeDisabled();
    fireEvent.click(boxes[2]!);
    expect(btn).toBeEnabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(boxes[1]!);
    expect(btn).toBeDisabled();
    fireEvent.click(boxes[1]!);
    fireEvent.click(btn);
    expect(onCompare).toHaveBeenCalledTimes(1);
    const [older, newer] = onCompare.mock.calls[0] as [EvalSuiteRun, EvalSuiteRun];
    expect([older.id, newer.id]).toEqual(["r5", "r7"]);
  });

  it("gives every checkbox an accessible name", async () => {
    setup(THREE);
    renderView();
    expect(await screen.findByRole("checkbox", { name: "Select run 2026-05-29 09:14" })).toBeInTheDocument();
  });

  it("exposes onOpenRun as a keyboard-reachable button on each run", async () => {
    setup(THREE);
    const onOpenRun = vi.fn();
    renderView({ onOpenRun });
    fireEvent.click(await screen.findByRole("button", { name: "Open run 2026-05-27 16:40" }));
    expect(onOpenRun.mock.calls[0]?.[0].id).toBe("r6");
  });
});

describe("AgentEvalView — regression banner (AC-42, EC-19)", () => {
  it("names each lowered metric with its drop in pp and the cases that went passed → failed", async () => {
    setup(
      [
        run("n", { agent_version: 7, started_at: "2026-05-29T09:00:00Z", recall: 0.8, precision: 0.89, citation_accuracy: 0.97 }),
        run("p", { agent_version: 6, started_at: "2026-05-27T09:00:00Z", recall: 0.82, precision: 0.91, citation_accuracy: 0.95 }),
      ],
      { "GET /eval/compare": (req: RecordedRequest) => (req.search, compareOf()) },
    );
    const { requests } = setup(
      [
        run("n", { agent_version: 7, started_at: "2026-05-29T09:00:00Z", recall: 0.8, precision: 0.89, citation_accuracy: 0.97 }),
        run("p", { agent_version: 6, started_at: "2026-05-27T09:00:00Z", recall: 0.82, precision: 0.91, citation_accuracy: 0.95 }),
      ],
      { "GET /eval/compare": compareOf() },
    );
    renderView();
    const banner = within(await screen.findByTestId("regression-banner"));
    expect(banner.getByText("Regression on v7")).toBeInTheDocument();
    expect(banner.getByText(/Recall dropped 2 pp/)).toBeInTheDocument();
    expect(banner.getByText(/Precision dropped 2 pp/)).toBeInTheDocument();
    expect(banner.queryByText(/Citation dropped/)).toBeNull();
    expect(await banner.findByText(/Passed → failed: stripe-key-leak/)).toBeInTheDocument();
    const cmp = requests.find((r) => r.path === "/eval/compare")!;
    expect(cmp.search).toContain("a=p");
    expect(cmp.search).toContain("b=n");
  });

  it("raises no banner for a drop below 1 pp or an improvement, and does not call compare", async () => {
    const { count } = setup(
      [run("n", { started_at: "2026-05-29T09:00:00Z", recall: 0.815, precision: 0.95 }), run("p", { started_at: "2026-05-27T09:00:00Z", recall: 0.82, precision: 0.91 })],
      { "GET /eval/compare": compareOf() },
    );
    renderView();
    await screen.findByTestId("metric-tile-recall");
    expect(screen.queryByTestId("regression-banner")).toBeNull();
    expect(count("GET", "/eval/compare")).toBe(0);
  });

  it("ignores failed runs when picking the pair (Q-6)", async () => {
    setup(
      [
        run("bad", { status: "failed", error: "x", started_at: "2026-05-30T09:00:00Z", recall: 0.1, precision: 0.1, citation_accuracy: 0.1 }),
        run("n", { started_at: "2026-05-29T09:00:00Z", recall: 0.85 }),
        run("p", { started_at: "2026-05-27T09:00:00Z", recall: 0.82 }),
      ],
      { "GET /eval/compare": compareOf() },
    );
    renderView();
    await screen.findByTestId("metric-tile-recall");
    expect(screen.queryByTestId("regression-banner")).toBeNull();
  });

  it("renders a hostile case name as text, never as HTML (NFR-3)", async () => {
    const evil = '<img src=x onerror="alert(1)">';
    setup(
      [run("n", { started_at: "2026-05-29T09:00:00Z", recall: 0.7 }), run("p", { started_at: "2026-05-27T09:00:00Z", recall: 0.82 })],
      { "GET /eval/compare": compareOf({ flipped: [{ case_id: "c", case_name: evil, expectation_types: ["must_find"], from: "passed", to: "failed" }] }) },
    );
    renderView();
    const banner = await screen.findByTestId("regression-banner");
    await waitFor(() => expect(banner.textContent).toContain(evil));
    expect(banner.querySelector("img")).toBeNull();
  });
});

describe("AgentEvalView — trend chart (AC-43)", () => {
  it("has a legend for the three series and a chronological text alternative of the values", async () => {
    setup(THREE);
    renderView();
    const list = await screen.findByRole("list", { name: "Metric values per completed run" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Recall", "Precision", "Citation"]);
    const table = within(screen.getByTestId("trend-table"));
    const rows = table.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("rowheader")[0]!.textContent)).toEqual([
      "2026-05-25 11:02 v5",
      "2026-05-27 16:40 v6",
      "2026-05-29 09:14 v7",
    ]);
    expect(within(rows[2]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["82%", "91%", "95%"]);
  });

  it("leaves failed runs out of the trend and shows a missing metric as a dash", async () => {
    setup([
      run("bad", { status: "failed", error: "x", started_at: "2026-05-30T09:00:00Z" }),
      run("ok", { started_at: "2026-05-29T09:00:00Z", precision: null }),
    ]);
    renderView();
    const table = within(await screen.findByTestId("trend-table"));
    const rows = table.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["82%", "—", "95%"]);
  });
});

describe("AgentEvalView — Run eval, progress and announcements (AC-61, 62, NFR-6)", () => {
  it("shows the current progress of a run in progress on open and disables Run eval", async () => {
    setup([run("live", { status: "running", cases_done: 3, cases_total: 8, recall: null, precision: null, citation_accuracy: null, cases_passed: 0 })]);
    renderView();
    await waitFor(() => expect(screen.getByTestId("run-status")).toHaveTextContent("Running 3/8"));
    const btn = screen.getByRole("button", { name: "Run eval" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("A run of this agent is already in progress.");
  });

  it("disables Run eval with a reason when the agent has no eval cases", async () => {
    setup(THREE, { "GET /agents/a1/eval-cases": [] });
    renderView();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Run eval" })).toHaveAccessibleDescription("Add an eval case to run this agent's set."),
    );
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
  });

  it("starts a run on click and announces it", async () => {
    const { count } = setup(THREE, { "POST /agents/a1/eval-runs": { run_id: "new", status: "running" } });
    renderView();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    await waitFor(() => expect(count("POST", "/agents/a1/eval-runs")).toBe(1));
    await waitFor(() => expect(screen.getByTestId("run-status")).toHaveTextContent("Eval run started"));
  });

  it("surfaces the API's error (e.g. a missing key) when the run cannot start", async () => {
    setup(THREE, { "POST /agents/a1/eval-runs": apiError(422, "No API key configured for openrouter") });
    renderView();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No API key configured for openrouter");
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();
  });

  it("announces the outcome when a run in progress finishes", async () => {
    let calls = 0;
    setup(() => {
      calls += 1;
      return calls <= 2
        ? [run("x", { status: "running", cases_done: 1, cases_total: 8, recall: null, precision: null, citation_accuracy: null, cases_passed: 0 })]
        : [run("x", { cases_total: 8, cases_done: 8, cases_passed: 6, cases_errored: 1 })];
    });
    renderView();
    await waitFor(() => expect(screen.getByTestId("run-status")).toHaveTextContent("Running 1/8"));
    await waitFor(() => expect(screen.getByTestId("run-status")).toHaveTextContent("Eval run finished: 6/7 cases passed"), { timeout: 6000 });
  }, 10000);

  it("announces the failure when a run in progress fails", async () => {
    let calls = 0;
    setup(() => {
      calls += 1;
      return calls <= 2
        ? [run("x", { status: "running", cases_done: 1, cases_total: 8, recall: null, precision: null, citation_accuracy: null, cases_passed: 0 })]
        : [run("x", { status: "failed", error: "provider down", recall: null, precision: null, citation_accuracy: null })];
    });
    renderView();
    await waitFor(() => expect(screen.getByTestId("run-status")).toHaveTextContent("Running 1/8"));
    await waitFor(() => expect(screen.getByTestId("run-status")).toHaveTextContent("Eval run failed: provider down"), { timeout: 6000 });
  }, 10000);
});

describe("AgentEvalView — errors", () => {
  it("shows an error state when the agent cannot be loaded", async () => {
    installFetch({ "GET /agents/a1": apiError(404, "Agent not found"), "GET /agents": [], "GET /agents/a1/eval-cases": [], "GET /agents/a1/eval-runs": [] });
    renderView();
    expect(await screen.findByText("Could not load this agent")).toBeInTheDocument();
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
  });

  it("shows an error state when the runs cannot be loaded", async () => {
    setup(() => {
      throw new Error("x");
    });
    renderView();
    expect(await screen.findByText("Could not load eval data")).toBeInTheDocument();
  });
});
