import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import agentPerformance from "../../../../../messages/en/agentPerformance.json";
import { apiError, installFetch, type Handler } from "../../../../test/context-docs-fixtures";
import {
  REPO,
  detailOf,
  emptyRangeOverviewOf,
  overviewOf,
  rowOf,
} from "../../../../test/agent-performance-fixtures";

/* A tiny in-memory address bar: `useSearchParams` reads it, `router.replace` writes it, so the
   page's address state makes the same round trip it makes in Next. */
const addr = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const store = {
    search: "",
    replaced: [] as string[],
    set(next: string) {
      store.search = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  return store;
});
const repoState = vi.hoisted(() => ({
  repoId: "r1" as string | null,
  repos: [] as { id: string; full_name: string }[],
  reposLoaded: true,
  setRepoId: vi.fn(),
}));

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: (url: string) => {
        addr.replaced.push(url);
        addr.set(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
      },
    }),
    usePathname: () => "/agent-performance",
    useSearchParams: () => {
      const search = React.useSyncExternalStore(addr.subscribe, () => addr.search, () => addr.search);
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => repoState }));

import { AgentPerformanceView } from "./AgentPerformanceView";

const REPOS = [REPO, { id: "r2", full_name: "acme/api" }];
const HOUR = 3_600_000;

beforeEach(() => {
  addr.search = "repo=r1";
  addr.replaced = [];
  repoState.repoId = "r1";
  repoState.repos = REPOS;
  repoState.reposLoaded = true;
  repoState.setRepoId.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ agentPerformance }}>
        <AgentPerformanceView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const OVERVIEW = "GET /agent-performance";
const reads = (fx: ReturnType<typeof installFetch>) => fx.requests.filter((r) => r.path === "/agent-performance");
const paramsOf = (search: string) => Object.fromEntries(new URLSearchParams(search));
const rowButton = (name: string) => screen.getByRole("button", { name: `Show details of ${name}` });
const rowNames = () =>
  screen
    .getAllByRole("button", { name: /^Show details of / })
    .map((b) => b.getAttribute("aria-label")!.replace("Show details of ", ""));

const loaded = (routes: Record<string, Handler> = {}) =>
  installFetch({ [OVERVIEW]: overviewOf(), "GET /agents/a1/performance": detailOf(overviewOf().rows[0]!), ...routes });

describe("AgentPerformanceView — page frame (AC-2, AC-61, AC-3, AC-50)", () => {
  it("shows the title, the subtitle, the repository it reads, the three range choices with 30 days selected and the data", async () => {
    const fx = loaded();
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Agent Performance" })).toBeInTheDocument();
    expect(screen.getByText("Which agents earn their keep — accept rate is the quality signal")).toBeInTheDocument();
    expect(screen.getByText("Repository: acme/web")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom range" })).toBeInTheDocument();

    expect(await screen.findByRole("region", { name: "Total runs (30D)" })).toBeInTheDocument();
    expect(rowNames()).toEqual(["Security Reviewer", "Style Reviewer"]);
    // one read, for the repository named by the address, over the last 30 days
    expect(reads(fx)).toHaveLength(1);
    const q = paramsOf(reads(fx)[0]!.search);
    expect(q.repoId).toBe("r1");
    expect(Date.parse(q.to!) - Date.parse(q.from!)).toBe(30 * 24 * HOUR);
  });

  it('shows "Data as of <time>" and Refresh reads the same repository and range again', async () => {
    const fx = loaded();
    renderView();
    await screen.findByRole("region", { name: "Total runs (30D)" });
    expect(screen.getByText(/^Data as of /)).toBeInTheDocument();
    const first = paramsOf(reads(fx)[0]!.search);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(reads(fx)).toHaveLength(2));
    const second = paramsOf(reads(fx)[1]!.search);
    expect(second.repoId).toBe(first.repoId);
    expect(Date.parse(second.to!) - Date.parse(second.from!)).toBe(30 * 24 * HOUR);
  });
});

describe("AgentPerformanceView — range (AC-4)", () => {
  it('selecting "1 day" reads once for the last 24 hours, relabels the cards "(1D)" and writes the range to the address', async () => {
    const fx = loaded();
    renderView();
    await screen.findByRole("region", { name: "Total runs (30D)" });
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));

    expect(await screen.findByRole("region", { name: "Total runs (1D)" })).toBeInTheDocument();
    expect(reads(fx)).toHaveLength(2);
    const q = paramsOf(reads(fx)[1]!.search);
    expect(Date.parse(q.to!) - Date.parse(q.from!)).toBe(24 * HOUR);
    expect(new URLSearchParams(addr.search).get("range")).toBe("1d");
  });
});

describe("AgentPerformanceView — the address keeps the view (AC-47)", () => {
  it("restores range, sort and the expanded row from the address and reads that agent's detail", async () => {
    addr.search = "repo=r1&range=1d&sort=runs&dir=asc&expanded=a1";
    const fx = loaded();
    renderView();

    expect(await screen.findByRole("region", { name: "Total runs (1D)" })).toBeInTheDocument();
    expect(rowNames()).toEqual(["Style Reviewer", "Security Reviewer"]); // Runs, ascending
    expect(rowButton("Security Reviewer")).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Accepted: 45")).toBeInTheDocument();
    const detail = fx.requests.find((r) => r.path === "/agents/a1/performance")!;
    expect(paramsOf(detail.search).repoId).toBe("r1");
    expect(addr.replaced).toEqual([]); // a valid address is not rewritten
  });

  it("writes sorting and expansion to the address", async () => {
    loaded();
    renderView();
    await screen.findByRole("region", { name: "Total runs (30D)" });

    fireEvent.click(screen.getByRole("button", { name: "Sort by Runs" }));
    expect(new URLSearchParams(addr.search).get("sort")).toBe("runs");
    expect(new URLSearchParams(addr.search).get("dir")).toBeNull(); // descending is the default, not written
    fireEvent.click(screen.getByRole("button", { name: "Sort by Runs" }));
    expect(new URLSearchParams(addr.search).get("dir")).toBe("asc");

    fireEvent.click(rowButton("Style Reviewer"));
    expect(new URLSearchParams(addr.search).get("expanded")).toBe("a2");
    expect(rowButton("Style Reviewer")).toHaveAttribute("aria-expanded", "true");
  });
});

describe("AgentPerformanceView — invalid address parts (AC-64)", () => {
  it("replaces each invalid part with its default, names what was reset and cleans the address", async () => {
    addr.search = "repo=bogus&range=custom&sort=zzz&dir=up";
    const fx = loaded();
    renderView();

    expect(await screen.findByRole("region", { name: "Total runs (30D)" })).toBeInTheDocument();
    expect(
      screen.getByText("Reset to default: repository, range, sort column, sort direction."),
    ).toBeInTheDocument();
    expect(paramsOf(reads(fx)[0]!.search).repoId).toBe("r1"); // the active repository
    expect(screen.getByText("Repository: acme/web")).toBeInTheDocument();
    expect(addr.replaced.at(-1)).toBe("/agent-performance?repo=r1");
  });

  it("keeps the valid parts and names only the reset one", async () => {
    addr.search = "repo=r1&range=1d&sort=zzz";
    loaded();
    renderView();
    expect(await screen.findByRole("region", { name: "Total runs (1D)" })).toBeInTheDocument();
    expect(screen.getByText("Reset to default: sort column.")).toBeInTheDocument();
    expect(addr.replaced.at(-1)).toBe("/agent-performance?repo=r1&range=1d");
  });

  it("resets an expanded row that names no listed agent once the agents are known", async () => {
    addr.search = "repo=r1&expanded=ghost";
    loaded();
    renderView();
    expect(await screen.findByText("Reset to default: expanded row.")).toBeInTheDocument();
    expect(screen.queryByText(/Loading details/)).not.toBeInTheDocument();
    expect(addr.replaced.at(-1)).toBe("/agent-performance?repo=r1");
  });
});

describe("AgentPerformanceView — repository (AC-61, AC-62)", () => {
  it("reads the repository of the address and keeps the sidebar selector in step with it", async () => {
    addr.search = "repo=r2&range=1d&sort=runs";
    const fx = loaded({ [OVERVIEW]: overviewOf({ repo: REPOS[1]! }) });
    renderView();
    expect(await screen.findByText("Repository: acme/api")).toBeInTheDocument();
    expect(paramsOf(reads(fx)[0]!.search).repoId).toBe("r2");
    expect(repoState.setRepoId).toHaveBeenCalledWith("r2");
  });

  it("reads the newly selected repository for the same range and sort", async () => {
    addr.search = "repo=r1&range=1d&sort=runs&dir=asc";
    const fx = loaded();
    renderView();
    await screen.findByRole("region", { name: "Total runs (1D)" });

    // what the shell's repository selector does on this page: repo replaced, the rest kept
    act(() => addr.set("repo=r2&range=1d&sort=runs&dir=asc"));
    await waitFor(() => expect(reads(fx)).toHaveLength(2));
    const q = paramsOf(reads(fx)[1]!.search);
    expect(q.repoId).toBe("r2");
    expect(Date.parse(q.to!) - Date.parse(q.from!)).toBe(24 * HOUR);
    const runsSort = await screen.findByRole("button", { name: "Sort by Runs" });
    expect(runsSort.closest("th")).toHaveAttribute("aria-sort", "ascending");
  });

  it('shows "No repository yet" with a link to import one, and sends no read, while the workspace has none', async () => {
    repoState.repos = [];
    repoState.repoId = null;
    addr.search = "";
    const fx = loaded();
    renderView();
    expect(await screen.findByText("No repository yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import a repository" })).toHaveAttribute("href", "/onboarding");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(fx.requests).toHaveLength(0);
  });
});

describe("AgentPerformanceView — loading and failure (AC-40, AC-41)", () => {
  it("shows placeholders and no number, no zero and no dash while the read is in flight", async () => {
    installFetch({ [OVERVIEW]: () => new Promise(() => {}) });
    const { container } = renderView();
    const busy = await waitFor(() => {
      const el = container.querySelector('[aria-busy="true"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(busy).toHaveTextContent(/^Loading agent performance…$/);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows an error with Retry instead of the data, keeps the range control usable, and recovers on Retry", async () => {
    let calls = 0;
    const fx = installFetch({ [OVERVIEW]: () => (++calls === 1 ? apiError(500, "boom") : overviewOf()) });
    renderView();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load agent performance.");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 day" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Custom range" })).toBeEnabled();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("region", { name: "Total runs (30D)" })).toBeInTheDocument();
    expect(reads(fx)).toHaveLength(2);
  });

  it("still lets the user change the range after a failed read", async () => {
    let calls = 0;
    const fx = installFetch({ [OVERVIEW]: () => (++calls === 1 ? apiError(500, "boom") : overviewOf()) });
    renderView();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(await screen.findByRole("region", { name: "Total runs (1D)" })).toBeInTheDocument();
    expect(reads(fx)).toHaveLength(2);
  });
});

describe("AgentPerformanceView — empty states (AC-42, AC-43)", () => {
  it('says "No agent runs on <repo> in this period" with a hint when agents exist but have no counted run, and zeroes the cards', async () => {
    installFetch({ [OVERVIEW]: emptyRangeOverviewOf() });
    renderView();
    expect(await screen.findByText("No agent runs on acme/web in this period")).toBeInTheDocument();
    expect(screen.getByText("Choose a longer range.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cost breakdown" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Total runs (30D)" })).getByText("0")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Avg accept rate" })).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Most-active agent" })).getByText("—")).toBeInTheDocument();
  });

  it('says "No agents yet" with a link to the Agents page when the workspace has no listed agent', async () => {
    installFetch({ [OVERVIEW]: emptyRangeOverviewOf({ rows: [] }) });
    renderView();
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Agents" })).toHaveAttribute("href", "/agents");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("AgentPerformanceView — Most-active card (AC-67)", () => {
  it("expands that agent's row, writes it to the address and scrolls it into view", async () => {
    loaded();
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Show Security Reviewer in the table" }));

    expect(new URLSearchParams(addr.search).get("expanded")).toBe("a1");
    await waitFor(() => expect(rowButton("Security Reviewer")).toHaveAttribute("aria-expanded", "true"));
    expect(await screen.findByText("Accepted: 45")).toBeInTheDocument();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    const target = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.contexts[0] as HTMLElement;
    expect(target.dataset.agentId).toBe("a1");
  });
});

describe("AgentPerformanceView — Most-active card on an already expanded row (AC-67)", () => {
  const scrollIntoView = () => Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
  const detailReads = (fx: ReturnType<typeof installFetch>) =>
    fx.requests.filter((r) => r.path === "/agents/a1/performance");

  it("scrolls to the row and focuses its button, without collapsing it, changing the address or reading again", async () => {
    addr.search = "repo=r1&expanded=a1";
    const fx = loaded();
    renderView();
    expect(await screen.findByText("Accepted: 45")).toBeInTheDocument();
    expect(scrollIntoView()).not.toHaveBeenCalled(); // opening an address with a row expanded does not scroll
    const requestsBefore = fx.requests.length;
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      fireEvent.click(screen.getByRole("button", { name: "Show Security Reviewer in the table" }));
      await act(async () => {}); // let any (unwanted) follow-up render or request settle

      expect(scrollIntoView()).toHaveBeenCalledTimes(1);
      const target = scrollIntoView().mock.contexts[0] as HTMLElement;
      expect(target.dataset.agentId).toBe("a1");
      expect(rowButton("Security Reviewer")).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Accepted: 45")).toBeInTheDocument();
      expect(new URLSearchParams(addr.search).get("expanded")).toBe("a1");
      expect(addr.replaced).toEqual([]); // the address was not written at all
      expect(fx.requests).toHaveLength(requestsBefore); // no extra overview or detail read
      expect(document.activeElement).toBe(rowButton("Security Reviewer"));
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    } finally {
      focus.mockRestore();
    }
  });

  it("expands a collapsed row and scrolls once; activating the card again only scrolls", async () => {
    const fx = loaded();
    renderView();
    const card = await screen.findByRole("button", { name: "Show Security Reviewer in the table" });

    fireEvent.click(card); // collapsed: expand + scroll
    await waitFor(() => expect(scrollIntoView()).toHaveBeenCalledTimes(1));
    expect(new URLSearchParams(addr.search).get("expanded")).toBe("a1");
    expect(await screen.findByText("Accepted: 45")).toBeInTheDocument();
    const requestsAfterExpand = fx.requests.length;
    const writes = addr.replaced.length;

    fireEvent.click(card); // already expanded: scroll only
    await waitFor(() => expect(scrollIntoView()).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(rowButton("Security Reviewer")).toHaveAttribute("aria-expanded", "true");
    expect(new URLSearchParams(addr.search).get("expanded")).toBe("a1");
    expect(addr.replaced).toHaveLength(writes);
    expect(detailReads(fx)).toHaveLength(1);
    expect(fx.requests).toHaveLength(requestsAfterExpand);
  });
});

describe("AgentPerformanceView — read only (AC-37)", () => {
  it("only ever sends GET reads of stored data, through every action the page offers", async () => {
    let calls = 0;
    const fx = installFetch({
      [OVERVIEW]: () => (++calls === 3 ? apiError(500, "boom") : overviewOf()), // 3rd read = Refresh
      "GET /agents/a1/performance": detailOf(overviewOf().rows[0]!),
      "GET /agents/a2/performance": detailOf(overviewOf().rows[1]!),
    });
    renderView();
    await screen.findByRole("region", { name: "Total runs (30D)" });

    fireEvent.click(screen.getByRole("button", { name: "Sort by Runs" })); // sort
    fireEvent.click(rowButton("Security Reviewer")); // expand
    await screen.findByText("Accepted: 45");
    fireEvent.click(screen.getByRole("button", { name: "Show Security Reviewer in the table" })); // Most-active card
    fireEvent.click(rowButton("Style Reviewer")); // another row
    await screen.findAllByText(/^Accepted: /);
    fireEvent.click(screen.getByRole("button", { name: "1 day" })); // range
    await screen.findByRole("region", { name: "Total runs (1D)" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" })); // Refresh (fails)
    fireEvent.click(await screen.findByRole("button", { name: "Retry" })); // Retry
    await screen.findByRole("region", { name: "Total runs (1D)" });

    expect(fx.requests.length).toBeGreaterThan(4);
    expect(fx.requests.every((r) => r.method === "GET")).toBe(true);
    expect(
      fx.requests.every((r) => r.path === "/agent-performance" || /^\/agents\/[^/]+\/performance$/.test(r.path)),
    ).toBe(true);
    expect(fx.requests.every((r) => r.body === undefined)).toBe(true);
  });
});

describe("AgentPerformanceView — untrusted names", () => {
  it("renders agent and repository names as text, never as markup", async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    addr.search = "repo=r1";
    repoState.repos = [{ id: "r1", full_name: `acme/${hostile}` }];
    installFetch({
      [OVERVIEW]: overviewOf({
        repo: { id: "r1", full_name: `acme/${hostile}` },
        rows: [rowOf("a1", hostile)],
        totals: { ...overviewOf().totals, most_active: null },
        cost_by_agent: [{ agent_id: "a1", name: hostile, cost_usd: 8.74 }],
      }),
    });
    renderView();
    expect(await screen.findByText(`Repository: acme/${hostile}`)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: `Show details of ${hostile}` })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
