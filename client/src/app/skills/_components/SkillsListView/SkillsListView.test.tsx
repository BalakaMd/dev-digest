import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import common from "../../../../../messages/en/common.json";
import shell from "../../../../../messages/en/shell.json";
import { ToastProvider } from "../../../../lib/toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/skills",
  useSearchParams: () => new URLSearchParams(),
}));
// The app shell is chrome; this test is about the grid.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const deleteSkill = vi.fn();
const updateSkill = vi.fn();
let list: SkillSummary[] = [];
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: list, isLoading: false, isError: false }),
  useSkillAgents: () => ({ data: [{ id: "ag1", name: "Security Reviewer" }], isLoading: false }),
  useUpdateSkill: () => ({ mutate: updateSkill }),
  useDeleteSkill: () => ({ mutateAsync: deleteSkill, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

const skill = (name: string, extra: Partial<SkillSummary> = {}): SkillSummary => ({
  id: `id-${name}`,
  name,
  description: `${name} applies when…`,
  type: "rubric",
  source: "manual",
  body: `## ${name} heading\n\nSome **bold** guidance.`,
  enabled: true,
  version: 1,
  agent_count: 1,
  ...extra,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills, common, shell }}>
      <ToastProvider>
        <SkillsListView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  list = [skill("pr-quality-rubric"), skill("no-then-chains", { type: "convention" })];
  deleteSkill.mockReset().mockResolvedValue({ ok: true });
  updateSkill.mockReset();
  push.mockReset();
});
afterEach(cleanup);

describe("Skills page", () => {
  it("renders a card per skill", () => {
    renderView();
    expect(screen.getByTestId("skill-card-pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByTestId("skill-card-no-then-chains")).toBeInTheDocument();
  });

  it("clicking a card opens a side drawer with the rendered body, not a page navigation", () => {
    renderView();
    fireEvent.click(screen.getByTestId("skill-card-pr-quality-rubric"));
    const drawer = screen.getByRole("dialog");
    // Rendered markdown: a heading element and <strong>, not the raw `##` / `**`.
    expect(within(drawer).getByRole("heading", { name: "pr-quality-rubric heading" })).toBeInTheDocument();
    expect(within(drawer).getByText("bold").tagName).toBe("STRONG");
    expect(within(drawer).getByText("Security Reviewer")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(within(drawer).getByText("Open"));
    expect(push).toHaveBeenCalledWith("/skills/id-pr-quality-rubric");
  });

  it("the Add menu offers Create and Import; Create opens the form modal", () => {
    renderView();
    fireEvent.click(screen.getByText("Add Skill"));
    expect(screen.getByText("Import from file (.md or .zip)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Create skill"));
    const modal = screen.getByRole("dialog");
    for (const field of ["Name", "Description", "Body (Markdown)"]) {
      expect(within(modal).getByLabelText(field)).toBeInTheDocument();
    }
    expect(within(modal).getByText("Type")).toBeInTheDocument();
  });

  it("delete asks for confirmation; cancel keeps the skill", async () => {
    renderView();
    fireEvent.click(screen.getByLabelText("Delete no-then-chains"));
    expect(screen.getByText("Delete skill?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(deleteSkill).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Delete no-then-chains"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSkill).toHaveBeenCalledWith("id-no-then-chains"));
  });

  it("the card toggle flips the skill's global enabled flag", () => {
    renderView();
    fireEvent.click(within(screen.getByTestId("skill-card-no-then-chains")).getByRole("switch"));
    expect(updateSkill).toHaveBeenCalledWith({ id: "id-no-then-chains", patch: { enabled: false } });
  });

  it("filters cards by the search box", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "then" } });
    expect(screen.queryByTestId("skill-card-pr-quality-rubric")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-no-then-chains")).toBeInTheDocument();
  });
});
