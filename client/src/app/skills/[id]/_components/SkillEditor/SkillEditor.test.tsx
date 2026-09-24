import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skills from "../../../../../../messages/en/skills.json";
import common from "../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../lib/toast";

const update = vi.fn();
const restore = vi.fn();
let versions: SkillVersion[] = [];
vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: update, mutateAsync: update, isPending: false }),
  useRestoreSkillVersion: () => ({ mutateAsync: restore, isPending: false }),
  useSkillVersions: () => ({ data: versions, isLoading: false, isError: false }),
}));

import { SkillEditor } from "./SkillEditor";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "When reviewing, score the PR.",
  type: "rubric",
  source: "manual",
  body: "## Rubric\n\nCheck **tests**.\nCheck naming.",
  enabled: true,
  version: 2,
};

function renderEditor(tab: string, onTab = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills, common }}>
      <ToastProvider>
        <SkillEditor skill={SKILL} tab={tab} onTab={onTab} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onTab;
}

beforeEach(() => {
  update.mockReset().mockResolvedValue({ ...SKILL, version: 3 });
  restore.mockReset().mockResolvedValue({ ...SKILL, version: 3 });
  versions = [
    { skill_id: "sk1", version: 2, body: SKILL.body, created_at: "2026-09-24T10:00:00Z" },
    { skill_id: "sk1", version: 1, body: "## Rubric\n\nCheck **tests**.", created_at: "2026-09-23T10:00:00Z" },
  ];
});
afterEach(cleanup);

describe("SkillEditor", () => {
  it("has Config, Preview and Versioning tabs", () => {
    const onTab = renderEditor("config");
    for (const tab of ["Config", "Preview", "Versioning"]) expect(screen.getByText(tab)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Versioning"));
    expect(onTab).toHaveBeenCalledWith("versioning");
  });

  it("Config edits the fields and saves only when something changed", async () => {
    renderEditor("config");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Body (Markdown)"), { target: { value: "## New body" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        id: "sk1",
        patch: { name: SKILL.name, description: SKILL.description, type: "rubric", body: "## New body" },
      }),
    );
  });

  it("Preview renders the markdown instead of showing it raw", () => {
    renderEditor("preview");
    const preview = screen.getByTestId("skill-preview");
    expect(within(preview).getByRole("heading", { name: "Rubric" })).toBeInTheDocument();
    expect(within(preview).getByText("tests").tagName).toBe("STRONG");
    expect(preview.textContent).not.toContain("##");
  });

  it("Versioning lists every version; Diff compares an older one with the current body", () => {
    renderEditor("versioning");
    expect(screen.getByTestId("version-2")).toHaveTextContent("current");
    const v1 = screen.getByTestId("version-1");
    expect(within(screen.getByTestId("version-2")).queryByText("Diff")).not.toBeInTheDocument();

    fireEvent.click(within(v1).getByText("Diff"));
    expect(screen.getByText("v1 → current (v2)")).toBeInTheDocument();
    const added = v1.querySelectorAll('[data-kind="add"]');
    expect(added).toHaveLength(1);
    expect(added[0]).toHaveTextContent("Check naming.");
  });

  it("Restore asks for confirmation, then restores that version", async () => {
    renderEditor("versioning");
    fireEvent.click(within(screen.getByTestId("version-1")).getByText("Restore"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Restore v1?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith({ id: "sk1", version: 1 }));
  });
});
