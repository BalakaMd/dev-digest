import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Repo } from "@devdigest/shared";
import { repoOf, WORKFLOW_PATH } from "@/test/ci-fixtures";
import { CHECK_WAIT, continueBtn, renderWizard, toPreview } from "@/test/ci-wizard-harness";

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

const editor = () => screen.getByRole("textbox", { name: `Contents of ${WORKFLOW_PATH}` }) as HTMLTextAreaElement;
const editWorkflow = (text: string) => fireEvent.change(editor(), { target: { value: text } });
const stepItem = (name: string) => within(screen.getByRole("list", { name: "Export steps" })).getByText(name).closest("li")!;

describe("ExportWizard — dialog frame (AC-1, NFR-3)", () => {
  it("opens as a named modal dialog with the agent in the subtitle and the Target step current", () => {
    repos = [repoOf("acme/api")];
    renderWizard();

    const dialog = screen.getByRole("dialog", { name: "Export to CI" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Run Security Reviewer automatically on pull requests")).toBeInTheDocument();
    expect(stepItem("Target")).toHaveAttribute("aria-current", "step");
    expect(stepItem("Preview")).not.toHaveAttribute("aria-current");
  });

  it("keeps Tab inside the dialog and gives focus back to the opener when it closes", () => {
    repos = [repoOf("acme/api")];
    const opener = document.createElement("button");
    opener.textContent = "Add to CI";
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderWizard();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    const close = screen.getByRole("button", { name: "Close" });
    const last = continueBtn();
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close); // wrapped from the last control to the first
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last); // and back

    unmount();
    expect(document.activeElement).toBe(opener);
  });
});

describe("ExportWizard — steps and state (AC-2, AC-3)", () => {
  it("marks a finished step with a check and the text \"completed\" and moves the current marker on", async () => {
    repos = [repoOf("acme/api")];
    renderWizard();
    await toPreview();

    const target = stepItem("Target");
    expect(target).not.toHaveAttribute("aria-current");
    expect(within(target).getByText("completed")).toBeInTheDocument();
    expect(target.querySelector("svg")).not.toBeNull();
    expect(stepItem("Preview")).toHaveAttribute("aria-current", "step");
  });

  it("keeps the edited workflow when the user goes Back twice and forward again", async () => {
    repos = [repoOf("acme/api")];
    const { fx } = renderWizard();
    await toPreview();
    editWorkflow("name: my edited workflow\n");
    await waitFor(() => expect(continueBtn()).toBeEnabled(), CHECK_WAIT);
    fireEvent.click(continueBtn()); // -> Configure
    fireEvent.click(screen.getByRole("button", { name: "Back" })); // -> Preview
    fireEvent.click(screen.getByRole("button", { name: "Back" })); // -> Target
    expect(stepItem("Target")).toHaveAttribute("aria-current", "step");

    fireEvent.click(continueBtn());
    await screen.findByRole("list", { name: "Files to create" });
    expect(editor().value).toBe("name: my edited workflow\n");
    expect(fx.count("POST", "/agents/ag1/ci/preview")).toBe(1); // nothing was regenerated over the edit
  });
});

describe("ExportWizard — closing (AC-4, AC-72, EC-12)", () => {
  it("closes on Escape without any write when nothing was edited", async () => {
    repos = [repoOf("acme/api")];
    const { fx, onClose } = renderWizard();
    await toPreview();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fx.requests.some((r) => r.path.endsWith("/ci/install"))).toBe(false);
  });

  it("asks before dropping workflow edits; \"Keep editing\" returns to the untouched editor", async () => {
    repos = [repoOf("acme/api")];
    const { fx, onClose } = renderWizard();
    await toPreview();
    editWorkflow("name: precious edit\n");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "Discard your workflow edits?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(editor().value).toBe("name: precious edit\n");

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fx.requests.some((r) => r.path.endsWith("/ci/install"))).toBe(false);
  });
});
