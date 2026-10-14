import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CiInstallResult, Repo } from "@devdigest/shared";
import { apiError } from "@/test/context-docs-fixtures";
import { WORKFLOW_PATH, installationOf, previewOf, repoOf } from "@/test/ci-fixtures";
import { CHECK_WAIT, continueBtn, renderWizard, toInstall, toPreview } from "@/test/ci-wizard-harness";

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

beforeEach(() => {
  repos = [repoOf("acme/api")];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  repos = [];
  document.body.innerHTML = "";
});

const PR_URL = "https://github.com/acme/api/pull/7";
const prResult = (over: Partial<CiInstallResult> = {}): CiInstallResult => ({
  installation: installationOf("i1", { status: "pr_open", pr_url: PR_URL }),
  pr_url: PR_URL,
  files_count: 5,
  zip_base64: null,
  ...over,
});

const installBtn = () => screen.getByRole("button", { name: "Install" });
const installPosts = (fx: ReturnType<typeof renderWizard>["fx"]) =>
  fx.requests.filter((r) => r.method === "POST" && r.path === "/agents/ag1/ci/install");

describe("InstallStep — options (AC-29, AC-67)", () => {
  it("offers a pull request (recommended, selected) and a zip, stating repository, title, branch and file count", async () => {
    renderWizard();
    await toInstall();

    const pr = screen.getByRole("radio", { name: /Open a (PR|pull request) with these files/ });
    expect(pr).toBeChecked();
    const card = within(pr.closest("label")!);
    expect(card.getByText("recommended")).toBeInTheDocument();
    expect(card.getByText("DevDigest opens a pull request in acme/api with 5 files.")).toBeInTheDocument();
    expect(card.getByText(/Add DevDigest CI review/)).toBeInTheDocument();
    expect(card.getByText(/devdigest\/ci/)).toBeInTheDocument();

    const zip = screen.getByRole("radio", { name: /Copy files as a zip/ });
    expect(zip).not.toBeChecked();
    expect(within(zip.closest("label")!).getByText("add them manually")).toBeInTheDocument();
    expect(screen.queryByText(/Your edited workflow file is kept/)).not.toBeInTheDocument();
  });

  it("names the pull-request option exactly as the spec does (AC-29, AC-30, AC-36)", async () => {
    renderWizard();
    await toInstall();
    expect(screen.getByRole("radio", { name: /Open a PR with these files/ })).toBeInTheDocument();
  });

  it("says the Configure choices are not applied when the user kept an edited workflow over them", async () => {
    renderWizard();
    await toPreview();
    fireEvent.change(screen.getByRole("textbox", { name: `Contents of ${WORKFLOW_PATH}` }), {
      target: { value: "name: my edit\n" },
    });
    await waitFor(() => expect(continueBtn()).toBeEnabled(), CHECK_WAIT);
    fireEvent.click(continueBtn());
    await screen.findByRole("heading", { name: "Trigger" });
    fireEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    fireEvent.click(continueBtn());
    fireEvent.click(await screen.findByRole("button", { name: "Keep my edits" }));

    expect(await screen.findByText(/are not applied to it/)).toHaveTextContent(
      "Your edited workflow file is kept, so the triggers and “Post results as” chosen in Configure are not applied to it.",
    );
  });
});

describe("InstallStep — open a PR (AC-33, AC-71, AC-77)", () => {
  it("sends the wizard's choices and edited workflow, then announces the result with a safe PR link and the three next steps in order", async () => {
    const { fx, onClose } = renderWizard({ routes: { "POST /agents/ag1/ci/install": () => prResult() } });
    await toInstall();
    fireEvent.click(installBtn());

    const link = await screen.findByRole("link", { name: "Open the pull request on GitHub" });
    expect(link).toHaveAttribute("href", PR_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");

    // Announced through a polite live region.
    const status = screen.getByText("The pull request is ready in acme/api.");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");

    const steps = within(screen.getByRole("region", { name: "Next steps" })).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Add OPENROUTER_API_KEY to the repository's Actions secrets.");
    const secrets = within(steps[0]!).getByRole("link", { name: "Open the Actions secrets settings" });
    expect(secrets).toHaveAttribute("href", "https://github.com/acme/api/settings/secrets/actions");
    expect(secrets).toHaveAttribute("target", "_blank");
    expect(steps[1]).toHaveTextContent("Review and merge the pull request.");
    expect(steps[2]).toHaveTextContent("required status check");

    expect(installPosts(fx)).toHaveLength(1);
    expect(installPosts(fx)[0]!.body).toEqual({
      repo: "acme/api",
      triggers: ["opened", "synchronize"],
      post_as: "github_review",
      workflow: previewOf().files.find((f) => f.editable)!.contents,
      action: "open_pr",
      acknowledge_risk: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("never turns a PR URL that is not on github.com into a link", async () => {
    renderWizard({
      routes: { "POST /agents/ag1/ci/install": () => prResult({ pr_url: "javascript:alert(document.cookie)" }) },
    });
    await toInstall();
    fireEvent.click(installBtn());

    await screen.findByText("The pull request is ready in acme/api.");
    expect(screen.queryByRole("link", { name: "Open the pull request on GitHub" })).not.toBeInTheDocument();
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("javascript:"))).toBe(false);
  });

  it("links the help text to GitHub's Actions-secrets docs in a new tab", async () => {
    renderWizard();
    await toInstall();
    const help = screen.getByRole("link", { name: "GitHub Action setup docs" });
    expect(help.getAttribute("href")).toMatch(/^https:\/\/docs\.github\.com\/.*secrets/);
    expect(help).toHaveAttribute("target", "_blank");
    expect(help.getAttribute("rel")).toContain("noopener");
  });
});

describe("InstallStep — GitHub rejects the install (AC-34, EC-17)", () => {
  const FORBIDDEN = apiError(
    502,
    "Resource not accessible by integration",
    { needed_permissions: "Contents: write, Pull requests: write, Workflows: write" },
    "external_service",
  );

  it("stays on Install with GitHub's reason and the needed permissions, keeps the choice and lets the user retry", async () => {
    let calls = 0;
    const { fx } = renderWizard({
      routes: { "POST /agents/ag1/ci/install": () => (++calls === 1 ? FORBIDDEN : prResult()) },
    });
    await toInstall();
    fireEvent.click(screen.getByRole("radio", { name: /Copy files as a zip/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Open a (PR|pull request) with these files/ }));
    fireEvent.click(installBtn());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("GitHub rejected the install: Resource not accessible by integration");
    expect(alert).toHaveTextContent("Contents: write, Pull requests: write, Workflows: write");
    expect(screen.getByRole("radio", { name: /Open a (PR|pull request) with these files/ })).toBeChecked();
    expect(screen.queryByRole("link", { name: "Open the pull request on GitHub" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Open the pull request on GitHub" })).toBeInTheDocument();
    expect(installPosts(fx)).toHaveLength(2);
    expect(installPosts(fx)[1]!.body).toEqual(installPosts(fx)[0]!.body);
  });

  it("shows a GitHub error that contains markup as plain text", async () => {
    renderWizard({
      routes: {
        "POST /agents/ag1/ci/install": () => apiError(502, "<img src=x onerror=alert(1)>Bad credentials", undefined, "external_service"),
      },
    });
    await toInstall();
    fireEvent.click(installBtn());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("<img src=x onerror=alert(1)>Bad credentials");
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("InstallStep — double activation (AC-35, EC-18)", () => {
  it("sends one request, disables Install and Back and shows progress while it runs", async () => {
    let release: (r: CiInstallResult) => void = () => {};
    const { fx } = renderWizard({
      routes: { "POST /agents/ag1/ci/install": () => new Promise<CiInstallResult>((res) => (release = res)) },
    });
    await toInstall();

    fireEvent.click(installBtn());
    const busy = await screen.findByRole("button", { name: "Installing…" });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    fireEvent.click(busy);
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByText("Installing, please wait…")).toBeInTheDocument();
    expect(installPosts(fx)).toHaveLength(1);

    await act(async () => release(prResult()));
    expect(await screen.findByRole("link", { name: "Open the pull request on GitHub" })).toBeInTheDocument();
    expect(installPosts(fx)).toHaveLength(1);
  });
});

describe("InstallStep — no GitHub token (AC-36, EC-19)", () => {
  it("disables the pull-request option with the reason and a Settings link, and the zip still works", async () => {
    const { fx } = renderWizard({
      routes: {
        "POST /agents/ag1/ci/preview": () => previewOf({ github_token_configured: false }),
        "POST /agents/ag1/ci/install": () => prResult({ pr_url: null, zip_base64: btoa("PK-zip") }),
      },
    });
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await toInstall();

    const pr = screen.getByRole("radio", { name: /Open a (PR|pull request) with these files/ });
    expect(pr).toBeDisabled();
    expect(pr).toHaveAccessibleDescription(/No GitHub token is configured/);
    expect(screen.getByRole("link", { name: "Add one in Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");
    const zip = screen.getByRole("radio", { name: /Copy files as a zip/ });
    expect(zip).toBeChecked();
    expect(zip).toBeEnabled();

    fireEvent.click(installBtn());
    await screen.findByText("The zip was downloaded. Add its files to acme/api manually.");
    expect(installPosts(fx)[0]!.body).toMatchObject({ action: "zip" });
  });
});

describe("InstallStep — zip (AC-37)", () => {
  it("downloads the decoded zip under the agent's name and lists the manual next steps", async () => {
    const bytes = "PK\u0003\u0004zip-body"; // 12 bytes once decoded
    const { fx } = renderWizard({
      routes: {
        "POST /agents/ag1/ci/install": () =>
          prResult({
            pr_url: null,
            zip_base64: btoa(bytes),
            installation: installationOf("i1", { status: "awaiting_manual" }),
          }),
      },
    });
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => (created.push(b as Blob), "blob:zip"));
    URL.revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    await toInstall();
    fireEvent.click(screen.getByRole("radio", { name: /Copy files as a zip/ }));
    fireEvent.click(installBtn());

    await screen.findByText("The zip was downloaded. Add its files to acme/api manually.");
    expect(installPosts(fx)[0]!.body).toMatchObject({ action: "zip", repo: "acme/api" });
    expect(downloads).toEqual(["devdigest-ci-security-reviewer.zip"]);
    expect(created).toHaveLength(1);
    expect(created[0]!.type).toBe("application/zip");
    expect(created[0]!.size).toBe(bytes.length);
    expect(screen.queryByRole("link", { name: "Open the pull request on GitHub" })).not.toBeInTheDocument();
    expect(screen.getByText("Unpack the zip at the repository root, then commit and push the files.")).toBeInTheDocument();
  });
});
