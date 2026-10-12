import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MultiAgentRun } from "@devdigest/shared";
import common from "../../../../../../messages/en/multiAgentCommon.json";
import columnsMessages from "../../../../../../messages/en/multiAgentColumns.json";
import tabsMessages from "../../../../../../messages/en/multiAgentTabs.json";
import disagreeMessages from "../../../../../../messages/en/multiAgentDisagree.json";
import results from "../../../../../../messages/en/multiAgentResults.json";
import prReview from "../../../../../../messages/en/prReview.json";
import { installFetch, apiError } from "@/test/context-docs-fixtures";
import { column, finding, multiRun, XSS } from "@/test/multi-agent-result-fixtures";

const push = vi.fn();
const replace = vi.fn();
const setRepoId = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/multi-agent-review/mar-1",
  useSearchParams: () => searchParams,
}));
// The shell is chrome; this test is about the page.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ setRepoId }),
}));
// The shared drawer has its own tests; here only that it is opened for the right run.
vi.mock("@/components/run-trace-drawer", () => ({
  RunTraceDrawer: (p: { runId: string; running?: boolean; agentName?: string | null; onClose: () => void }) => (
    <div role="dialog" aria-label="Run trace" data-run-id={p.runId} data-running={String(!!p.running)}>
      {p.agentName}
      <button onClick={p.onClose}>close drawer</button>
    </div>
  ),
}));

import { ResultsView } from "./ResultsView";

const RUN_PATH = "GET /multi-agent-runs/mar-1";

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  setRepoId.mockReset();
  searchParams = new URLSearchParams();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderResults() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale="en"
        messages={{
          multiAgentCommon: common,
          multiAgentColumns: columnsMessages,
          multiAgentTabs: tabsMessages,
          multiAgentDisagree: disagreeMessages,
          multiAgentResults: results,
          prReview,
        }}
      >
        <ResultsView id="mar-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function loaded(run: MultiAgentRun, extra: Record<string, unknown> = {}) {
  const net = installFetch({ [RUN_PATH]: run, ...extra });
  renderResults();
  await screen.findByRole("heading", { level: 1 });
  return net;
}

describe("ResultsView", () => {
  it("shows the PR number and title, the agent count and, once every agent ended, actual totals next to the estimate (AC-27, AC-28, AC-56)", async () => {
    await loaded(
      multiRun({
        agent_count: 2,
        total_duration_ms: 20_000,
        total_cost_usd: 0.05,
        estimate: { time_ms: 18_000, cost_usd: 0.04, agents_without_time: 0, agents_without_cost: 0 },
      }),
    );
    expect(screen.getByRole("heading", { level: 1, name: "#42 Add rate limiting" })).toBeInTheDocument();
    expect(screen.getByText("2 agents · parallel")).toBeInTheDocument();
    expect(screen.getByText(/Total time/).parentElement).toHaveTextContent("20.0 s");
    expect(screen.getByText(/Total cost/).parentElement).toHaveTextContent("$0.05");
    expect(screen.getByText("estimate 18.0 s")).toBeInTheDocument();
    expect(screen.getByText("estimate $0.04")).toBeInTheDocument();
    expect(screen.queryByText("excludes unpriced agents")).not.toBeInTheDocument();
  });

  it("marks a total cost that excludes unpriced agents, and shows an em dash for an unknown total (AC-28)", async () => {
    await loaded(multiRun({ cost_incomplete: true, total_cost_usd: null, total_duration_ms: null }));
    expect(screen.getByText("excludes unpriced agents")).toBeInTheDocument();
    expect(screen.getByText(/Total time/).parentElement).toHaveTextContent("Total time—");
    expect(screen.getByText(/Total cost/).parentElement).toHaveTextContent("Total cost—");
  });

  it("shows em-dash totals and no estimate while a column still runs, and offers 'Cancel remaining' only then (AC-28, AC-55)", async () => {
    await loaded(
      multiRun({
        total_duration_ms: null,
        total_cost_usd: null,
        estimate: { time_ms: 18_000, cost_usd: 0.04, agents_without_time: 0, agents_without_cost: 0 },
        columns: [column("r1", { status: "running", score: null }), column("r2", { status: "done" })],
      }),
    );
    expect(screen.getByText(/Total time/).parentElement).toHaveTextContent("Total time—");
    expect(screen.getByText(/Total cost/).parentElement).toHaveTextContent("Total cost—");
    expect(screen.queryByText(/^estimate /)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel remaining" })).toBeInTheDocument();
    cleanup();

    await loaded(multiRun());
    expect(screen.queryByRole("button", { name: "Cancel remaining" })).not.toBeInTheDocument();
  });

  it("'Cancel remaining' cancels only the running runs and then refetches the run (AC-55)", async () => {
    const net = await loaded(
      multiRun({
        columns: [
          column("r1", { agent_name: "A", status: "running", score: null }),
          column("r2", { agent_name: "B", status: "done" }),
          column("r3", { agent_name: "C", status: "running", score: null }),
        ],
      }),
      { "POST /runs/r1/cancel": { ok: true }, "POST /runs/r3/cancel": { ok: true } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel remaining" }));
    await waitFor(() => expect(net.count("GET", "/multi-agent-runs/mar-1")).toBe(2));
    expect(net.count("POST", "/runs/r1/cancel")).toBe(1);
    expect(net.count("POST", "/runs/r3/cancel")).toBe(1);
    expect(net.requests.some((r) => r.path === "/runs/r2/cancel")).toBe(false);
  });

  it("shows Columns by default and switches to Tabs through the toggle by writing ?view= to the URL (AC-29)", async () => {
    await loaded(multiRun());
    expect(screen.getByRole("region", { name: "Agent results, one column per agent" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Columns" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    expect(replace).toHaveBeenCalledWith("/multi-agent-review/mar-1?view=tabs", { scroll: false });
    cleanup();

    searchParams = new URLSearchParams("view=tabs");
    await loaded(multiRun());
    expect(screen.getByRole("tablist", { name: "Agents" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Agent results, one column per agent" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tabs" })).toHaveAttribute("aria-pressed", "true");
    // The disagreement block stays in both modes.
    expect(screen.getByRole("heading", { name: "Where agents disagree" })).toBeInTheDocument();
  });

  it("shows a loading skeleton while the run loads (AC-27)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    renderResults();
    expect(screen.getByRole("status", { name: "Loading the multi-agent run" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("shows a not-found state with a link to configure a new run when the run does not exist (EC-21)", async () => {
    installFetch({ [RUN_PATH]: apiError(404, "not found") });
    renderResults();
    expect(await screen.findByText(/This multi-agent run was not found\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configure a new run" }));
    expect(push).toHaveBeenCalledWith("/multi-agent-review");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("opens the shared run trace drawer for the chosen column, on its running state (AC-35)", async () => {
    await loaded(
      multiRun({
        columns: [
          column("r1", { agent_name: "Alpha", status: "running", score: null }),
          column("r2", { agent_name: "Beta", status: "done" }),
        ],
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Run trace" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View trace for Alpha" }));
    const drawer = screen.getByRole("dialog", { name: "Run trace" });
    expect(drawer).toHaveAttribute("data-run-id", "r1");
    expect(drawer).toHaveAttribute("data-running", "true");
    expect(within(drawer).getByText("Alpha")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "close drawer" }));
    expect(screen.queryByRole("dialog", { name: "Run trace" })).not.toBeInTheDocument();
  });

  it("accepting a finding in Tabs mode calls the action for that finding and refetches the run (AC-49)", async () => {
    searchParams = new URLSearchParams("view=tabs");
    const net = await loaded(
      multiRun({ columns: [column("r1", { findings: [finding("f1", { title: "Leaked key" })] })] }),
      { "POST /findings/f1/accept": { finding: {} } },
    );
    expect(net.count("GET", "/multi-agent-runs/mar-1")).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /Leaked key/ }));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(net.count("GET", "/multi-agent-runs/mar-1")).toBe(2));
    expect(net.count("POST", "/findings/f1/accept")).toBe(1);
  });

  it("'Configure run' selects this run's repo and opens the configure screen with its PR (AC-30)", async () => {
    await loaded(multiRun({ repo_id: "repo-9", pr_id: "pr/9 x" }));
    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(setRepoId).toHaveBeenCalledWith("repo-9");
    expect(push).toHaveBeenCalledWith("/multi-agent-review?pr=pr%2F9%20x");
    expect(setRepoId.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]!);
  });

  it("renders an untrusted PR title as text with no image element (security)", async () => {
    await loaded(multiRun({ pr_title: `Title ${XSS}` }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`#42 Title ${XSS}`);
    expect(document.querySelector("img")).toBeNull();
  });
});
