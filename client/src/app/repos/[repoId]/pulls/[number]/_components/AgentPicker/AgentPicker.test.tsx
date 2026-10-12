import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../../../../../../messages/en/prReview.json";
import agentPicker from "../../../../../../../../messages/en/agentPicker.json";

const push = vi.fn();
const mockUseAgents = vi.fn();
const mockUseEstimates = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => mockUseAgents() }));
vi.mock("@/lib/hooks/multi-agent-review", () => ({ useReviewEstimates: () => mockUseEstimates() }));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import { AgentPicker } from "./AgentPicker";

const AGENTS = [
  { id: "a1", name: "Security", enabled: true },
  { id: "a2", name: "Style", enabled: true },
  { id: "a3", name: "Perf", enabled: true },
  { id: "a9", name: "Disabled one", enabled: false },
];

beforeEach(() => {
  mockUseAgents.mockReturnValue({ data: AGENTS });
  mockUseEstimates.mockReturnValue({
    data: {
      estimates: [
        { agent_id: "a1", duration_ms: 12_400, cost_usd: 0.02, runs: 3, cost_runs: 3 },
        { agent_id: "a2", duration_ms: null, cost_usd: null, runs: 0, cost_runs: 0 },
      ],
    },
  });
  mockMutateAsync.mockResolvedValue({ multi_agent_run_id: "mar-1" });
});

afterEach(() => {
  cleanup();
  push.mockReset();
  mockUseAgents.mockReset();
  mockUseEstimates.mockReset();
  mockMutateAsync.mockReset();
});

function renderPicker(props: Partial<React.ComponentProps<typeof AgentPicker>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, agentPicker }}>
      <AgentPicker prId="pr1" {...props} />
    </NextIntlClientProvider>,
  );
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: /Run Review/ }));
  return screen.getByRole("dialog", { name: "Pick agents to run" });
}

const runButton = (n: number) => screen.getByRole("button", { name: `Run multi-agent review (${n})` });
const tick = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name }));

describe("AgentPicker — what the panel shows (AC-1…AC-4)", () => {
  it("lists only the enabled agents, none of them checked, with the run button disabled", () => {
    renderPicker();
    const panel = open();
    const boxes = within(panel).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const name of ["Security", "Style", "Perf"]) {
      expect(within(panel).getByRole("checkbox", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText("Disabled one")).not.toBeInTheDocument();
    for (const b of boxes) expect(b).toHaveAttribute("aria-checked", "false");
    expect(runButton(0)).toBeDisabled();
  });

  it('shows "~N s" for an agent with history and "—" for one without', () => {
    renderPicker();
    open();
    expect(screen.getByLabelText("Estimated duration ~12 s")).toBeInTheDocument();
    // Style has no completed run; Perf is not in the estimates at all.
    expect(screen.getAllByLabelText("Estimated duration —")).toHaveLength(2);
  });
});

describe("AgentPicker — selecting (AC-5, AC-6)", () => {
  it("counts the ticked agents in the button label and enables it; Clear unticks everything", () => {
    renderPicker();
    open();
    tick("Security");
    tick("Perf");
    expect(runButton(2)).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(runButton(0)).toBeDisabled();
    for (const b of screen.getAllByRole("checkbox")) expect(b).toHaveAttribute("aria-checked", "false");
  });
});

describe("AgentPicker — running (AC-7, AC-8, AC-18)", () => {
  it("sends exactly the ticked agent ids, then opens the result page of the new multi-agent run", async () => {
    const onRunsStarted = vi.fn();
    renderPicker({ onRunsStarted });
    open();
    tick("Perf");
    tick("Security");
    fireEvent.click(runButton(2));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent-review/mar-1"));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    // Order of the list, not of the clicks; the disabled agent and the unticked one are absent.
    expect(mockMutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a3"] });
    expect(onRunsStarted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a single ticked agent is still a multi-agent run with agentIds of length 1", async () => {
    renderPicker();
    open();
    tick("Style");
    fireEvent.click(runButton(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent-review/mar-1"));
    expect(mockMutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a2"] });
  });

  it("a double activation starts one run only", async () => {
    let finish!: (v: { multi_agent_run_id: string }) => void;
    mockMutateAsync.mockReturnValue(new Promise((res) => (finish = res)));
    renderPicker();
    open();
    tick("Security");
    const btn = runButton(1);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    finish({ multi_agent_run_id: "mar-1" });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it("when the trigger fails it stays on the page with the panel open and the selection kept", async () => {
    mockMutateAsync.mockRejectedValue(new Error("boom"));
    renderPicker();
    open();
    tick("Security");
    fireEvent.click(runButton(1));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Security" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("AgentPicker — closing resets the selection (AC-1)", () => {
  const expectFreshPanel = () => {
    open();
    for (const b of screen.getAllByRole("checkbox")) expect(b).toHaveAttribute("aria-checked", "false");
    expect(runButton(0)).toBeDisabled();
  };

  it("Escape closes the panel and a reopened one has nothing ticked and the run button disabled", () => {
    renderPicker();
    open();
    tick("Security");
    expect(runButton(1)).toBeEnabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expectFreshPanel();
  });

  it("closing through the trigger button also drops the ticks", () => {
    renderPicker();
    open();
    tick("Perf");
    fireEvent.click(screen.getByRole("button", { name: /Run Review/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expectFreshPanel();
  });
});

describe("AgentPicker — edge cases (EC-1, EC-2, EC-3)", () => {
  it("with no enabled agent it says so and links to the Agents page, without a run button", () => {
    mockUseAgents.mockReturnValue({ data: [{ id: "a9", name: "Disabled one", enabled: false }] });
    renderPicker();
    open();
    expect(screen.getByText("No enabled agents — enable one")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run multi-agent review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open the Agents page" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it('"Configure agents…" opens the Agents page', () => {
    renderPicker();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Configure agents…" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("on a merged PR it warns, yet the run is still allowed", async () => {
    renderPicker({ warnMerged: true });
    open();
    expect(screen.getByText("Already merged — review is informational")).toBeInTheDocument();
    tick("Security");
    expect(runButton(1)).toBeEnabled();
    fireEvent.click(runButton(1));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] }));
  });

  it("without the warning flag there is no merged warning", () => {
    renderPicker();
    open();
    expect(screen.queryByText("Already merged — review is informational")).not.toBeInTheDocument();
  });
});
