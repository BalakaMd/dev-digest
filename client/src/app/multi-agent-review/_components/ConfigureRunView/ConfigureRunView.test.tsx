import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgentConfigure from "../../../../../messages/en/multiAgentConfigure.json";

const push = vi.fn();
const mockMutateAsync = vi.fn();
const state = vi.hoisted(() => ({
  search: new URLSearchParams(),
  repo: { id: "r1" } as { id: string } | null,
  pulls: { data: [] as unknown[], isError: false, isLoading: false },
  agents: { data: [] as unknown[], isError: false },
  estimates: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => state.search,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: state.repo }) }));
vi.mock("@/lib/hooks/core", () => ({ usePulls: () => state.pulls }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => state.agents }));
vi.mock("@/lib/hooks/multi-agent-review", () => ({
  useReviewEstimates: () => ({ data: { estimates: state.estimates } }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import { ConfigureRunView } from "./ConfigureRunView";

const PULLS = [
  { id: "pr-open", number: 12, title: "Add pagination", status: "open" },
  { id: "pr-review", number: 13, title: "Fix cache", status: "needs_review" },
  { id: "pr-merged", number: 9, title: "Old merged work", status: "merged" },
  { id: "pr-closed", number: 8, title: "Abandoned", status: "closed" },
];
const AGENTS = [
  { id: "a1", name: "Security", description: "Finds vulnerabilities", enabled: true },
  { id: "a2", name: "Style", description: "", enabled: true },
  { id: "a3", name: "Perf", description: "Hot paths", enabled: true },
  { id: "a9", name: "Disabled one", description: "", enabled: false },
];
const ESTIMATES = [
  { agent_id: "a1", duration_ms: 12_400, cost_usd: 0.02, runs: 3, cost_runs: 3 },
  { agent_id: "a2", duration_ms: 8_000, cost_usd: 0.015, runs: 1, cost_runs: 1 },
  // a3: no history at all
];

beforeEach(() => {
  state.search = new URLSearchParams();
  state.repo = { id: "r1" };
  state.pulls = { data: PULLS, isError: false, isLoading: false };
  state.agents = { data: AGENTS, isError: false };
  state.estimates = ESTIMATES;
  mockMutateAsync.mockResolvedValue({ multi_agent_run_id: "mar-1" });
});

afterEach(() => {
  cleanup();
  push.mockReset();
  mockMutateAsync.mockReset();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentConfigure }}>
      <ConfigureRunView />
    </NextIntlClientProvider>,
  );
}

const prSelect = () => screen.getByLabelText("Pull request") as HTMLSelectElement;
const pickPr = (id: string) => fireEvent.change(prSelect(), { target: { value: id } });
const runButton = (n: number) => screen.getByRole("button", { name: `Run multi-agent review (${n})` });
const tick = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name }));

describe("ConfigureRunView — step 1, the pull request (AC-9, AC-10, AC-11)", () => {
  it("offers open pull requests only, behind a placeholder", () => {
    renderView();
    const labels = Array.from(prSelect().options).map((o) => o.textContent);
    expect(labels).toEqual(["Select a pull request", "#12 · Add pagination", "#13 · Fix cache"]);
    expect(prSelect().value).toBe("");
  });

  it("preselects the pull request named by ?pr=", () => {
    state.search = new URLSearchParams("pr=pr-review");
    renderView();
    expect(prSelect().value).toBe("pr-review");
    expect(screen.getByRole("checkbox", { name: "Security" })).toBeInTheDocument();
  });

  it("ignores a ?pr= that is not an open pull request of the repository", () => {
    state.search = new URLSearchParams("pr=pr-merged");
    renderView();
    expect(prSelect().value).toBe("");
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
  });
});

describe("ConfigureRunView — step 2, the agents (AC-12, AC-13, AC-14, AC-53)", () => {
  it("shows a placeholder instead of agents until a pull request is picked, and the run button is disabled", () => {
    renderView();
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(runButton(0)).toBeDisabled();
  });

  it("lists the enabled agents with estimate and run count, none of them checked", () => {
    renderView();
    pickPr("pr-open");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const b of boxes) expect(b).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Disabled one")).not.toBeInTheDocument();
    expect(screen.getByText("Finds vulnerabilities")).toBeInTheDocument();
    expect(screen.getByText("12.4 s · $0.02")).toBeInTheDocument();
    expect(screen.getByText("based on 3 runs")).toBeInTheDocument();
    expect(screen.getByText("based on 1 run")).toBeInTheDocument();
    // An agent without history shows dashes and "0 runs".
    expect(screen.getByText("— · —")).toBeInTheDocument();
    expect(screen.getByText("based on 0 runs")).toBeInTheDocument();
    expect(runButton(0)).toBeDisabled();
    expect(screen.queryByText(/parallel fan-out/)).not.toBeInTheDocument();
  });

  it('"Select all" checks every enabled agent', () => {
    renderView();
    pickPr("pr-open");
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    for (const b of screen.getAllByRole("checkbox")) expect(b).toHaveAttribute("aria-checked", "true");
    expect(runButton(3)).toBeEnabled();
  });

  it("summarises the checked agents: slowest time, summed cost, and how many have no history", () => {
    renderView();
    pickPr("pr-open");
    tick("Security");
    tick("Style");
    expect(screen.getByText("≈ 12.4 s · $0.035 · parallel fan-out")).toBeInTheDocument();
    expect(screen.queryByText(/without history/)).not.toBeInTheDocument();
    tick("Perf");
    expect(screen.getByText("≈ 12.4 s · $0.035 · parallel fan-out")).toBeInTheDocument();
    expect(screen.getByText("1 agent without history not included")).toBeInTheDocument();
  });

  it("when no checked agent has history the summary shows dashes", () => {
    renderView();
    pickPr("pr-open");
    tick("Perf");
    expect(screen.getByText("≈ — · — · parallel fan-out")).toBeInTheDocument();
    expect(screen.getByText("1 agent without history not included")).toBeInTheDocument();
  });

  it("changing the pull request clears the selection", () => {
    renderView();
    pickPr("pr-open");
    tick("Security");
    pickPr("pr-review");
    for (const b of screen.getAllByRole("checkbox")) expect(b).toHaveAttribute("aria-checked", "false");
    expect(runButton(0)).toBeDisabled();
  });
});

describe("ConfigureRunView — starting the run (AC-15, AC-17, AC-18)", () => {
  it("sends the picked pull request and exactly the checked agent ids, then opens the result page", async () => {
    renderView();
    pickPr("pr-review");
    tick("Perf");
    tick("Security");
    fireEvent.click(runButton(2));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent-review/mar-1"));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({ prId: "pr-review", agentIds: ["a1", "a3"] });
  });

  it("a failed trigger keeps the screen and the selection for a retry", async () => {
    mockMutateAsync.mockRejectedValue(new Error("boom"));
    renderView();
    pickPr("pr-open");
    tick("Security");
    fireEvent.click(runButton(1));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Security" })).toHaveAttribute("aria-checked", "true");
    expect(runButton(1)).toBeEnabled();
  });
});

describe("ConfigureRunView — empty and error states (AC-58, EC-1, EC-4)", () => {
  it("says so when the repository has no open pull request", () => {
    state.pulls = { data: [PULLS[2], PULLS[3]], isError: false, isLoading: false };
    renderView();
    expect(screen.getByText("The active repository has no open pull requests.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Pull request")).not.toBeInTheDocument();
    expect(runButton(0)).toBeDisabled();
  });

  it("says so when there is no active repository", () => {
    state.repo = null;
    state.pulls = { data: [], isError: false, isLoading: false };
    renderView();
    expect(screen.getByText("No active repository. Select a repository first.")).toBeInTheDocument();
  });

  it("says so when the pull requests cannot be loaded", () => {
    state.pulls = { data: [], isError: true, isLoading: false };
    renderView();
    expect(screen.getByText("Could not load pull requests.")).toBeInTheDocument();
  });

  it("with no enabled agent it says so and links to the Agents page", () => {
    state.agents = { data: [AGENTS[3]], isError: false };
    renderView();
    pickPr("pr-open");
    expect(screen.getByText(/No enabled agents\./)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();
    expect(runButton(0)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Open the Agents page" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("says so when the agents cannot be loaded", () => {
    state.agents = { data: [], isError: true };
    renderView();
    pickPr("pr-open");
    expect(screen.getByText("Could not load agents.")).toBeInTheDocument();
  });
});
