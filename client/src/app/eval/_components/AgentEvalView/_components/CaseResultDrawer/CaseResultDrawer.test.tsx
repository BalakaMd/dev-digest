import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseRun, EvalCaseRunDetail, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import common from "../../../../../../../messages/en/common.json";
import { apiError, installFetch } from "../../../../../../test/context-docs-fixtures";
import { CaseResultDrawer } from "./CaseResultDrawer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RUN: EvalSuiteRun = {
  id: "r7",
  agent_id: "a1",
  agent_version: 7,
  status: "done",
  error: null,
  started_at: "2026-05-29T09:14:00Z",
  finished_at: "2026-05-29T09:15:00Z",
  cases_total: 3,
  cases_done: 3,
  cases_errored: 1,
  cases_passed: 1,
  recall: 0.5,
  precision: 0.5,
  citation_accuracy: 1,
  cost_usd: 0.1,
  duration_ms: 1000,
};

const caseRun = (id: string, name: string, over: Partial<EvalCaseRun> = {}): EvalCaseRun => ({
  id,
  case_id: `c-${id}`,
  case_name: name,
  expectation_types: ["must_find"],
  status: "ok",
  error: null,
  passed: true,
  expected_count: 1,
  returned_count: 1,
  duration_ms: 10,
  cost_usd: 0.01,
  ...over,
});

const CASES: EvalCaseRun[] = [
  caseRun("cr1", "stripe-key-leak"),
  caseRun("cr2", "sql-injection", { passed: false }),
  caseRun("cr3", "broken-case", { status: "error", passed: null, error: "model timed out" }),
];

const DETAIL: EvalCaseRunDetail = {
  ...CASES[1]!,
  expectations: [{ type: "must_find", file: "src/db.ts", start_line: 10, end_line: 14 }],
  findings: [
    { file: "src/db.ts", start_line: 11, end_line: 12, title: "Unparameterised query", rationale: "Use **bound** params", matched: true },
    { file: "src/other.ts", start_line: 1, end_line: 2, title: "<img src=x onerror=alert(1)>", matched: false },
  ],
  dropped: [{ file: "src/ghost.ts", start_line: 3, end_line: 4, title: "Hallucinated file", reason: "file not in diff" }],
  expectation_matches: [{ expectation_index: 0, matched: true, finding_indexes: [0] }],
};

function renderDrawer(routes: Record<string, unknown> = {}, onClose = vi.fn(), run: EvalSuiteRun = RUN) {
  const f = installFetch({
    "GET /eval-runs/r7": { run: RUN, cases: CASES },
    "GET /eval-runs/r7/cases/cr2": DETAIL,
    ...routes,
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <CaseResultDrawer run={run} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...f, onClose };
}

describe("CaseResultDrawer — case list (AC-67)", () => {
  it("lists each case with pass / fail / error as text and the error message of an errored case", async () => {
    renderDrawer();
    const pass = within(await screen.findByRole("button", { name: "Open case stripe-key-leak" }));
    expect(pass.getByText("passed")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Open case sql-injection" })).getByText("failed")).toBeInTheDocument();
    const broken = within(screen.getByRole("button", { name: "Open case broken-case" }));
    expect(broken.getByText("error")).toBeInTheDocument();
    expect(broken.getByText("Error: model timed out")).toBeInTheDocument();
    expect(screen.getByText("v7 · 1/2 cases passed · 1 errored case")).toBeInTheDocument();
  });

  it("states the errored count even when no case errored (AC-67)", async () => {
    renderDrawer({}, vi.fn(), { ...RUN, cases_errored: 0, cases_total: 2 });
    expect(await screen.findByText("v7 · 1/2 cases passed · 0 errored cases")).toBeInTheDocument();
  });

  it("marks a case whose definition was deleted after the run", async () => {
    renderDrawer({
      "GET /eval-runs/r7": { run: RUN, cases: [caseRun("cr1", "gone", { case_id: null })] },
    });
    expect(await screen.findByText("Case deleted")).toBeInTheDocument();
  });

  it("shows an error state when the run cannot be loaded", async () => {
    renderDrawer({ "GET /eval-runs/r7": apiError(404, "Run not found") });
    expect(await screen.findByText("Could not load the run's cases")).toBeInTheDocument();
  });

  it("closes with Escape and the Close button", async () => {
    const { onClose } = renderDrawer();
    await screen.findByRole("button", { name: "Open case sql-injection" });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("CaseResultDrawer — case detail (AC-39, 40, NFR-3)", () => {
  it("shows the expectation, kept findings with matched yes/no, dropped findings with reasons and the outcome", async () => {
    renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Open case sql-injection" }));
    expect(await screen.findByText("Case result · sql-injection")).toBeInTheDocument();
    const expected = within(await screen.findByRole("region", { name: "Expected" }));
    expect(expected.getByText("must find")).toBeInTheDocument();
    expect(expected.getByText("src/db.ts:10–14")).toBeInTheDocument();
    expect(expected.getByText("met")).toBeInTheDocument();
    const returned = within(screen.getByRole("region", { name: "Returned findings" }));
    expect(returned.getByText("Unparameterised query")).toBeInTheDocument();
    expect(returned.getByText("src/db.ts:11–12")).toBeInTheDocument();
    expect(returned.getByText("matched")).toBeInTheDocument();
    expect(returned.getByText("not matched")).toBeInTheDocument();
    // rationale goes through the Markdown renderer
    expect(returned.getByText("bound").tagName).toBe("STRONG");
    const dropped = within(screen.getByRole("region", { name: "Dropped findings" }));
    expect(dropped.getByText("Hallucinated file")).toBeInTheDocument();
    expect(dropped.getByText("src/ghost.ts:3–4")).toBeInTheDocument();
    expect(dropped.getByText("Reason: file not in diff")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("renders a hostile finding title as text, never as HTML (NFR-3)", async () => {
    renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Open case sql-injection" }));
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows an errored case's message and goes back to the list", async () => {
    renderDrawer({
      "GET /eval-runs/r7/cases/cr3": {
        ...CASES[2]!,
        expectations: [{ type: "must_find", file: "a.ts", start_line: 1, end_line: 2 }],
        findings: [],
        dropped: [],
        expectation_matches: [],
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Open case broken-case" }));
    expect(await screen.findByText("Error: model timed out")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Returned findings" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to the cases" }));
    expect(await screen.findByRole("button", { name: "Open case stripe-key-leak" })).toBeInTheDocument();
  });

  it("shows an error state when the case cannot be loaded", async () => {
    renderDrawer({ "GET /eval-runs/r7/cases/cr2": apiError(404, "gone") });
    fireEvent.click(await screen.findByRole("button", { name: "Open case sql-injection" }));
    expect(await screen.findByText("Could not load the case result")).toBeInTheDocument();
  });
});
