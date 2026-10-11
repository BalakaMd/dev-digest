import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalDashboardAgent, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../messages/en/eval.json";
import common from "../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../lib/toast";
import { apiError, installFetch } from "../../../../test/context-docs-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/eval",
  useSearchParams: () => new URLSearchParams(),
}));
// The app shell is chrome; this test is about the dashboard.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const run = (id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id,
  agent_id: "a1",
  agent_name: "Security Reviewer",
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
  cost_usd: null,
  duration_ms: 1000,
  ...over,
});

const agent = (id: string, name: string, over: Partial<EvalDashboardAgent> = {}): EvalDashboardAgent => ({
  agent_id: id,
  name,
  provider: "openrouter",
  model: "gpt-4.1",
  enabled: true,
  cases_total: 20,
  latest: run(`r-${id}`, { agent_id: id, agent_name: name }),
  running: null,
  recall_spark: [0.7, null, 0.82],
  ...over,
});

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <ToastProvider>
          <EvalDashboardView />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalDashboardView — agents list (AC-35, 64)", () => {
  it("lists every agent incl. disabled and never-run, with metrics, version and case count", async () => {
    installFetch({
      "GET /eval/dashboard": {
        agents: [
          agent("a1", "Security Reviewer"),
          agent("a2", "Old Mentor", { enabled: false, latest: null, recall_spark: [], cases_total: 1 }),
          agent("a3", "Empty Agent", { latest: null, recall_spark: [], cases_total: 0 }),
        ],
        recent_runs: [],
      },
    });
    renderView();
    const row1 = within(await screen.findByTestId("agent-row-a1"));
    expect(row1.getByText("gpt-4.1")).toBeInTheDocument();
    expect(row1.getByText("82%")).toBeInTheDocument();
    expect(row1.getByText("91%")).toBeInTheDocument();
    expect(row1.getByText("95%")).toBeInTheDocument();
    expect(row1.getByText(/v7 · 2026-05-29 09:14 · 17\/20 cases passed/)).toBeInTheDocument();
    expect(row1.getByText(/20 eval cases/)).toBeInTheDocument();
    expect(row1.getByRole("img", { name: "Recall of the last runs" })).toBeInTheDocument();

    const row2 = within(screen.getByTestId("agent-row-a2"));
    expect(row2.getByText("disabled")).toBeInTheDocument();
    expect(row2.getByText(/never run/)).toBeInTheDocument();
    expect(row2.getByText(/1 eval case$/)).toBeInTheDocument();
    expect(row2.queryByRole("img")).toBeNull();

    expect(within(screen.getByTestId("agent-row-a3")).getByText(/No eval cases yet/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/gold set|traces/i);
  });

  it("links each row to the agent's dashboard with an accessible name", async () => {
    installFetch({ "GET /eval/dashboard": { agents: [agent("a1", "Security Reviewer")], recent_runs: [] } });
    renderView();
    const link = await screen.findByRole("link", { name: "Open dashboard for Security Reviewer" });
    expect(link).toHaveAttribute("href", "/eval/a1");
  });

  it("shows a progress marker on an agent with a run in progress", async () => {
    installFetch({
      "GET /eval/dashboard": {
        agents: [agent("a1", "Security Reviewer", { running: run("rr", { status: "running", cases_done: 3, cases_total: 8 }) })],
        recent_runs: [],
      },
    });
    renderView();
    expect(await screen.findByText("Running 3/8")).toBeInTheDocument();
  });

  it("shows an error state with retry when the dashboard fails to load", async () => {
    installFetch({ "GET /eval/dashboard": apiError(500, "boom") });
    renderView();
    expect(await screen.findByText("Could not load eval data")).toBeInTheDocument();
  });
});

describe("EvalDashboardView — recent runs (AC-36, Q-6)", () => {
  it("lists runs as given (newest first) with metrics, passed/total and status markers", async () => {
    installFetch({
      "GET /eval/dashboard": {
        agents: [agent("a1", "Security Reviewer")],
        recent_runs: [
          run("n1", { status: "running", cases_done: 2, cases_total: 20, recall: null, precision: null, citation_accuracy: null, cases_passed: 0 }),
          run("n2", { status: "failed", error: "missing key", started_at: "2026-05-28T13:20:00Z", agent_version: 6, recall: null }),
          run("n3", { started_at: "2026-05-27T16:40:00Z", agent_version: 5, cases_errored: 2, cases_passed: 15 }),
        ],
      },
    });
    renderView();
    const table = await screen.findByRole("table", { name: /10 most recent/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("running 2/20")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("failed: missing key")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("v6")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("done")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("15/18")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("82%")).toBeInTheDocument();
  });
});

describe("EvalDashboardView — Run all agents (AC-44)", () => {
  it("posts /eval/run-all and announces how many runs started", async () => {
    const { count } = installFetch({
      "GET /eval/dashboard": { agents: [agent("a1", "Security Reviewer")], recent_runs: [] },
      "POST /eval/run-all": { started: [{ agent_id: "a1", run_id: "r9" }, { agent_id: "a2", run_id: "r10" }] },
    });
    renderView();
    await screen.findByTestId("agent-row-a1");
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    await waitFor(() => expect(screen.getByTestId("dashboard-status")).toHaveTextContent("Started 2 runs"));
    expect(count("POST", "/eval/run-all")).toBe(1);
  });

  it("says so when no agent had cases to run", async () => {
    installFetch({
      "GET /eval/dashboard": { agents: [agent("a1", "Security Reviewer")], recent_runs: [] },
      "POST /eval/run-all": { started: [] },
    });
    renderView();
    await screen.findByTestId("agent-row-a1");
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    await waitFor(() => expect(screen.getByTestId("dashboard-status")).toHaveTextContent("No agent has eval cases to run"));
  });
});
