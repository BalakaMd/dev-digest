import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { installFetch } from "@/test/context-docs-fixtures";
import { installationOf, runOf } from "@/test/ci-fixtures";
import { useCiInstall, useCiInstallations, useCiRuns, useCiSecrets } from "./ci";

afterEach(() => vi.unstubAllGlobals());

function wrapperFor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return wrapper;
}

describe("useCiRuns (AC-59)", () => {
  it("runs exactly one body-less POST /ci/refresh when it mounts, then lists the runs with the filters", async () => {
    const fx = installFetch({
      "POST /ci/refresh": { degraded: false, message: null },
      "GET /ci/runs": { items: [runOf("r1")], next_cursor: null },
    });
    const { result, rerender } = renderHook(() => useCiRuns({ agentId: "ag1", installationId: "i1" }), {
      wrapper: wrapperFor(),
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    rerender();

    expect(fx.count("POST", "/ci/refresh")).toBe(1);
    // No JSON body and no content-type: Fastify rejects an empty body declared as JSON (server INSIGHTS).
    const call = fx.fetchMock.mock.calls.find(([url]) => String(url).endsWith("/ci/refresh"))!;
    const init = call[1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(init.headers as Record<string, string>).not.toHaveProperty("content-type");

    const list = fx.requests.find((r) => r.method === "GET" && r.path === "/ci/runs")!;
    const q = new URLSearchParams(list.search);
    expect(q.get("agent_id")).toBe("ag1");
    expect(q.get("installation_id")).toBe("i1");
    expect(q.get("limit")).toBe("50");
  });

  it("asks for the next page with the cursor the previous page returned", async () => {
    const fx = installFetch({
      "POST /ci/refresh": { degraded: false, message: null },
      "GET /ci/runs": (req) =>
        new URLSearchParams(req.search).get("cursor") === "c1"
          ? { items: [runOf("r2")], next_cursor: null }
          : { items: [runOf("r1")], next_cursor: "c1" },
    });
    const { result } = renderHook(() => useCiRuns(), { wrapper: wrapperFor() });
    // The mount refresh invalidates the list; let that refetch settle before paging.
    await waitFor(() => expect(result.current.refresh.isSuccess && !result.current.isFetching).toBe(true));
    expect(result.current.items.map((r) => r.id)).toEqual(["r1"]);
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(["r1", "r2"]));
    expect(fx.requests.filter((r) => r.path === "/ci/runs").some((r) => r.search.includes("cursor=c1"))).toBe(true);
    expect(fx.count("POST", "/ci/refresh")).toBe(1);
  });
});

describe("useCiRuns under React.StrictMode (AC-59 regression)", () => {
  it("completes the mount-time refresh and exposes its result instead of staying pending", async () => {
    // StrictMode mounts, unmounts and re-mounts the effect; a ref-guarded mutate() used to leave
    // `refresh.isPending` true forever (the "Refreshing…" button never came back).
    installFetch({
      "POST /ci/refresh": { degraded: false, message: null },
      "GET /ci/runs": { items: [runOf("r1")], next_cursor: null },
    });
    // `reactStrictMode: true` (RTL >= 16.1), not a <StrictMode> inside `wrapper`: the latter does
    // not re-run effects in renderHook, so it would pass even with the old ref-guarded code.
    const { result } = renderHook(() => useCiRuns(), { wrapper: wrapperFor(), reactStrictMode: true });

    // `isPending` is also false before the first mutate() (idle), so wait for the result itself.
    await waitFor(() => expect(result.current.refresh.isSuccess).toBe(true));
    expect(result.current.refresh.isPending).toBe(false);
    expect(result.current.refresh.data).toEqual({ degraded: false, message: null });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
  });
});

describe("useCiInstall", () => {
  it("posts the install body to the agent's endpoint and refetches installations and runs afterwards", async () => {
    const fx = installFetch({
      "GET /agents/ag1/ci/installations": [],
      "POST /agents/ag1/ci/install": {
        installation: installationOf("i1", { status: "pr_open" }),
        pr_url: "https://github.com/acme/api/pull/7",
        files_count: 5,
        zip_base64: null,
      },
      "POST /ci/refresh": { degraded: false, message: null },
      "GET /ci/runs": { items: [], next_cursor: null },
    });
    const { result } = renderHook(
      () => ({ installs: useCiInstallations("ag1"), runs: useCiRuns(), install: useCiInstall("ag1") }),
      { wrapper: wrapperFor() },
    );
    // Let the mount refresh (which also invalidates both lists) settle first.
    await waitFor(() => expect(result.current.runs.refresh.isSuccess && !result.current.runs.isFetching).toBe(true));
    await waitFor(() => expect(result.current.installs.isFetching).toBe(false));
    const installsBefore = fx.count("GET", "/agents/ag1/ci/installations");
    const runsBefore = fx.count("GET", "/ci/runs");

    await act(async () => {
      await result.current.install.mutateAsync({
        repo: "acme/api",
        triggers: ["opened"],
        post_as: "none",
        workflow: "name: x",
        action: "open_pr",
      });
    });

    const post = fx.requests.find((r) => r.method === "POST" && r.path === "/agents/ag1/ci/install")!;
    expect(post.body).toMatchObject({ repo: "acme/api", action: "open_pr", workflow: "name: x" });
    await waitFor(() => expect(fx.count("GET", "/agents/ag1/ci/installations")).toBe(installsBefore + 1));
    await waitFor(() => expect(fx.count("GET", "/ci/runs")).toBe(runsBefore + 1));
  });
});

describe("useCiSecrets", () => {
  it("url-encodes the repository and stays idle until one is chosen", async () => {
    const fx = installFetch({ "GET /agents/ag1/ci/secrets": { github_token_configured: true, openrouter_key: "set" } });
    const { result, rerender } = renderHook(({ repo }: { repo: string }) => useCiSecrets("ag1", repo), {
      wrapper: wrapperFor(),
      initialProps: { repo: "" },
    });
    expect(fx.requests).toHaveLength(0);
    rerender({ repo: "acme/api" });
    await waitFor(() => expect(result.current.data?.openrouter_key).toBe("set"));
    expect(fx.requests[0]!.search).toBe("?repo=acme%2Fapi");
  });
});
