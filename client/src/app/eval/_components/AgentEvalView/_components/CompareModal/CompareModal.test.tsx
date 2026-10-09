import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCompare, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import common from "../../../../../../../messages/en/common.json";
import { apiError, installFetch } from "../../../../../../test/context-docs-fixtures";
import { CompareModal } from "./CompareModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const run = (id: string, version: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id,
  agent_id: "a1",
  agent_version: version,
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

const OLDER = run("r6", 6, { recall: 0.78 });
const NEWER = run("r7", 7);

const compareOf = (over: Partial<EvalCompare> = {}): EvalCompare => ({
  older: OLDER,
  newer: NEWER,
  recall: { older: 0.78, newer: 0.82, delta_pp: 4 },
  precision: { older: 0.93, newer: 0.91, delta_pp: -2 },
  citation_accuracy: { older: null, newer: 0.95, delta_pp: null },
  cost: { older: 0.21, newer: 0.23, delta: 0.02 },
  shared_case_count: 18,
  only_in_older: [],
  only_in_newer: [],
  flipped: [],
  errored: { older: 0, newer: 0 },
  config_diff: {
    system_prompt: [
      { kind: "same", text: "You are a reviewer." },
      { kind: "del", text: "Return 10 findings." },
      { kind: "add", text: "Return at most 5 findings." },
    ],
    provider: null,
    model: { older: "gpt-4.1", newer: "gpt-5" },
    skills: { added: ["Secrets"], removed: ["Style"], reordered: true },
  },
  ...over,
});

const agent = (version: number): Agent => ({ id: "a1", name: "Sec", version }) as unknown as Agent;

function renderModal(routes: Record<string, unknown>, onClose = vi.fn()) {
  const f = installFetch({ "GET /agents/a1": agent(7 - 1), ...routes } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <CompareModal agentId="a1" older={OLDER} newer={NEWER} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...f, onClose };
}

describe("CompareModal — metrics, cost, config (AC-31, 32, 45, 76)", () => {
  it("shows older → newer with signed pp deltas, cost with its delta, and the config diff as text", async () => {
    renderModal({ "GET /eval/compare": compareOf() });
    expect(screen.getByText("Compare runs · v6 → v7")).toBeInTheDocument();
    const recall = within(await screen.findByTestId("compare-tile-Recall"));
    expect(recall.getByText("78%")).toBeInTheDocument();
    expect(recall.getByText("82%")).toBeInTheDocument();
    expect(recall.getByText("▲ 4 pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("compare-tile-Precision")).getByText("▼ 2 pt")).toBeInTheDocument();
    // a missing value renders "—" and no delta
    const cit = within(screen.getByTestId("compare-tile-Citation accuracy"));
    expect(cit.getByText("—")).toBeInTheDocument();
    expect(cit.queryByText(/pt$/)).toBeNull();
    const cost = within(screen.getByTestId("compare-tile-cost"));
    expect(cost.getByText("$0.21")).toBeInTheDocument();
    expect(cost.getByText("$0.23")).toBeInTheDocument();
    expect(cost.getByText("▲ +$0.02")).toBeInTheDocument();
    // config diff
    expect(screen.getByText("Return at most 5 findings.")).toBeInTheDocument();
    expect(screen.getByText("Return 10 findings.")).toBeInTheDocument();
    expect(screen.getByText("+")).toBeInTheDocument();
    expect(screen.getByText("−")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1 → gpt-5")).toBeInTheDocument();
    expect(screen.queryByText("Provider")).toBeNull();
    const skills = within(screen.getByTestId("skills-diff"));
    expect(skills.getByText("Secrets")).toBeInTheDocument();
    expect(skills.getByText("Style")).toBeInTheDocument();
    expect(skills.getByText("Skills reordered")).toBeInTheDocument();
  });

  it("shows an unknown cost as — with no delta, never $0 (AC-76)", async () => {
    renderModal({ "GET /eval/compare": compareOf({ cost: { older: 0.21, newer: null, delta: null } }) });
    const cost = within(await screen.findByTestId("compare-tile-cost"));
    expect(cost.getByText("—")).toBeInTheDocument();
    expect(cost.queryByText("$0.00")).toBeNull();
    expect(cost.queryByText(/[▲▼]/)).toBeNull();
  });
});

describe("CompareModal — case sets (AC-33, 41, 67)", () => {
  it("lists cases present in only one run and the flipped cases with name, type and direction", async () => {
    renderModal({
      "GET /eval/compare": compareOf({
        only_in_older: [{ case_id: "c9", case_name: "old-only", expectation_types: ["must_find"] }],
        only_in_newer: [{ case_id: "c8", case_name: "new-only", expectation_types: ["must_not_flag"] }],
        flipped: [
          { case_id: "c1", case_name: "stripe-key-leak", expectation_types: ["must_find"], from: "passed", to: "failed" },
          { case_id: "c2", case_name: "sql-injection", expectation_types: ["must_not_flag"], from: "failed", to: "passed" },
        ],
        errored: { older: 1, newer: 2 },
      }),
    });
    const notice = within(await screen.findByTestId("compare-not-same-set"));
    expect(notice.getByText(/did not score the same cases/)).toBeInTheDocument();
    expect(notice.getByText(/old-only/)).toBeInTheDocument();
    expect(notice.getByText(/new-only/)).toBeInTheDocument();
    expect(screen.getByText("18 cases scored in both runs")).toBeInTheDocument();
    const flipped = within(screen.getByRole("region", { name: "Changed outcome" }));
    const items = flipped.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("stripe-key-leak (must find) passed → failed");
    expect(items[1]).toHaveTextContent("sql-injection (must not flag) failed → passed");
    expect(screen.getByText("Errored cases: older 1, newer 2")).toBeInTheDocument();
  });

  it("shows no notice when both runs scored the same cases, and says nothing flipped", async () => {
    renderModal({ "GET /eval/compare": compareOf() });
    expect(await screen.findByText("No case changed its outcome.")).toBeInTheDocument();
    expect(screen.queryByTestId("compare-not-same-set")).toBeNull();
    // The errored counts are shown even when both are 0 (AC-67).
    expect(screen.getByText("Errored cases: older 0, newer 0")).toBeInTheDocument();
  });

  it("renders stored text as text, never as HTML (NFR-3)", async () => {
    const payload = "<img src=x onerror=alert(1)>";
    renderModal({
      "GET /eval/compare": compareOf({
        flipped: [{ case_id: "c1", case_name: payload, expectation_types: ["must_find"], from: "passed", to: "failed" }],
        config_diff: { ...compareOf().config_diff, system_prompt: [{ kind: "add", text: payload }] },
      }),
    });
    expect((await screen.findAllByText(payload, { exact: false })).length).toBeGreaterThan(0);
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("CompareModal — Promote (AC-59, 70, Q-4)", () => {
  it("restores the newer run's version and confirms the new version number with skipped skills", async () => {
    const { requests } = renderModal({
      "GET /eval/compare": compareOf(),
      "POST /agents/a1/versions/7/restore": { id: "a1", name: "Sec", version: 9, skipped_skill_ids: ["sk-gone"] },
    });
    const btn = await screen.findByRole("button", { name: "Promote v7" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(await screen.findByText("Version 9 is now current")).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST" && r.path === "/agents/a1/versions/7/restore")).toBe(true);
    expect(screen.getByText("Skills that no longer exist were skipped: sk-gone")).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("keeps Promote disabled with an accessible description when the newer run's version is current (AC-70)", async () => {
    renderModal({ "GET /eval/compare": compareOf(), "GET /agents/a1": agent(7) });
    const btn = await screen.findByRole("button", { name: "Promote v7" });
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveAccessibleDescription("This version is already current.");
  });

  it("shows the API's message when Promote fails", async () => {
    renderModal({
      "GET /eval/compare": compareOf(),
      "POST /agents/a1/versions/7/restore": apiError(409, "Version 7 is already current"),
    });
    const btn = await screen.findByRole("button", { name: "Promote v7" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent("Version 7 is already current");
  });
});

describe("CompareModal — states and keyboard (NFR-4)", () => {
  it("shows an error state when the comparison cannot be loaded", async () => {
    renderModal({ "GET /eval/compare": apiError(422, "Runs are not comparable") });
    expect(await screen.findByText("Could not load the comparison")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promote v7" })).toBeDisabled();
  });

  it("closes with the Close button and with Escape", async () => {
    const { onClose } = renderModal({ "GET /eval/compare": compareOf() });
    await screen.findByText("Compare runs · v6 → v7");
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
