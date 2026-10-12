import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, CiInstallation } from "@devdigest/shared";
import ci from "../../../../../../../../messages/en/ci.json";
import agents from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { installFetch } from "../../../../../../../test/context-docs-fixtures";
import { agentOf, installationOf, runOf } from "../../../../../../../test/ci-fixtures";
import { CiTab } from "./CiTab";
import type { WizardProps } from "./constants";

beforeEach(() => {
  // Fixed "now" for relative times; only Date is faked so timers and queries keep running.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-29T09:04:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Stands in for the Export wizard: records what the tab hands it. */
function WizardStub({ initial, onClose }: WizardProps) {
  return (
    <div role="dialog" aria-label="wizard stub" data-initial={JSON.stringify(initial ?? null)}>
      <button onClick={onClose}>close stub</button>
    </div>
  );
}
const initialOf = () => JSON.parse(screen.getByRole("dialog", { name: "wizard stub" }).getAttribute("data-initial")!);

const OK = { degraded: false, message: null };
const NO_RUNS = { items: [], next_cursor: null };

function renderTab(agent: Agent, onTab = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ ci, agents }}>
        <ToastProvider>
          <CiTab agent={agent} onTab={onTab} Wizard={WizardStub} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, onTab };
}

function routes(installs: CiInstallation[], runs: unknown = NO_RUNS, refresh: unknown = OK) {
  return installFetch({
    "GET /agents/ag1/ci/installations": installs,
    "POST /ci/refresh": refresh as object,
    "GET /ci/runs": runs as object,
  });
}

describe("CiTab — installations (AC-39, AC-40, AC-33)", () => {
  it("shows the heading, the Active-in-N badge (installed only), both buttons, one row per installation and the Add repository row", async () => {
    routes([
      installationOf("i1", {
        repo: "acme/api",
        status: "installed",
        latest_run: runOf("r1", { verdict: "approve" }),
      }),
      installationOf("i2", { repo: "acme/web", status: "pr_open", pr_url: "https://github.com/acme/web/pull/9" }),
    ]);
    renderTab(agentOf({ version: 3 }));

    expect(screen.getByRole("heading", { name: "CI deployment" })).toBeInTheDocument();
    expect(await screen.findByText("Active in 1 repo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update CI config" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add to CI" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add repository" })).toBeInTheDocument();

    const installed = within(screen.getByTestId("ci-installation-i1"));
    expect(installed.getByText("acme/api")).toBeInTheDocument();
    expect(installed.getByText("GitHub Actions")).toBeInTheDocument();
    expect(installed.getByText("Installed")).toBeInTheDocument();
    expect(installed.getByText("Latest run: Approve")).toBeInTheDocument();
    expect(installed.getByText("v3")).toBeInTheDocument();
    expect(installed.getByText(/Changed .*ago/)).toHaveTextContent("Changed 4 min. ago");

    const open = within(screen.getByTestId("ci-installation-i2"));
    expect(open.getByText("PR open")).toBeInTheDocument();
    expect(open.getByText("Latest run: No run yet")).toBeInTheDocument();
    expect(screen.queryByText("Config out of date")).not.toBeInTheDocument();
  });

  it("flags an installation exported from an older agent version and Update opens the wizard for that repository (AC-69, EC-22)", async () => {
    routes([installationOf("i1", { repo: "acme/api", exported_agent_version: 3, triggers: ["opened"], post_as: "pr_comment" })]);
    renderTab(agentOf({ version: 5 }));

    expect(await screen.findByText("Config out of date")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update CI config for acme/api" }));
    expect(initialOf()).toEqual({ repo: "acme/api", triggers: ["opened"], postAs: "pr_comment" });
  });

  it("shows only the explanation and Add to CI when the agent has no installation (AC-41, EC-20, AC-1)", async () => {
    routes([]);
    renderTab(agentOf());

    expect(await screen.findByText("Not exported to CI yet")).toBeInTheDocument();
    expect(screen.getByText(/Export to CI adds a workflow/)).toBeInTheDocument();
    expect(screen.queryByText(/Active in/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update CI config" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add to CI" }));
    expect(screen.getByRole("dialog", { name: "wizard stub" })).toBeInTheDocument();
    expect(initialOf()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "close stub" }));
    expect(screen.queryByRole("dialog", { name: "wizard stub" })).not.toBeInTheDocument();
  });
});

describe("CiTab — agent that cannot be exported (AC-8, EC-34)", () => {
  it("disables both buttons for a non-OpenRouter agent, names the reason and links to the Config tab", async () => {
    routes([installationOf("i1")]);
    const { onTab } = renderTab(agentOf({ provider: "openai" }));

    const add = await screen.findByRole("button", { name: "Add to CI" });
    expect(add).toBeDisabled();
    expect(screen.getByRole("button", { name: "Update CI config" })).toBeDisabled();
    expect(add).toHaveAccessibleDescription(/CI runs use OpenRouter/);

    fireEvent.click(screen.getByRole("button", { name: "Open the Config tab" }));
    expect(onTab).toHaveBeenCalledWith("config");
  });

  it("still allows export for a disabled agent and says CI runs are not affected", async () => {
    routes([]);
    renderTab(agentOf({ enabled: false }));
    expect(await screen.findByText("This agent is disabled in the studio; CI runs are not affected.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to CI" })).toBeEnabled();
  });
});

describe("CiTab — run history (AC-43, AC-58)", () => {
  it("lists the agent's runs without the agent column and filters them by installation", async () => {
    const fx = routes(
      [installationOf("i1", { repo: "acme/api" }), installationOf("i2", { repo: "acme/web" })],
      { items: [runOf("r1")], next_cursor: null },
    );
    renderTab(agentOf());

    expect(await screen.findByTestId("ci-run-r1")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "CI runs of this agent" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Agent" })).not.toBeInTheDocument();
    expect(new URLSearchParams(fx.requests.find((r) => r.path === "/ci/runs")!.search).get("agent_id")).toBe("ag1");

    const filter = within(await screen.findByRole("group", { name: "Installation" })).getByRole("combobox");
    fireEvent.change(filter, { target: { value: "i2" } });
    await waitFor(() =>
      expect(
        fx.requests.some((r) => r.path === "/ci/runs" && new URLSearchParams(r.search).get("installation_id") === "i2"),
      ).toBe(true),
    );
  });

  it("keeps the stored runs and shows a notice when GitHub could not be read", async () => {
    routes([installationOf("i1")], { items: [runOf("r1")], next_cursor: null }, { degraded: true, message: "Rate limited." });
    renderTab(agentOf());

    expect(await screen.findByTestId("ci-degraded")).toHaveTextContent("Rate limited.");
    expect(screen.getByTestId("ci-run-r1")).toBeInTheDocument();
  });
});

describe("CiTab — Update CI config (AC-42, EC-21)", () => {
  it("opens the wizard straight away, preselected from the last export, when there is exactly one installation", async () => {
    routes([installationOf("i1", { repo: "acme/api", triggers: ["opened", "reopened"], post_as: "none" })]);
    renderTab(agentOf());

    fireEvent.click(await screen.findByRole("button", { name: "Update CI config" }));
    expect(screen.queryByText("Which repository do you want to update?")).not.toBeInTheDocument();
    expect(initialOf()).toEqual({ repo: "acme/api", triggers: ["opened", "reopened"], postAs: "none" });
  });

  it("asks which installation to update when there are several and preselects that one's last export", async () => {
    routes([
      installationOf("i1", { repo: "acme/api", triggers: ["opened"], post_as: "github_review" }),
      installationOf("i2", { repo: "acme/web", triggers: ["synchronize"], post_as: "pr_comment" }),
    ]);
    renderTab(agentOf());

    fireEvent.click(await screen.findByRole("button", { name: "Update CI config" }));
    const picker = within(screen.getByRole("group", { name: "Which repository do you want to update?" }));
    expect(screen.queryByRole("dialog", { name: "wizard stub" })).not.toBeInTheDocument();
    fireEvent.click(picker.getByRole("radio", { name: "acme/web" }));
    fireEvent.click(picker.getByRole("button", { name: "Continue" }));

    expect(initialOf()).toEqual({ repo: "acme/web", triggers: ["synchronize"], postAs: "pr_comment" });
    expect(screen.queryByText("Which repository do you want to update?")).not.toBeInTheDocument();
  });
});

describe("CiTab — Fail CI on (AC-44, AC-45)", () => {
  it("states that a changed value reaches a repository only after its CI config is updated", async () => {
    routes([]);
    renderTab(agentOf({ ci_fail_on: "critical" }));
    const group = await screen.findByRole("group", { name: "Fail CI on" });
    expect(group).toHaveAccessibleDescription(/reaches a repository only after its CI config is updated/);
    expect(within(group).getByRole("combobox")).toHaveValue("critical");
    expect(Array.from(within(group).getAllByRole("option")).map((o) => o.getAttribute("value"))).toEqual([
      "never",
      "critical",
      "warning",
      "any",
    ]);
  });

  it("saves the new value on the agent exactly like the Config tab and reports the new version", async () => {
    const fx = installFetch({
      "GET /agents/ag1/ci/installations": [],
      "POST /ci/refresh": OK,
      "GET /ci/runs": NO_RUNS,
      "PUT /agents/ag1": (req) => agentOf({ ...(req.body as object), version: 4 }),
    });
    renderTab(agentOf({ ci_fail_on: "critical", version: 3 }));

    const group = await screen.findByRole("group", { name: "Fail CI on" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled(); // unchanged value: nothing to save
    fireEvent.change(within(group).getByRole("combobox"), { target: { value: "warning" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(await screen.findByText("Agent saved (v4)")).toBeInTheDocument();
    const put = fx.requests.find((r) => r.method === "PUT")!;
    expect(put.path).toBe("/agents/ag1");
    expect(put.body).toEqual({ ci_fail_on: "warning" });
  });
});
