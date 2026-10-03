import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skills from "../../../../../../messages/en/skills.json";
import common from "../../../../../../messages/en/common.json";
import contextDocs from "../../../../../../messages/en/contextDocs.json";
import { ToastProvider } from "../../../../../lib/toast";
import { entry, installFetch, listOf } from "../../../../../test/context-docs-fixtures";

const update = vi.fn();
const restore = vi.fn();
const setDocs = vi.fn();
let versions: SkillVersion[] = [];
vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: update, mutateAsync: update, isPending: false }),
  useRestoreSkillVersion: () => ({ mutateAsync: restore, isPending: false }),
  useSkillVersions: () => ({ data: versions, isLoading: false, isError: false }),
  useSetSkillContextDocs: () => ({ mutateAsync: setDocs, isPending: false }),
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", repos: [], activeRepo: null, reposLoaded: true, setRepoId: () => {} }),
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

function renderEditor(tab: string, onTab = vi.fn(), skill: Skill = SKILL) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ skills, common, contextDocs }}>
        <ToastProvider>
          <SkillEditor skill={skill} tab={tab} onTab={onTab} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onTab;
}

beforeEach(() => {
  update.mockReset().mockResolvedValue({ ...SKILL, version: 3 });
  restore.mockReset().mockResolvedValue({ ...SKILL, version: 3 });
  setDocs.mockReset().mockResolvedValue(undefined);
  versions = [
    { skill_id: "sk1", version: 2, body: SKILL.body, created_at: "2026-09-24T10:00:00Z" },
    { skill_id: "sk1", version: 1, body: "## Rubric\n\nCheck **tests**.", created_at: "2026-09-23T10:00:00Z" },
  ];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkillEditor", () => {
  it("has Config, Context, Preview and Versioning tabs", () => {
    const onTab = renderEditor("config");
    for (const tab of ["Config", "Context", "Preview", "Versioning"]) expect(screen.getByText(tab)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Versioning"));
    expect(onTab).toHaveBeenCalledWith("versioning");
  });

  describe("Context tab (AC-23, AC-81)", () => {
    const DOCS = [entry("docs/a.md", { tokens: 10 }), entry("specs/b.md", { tokens: 20 }), entry("insights/c.md", { tokens: 30 })];
    const WITH_DOCS: Skill = { ...SKILL, context_docs: ["specs/b.md", "docs/a.md"] };

    beforeEach(() => {
      installFetch({ "GET /repos/r1/context-docs": listOf(DOCS) });
    });

    it("is reachable from the tab bar", () => {
      const onTab = renderEditor("config");
      fireEvent.click(screen.getByText("Context"));
      expect(onTab).toHaveBeenCalledWith("context");
    });

    it('shows "Project context to use", an "N attached" counter and the inherit line', async () => {
      renderEditor("context", vi.fn(), WITH_DOCS);
      expect(await screen.findByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
      expect(screen.getByText("2 attached")).toBeInTheDocument();
      expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    });

    it("shows both the order hint and the inherit line under the title (AC-23)", async () => {
      renderEditor("context", vi.fn(), WITH_DOCS);
      const order = await screen.findByText(/earlier docs appear earlier in the assembled ## Project context block/);
      const inherit = screen.getByText("Any agent using this skill inherits these documents.");
      // One hint paragraph carries both sentences.
      expect(order.parentElement).toBe(inherit.parentElement);
      expect(order.parentElement).toHaveTextContent(/Toggle to attach\.\s+Any agent using this skill inherits/);
    });

    it("lists the skill's own documents in attachment order, with no inherited rows", async () => {
      renderEditor("context", vi.fn(), WITH_DOCS);
      await screen.findByTestId("context-row-specs/b.md");
      expect(screen.getAllByTestId(/^context-row-/).map((el) => el.getAttribute("data-testid"))).toEqual([
        "context-row-specs/b.md",
        "context-row-docs/a.md",
        "context-row-insights/c.md",
      ]);
      expect(screen.queryByText(/^via /)).not.toBeInTheDocument();
    });

    it('shows a "SERIALIZES AS" box with ## Project context and one `- <path>` line per document in attachment order', async () => {
      renderEditor("context", vi.fn(), WITH_DOCS);
      const heading = await screen.findByText("SERIALIZES AS");
      const box = within(heading.closest("section")!).getByText(/## Project context/);
      expect(box.textContent).toBe("## Project context\n- specs/b.md\n- docs/a.md");
    });

    it("saves the full ordered list through the skill hook when a row is checked", async () => {
      renderEditor("context", vi.fn(), WITH_DOCS);
      fireEvent.click(await screen.findByRole("checkbox", { name: "insights/c.md" }));
      await waitFor(() =>
        expect(setDocs).toHaveBeenCalledWith({ id: "sk1", paths: ["specs/b.md", "docs/a.md", "insights/c.md"] }),
      );
    });

    it("does not touch the skill's version when attachments change (AC-76 on the client)", async () => {
      renderEditor("context", vi.fn(), WITH_DOCS);
      fireEvent.click(await screen.findByRole("checkbox", { name: "insights/c.md" }));
      await waitFor(() => expect(setDocs).toHaveBeenCalled());
      expect(update).not.toHaveBeenCalled();
      expect(screen.getByText("v2")).toBeInTheDocument();
    });
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
