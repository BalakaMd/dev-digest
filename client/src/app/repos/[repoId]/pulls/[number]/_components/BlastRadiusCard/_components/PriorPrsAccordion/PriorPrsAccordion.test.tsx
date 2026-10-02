import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrHistoryDegradedReason, PrHistoryResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { PriorPrsAccordion } from "./PriorPrsAccordion";

/** Real hook + QueryClient against a mocked `fetch` (GET /pulls/:id/history). */

const HISTORY: PrHistoryResponse = {
  history: [
    {
      pr_number: 41,
      title: "Fix <b>rounding</b> in charge",
      merged_at: "2026-03-05T12:00:00Z",
      author: "alice",
      files_overlap: ["src/pay.ts", "src/money.ts"],
      notes: "2 of your files changed here",
    },
    {
      pr_number: 37,
      title: "Add refunds",
      merged_at: "2026-02-01T12:00:00Z",
      author: "bob",
      files_overlap: ["src/pay.ts"],
      notes: "",
    },
  ],
  degraded: false,
  degraded_reason: null,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let history: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;

function renderBlock(repoFullName: string | null = "acme/payments-api") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ blast: messages }}>
        <PriorPrsAccordion prId="pr-1" repoFullName={repoFullName} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const toggle = () => screen.findByRole("button", { name: /Prior PRs touching these files/ });

beforeEach(() => {
  history = () => json(HISTORY);
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    const { pathname } = new URL(String(input));
    if (pathname === "/pulls/pr-1/history") return history();
    throw new Error(`Unhandled fake fetch route: ${pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PriorPrsAccordion", () => {
  it("is collapsed with a count badge, then expands to linked rows", async () => {
    renderBlock();
    const button = await toggle();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByRole("img", { name: "2 prior PRs" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const link = screen.getByRole("link", { name: "#41 Fix <b>rounding</b> in charge" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/41");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/by alice/)).toHaveTextContent(/merged Mar 5, 2026/);
    expect(screen.getByText("src/money.ts")).toBeInTheDocument();
    expect(screen.getByText("2 of your files changed here")).toBeInTheDocument();
    expect(screen.getByText(/by bob/)).toBeInTheDocument();
    // Data is text, never markup.
    expect(document.querySelector("b")).toBeNull();
  });

  it("caps shared files and exposes the rest via a +N more indicator", async () => {
    const files = Array.from({ length: 8 }, (_, i) => `src/f${i}.ts`);
    history = () => json({ history: [{ ...HISTORY.history[0], files_overlap: files }], degraded: false });
    renderBlock();
    fireEvent.click(await toggle());
    expect(screen.getByText("src/f4.ts")).toBeInTheDocument();
    expect(screen.queryByText("src/f5.ts")).toBeNull();
    const more = screen.getByText("+3 more files");
    expect(more).toHaveAttribute("title", "src/f5.ts\nsrc/f6.ts\nsrc/f7.ts");
  });

  it("renders titles as plain text without a repository", async () => {
    renderBlock(null);
    fireEvent.click(await toggle());
    expect(await screen.findByText("#37 Add refunds")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says so when there are no prior PRs", async () => {
    history = () => json({ history: [], degraded: false, degraded_reason: null });
    renderBlock();
    fireEvent.click(await toggle());
    expect(await screen.findByText("No earlier merged PRs touched these files.")).toBeInTheDocument();
  });

  it.each([
    ["no_token", "Add a GitHub token in Settings to see prior PRs."],
    ["github_error", "Could not read the history from GitHub."],
    ["no_files", "Open the PR once so its changed files are loaded."],
  ] as [PrHistoryDegradedReason, string][])("shows the %s text and no count badge", async (reason, text) => {
    history = () => json({ history: [], degraded: true, degraded_reason: reason });
    renderBlock();
    const button = await toggle();
    fireEvent.click(button);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a load error and Retry refetches", async () => {
    history = () => json({ error: { code: "internal", message: "boom" } }, 500);
    renderBlock();
    fireEvent.click(await toggle());
    expect(await screen.findByText("Could not load the prior PRs.")).toBeInTheDocument();

    history = () => json(HISTORY);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /#41/ })).toBeInTheDocument();
  });
});
