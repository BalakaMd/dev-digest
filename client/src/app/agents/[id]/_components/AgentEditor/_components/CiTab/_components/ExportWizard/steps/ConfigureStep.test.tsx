import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Repo } from "@devdigest/shared";
import { apiError } from "@/test/context-docs-fixtures";
import { WORKFLOW_PATH, previewOf, fileOf, repoOf } from "@/test/ci-fixtures";
import { CHECK_WAIT, continueBtn, renderWizard, toConfigure, toPreview } from "@/test/ci-wizard-harness";

let repos: Repo[] = [];
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: repos[0]?.id ?? null,
    repos,
    activeRepo: repos[0] ?? null,
    reposLoaded: true,
    setRepoId: () => {},
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  repos = [];
  document.body.innerHTML = "";
});

const trigger = (name: string) => screen.getByRole("button", { name: `pull_request:${name}` });

describe("ConfigureStep — triggers (AC-24, AC-25, EC-13)", () => {
  it("starts with opened and synchronize pressed, reopened optional, and toggles with aria-pressed", async () => {
    repos = [repoOf("acme/api")];
    renderWizard();
    await toConfigure();

    expect(trigger("opened")).toHaveAttribute("aria-pressed", "true");
    expect(trigger("synchronize")).toHaveAttribute("aria-pressed", "true");
    expect(trigger("reopened")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(trigger("reopened"));
    expect(trigger("reopened")).toHaveAttribute("aria-pressed", "true");
  });

  it("blocks Continue with a reason while every trigger is deselected", async () => {
    repos = [repoOf("acme/api")];
    renderWizard();
    await toConfigure();

    fireEvent.click(trigger("opened"));
    fireEvent.click(trigger("synchronize"));
    expect(continueBtn()).toBeDisabled();
    expect(continueBtn()).toHaveAccessibleDescription("Select at least one trigger");
    fireEvent.click(trigger("opened"));
    expect(continueBtn()).toBeEnabled();
  });
});

describe("ConfigureStep — post results as (AC-27, AC-28)", () => {
  it("defaults to GitHub review (recommended), offers PR comment and none, and shows the branch-protection note", async () => {
    repos = [repoOf("acme/api")];
    renderWizard();
    await toConfigure();

    const group = within(screen.getByRole("group", { name: "Post results as" }));
    expect(group.getByRole("radio", { name: /GitHub review/ })).toBeChecked();
    expect(group.getByText("recommended")).toBeInTheDocument();
    fireEvent.click(group.getByRole("radio", { name: "PR comment" }));
    expect(group.getByRole("radio", { name: "PR comment" })).toBeChecked();
    expect(group.getByRole("radio", { name: "None (exit code only)" })).not.toBeChecked();
    expect(screen.getByText(/add a required status check in the repository's branch protection/)).toBeInTheDocument();
  });
});

describe("ConfigureStep — secrets status (AC-26, EC-14)", () => {
  const row = () => within(screen.getByText("OPENROUTER_API_KEY").closest("li")!);

  it.each([
    ["set", "set"],
    ["not_set", "not set"],
    ["unknown", "unknown"],
  ] as const)("shows the repository's OPENROUTER_API_KEY as %s", async (status, text) => {
    repos = [repoOf("acme/api")];
    renderWizard({
      routes: { "GET /agents/ag1/ci/secrets": { github_token_configured: true, openrouter_key: status } },
    });
    await toConfigure();
    expect(await row().findByText(text)).toBeInTheDocument();
  });

  it("says unknown, not \"not set\", when the lookup itself fails", async () => {
    repos = [repoOf("acme/api")];
    renderWizard({ routes: { "GET /agents/ag1/ci/secrets": apiError(502, "GitHub unreachable") } });
    await toConfigure();
    expect(await row().findByText("unknown")).toBeInTheDocument();
    expect(row().queryByText("not set")).not.toBeInTheDocument();
  });
});

describe("ConfigureStep — changed choices after editing the workflow (AC-16, EC-8)", () => {
  async function editThenChangeTriggers() {
    repos = [repoOf("acme/api")];
    const regenerated = previewOf({
      files: [fileOf(WORKFLOW_PATH, { editable: true, contents: "name: regenerated\n", size_bytes: 18 })],
    });
    let calls = 0;
    const view = renderWizard({
      routes: { "POST /agents/ag1/ci/preview": () => (++calls === 1 ? previewOf() : regenerated) },
    });
    await toPreview();
    fireEvent.change(screen.getByRole("textbox", { name: `Contents of ${WORKFLOW_PATH}` }), {
      target: { value: "name: my edit\n" },
    });
    await waitFor(() => expect(continueBtn()).toBeEnabled(), CHECK_WAIT);
    fireEvent.click(continueBtn());
    await screen.findByRole("heading", { name: "Trigger" });
    fireEvent.click(trigger("reopened"));
    fireEvent.click(continueBtn());
    await screen.findByRole("alertdialog", { name: "Replace your workflow edits?" });
    return view;
  }

  it("asks before replacing, and \"Replace edits\" regenerates the file from the new choices", async () => {
    const { fx } = await editThenChangeTriggers();
    fireEvent.click(screen.getByRole("button", { name: "Replace edits" }));

    await screen.findByRole("radio", { name: /Copy files as a zip/ });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("textbox", { name: `Contents of ${WORKFLOW_PATH}` })).toHaveValue(
      "name: regenerated\n",
    );
    const previews = fx.requests.filter((r) => r.path === "/agents/ag1/ci/preview");
    expect(previews).toHaveLength(2);
    expect(previews[1]!.body).toMatchObject({ triggers: ["opened", "synchronize", "reopened"] });
  });

  it("\"Keep my edits\" moves on without regenerating and leaves the edit intact", async () => {
    const { fx } = await editThenChangeTriggers();
    fireEvent.click(screen.getByRole("button", { name: "Keep my edits" }));

    await screen.findByRole("radio", { name: /Copy files as a zip/ });
    expect(fx.count("POST", "/agents/ag1/ci/preview")).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      (await screen.findByRole("textbox", { name: `Contents of ${WORKFLOW_PATH}` })) as HTMLTextAreaElement,
    ).toHaveValue("name: my edit\n");
  });
});
