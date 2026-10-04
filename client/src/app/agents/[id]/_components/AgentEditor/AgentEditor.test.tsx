import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkillDetail } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import contextDocs from "../../../../../../messages/en/contextDocs.json";
import { ToastProvider } from "../../../../../lib/toast";
import { entry, installFetch, listOf } from "../../../../../test/context-docs-fixtures";

// Mock the data hooks so the editor renders without a network/query client.
const setDocs = vi.fn();
let linkedSkills: AgentSkillDetail[] = [];
let activeRepoId: string | null = "r1";
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useSetAgentContextDocs: () => ({ mutateAsync: setDocs, isPending: false }),
}));
vi.mock("../../../../../lib/hooks/skills", () => ({
  useAgentSkills: () => ({ data: linkedSkills, isLoading: false, isError: false }),
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: activeRepoId, repos: [], activeRepo: null, reposLoaded: true, setRepoId: () => {} }),
}));

import { AgentEditor } from "./AgentEditor";
import { TABS, VALID_TABS } from "./constants";

beforeEach(() => {
  setDocs.mockReset().mockResolvedValue(undefined);
  linkedSkills = [];
  activeRepoId = "r1";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages, contextDocs }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("has Config, Skills and Context tabs and no others", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Context")).toBeInTheDocument();
    for (const absent of ["Evals", "Stats", "CI"]) expect(screen.queryByText(absent)).not.toBeInTheDocument();
  });
});

describe("Agent Editor — Context tab (AC-10)", () => {
  it("sits after Config and Skills in the tab bar, and is a valid ?tab= value", () => {
    expect(TABS.map((t) => t.key)).toEqual(["config", "skills", "context"]);
    expect(VALID_TABS).toContain("context");
  });

  it("selecting it in the tab bar asks for the context tab", () => {
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);
    fireEvent.click(screen.getByText("Context"));
    expect(onTab).toHaveBeenCalledWith("context");
  });

  it("keeps the plain order hint — the skill-only inherit line is not shown on the agent tab (AC-23)", async () => {
    installFetch({ "GET /repos/r1/context-docs": listOf([entry("specs/api.md")]) });
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(await screen.findByText(/earlier docs appear earlier in the assembled ## Project context block/)).toBeInTheDocument();
    expect(screen.queryByText(/inherits these documents/)).not.toBeInTheDocument();
  });

  it("opens the picker for the active repository when tab is context", async () => {
    installFetch({ "GET /repos/r1/context-docs": listOf([entry("specs/api.md")]) });
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "specs/api.md" })).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
  });
});

describe("Agent Editor — Context tab rows (AC-11, AC-46)", () => {
  const DOCS = [
    entry("docs/alpha.md"),
    entry("docs/own.md"),
    entry("specs/skill-a.md"),
    entry("specs/skill-b.md"),
    entry("specs/skill-off.md"),
    entry("insights/z.md"),
  ];
  const skill = (name: string, enabled: boolean, docs: string[], order: number): AgentSkillDetail => ({
    id: `id-${name}`,
    name,
    description: "",
    type: "rubric",
    source: "manual",
    body: "b",
    enabled,
    version: 1,
    context_docs: docs,
    order,
  });

  beforeEach(() => {
    installFetch({ "GET /repos/r1/context-docs": listOf(DOCS) });
  });

  const rowPaths = () => screen.getAllByTestId(/^context-row-/).map((el) => el.getAttribute("data-testid")!.replace("context-row-", ""));

  it('lists the agent\'s own documents first, then "via <skill>" documents of its enabled skills, then the rest', async () => {
    linkedSkills = [
      skill("rubric", true, ["specs/skill-a.md", "docs/own.md"], 0),
      skill("gate", true, ["specs/skill-b.md"], 1),
      skill("retired", false, ["specs/skill-off.md"], 2),
    ];
    renderWithIntl(<AgentEditor agent={{ ...AGENT, context_docs: ["docs/own.md"] }} tab="context" onTab={() => {}} />);
    await screen.findByTestId("context-row-docs/own.md");

    expect(rowPaths()).toEqual([
      "docs/own.md", // attached
      "specs/skill-a.md", // via rubric (skill link order)
      "specs/skill-b.md", // via gate
      "docs/alpha.md", // the rest, by path …
      "insights/z.md",
      "specs/skill-off.md", // … including the document of the disabled skill
    ]);
    expect(within(screen.getByTestId("context-row-specs/skill-a.md")).getByText("via rubric")).toBeInTheDocument();
    expect(within(screen.getByTestId("context-row-specs/skill-b.md")).getByText("via gate")).toBeInTheDocument();
    expect(within(screen.getByTestId("context-row-specs/skill-off.md")).queryByText(/^via /)).not.toBeInTheDocument();
  });

  it("shows a document that is both attached and inherited once, as attached", async () => {
    linkedSkills = [skill("rubric", true, ["docs/own.md"], 0)];
    renderWithIntl(<AgentEditor agent={{ ...AGENT, context_docs: ["docs/own.md"] }} tab="context" onTab={() => {}} />);
    await screen.findByTestId("context-row-docs/own.md");
    expect(screen.getAllByTestId("context-row-docs/own.md")).toHaveLength(1);
    const own = within(screen.getByTestId("context-row-docs/own.md"));
    expect(own.getByRole("checkbox")).toBeChecked();
    expect(own.queryByText(/^via /)).not.toBeInTheDocument();
  });

  it("does not count inherited documents as attached", async () => {
    linkedSkills = [skill("rubric", true, ["specs/skill-a.md"], 0)];
    renderWithIntl(<AgentEditor agent={{ ...AGENT, context_docs: ["docs/own.md"] }} tab="context" onTab={() => {}} />);
    expect(await screen.findByText("1 of 6 attached")).toBeInTheDocument();
  });

  it("gives an inherited \"via <skill>\" row a disabled checkbox; clicking it saves nothing and does not attach it (AC-46)", async () => {
    linkedSkills = [skill("rubric", true, ["specs/skill-a.md"], 0)];
    renderWithIntl(<AgentEditor agent={{ ...AGENT, context_docs: ["docs/own.md"] }} tab="context" onTab={() => {}} />);
    const inheritedRow = within(await screen.findByTestId("context-row-specs/skill-a.md"));
    expect(inheritedRow.getByText("via rubric")).toBeInTheDocument();
    const box = inheritedRow.getByRole("checkbox", { name: "specs/skill-a.md" });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();

    // `HTMLElement.click()` is what a user's click does: it is ignored on a disabled control.
    // (`fireEvent.click` dispatches a synthetic event that jsdom delivers to disabled inputs too.)
    box.click();
    expect(setDocs).not.toHaveBeenCalled();
    expect(box).not.toBeChecked();
    expect(screen.getByText("1 of 6 attached")).toBeInTheDocument();
    // The agent's own attachment stays toggleable.
    expect(within(screen.getByTestId("context-row-docs/own.md")).getByRole("checkbox")).toBeEnabled();
  });

  it("saves the agent's full ordered list through the agent hook when a row is checked (AC-13)", async () => {
    renderWithIntl(<AgentEditor agent={{ ...AGENT, context_docs: ["docs/own.md"] }} tab="context" onTab={() => {}} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/alpha.md" }));
    await waitFor(() => expect(setDocs).toHaveBeenCalledWith({ id: "ag1", paths: ["docs/own.md", "docs/alpha.md"] }));
  });
});

describe("Agent Editor — Context tab without a repository (AC-44)", () => {
  it("shows an empty state linking to onboarding and saves nothing", () => {
    activeRepoId = null;
    const net = installFetch({});
    renderWithIntl(<AgentEditor agent={{ ...AGENT, context_docs: ["docs/own.md"] }} tab="context" onTab={() => {}} />);
    expect(screen.getByText("No repository selected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to onboarding" })).toHaveAttribute("href", "/onboarding");
    expect(net.requests).toHaveLength(0);
    expect(setDocs).not.toHaveBeenCalled();
  });
});
