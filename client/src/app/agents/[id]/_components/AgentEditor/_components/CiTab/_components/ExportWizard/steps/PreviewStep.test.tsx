import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CiCheckResult, Repo } from "@devdigest/shared";
import { apiError } from "@/test/context-docs-fixtures";
import { CLEAN_CHECK, WORKFLOW_PATH, previewOf, repoOf } from "@/test/ci-fixtures";
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

const SKILL_PATH = ".devdigest/skills/owasp-top-10/SKILL.md";
const RUNNER_PATH = ".devdigest/runner/index.js";

const fileButton = (path: string) => within(screen.getByRole("list", { name: "Files to create" })).getByRole("button", { name: new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
const editor = () => screen.getByRole("textbox", { name: `Contents of ${WORKFLOW_PATH}` });

describe("PreviewStep — files (AC-9, AC-10, AC-70)", () => {
  it("lists exactly the files the install creates, in order, with only the workflow editable and the runner shown by size", async () => {
    repos = [repoOf("acme/api")];
    renderWizard({ routes: { "POST /agents/ag1/ci/preview": () => previewOf({ context_docs_count: 2 }) } });
    await toPreview();

    const list = screen.getByRole("list", { name: "Files to create" });
    const paths = within(list)
      .getAllByRole("listitem")
      .map((li) => li.querySelector(".mono")!.textContent);
    expect(paths).toEqual([
      ".devdigest/agents/security-reviewer.yaml",
      SKILL_PATH,
      ".devdigest/memory.jsonl",
      RUNNER_PATH,
      WORKFLOW_PATH,
    ]);
    expect(fileButton(RUNNER_PATH)).toHaveTextContent("2.3 MB");

    // The workflow opens first and is the one editable file.
    expect(editor()).toHaveValue(previewOf().files.at(-1)!.contents);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);

    fireEvent.click(fileButton(SKILL_PATH));
    expect(screen.getByLabelText(`Contents of ${SKILL_PATH} (read-only)`)).toHaveTextContent(`contents of ${SKILL_PATH}`);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(fileButton(RUNNER_PATH));
    expect(screen.getByText("Bundled agent-runner, 2.3 MB. Its contents are not shown.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Contents of .devdigest\/runner\/index.js/)).not.toBeInTheDocument();

    expect(screen.getByText("Not carried into CI: project context documents (2), repo intel")).toBeInTheDocument();
  });

  it("offers a retry when the files could not be generated", async () => {
    repos = [repoOf("acme/api")];
    let calls = 0;
    renderWizard({
      routes: {
        "POST /agents/ag1/ci/preview": () => (++calls === 1 ? apiError(500, "boom") : previewOf()),
      },
    });
    await waitFor(() => expect(continueBtn()).toBeEnabled());
    fireEvent.click(continueBtn());

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("list", { name: "Files to create" })).toBeInTheDocument();
  });
});

describe("PreviewStep — workflow checks (AC-23, AC-74, AC-68, EC-9, EC-35)", () => {
  const YAML_ERROR: CiCheckResult = { yaml_error: { line: 3, message: "bad indentation" }, risks: [], leaks: [] };

  it("shows the YAML error with its line and blocks Continue until the file parses again", async () => {
    repos = [repoOf("acme/api")];
    const { fx } = renderWizard({
      routes: {
        "POST /agents/ag1/ci/check": (req) =>
          (req.body as { workflow: string }).workflow.includes("\t") ? YAML_ERROR : CLEAN_CHECK,
      },
    });
    await toPreview();

    fireEvent.change(editor(), { target: { value: "name: x\non:\n\tbroken" } });
    expect(await screen.findByText("Not valid YAML (line 3): bad indentation", undefined, CHECK_WAIT)).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();
    expect(continueBtn()).toHaveAccessibleDescription("Fix the YAML error in the workflow file to continue.");
    // The server was asked about exactly what was typed.
    const checks = fx.requests.filter((r) => r.path === "/agents/ag1/ci/check");
    expect((checks.at(-1)!.body as { workflow: string }).workflow).toBe("name: x\non:\n\tbroken");

    fireEvent.change(editor(), { target: { value: "name: fixed\n" } });
    await waitFor(() => expect(continueBtn()).toBeEnabled(), CHECK_WAIT);
    expect(screen.queryByText(/Not valid YAML/)).not.toBeInTheDocument();
  });

  it("lists a risky construct and lets the user go on only after ticking \"I understand the risk\"", async () => {
    repos = [repoOf("acme/api")];
    renderWizard({
      routes: {
        "POST /agents/ag1/ci/check": {
          yaml_error: null,
          leaks: [],
          risks: [
            { kind: "trigger", detail: "pull_request_target runs with write access on forks", risk: true },
            { kind: "fork_skip", detail: "fork guard kept", risk: false },
          ],
        } satisfies CiCheckResult,
      },
    });
    await toPreview();

    expect(await screen.findByText(/pull_request_target runs with write access on forks/, undefined, CHECK_WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/fork guard kept/)).not.toBeInTheDocument(); // only real risks are listed
    expect(continueBtn()).toBeDisabled();
    expect(continueBtn()).toHaveAccessibleDescription(/I understand the risk/);

    fireEvent.click(screen.getByRole("checkbox", { name: "I understand the risk" }));
    expect(continueBtn()).toBeEnabled();
  });

  it("shows a secret-like value by file and line, masked, and blocks Continue", async () => {
    repos = [repoOf("acme/api")];
    renderWizard({
      routes: {
        "POST /agents/ag1/ci/check": {
          yaml_error: null,
          risks: [],
          leaks: [{ path: ".devdigest/agents/security-reviewer.yaml", line: 12, masked: "sk-or-v1-••••" }],
        } satisfies CiCheckResult,
      },
    });
    await toPreview();

    const alert = await screen.findByText("Secret-like values found", undefined, CHECK_WAIT);
    const box = alert.closest("[role=alert]") as HTMLElement;
    expect(box).toHaveTextContent(".devdigest/agents/security-reviewer.yaml, line 12: sk-or-v1-••••");
    expect(continueBtn()).toBeDisabled();
    expect(continueBtn()).toHaveAccessibleDescription("Remove the secret-like value from the files to continue.");
  });
});
