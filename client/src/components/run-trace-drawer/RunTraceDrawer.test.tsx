import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const BASE_TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// Mutable so individual tests can swap in a trace whose prompt_assembly
// carries an `intent` block, without re-declaring the whole mock.
let currentTrace: RunTrace = BASE_TRACE;

// `realTrace.on` swaps the trace hook for the real one (needs a QueryClient and
// a fetch stub) so the 404-retry behaviour is exercised end to end;
// `liveEvents` is what the SSE hook reports.
const realTrace = vi.hoisted(() => ({ on: false }));
const liveEvents = vi.hoisted(() => ({
  value: { events: [] as { t: string; kind: string; msg: string }[], running: false },
}));

vi.mock("../../lib/hooks/trace", async () => {
  const actual = await vi.importActual<typeof import("../../lib/hooks/trace")>("../../lib/hooks/trace");
  return {
    useRunTrace: (...args: Parameters<typeof actual.useRunTrace>) =>
      realTrace.on ? actual.useRunTrace(...args) : { data: currentTrace, isLoading: false },
  };
});
vi.mock("../../lib/hooks/reviews", () => ({
  useRunEvents: () => liveEvents.value,
}));

import RunTraceDrawer from "./RunTraceDrawer";

beforeEach(() => {
  currentTrace = BASE_TRACE;
  realTrace.on = false;
  liveEvents.value = { events: [], running: false };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("shows the PR intent prompt block only when the trace carries one", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // Prompt assembly starts collapsed — open it to reach the per-slot blocks.
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("PR intent (dynamic)")).not.toBeInTheDocument();
  });

  it("renders the PR intent prompt block when prompt_assembly.intent is present", () => {
    currentTrace = {
      ...BASE_TRACE,
      prompt_assembly: {
        ...BASE_TRACE.prompt_assembly,
        intent: "## PR intent (derived — verify against the diff)\nSummary: add pagination.",
        intent_tokens: 42,
      },
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("PR intent (dynamic)")).toBeInTheDocument();
  });

  it('labels a local document that overrides a repository one "Local · overrides repository" (SPEC-02 AC-17)', () => {
    currentTrace = {
      ...BASE_TRACE,
      specs_read: ["docs/guide.md"],
      prompt_assembly: { ...BASE_TRACE.prompt_assembly, specs: "## Project context\n<untrusted>…</untrusted>" },
      context: {
        docs: [{ path: "docs/guide.md", source: "local", tokens: 120, overrides_repo: true }],
        tokens: 120,
        skipped: [],
      },
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Local · overrides repository")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getAllByText("Local · overrides repository")).toHaveLength(2);
  });

  it("a trace written before the feature (no context field) renders without any Local mark", () => {
    currentTrace = { ...BASE_TRACE, specs_read: ["spec-0"] };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("spec-0")).toBeInTheDocument();
    expect(screen.queryByText(/^Local/)).not.toBeInTheDocument();
  });
});

describe("Run Trace drawer — live runs and a late trace (SPEC-08 AC-35, EC-22)", () => {
  it("a 404 for a trace that is written a moment later is retried and then shows the trace", async () => {
    realTrace.on = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "not_found", message: "no trace" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify(BASE_TRACE), { status: 200, headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient();

    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
          <div data-theme="dark">
            <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />
          </div>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    // While the trace is missing the drawer says it is loading, not "no trace".
    expect(await screen.findByText("Loading trace…")).toBeInTheDocument();
    expect(await screen.findByText("2/2 passed", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText("No trace available yet.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) expect(String(call[0])).toMatch(/\/runs\/r1\/trace$/);
  });

  it("a running run opens on the Live log tab first, with the streamed lines and no trace body", () => {
    liveEvents.value = { events: [{ t: "00.20", kind: "info", msg: "Reading the diff" }], running: true };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} running onClose={() => {}} />);
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
    expect(screen.getByText("Reading the diff")).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    expect(screen.getByText(/PR #482 · running/)).toBeInTheDocument();
  });
});
