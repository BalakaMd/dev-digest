import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const parse = vi.fn();
const create = vi.fn();
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: parse, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: create, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

const PREVIEW: SkillImportPreview = {
  name: "contract-breaking-change",
  description: "When a route signature changes, classify it.",
  type: "rubric",
  source: "imported",
  body: "## Breaking vs compatible\n\nRemoving a field is **breaking**.",
  ignored_entries: ["README.md", "scripts/check.sh"],
  warnings: ["1 executable-looking file(s) in the archive were NOT imported and never run: scripts/check.sh"],
};

function renderModal() {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <ImportSkillModal onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

async function upload(name: string) {
  const file = new File(["PK..."], name, { type: "application/zip" });
  fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
  await screen.findByText("Preview");
}

beforeEach(() => {
  parse.mockReset().mockResolvedValue(PREVIEW);
  create.mockReset().mockResolvedValue({ id: "sk9", name: PREVIEW.name });
  push.mockReset();
});
afterEach(cleanup);

describe("ImportSkillModal", () => {
  it("accepts .md and .zip and warns that imported text becomes prompt instructions", () => {
    renderModal();
    expect(screen.getByLabelText("Choose a file")).toHaveAttribute("accept", ".md,.markdown,.zip");
    expect(screen.getByText(/someone else's instructions/)).toBeInTheDocument();
  });

  it("shows a preview of the extracted core and the ignored entries — and saves nothing yet", async () => {
    renderModal();
    await upload("contract-breaking-change.zip");

    expect(parse).toHaveBeenCalledWith(expect.objectContaining({ filename: "contract-breaking-change.zip" }));
    expect(screen.getByRole("heading", { name: "Breaking vs compatible" })).toBeInTheDocument();
    expect(screen.getByText("Not imported (2)")).toBeInTheDocument();
    expect(screen.getByText("scripts/check.sh")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("NOT imported and never run");
    expect(screen.getByLabelText("Name")).toHaveValue("contract-breaking-change");
    expect(create).not.toHaveBeenCalled();
  });

  it("persists the skill as imported only after Save", async () => {
    renderModal();
    await upload("contract-breaking-change.zip");
    fireEvent.click(screen.getByText("Save skill"));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: PREVIEW.name,
        description: PREVIEW.description,
        type: PREVIEW.type,
        body: PREVIEW.body,
        source: "imported",
      }),
    );
    expect(push).toHaveBeenCalledWith("/skills/sk9?tab=preview");
  });
});
