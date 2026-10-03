import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import runs from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const BASE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 0, grounding: "0/0 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: null, memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

const SPECS_BLOCK = "## Project context\n<untrusted>…</untrusted>";

const WITH_CONTEXT: RunTrace = {
  ...BASE,
  specs_read: ["docs/guide.md", "notes.md"],
  prompt_assembly: { ...BASE.prompt_assembly, specs: SPECS_BLOCK },
  context: {
    docs: [
      { path: "docs/guide.md", source: "repo", tokens: 120 },
      { path: "notes.md", source: "local", tokens: 80 },
    ],
    tokens: 200,
    skipped: [
      { path: "specs/big.md", reason: "over_budget" },
      { path: "specs/gone.md", reason: "not_found" },
      { path: "specs/odd.md", reason: "some_future_reason" },
    ],
  },
};

function renderBody(trace: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <TraceBody trace={trace} findings={[]} />
    </NextIntlClientProvider>,
  );
}

const openPromptAssembly = () => fireEvent.click(screen.getByText("Prompt assembly"));

describe("TraceBody — project context (AC-40)", () => {
  it('lists the documents under "Specs read" and marks local ones "Local"', () => {
    renderBody(WITH_CONTEXT);
    const row = screen.getByText("Specs read").parentElement!;
    const repoChip = within(row).getByText("docs/guide.md").parentElement!;
    const localChip = within(row).getByText("notes.md").parentElement!;
    expect(within(repoChip).queryByText("Local")).not.toBeInTheDocument();
    expect(within(localChip).getByText("Local")).toBeInTheDocument();
  });

  it('shows the "Project context — attached specs (untrusted)" block with its total token count', () => {
    renderBody(WITH_CONTEXT);
    openPromptAssembly();
    const label = screen.getByText("Project context — attached specs (untrusted)");
    expect(label.parentElement).toHaveTextContent("200 tokens");
    // The block itself holds the injected text, shown on expand.
    fireEvent.click(label);
    expect(screen.getByText(/## Project context/)).toBeInTheDocument();
  });

  it("shows each injected document with its own token count, marking local ones", () => {
    renderBody(WITH_CONTEXT);
    openPromptAssembly();
    const guide = screen.getAllByText("docs/guide.md").at(-1)!.parentElement!;
    expect(guide).toHaveTextContent("120 tokens");
    const local = screen.getAllByText("notes.md").at(-1)!.parentElement!;
    expect(local).toHaveTextContent("80 tokens");
    expect(within(local).getByText("Local")).toBeInTheDocument();
  });

  it("lists skipped documents with a readable reason, falling back to the raw reason", () => {
    renderBody(WITH_CONTEXT);
    openPromptAssembly();
    expect(screen.getByText("Skipped documents")).toBeInTheDocument();
    expect(screen.getByText("specs/big.md").parentElement).toHaveTextContent("over the token budget");
    expect(screen.getByText("specs/gone.md").parentElement).toHaveTextContent("not found");
    expect(screen.getByText("specs/odd.md").parentElement).toHaveTextContent("some_future_reason");
  });

  it("lists skipped documents even when nothing could be injected", () => {
    renderBody({
      ...BASE,
      context: { docs: [], tokens: 0, skipped: [{ path: "specs/big.md", reason: "over_budget" }] },
    });
    openPromptAssembly();
    expect(screen.getByText("Skipped documents")).toBeInTheDocument();
    expect(screen.getByText("specs/big.md")).toBeInTheDocument();
  });

  it("shows no skipped list when everything fitted", () => {
    renderBody({ ...WITH_CONTEXT, context: { ...WITH_CONTEXT.context!, skipped: [] } });
    openPromptAssembly();
    expect(screen.queryByText("Skipped documents")).not.toBeInTheDocument();
  });

  it("renders document paths as text, never as markup", () => {
    renderBody({
      ...WITH_CONTEXT,
      context: { docs: [{ path: "<img src=x onerror=alert(1)>.md", source: "repo", tokens: 1 }], tokens: 1, skipped: [] },
    });
    expect(document.body.querySelector("img")).toBeNull();
    expect(screen.getAllByText("<img src=x onerror=alert(1)>.md").length).toBeGreaterThan(0);
  });
});

describe("TraceBody — traces without a context field (AC-38 on the client)", () => {
  it("falls back to the plain specs_read list, with no Local marks and no skipped list", () => {
    renderBody({ ...BASE, specs_read: ["spec-0", "spec-1"], prompt_assembly: { ...BASE.prompt_assembly, specs: "legacy specs text" } });
    expect(screen.getByText("spec-0")).toBeInTheDocument();
    expect(screen.getByText("spec-1")).toBeInTheDocument();
    expect(screen.queryByText("Local")).not.toBeInTheDocument();
    openPromptAssembly();
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    expect(screen.queryByText("Skipped documents")).not.toBeInTheDocument();
    expect(screen.queryByText(/ tokens$/)).not.toBeInTheDocument();
  });

  it('says "none" when there are no specs at all and no specs block', () => {
    renderBody(BASE);
    expect(within(screen.getByText("Specs read").parentElement!).getByText("none")).toBeInTheDocument();
    openPromptAssembly();
    expect(screen.queryByText("Project context — attached specs (untrusted)")).not.toBeInTheDocument();
  });
});
