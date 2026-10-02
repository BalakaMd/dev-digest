import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastDegradedReason, PrBlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

/**
 * Real hooks + a real QueryClient against a mocked `fetch`: this exercises the
 * URLs the card talks to (`GET /pulls/:id/blast`, `POST /repos/:id/resync`)
 * and renders with the real `blast.json` labels.
 */

const MAP: PrBlastRadiusResponse = {
  changed_symbols: [
    { name: "charge", file: "src/pay.ts", kind: "function" },
    { name: "refund", file: "src/pay.ts", kind: "function" },
    { name: "unusedA", file: "src/pay.ts", kind: "function" },
    { name: "unusedB", file: "src/pay.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "charge",
      callers: [
        { name: "checkout", file: "src/api/checkout.ts", line: 12 },
        { name: "retryJob", file: "src/jobs/retry.ts", line: 40 },
      ],
      endpoints_affected: ["POST /checkout", "GET /receipt"],
      crons_affected: ["nightly-settlement"],
    },
    {
      symbol: "refund",
      callers: [{ name: "refundRoute", file: "src/api/refund.ts", line: 3 }],
      // Also reached through `charge`: must be counted once in the headline.
      endpoints_affected: ["POST /checkout"],
      crons_affected: [],
    },
  ],
  summary: "4 changed symbols · 3 callers · 2 endpoints · 1 cron/job",
  degraded: false,
  degraded_reason: null,
  indexed_sha: "indexed-sha",
};

const EMPTY: PrBlastRadiusResponse = {
  ...MAP,
  changed_symbols: MAP.changed_symbols.slice(0, 2),
  downstream: [],
};

const degraded = (reason: BlastDegradedReason, over: Partial<PrBlastRadiusResponse> = {}): PrBlastRadiusResponse => ({
  ...EMPTY,
  degraded: true,
  degraded_reason: reason,
  ...over,
});

interface ServerState {
  blast: () => Response;
  history: () => Response;
  resync: () => Response;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let server: ServerState;
let fetchMock: ReturnType<typeof vi.fn>;

const requests = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    method: ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase(),
    path: new URL(String(url)).pathname,
  }));

function renderCard(props: Partial<React.ComponentProps<typeof BlastRadiusCard>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard prId="pr-1" repoId="repo-1" repoFullName="acme/payments-api" headSha="head-sha" {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server = {
    blast: () => json(MAP),
    history: () => json({ history: [], degraded: false, degraded_reason: null }),
    resync: () => json({ status: "queued" }),
  };
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const { pathname } = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && pathname === "/pulls/pr-1/blast") return server.blast();
    if (method === "GET" && pathname === "/pulls/pr-1/history") return server.history();
    if (method === "POST" && pathname === "/repos/repo-1/resync") return server.resync();
    throw new Error(`Unhandled fake fetch route: ${method} ${pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BlastRadiusCard — summary and tree", () => {
  it("shows the title while loading, then the four summary counts with their blast.json labels", async () => {
    renderCard();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.queryByTestId("blast-stat-symbols")).toBeNull();

    await screen.findByTestId("blast-stat-symbols");
    // 4 changed symbols, 3 callers, 2 unique endpoints (POST /checkout is reached twice), 1 cron.
    expect(screen.getByTestId("blast-stat-symbols")).toHaveTextContent(/4\s*symbols/);
    expect(screen.getByTestId("blast-stat-callers")).toHaveTextContent(/3\s*callers/);
    expect(screen.getByTestId("blast-stat-endpoints")).toHaveTextContent(/2\s*endpoints/);
    expect(screen.getByTestId("blast-stat-crons")).toHaveTextContent(/1\s*cron\/job(?!s)/);
  });

  it("requests the blast map and the prior-PR history for the PR id, and nothing else while healthy", async () => {
    renderCard();
    await screen.findByTestId("blast-stat-symbols");
    await screen.findByText("0", { selector: "span" });
    expect(requests()).toEqual(
      expect.arrayContaining([
        { method: "GET", path: "/pulls/pr-1/blast" },
        { method: "GET", path: "/pulls/pr-1/history" },
      ]),
    );
    expect(requests()).toHaveLength(2);
  });

  it("lists callers as file:line links to the exact GitHub line at the indexed commit", async () => {
    renderCard();
    const link = await screen.findByRole("link", { name: "src/api/checkout.ts:12" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/indexed-sha/src/api/checkout.ts#L12",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("falls back to the PR head sha for the links when nothing was indexed", async () => {
    server.blast = () => json({ ...MAP, indexed_sha: null });
    renderCard();
    const link = await screen.findByRole("link", { name: "src/api/checkout.ts:12" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/head-sha/src/api/checkout.ts#L12",
    );
  });

  it("renders callers as plain text when the repository is unknown", async () => {
    renderCard({ repoFullName: null });
    await screen.findByText("src/api/checkout.ts:12");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("opens the first symbol only; the others expand and collapse on click", async () => {
    renderCard();
    const charge = await screen.findByRole("button", { name: /charge/ });
    const refund = screen.getByRole("button", { name: /refund/ });
    expect(charge).toHaveAttribute("aria-expanded", "true");
    expect(refund).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("src/api/checkout.ts:12")).toBeInTheDocument();
    expect(screen.queryByText("src/api/refund.ts:3")).toBeNull();

    fireEvent.click(refund);
    expect(refund).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/api/refund.ts:3")).toBeInTheDocument();

    fireEvent.click(charge);
    expect(charge).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/api/checkout.ts:12")).toBeNull();
  });

  it("shows the caller count per symbol", async () => {
    renderCard();
    expect(await screen.findByRole("button", { name: /charge/ })).toHaveTextContent("2 callers");
    expect(screen.getByRole("button", { name: /refund/ })).toHaveTextContent(/1 callers?$/);
  });

  it("keeps HTTP endpoints and cron jobs in separate groups", async () => {
    renderCard();
    await screen.findByRole("link", { name: "src/api/checkout.ts:12" });
    const endpoints = screen.getByText("HTTP endpoints").parentElement!;
    const crons = screen.getByText("Cron jobs").parentElement!;
    expect(endpoints).not.toBe(crons);
    expect(endpoints).toHaveTextContent("POST /checkout");
    expect(endpoints).toHaveTextContent("GET /receipt");
    expect(endpoints).not.toHaveTextContent("nightly-settlement");
    expect(crons).toHaveTextContent("nightly-settlement");
    expect(crons).not.toHaveTextContent("POST /checkout");
  });

  it("folds symbols without callers into one collapsed line that expands to their names", async () => {
    renderCard();
    const toggle = await screen.findByRole("button", { name: "2 changed symbols without callers" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("unusedA")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("unusedA")).toBeInTheDocument();
    expect(screen.getByText("unusedB")).toBeInTheDocument();
  });

  it("uses singular labels for a count of one", async () => {
    server.blast = () =>
      json({
        changed_symbols: [
          { name: "charge", file: "src/pay.ts", kind: "function" },
          { name: "unusedA", file: "src/pay.ts", kind: "function" },
        ],
        downstream: [
          {
            symbol: "charge",
            callers: [{ name: "checkout", file: "src/api/checkout.ts", line: 12 }],
            endpoints_affected: ["POST /checkout"],
            crons_affected: ["nightly-settlement"],
          },
        ],
        summary: "",
        degraded: false,
        degraded_reason: null,
        indexed_sha: "indexed-sha",
      });
    renderCard();
    await screen.findByTestId("blast-stat-symbols");
    expect(screen.getByTestId("blast-stat-symbols")).toHaveTextContent(/^2\s*symbols$/);
    expect(screen.getByTestId("blast-stat-callers")).toHaveTextContent(/^1\s*caller$/);
    expect(screen.getByTestId("blast-stat-endpoints")).toHaveTextContent(/^1\s*endpoint$/);
    expect(screen.getByTestId("blast-stat-crons")).toHaveTextContent(/^1\s*cron\/job$/);
    expect(screen.getByRole("button", { name: /charge/ })).toHaveTextContent(/1 caller$/);
    expect(screen.getByRole("button", { name: "1 changed symbol without callers" })).toBeInTheDocument();
  });

  it("a healthy map has no incomplete-index marker and no Resync button", async () => {
    renderCard();
    await screen.findByTestId("blast-stat-symbols");
    expect(screen.queryByTestId("blast-degraded")).toBeNull();
    expect(screen.queryByRole("button", { name: /Resync/ })).toBeNull();
  });
});

describe("BlastRadiusCard — no callers", () => {
  it("says so in words instead of showing an empty block", async () => {
    server.blast = () => json(EMPTY);
    renderCard();
    expect(await screen.findByText("2 changed symbols, no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    // Not flagged as an incomplete index: "no callers" and "index incomplete" differ.
    expect(screen.queryByTestId("blast-degraded")).toBeNull();
  });
});

describe("BlastRadiusCard — no callers, singular", () => {
  it("says '1 changed symbol' for a single changed symbol", async () => {
    server.blast = () => json({ ...EMPTY, changed_symbols: EMPTY.changed_symbols.slice(0, 1) });
    renderCard();
    expect(await screen.findByText("1 changed symbol, no downstream callers found.")).toBeInTheDocument();
  });
});

describe("BlastRadiusCard — incomplete index", () => {
  it.each([
    ["no_data", "This repository has not been indexed yet."],
    ["index_failed", "The last indexing run failed."],
    ["index_partial", "Only part of the repository was indexed."],
    ["flag_off", "Repository intelligence is turned off, so no call data is available."],
    ["repo_too_large", "The repository is too large to index fully."],
  ] as const)("shows a separate marker with the reason text for %s", async (reason, text) => {
    server.blast = () => json(degraded(reason));
    renderCard();
    const marker = await screen.findByTestId("blast-degraded");
    expect(marker).toHaveAttribute("role", "status");
    expect(marker).toHaveTextContent("Index incomplete — the map may be missing callers");
    expect(marker).toHaveTextContent(text);
  });

  it.each(["no_data", "index_failed", "index_partial"] as const)(
    "offers Resync for %s",
    async (reason) => {
      server.blast = () => json(degraded(reason));
      renderCard();
      expect(await screen.findByRole("button", { name: "Resync" })).toBeEnabled();
    },
  );

  it.each(["flag_off", "repo_too_large"] as const)("offers no Resync for %s (it cannot fix it)", async (reason) => {
    server.blast = () => json(degraded(reason));
    renderCard();
    await screen.findByTestId("blast-degraded");
    expect(screen.queryByRole("button", { name: /Resync/ })).toBeNull();
  });

  it("still shows the callers of a partially built index next to the marker", async () => {
    server.blast = () => json({ ...MAP, degraded: true, degraded_reason: "index_partial" });
    renderCard();
    await screen.findByTestId("blast-degraded");
    expect(screen.getByRole("link", { name: "src/api/checkout.ts:12" })).toBeInTheDocument();
  });

  it("Resync POSTs /repos/:id/resync and then shows progress", async () => {
    server.blast = () => json(degraded("no_data"));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Resync" }));

    expect(await screen.findByText("Resync started — the map refreshes automatically.")).toBeInTheDocument();
    expect(requests()).toContainEqual({ method: "POST", path: "/repos/repo-1/resync" });
    const busy = screen.getByRole("button", { name: "Resyncing…" });
    expect(busy).toBeDisabled();
  });

  it("reports a failed resync instead of pretending it started", async () => {
    server.blast = () => json(degraded("no_data"));
    server.resync = () => json({ error: { code: "internal", message: "nope" } }, 500);
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Resync" }));

    expect(await screen.findByText("Could not start the resync.")).toBeInTheDocument();
    expect(screen.queryByText("Resync started — the map refreshes automatically.")).toBeNull();
  });

  it("after a resync, re-reads the map on its own and drops the marker once the index is complete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.blast = () => json(degraded("no_data"));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Resync" }));
    await screen.findByText("Resync started — the map refreshes automatically.");
    const before = requests().filter((r) => r.path === "/pulls/pr-1/blast").length;

    server.blast = () => json(MAP);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    await waitFor(() => expect(screen.queryByTestId("blast-degraded")).toBeNull());
    expect(requests().filter((r) => r.path === "/pulls/pr-1/blast").length).toBeGreaterThan(before);
    expect(screen.getByRole("link", { name: "src/api/checkout.ts:12" })).toBeInTheDocument();
  });
});

describe("BlastRadiusCard — errors", () => {
  it("shows the API error message with Retry, and Retry reloads the map", async () => {
    server.blast = () => json({ error: { code: "internal", message: "index store unavailable" } }, 500);
    renderCard();
    expect(await screen.findByText("index store unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("blast-stat-symbols")).toBeNull();

    server.blast = () => json(MAP);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("blast-stat-symbols")).toBeInTheDocument();
    expect(screen.queryByText("index store unavailable")).toBeNull();
  });
});

describe("BlastRadiusCard — Tree / Graph switch", () => {
  const pressed = (name: string) => screen.getByRole("button", { name });

  it("shows the Tree by default", async () => {
    renderCard();
    await screen.findByTestId("blast-stat-symbols");
    expect(pressed("tree")).toHaveAttribute("aria-pressed", "true");
    expect(pressed("graph")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();
  });

  it("switches to the graph and back, restoring the symbol rows", async () => {
    renderCard();
    await screen.findByRole("button", { name: /charge/ });

    fireEvent.click(pressed("graph"));
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(pressed("graph")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /charge/ })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();

    fireEvent.click(pressed("tree"));
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();
    expect(screen.getByRole("button", { name: /charge/ })).toBeInTheDocument();
  });

  it("keeps the degraded marker, Resync and the stats in the graph view", async () => {
    server.blast = () => json({ ...MAP, degraded: true, degraded_reason: "index_partial" });
    renderCard();
    await screen.findByTestId("blast-degraded");
    fireEvent.click(pressed("graph"));
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.getByTestId("blast-degraded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resync" })).toBeEnabled();
    expect(screen.getByTestId("blast-stat-symbols")).toBeInTheDocument();
  });
});

describe("BlastRadiusCard — prior PRs block", () => {
  it("is present, collapsed, in both views", async () => {
    renderCard();
    const toggle = await screen.findByRole("button", { name: /Prior PRs touching these files/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prior PRs touching these files/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
