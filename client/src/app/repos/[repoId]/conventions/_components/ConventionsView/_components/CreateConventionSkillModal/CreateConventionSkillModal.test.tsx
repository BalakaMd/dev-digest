import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionSkillDraft, ConventionSkillSplit } from "@devdigest/shared";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const create = vi.fn();
const draftsBySplit: Record<ConventionSkillSplit, ConventionSkillDraft[]> = { single: [], category: [] };
vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDrafts: (_repoId: string, split: ConventionSkillSplit) => ({
    data: draftsBySplit[split],
    isLoading: false,
    isError: false,
  }),
  useCreateConventionSkills: () => ({ mutateAsync: create, isPending: false }),
}));

import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

const draft = (name: string, category: ConventionSkillDraft["category"], ids: string[]): ConventionSkillDraft => ({
  name,
  description: `${ids.length} house conventions extracted from payments-api`,
  type: "convention",
  enabled: true,
  body: `# ${name}\n\nHouse conventions for \`payments-api\`.`,
  category,
  convention_ids: ids,
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <ToastProvider>
        <CreateConventionSkillModal repoId="r1" repoName="payments-api" acceptedCount={3} onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  draftsBySplit.single = [draft("payments-api-conventions", null, ["1", "2", "3"])];
  draftsBySplit.category = [
    draft("payments-api-naming-conventions", "naming", ["2"]),
    draft("payments-api-async-conventions", "async", ["1", "3"]),
  ];
  create.mockReset().mockResolvedValue([{ id: "s1" }]);
  push.mockReset();
});
afterEach(cleanup);

describe("CreateConventionSkillModal", () => {
  it("explains it builds from conventions and pre-fills every field", () => {
    renderModal();
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByText("3 accepted conventions")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("payments-api-conventions");
    expect(screen.getByLabelText("Description")).toHaveValue("3 house conventions extracted from payments-api");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Skill body")).toHaveValue(draftsBySplit.single[0]!.body);
  });

  it("creates the skill with the edited body and metadata, then opens Skills", async () => {
    const onClose = renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " my-rules " } });
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# my-rules\n\nEdited." } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      skills: [
        {
          name: "my-rules",
          description: "3 house conventions extracted from payments-api",
          type: "convention",
          enabled: false,
          body: "# my-rules\n\nEdited.",
          convention_ids: ["1", "2", "3"],
        },
      ],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/skills");
  });

  it("splits into one skill per category with a tab each", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: "One skill per category" }));
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByLabelText("Name")).toHaveValue("payments-api-naming-conventions");
    fireEvent.click(screen.getByRole("tab", { name: /Async/ }));
    expect(screen.getByLabelText("Name")).toHaveValue("payments-api-async-conventions");
    fireEvent.click(screen.getByRole("button", { name: "Create 2 skills" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0].skills).toHaveLength(2);
  });

  it("blocks Create while a draft has no name, and Cancel closes without saving", () => {
    const onClose = renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
