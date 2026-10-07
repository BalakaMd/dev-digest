import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { PrBriefBlock } from "./PrBriefBlock";

/** Real hooks + QueryClient against a mocked `fetch` (GET/POST /pulls/:id/brief). */

const BRIEF: PrBrief = {
  summary: "Adds token refresh to the auth flow.",
  risks: [
    {
      kind: "security",
      title: "Unchecked token",
      explanation: "The token is read without a check.",
      severity: "high",
      file_refs: ["src/auth.ts"],
    },
  ],
  review_focus: [{ file: "src/auth.ts", line: 12, reason: "Refresh path." }],
  head_sha: "abcdef1234567890",
  generated_at: new Date().toISOString(),
  language: "English",
  provider: "openai",
  model: "gpt-test",
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.01,
  input_tokens: 90,
  missing_inputs: [],
  shortened_inputs: [],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const REVIEW = {
  id: "rev-1",
  kind: "review",
  verdict: "request_changes",
  summary: "Secret committed.",
  score: 61,
  agent_name: "Security Reviewer",
  findings: [{ severity: "CRITICAL", dismissed_at: null }, { severity: "WARNING", dismissed_at: null }],
};

let stored: PrBriefResponse;
let reviews: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;

function renderBlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ brief: messages, prReview: prReviewMessages }}>
        <PrBriefBlock
          prId="pr-1"
          repoId="repo-1"
          number={7}
          intent={(risks) => <div>INTENT-SLOT{risks}</div>}
          blast={<div>BLAST-SLOT</div>}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  stored = { brief: null, stale: false };
  reviews = [];
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const { pathname } = new URL(String(input));
    if (pathname === "/pulls/pr-1/brief") {
      if (init?.method === "POST") {
        stored = { brief: BRIEF, stale: false };
        return json(stored);
      }
      return json(stored);
    }
    if (pathname === "/settings") return json({});
    if (pathname === "/settings/secrets-status") return json({ openai: true, anthropic: true, openrouter: true });
    if (pathname === "/pulls/pr-1/reviews") return json(reviews);
    throw new Error(`Unhandled fake fetch route: ${pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PrBriefBlock", () => {
  it("shows the stored brief: summary, Risk areas, Review focus, provenance and the Intent/Blast slots", async () => {
    stored = { brief: BRIEF, stale: false };
    renderBlock();

    expect(await screen.findByText("Adds token refresh to the auth flow.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Risk areas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review focus — read these first 1" })).toBeInTheDocument();
    expect(screen.getByText("Unchecked token")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "src/auth.ts line 12" })).toHaveAttribute(
      "href",
      "/repos/repo-1/pulls/7?tab=diff&file=src%2Fauth.ts&line=12",
    );
    expect(screen.getByText(/commit abcdef1 · gpt-test/)).toBeInTheDocument();
    expect(screen.getByText("INTENT-SLOT")).toBeInTheDocument();
    expect(screen.getByText("BLAST-SLOT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeEnabled();
    expect(screen.queryByText(/Outdated/)).toBeNull();
  });

  it("never generates on its own; Generate posts once and then shows the new brief", async () => {
    renderBlock();

    const generate = await screen.findByRole("button", { name: "Generate brief" });
    await vi.waitFor(() => expect(generate).toBeEnabled());
    expect(posts()).toHaveLength(0);
    expect(screen.queryByText("Adds token refresh to the auth flow.")).toBeNull();

    fireEvent.click(generate);

    expect(await screen.findByText("Adds token refresh to the auth flow.")).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeInTheDocument();
  });

  it("merges verdict, brief summary, score, regenerate and cost into one card", async () => {
    stored = { brief: BRIEF, stale: false };
    reviews = [REVIEW];
    renderBlock();

    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText("Adds token refresh to the auth flow.")).toBeInTheDocument();
    expect(screen.getByText(/commit abcdef1 · gpt-test/)).toBeInTheDocument();
    expect(screen.getByTitle("Cost of this run")).toHaveTextContent("$ $0.010");
    expect(screen.getByText("100→50")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Regenerate brief" })).toHaveLength(1);
    expect(screen.queryByText("Run a review to get a score")).toBeNull();
    expect(screen.getAllByText("PR SCORE")).toHaveLength(1);
  });

  it("shows a tiny cost without a doubled dollar sign", async () => {
    stored = { brief: { ...BRIEF, cost_usd: 0.0001 }, stale: false };
    renderBlock();

    expect(await screen.findByText("Adds token refresh to the auth flow.")).toBeInTheDocument();
    expect(screen.getByTitle("Cost of this run")).toHaveTextContent(/^<\$0\.001$/);
  });

  it("without a verdict review still shows summary, regenerate and cost", async () => {
    stored = { brief: { ...BRIEF, tokens_in: 8200, tokens_out: 1300, cost_usd: 0.0142 }, stale: false };
    renderBlock();

    expect(await screen.findByText("Adds token refresh to the auth flow.")).toBeInTheDocument();
    expect(screen.getByTitle("Cost of this run")).toHaveTextContent("$ $0.014");
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.queryByText("Run a review to get a score")).toBeNull();
    expect(screen.getByRole("img", { name: /PR SCORE: Run a review to get a score/ })).toHaveAttribute(
      "title",
      "Run a review to get a score",
    );
    expect(screen.getByText("8.2K→1.3K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeEnabled();
  });

  it("hides the cost line when cost and tokens are null", async () => {
    stored = { brief: { ...BRIEF, cost_usd: null, tokens_in: null, tokens_out: null }, stale: false };
    renderBlock();

    expect(await screen.findByText("Adds token refresh to the auth flow.")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.queryByText(/→/)).toBeNull();
  });
});
