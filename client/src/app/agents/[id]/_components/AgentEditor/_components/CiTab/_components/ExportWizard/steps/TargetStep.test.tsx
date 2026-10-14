import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Repo } from "@devdigest/shared";
import { agentOf, installationOf, repoOf } from "@/test/ci-fixtures";
import { continueBtn, renderWizard } from "@/test/ci-wizard-harness";

let repos: Repo[] = [];
let reposLoaded = true;
/** When set, the active repository is this one (or none, for null) instead of `repos[0]`. */
let activeOverride: { repo: Repo | null } | null = null;
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => {
    const activeRepo = activeOverride ? activeOverride.repo : (repos[0] ?? null);
    return { repoId: activeRepo?.id ?? null, repos, activeRepo, reposLoaded, setRepoId: () => {} };
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  repos = [];
  reposLoaded = true;
  activeOverride = null;
  document.body.innerHTML = "";
});

describe("TargetStep — target cards (AC-5, AC-6, EC-1)", () => {
  it("offers GitHub Actions as the selected, recommended target", () => {
    repos = [repoOf("acme/api")];
    renderWizard();

    const gha = screen.getByRole("radio", { name: /GitHub Actions/ });
    expect(gha).toBeChecked();
    expect(gha).toBeEnabled();
    expect(gha).toHaveAccessibleDescription("Runs on pull_request events");
    expect(within(gha.closest("label")!).getByText("recommended")).toBeInTheDocument();
  });

  it("shows CircleCI, Jenkins and Generic CLI disabled, with \"Coming soon\" as their description", () => {
    repos = [repoOf("acme/api")];
    renderWizard();

    for (const name of ["CircleCI", "Jenkins", "Generic CLI"]) {
      const card = screen.getByRole("radio", { name: new RegExp(name) });
      expect(card).toBeDisabled();
      expect(card).not.toBeChecked();
      expect(card).toHaveAccessibleDescription("Coming soon");
    }
  });
});

describe("TargetStep — repository picker (AC-7, AC-66, EC-2)", () => {
  it("lists the imported repositories as owner/name, preselects the active one and marks installed ones", async () => {
    repos = [repoOf("acme/api"), repoOf("acme/web")];
    renderWizard({ routes: { "GET /agents/ag1/ci/installations": [installationOf("i1", { repo: "acme/web" })] } });

    const api = screen.getByRole("radio", { name: "acme/api" });
    const web = screen.getByRole("radio", { name: /acme\/web/ });
    expect(api).toBeChecked();
    expect(web).not.toBeChecked();
    expect(await within(web.closest("label")!).findByText("installed")).toBeInTheDocument();
    expect(within(api.closest("label")!).queryByText("installed")).not.toBeInTheDocument();

    fireEvent.click(web);
    expect(web).toBeChecked();
    expect(continueBtn()).toBeEnabled();
  });

  it("shows an empty picker with a link to import a repository and keeps Continue disabled when there is none", () => {
    repos = [];
    renderWizard();

    expect(screen.queryByRole("radio", { name: "acme/api" })).not.toBeInTheDocument();
    expect(screen.getByText(/No repository has been imported yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import a repository" })).toHaveAttribute("href", "/onboarding");
    expect(continueBtn()).toBeDisabled();
    expect(continueBtn()).toHaveAccessibleDescription("Choose a repository to continue.");
  });
});

describe("TargetStep — default repository (AC-7)", () => {
  it("preselects the first repository and enables Continue when the stored active repo is stale", () => {
    repos = [repoOf("acme/api"), repoOf("acme/web")];
    activeOverride = { repo: null }; // repos loaded, but the stored repo id is not among them
    renderWizard();

    expect(screen.getByRole("radio", { name: "acme/api" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "acme/web" })).not.toBeChecked();
    expect(continueBtn()).toBeEnabled();
  });

  it("selects the active repository when it arrives after the wizard mounted and nothing was chosen", () => {
    repos = [];
    reposLoaded = false;
    activeOverride = { repo: null };
    const { rerenderWizard } = renderWizard();
    expect(continueBtn()).toBeDisabled();

    repos = [repoOf("acme/api"), repoOf("acme/web")];
    reposLoaded = true;
    activeOverride = { repo: repos[1]! };
    rerenderWizard();

    expect(screen.getByRole("radio", { name: "acme/web" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "acme/api" })).not.toBeChecked();
    expect(continueBtn()).toBeEnabled();
  });

  it("keeps the repository the user clicked when the active repository arrives later", () => {
    repos = [repoOf("acme/api"), repoOf("acme/web"), repoOf("acme/docs")];
    activeOverride = { repo: null };
    const { rerenderWizard } = renderWizard();
    fireEvent.click(screen.getByRole("radio", { name: "acme/web" }));
    expect(screen.getByRole("radio", { name: "acme/web" })).toBeChecked();

    activeOverride = { repo: repos[2]! };
    rerenderWizard();

    expect(screen.getByRole("radio", { name: "acme/web" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "acme/docs" })).not.toBeChecked();
  });

  it("keeps the repository given by `initial` when the active repository arrives later", () => {
    repos = [repoOf("acme/api"), repoOf("acme/web")];
    reposLoaded = false;
    activeOverride = { repo: null };
    const { rerenderWizard } = renderWizard({
      initial: { repo: "acme/web", triggers: ["opened"], postAs: "none" },
    });
    expect(screen.getByRole("radio", { name: "acme/web" })).toBeChecked();

    reposLoaded = true;
    activeOverride = { repo: repos[0]! };
    rerenderWizard();

    expect(screen.getByRole("radio", { name: "acme/web" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "acme/api" })).not.toBeChecked();
  });
});

describe("TargetStep — agent that cannot be exported (AC-8)", () => {
  it("blocks Continue with the OpenRouter reason for a non-OpenRouter agent", async () => {
    repos = [repoOf("acme/api")];
    renderWizard({ agent: agentOf({ provider: "anthropic" }) });

    expect(screen.getByRole("alert")).toHaveTextContent("CI runs use OpenRouter");
    await waitFor(() => expect(continueBtn()).toBeDisabled());
    expect(continueBtn()).toHaveAccessibleDescription(/CI runs use OpenRouter/);
  });
});
