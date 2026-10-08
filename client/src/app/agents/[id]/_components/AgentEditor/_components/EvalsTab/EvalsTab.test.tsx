import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCaseSummary, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import common from "../../../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { apiError, installFetch } from "../../../../../../../test/context-docs-fixtures";
import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

const kase = (id: string, name: string, over: Partial<EvalCaseSummary> = {}): EvalCaseSummary => ({
  id,
  agent_id: "ag1",
  name,
  expected_output: [{ type: "must_find", file: "src/pay.ts", start_line: 10, end_line: 12 }],
  source_finding_id: null,
  created_at: "2026-10-01T00:00:00Z",
  last_result: null,
  ...over,
});

const run = (id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id,
  agent_id: "ag1",
  agent_version: 1,
  status: "done",
  error: null,
  started_at: "2026-10-01T10:00:00Z",
  finished_at: "2026-10-01T10:01:00Z",
  cases_total: 5,
  cases_done: 5,
  cases_errored: 0,
  cases_passed: 3,
  recall: 0.824,
  precision: 0.9,
  citation_accuracy: null,
  cost_usd: null,
  duration_ms: 1000,
  ...over,
});

function renderTab(props: Partial<React.ComponentProps<typeof EvalsTab>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <ToastProvider>
          <EvalsTab agent={AGENT} {...props} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const CASES = [
  kase("c1", "stripe-key-leak", { last_result: { passed: true, expected_count: 1, returned_count: 1, duration_ms: 1, cost_usd: null, ran_at: "x" } }),
  kase("c2", "missing-retry", {
    expected_output: [{ type: "must_not_flag", file: "a.ts", start_line: 1, end_line: 2 }],
    last_result: { passed: false, expected_count: 1, returned_count: 0, duration_ms: 1, cost_usd: null, ran_at: "x" },
  }),
  kase("c3", "never-ran"),
];

describe("EvalsTab — cases (AC-10, 11, 64, 60)", () => {
  it("lists each case with type, file:start–end and its latest result in text", async () => {
    installFetch({ "GET /agents/ag1/eval-cases": CASES, "GET /agents/ag1/eval-runs": [] });
    renderTab();
    const row1 = within(await screen.findByTestId("case-row-c1"));
    expect(row1.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(row1.getByText("must find")).toBeInTheDocument();
    expect(row1.getByText("src/pay.ts:10–12")).toBeInTheDocument();
    expect(row1.getByText("passed")).toBeInTheDocument();
    const row2 = within(screen.getByTestId("case-row-c2"));
    expect(row2.getByText("must not flag")).toBeInTheDocument();
    expect(row2.getByText("failed")).toBeInTheDocument();
    expect(within(screen.getByTestId("case-row-c3")).getByText("never run")).toBeInTheDocument();
    expect(screen.getByText("3 eval cases")).toBeInTheDocument();
    expect(screen.queryByText(/gold set|traces/i)).not.toBeInTheDocument();
    for (const absent of ["Stats", "CI", "Learn", "Reply to author"]) expect(screen.queryByText(absent)).not.toBeInTheDocument();
  });

  it("shows the empty state and a disabled Run with its reason when there are no cases (AC-11, 17)", async () => {
    installFetch({ "GET /agents/ag1/eval-cases": [], "GET /agents/ag1/eval-runs": [] });
    renderTab();
    const empty = await screen.findByText(/No eval cases yet/);
    expect(empty).toHaveTextContent(/accepted or dismissed findings/);
    expect(empty).toHaveTextContent(/Turn into eval case/);
    expect(empty).toHaveTextContent(/New eval case/);
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    expect(runAll).toBeDisabled();
    expect(runAll).toHaveAccessibleDescription("Add an eval case to run this agent's set.");
    expect(screen.getByText("Add an eval case to run this agent's set.")).toBeVisible();
  });

  it("renders stored text as plain text, never as HTML (NFR-3)", async () => {
    installFetch({
      "GET /agents/ag1/eval-cases": [kase("c9", '<img src=x onerror="alert(1)">')],
      "GET /agents/ag1/eval-runs": [],
    });
    renderTab();
    expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("deletes a case only after confirmation and then no longer lists it (AC-12)", async () => {
    let cases = [...CASES];
    const net = installFetch({
      "GET /agents/ag1/eval-cases": () => cases,
      "GET /agents/ag1/eval-runs": [],
      "DELETE /eval-cases/c3": () => {
        cases = cases.filter((c) => c.id !== "c3");
        return new Response(null, { status: 204 });
      },
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Delete case never-ran" }));
    expect(net.count("DELETE", "/eval-cases/c3")).toBe(0);
    expect(screen.getByText("Delete eval case never-ran?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByTestId("case-row-c3")).not.toBeInTheDocument());
    expect(net.count("DELETE", "/eval-cases/c3")).toBe(1);
  });

  it("runs one case from its row and wires New / Edit to the parent", async () => {
    const onNewCase = vi.fn();
    const onEditCase = vi.fn();
    const net = installFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "GET /agents/ag1/eval-runs": [],
      "POST /eval-cases/c1/run": {},
    });
    renderTab({ onNewCase, onEditCase });
    fireEvent.click(await screen.findByRole("button", { name: "Run case stripe-key-leak" }));
    await waitFor(() => expect(net.count("POST", "/eval-cases/c1/run")).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Edit case missing-retry" }));
    expect(onEditCase).toHaveBeenCalledWith("c2");
    fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
    expect(onNewCase).toHaveBeenCalled();
  });
});

describe("EvalsTab — metrics and runs (AC-27, 29, 58, 61, 62, 63, NFR-5, 6)", () => {
  it("shows the latest completed run's metrics with signed deltas and — for no value", async () => {
    installFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "GET /agents/ag1/eval-runs": [
        run("r2", { started_at: "2026-10-02T10:00:00Z", recall: 0.824, precision: 0.88, cases_errored: 1 }),
        run("r1", { recall: 0.784, precision: 0.9 }),
      ],
    });
    renderTab();
    await screen.findByText("▲ 4 pt");
    const recall = within(screen.getByTestId("metric-tile-recall"));
    expect(recall.getByText("82%")).toBeInTheDocument();
    expect(recall.getByText("▲ 4 pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-tile-precision")).getByText("▼ 2 pt")).toBeInTheDocument();
    const citation = within(screen.getByTestId("metric-tile-citation_accuracy"));
    expect(citation.getByText("—")).toBeInTheDocument();
    expect(citation.queryByText(/%/)).not.toBeInTheDocument();
    const passed = within(screen.getByTestId("metric-tile-passed"));
    expect(passed.getByText("3/4")).toBeInTheDocument();
    expect(passed.getByText("1 case errored")).toBeInTheDocument();
  });

  it("shows no delta with a single completed run (EC-19)", async () => {
    installFetch({ "GET /agents/ag1/eval-cases": CASES, "GET /agents/ag1/eval-runs": [run("r1")] });
    renderTab();
    await within(screen.getByTestId("metric-tile-recall")).findByText("82%");
    const recall = within(screen.getByTestId("metric-tile-recall"));
    expect(recall.queryByText(/pt$/)).not.toBeInTheDocument();
  });

  it("links to the agent's dashboard (AC-58)", async () => {
    installFetch({ "GET /agents/ag1/eval-cases": CASES, "GET /agents/ag1/eval-runs": [] });
    renderTab();
    expect(await screen.findByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/ag1");
  });

  it("shows a run in progress with n/m, disables Run with the reason, ignores it for the tiles (AC-19, 61, 62)", async () => {
    installFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "GET /agents/ag1/eval-runs": [
        run("r2", { status: "running", started_at: "2026-10-02T10:00:00Z", cases_done: 3, cases_total: 8, recall: null, precision: null, finished_at: null }),
        run("r1"),
      ],
    });
    renderTab();
    expect(await screen.findByText("Running 3/8")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Running 3/8")).toBe(true);
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    expect(runAll).toBeDisabled();
    expect(runAll).toHaveAccessibleDescription("A run of this agent is already in progress.");
    expect(within(screen.getByTestId("metric-tile-recall")).getByText("82%")).toBeInTheDocument();
  });

  it("starts a run and surfaces the API's rejection", async () => {
    const net = installFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "GET /agents/ag1/eval-runs": [],
      "POST /agents/ag1/eval-runs": () => apiError(409, "A run is already in progress", undefined, "conflict"),
    });
    renderTab();
    await screen.findByText("3 eval cases");
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await waitFor(() => expect(net.count("POST", "/agents/ag1/eval-runs")).toBe(1));
    expect(await screen.findByText("A run is already in progress")).toBeInTheDocument();
  });

  it("reports a failed newest run by status and keeps tiles on completed runs (Q-6, NFR-6)", async () => {
    installFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "GET /agents/ag1/eval-runs": [
        run("r2", { status: "failed", error: "provider down", started_at: "2026-10-02T10:00:00Z", recall: null }),
        run("r1"),
      ],
    });
    renderTab();
    expect(await screen.findByText("Last run failed: provider down")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-tile-recall")).getByText("82%")).toBeInTheDocument();
  });

  it("announces when a watched run finishes (NFR-6)", async () => {
    let phase: "running" | "done" = "running";
    installFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "GET /agents/ag1/eval-runs": () =>
        phase === "running"
          ? [run("r1", { status: "running", cases_done: 1, finished_at: null, recall: null })]
          : [run("r1")],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
          <ToastProvider>
            <EvalsTab agent={AGENT} />
          </ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Running 1/5")).toBeInTheDocument();
    phase = "done";
    await client.invalidateQueries({ queryKey: ["eval-runs", "ag1"] });
    await waitFor(() => expect(screen.getAllByText("Eval run finished: 3/5 cases passed").length).toBeGreaterThan(0));
  });
});

describe("EvalsTab — case editor (S12)", () => {
  it("opens the case editor for New and for Edit, and closes it on Cancel", async () => {
    const stored = {
      ...kase("c2", "missing-retry"),
      input_diff: "+++ b/a.ts",
      input_meta: { title: "t", body: "b" },
      input_files: ["a.ts"],
    };
    installFetch({ "GET /agents/ag1/eval-cases": CASES, "GET /agents/ag1/eval-runs": [], "GET /eval-cases/c2": stored });
    renderTab();
    await screen.findByTestId("case-row-c2");
    fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Eval case · New eval case");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit case missing-retry" }));
    expect(await screen.findByDisplayValue("missing-retry")).toBeInTheDocument();
  });
});
