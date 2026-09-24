import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillDetail, SkillSummary } from "@devdigest/shared";
import agents from "../../../../../../../../messages/en/agents.json";
import skills from "../../../../../../../../messages/en/skills.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const setSkills = vi.fn();
let allSkills: SkillSummary[] = [];
let linked: AgentSkillDetail[] = [];
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: allSkills, isLoading: false, isError: false }),
  useAgentSkills: () => ({ data: linked, isLoading: false, isError: false }),
  useSetAgentSkills: () => ({ mutate: setSkills, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const skill = (name: string, type: SkillSummary["type"] = "rubric"): SkillSummary => ({
  id: `id-${name}`,
  name,
  description: "",
  type,
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  agent_count: 0,
});

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents, skills }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  setSkills.mockReset();
  allSkills = [skill("pr-quality-rubric"), skill("no-then-chains", "convention"), skill("secret-leakage-gate", "security")];
  linked = [
    { ...allSkills[2]!, order: 0 },
    { ...allSkills[0]!, order: 1 },
  ];
});
afterEach(cleanup);

/** jsdom has no layout: give the rows tops 0 / 50 / 100, 40px tall each. */
function placeRows() {
  screen.getAllByTestId(/^skill-row-/).forEach((el, i) => {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: i * 50, bottom: i * 50 + 40 } as DOMRect);
  });
}

const rowNames = () => screen.getAllByTestId(/^skill-row-/).map((el) => el.getAttribute("data-testid"));

describe("agent Skills tab", () => {
  it("lists every skill in the workspace — enabled ones first, in prompt order — with type labels", () => {
    renderTab();
    expect(rowNames()).toEqual([
      "skill-row-secret-leakage-gate",
      "skill-row-pr-quality-rubric",
      "skill-row-no-then-chains",
    ]);
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    expect(within(screen.getByTestId("skill-row-no-then-chains")).getByText("convention")).toBeInTheDocument();
  });

  it("numbers enabled skills by their place in the prompt", () => {
    renderTab();
    expect(within(screen.getByTestId("skill-row-secret-leakage-gate")).getByText("#1")).toBeInTheDocument();
    expect(within(screen.getByTestId("skill-row-pr-quality-rubric")).getByText("#2")).toBeInTheDocument();
    expect(within(screen.getByTestId("skill-row-no-then-chains")).queryByText(/^#/)).toBeNull();
  });

  it("makes only enabled skills draggable", () => {
    renderTab();
    expect(screen.getByTestId("skill-row-secret-leakage-gate")).toHaveAttribute("data-draggable", "true");
    expect(screen.getByTestId("skill-row-no-then-chains")).toHaveAttribute("data-draggable", "false");
  });

  it("dragging an enabled skill's handle onto another row saves the new prompt order", () => {
    renderTab();
    placeRows();
    const handle = screen.getByTestId("skill-handle-pr-quality-rubric");
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 70 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 20 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 20 });
    expect(setSkills).toHaveBeenCalledWith(
      { agentId: "ag1", skillIds: ["id-pr-quality-rubric", "id-secret-leakage-gate"] },
      expect.anything(),
    );
  });

  it("a disabled skill's handle does not start a drag", () => {
    renderTab();
    placeRows();
    const handle = screen.getByTestId("skill-handle-no-then-chains");
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 120 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 20 });
    expect(setSkills).not.toHaveBeenCalled();
  });

  it("toggling a skill keeps its row where it is", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("skill-row-secret-leakage-gate")).getByRole("switch"));
    expect(rowNames()).toEqual([
      "skill-row-secret-leakage-gate",
      "skill-row-pr-quality-rubric",
      "skill-row-no-then-chains",
    ]);
    expect(within(screen.getByTestId("skill-row-pr-quality-rubric")).getByText("#1")).toBeInTheDocument();
  });

  it("toggling a skill on links it at the end of the order", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("skill-row-no-then-chains")).getByRole("switch"));
    expect(setSkills).toHaveBeenCalledWith(
      { agentId: "ag1", skillIds: ["id-secret-leakage-gate", "id-pr-quality-rubric", "id-no-then-chains"] },
      expect.anything(),
    );
  });

  it("toggling a skill off unlinks it", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("skill-row-secret-leakage-gate")).getByRole("switch"));
    expect(setSkills).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["id-pr-quality-rubric"] }, expect.anything());
  });

  it("the ↓ button moves an enabled skill down", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move secret-leakage-gate down"));
    expect(setSkills).toHaveBeenCalledWith(
      { agentId: "ag1", skillIds: ["id-pr-quality-rubric", "id-secret-leakage-gate"] },
      expect.anything(),
    );
  });

  it("filters skills by name and turns reordering off while filtered", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "secret" } });
    expect(rowNames()).toEqual(["skill-row-secret-leakage-gate"]);
    expect(screen.getByTestId("skill-row-secret-leakage-gate")).toHaveAttribute("data-draggable", "false");
  });
});
