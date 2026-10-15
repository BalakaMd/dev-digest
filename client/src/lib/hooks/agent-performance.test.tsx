import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { detailOf, overviewOf } from "../../test/agent-performance-fixtures";
import { installFetch } from "../../test/context-docs-fixtures";
import { useAgentPerformance, useAgentPerformanceDetail, type PerformanceRange } from "./agent-performance";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The app's provider defaults (lib/providers.tsx): staleTime 30 s, no refetch on focus. */
function clientLikeTheApp() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const paramsOf = (search: string) => Object.fromEntries(new URLSearchParams(search));

/** A resolver that returns a new range on every call, like `now` moving on. */
function movingRange() {
  let n = 0;
  return vi.fn((): PerformanceRange => {
    n += 1;
    return { from: `2026-09-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`, to: `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00.000Z` };
  });
}

describe("useAgentPerformance — the range is resolved when the read is sent (AC-5)", () => {
  it("sends repoId and the resolved instants to GET /agent-performance", async () => {
    const fx = installFetch({ "GET /agent-performance": overviewOf() });
    const resolve = vi.fn(() => ({ from: "2026-09-14T10:00:00.000Z", to: "2026-10-14T10:00:00.000Z" }));
    const { result } = renderHook(() => useAgentPerformance("r1", "30d", resolve), {
      wrapper: wrapperFor(clientLikeTheApp()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fx.requests).toHaveLength(1);
    expect(fx.requests[0]!.method).toBe("GET");
    expect(paramsOf(fx.requests[0]!.search)).toEqual({
      repoId: "r1",
      from: "2026-09-14T10:00:00.000Z",
      to: "2026-10-14T10:00:00.000Z",
    });
  });

  it("recomputes the instants on every read, so a refetch sends a new 'now'", async () => {
    const fx = installFetch({ "GET /agent-performance": overviewOf() });
    const resolve = movingRange();
    const { result } = renderHook(() => useAgentPerformance("r1", "30d", resolve), {
      wrapper: wrapperFor(clientLikeTheApp()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.refetch();
    });
    expect(fx.requests).toHaveLength(2);
    expect(paramsOf(fx.requests[0]!.search).to).toBe("2026-10-11T10:00:00.000Z");
    expect(paramsOf(fx.requests[1]!.search).to).toBe("2026-10-12T10:00:00.000Z");
  });

  it("reads again when the page is opened again, although the app keeps results fresh for 30 s", async () => {
    const fx = installFetch({ "GET /agent-performance": overviewOf() });
    const client = clientLikeTheApp();
    const first = renderHook(() => useAgentPerformance("r1", "30d", movingRange()), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(() => useAgentPerformance("r1", "30d", movingRange()), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(fx.requests).toHaveLength(2));
    second.unmount();
  });

  it("reads nothing without a repository, or while disabled", async () => {
    const fx = installFetch({ "GET /agent-performance": overviewOf() });
    const client = clientLikeTheApp();
    const none = renderHook(() => useAgentPerformance(null, "30d", movingRange()), { wrapper: wrapperFor(client) });
    const off = renderHook(() => useAgentPerformance("r1", "30d", movingRange(), false), { wrapper: wrapperFor(client) });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(fx.requests).toHaveLength(0);
    expect(none.result.current.fetchStatus).toBe("idle");
    expect(off.result.current.fetchStatus).toBe("idle");
  });
});

describe("useAgentPerformance — no automatic reads (NG-3, AC-37)", () => {
  it("does not read again when the window regains focus", async () => {
    const fx = installFetch({ "GET /agent-performance": overviewOf() });
    const { result } = renderHook(() => useAgentPerformance("r1", "30d", movingRange()), {
      wrapper: wrapperFor(clientLikeTheApp()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(fx.requests).toHaveLength(1);
  });

  it("does not poll", async () => {
    const fx = installFetch({ "GET /agent-performance": overviewOf() });
    const { result } = renderHook(() => useAgentPerformance("r1", "30d", movingRange()), {
      wrapper: wrapperFor(clientLikeTheApp()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(fx.requests).toHaveLength(1);
  });
});

describe("useAgentPerformanceDetail — one agent over the range the overview applied (AC-35)", () => {
  const A = { from: "2026-09-14T10:00:00.000Z", to: "2026-10-14T10:00:00.000Z" };
  const B = { from: "2026-10-13T10:00:00.000Z", to: "2026-10-14T10:00:00.000Z" };

  it("reads GET /agents/:id/performance with the repository and exactly the applied instants", async () => {
    const fx = installFetch({ "GET /agents/a1/performance": detailOf(overviewOf().rows[0]!) });
    const { result } = renderHook(() => useAgentPerformanceDetail("a1", "r1", A), {
      wrapper: wrapperFor(clientLikeTheApp()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fx.requests).toHaveLength(1);
    expect(fx.requests[0]!.method).toBe("GET");
    expect(paramsOf(fx.requests[0]!.search)).toEqual({ repoId: "r1", ...A });
  });

  it("reads again for another applied range instead of serving the previous one", async () => {
    const fx = installFetch({ "GET /agents/a1/performance": detailOf(overviewOf().rows[0]!) });
    const { result, rerender } = renderHook(
      ({ applied }: { applied: PerformanceRange }) => useAgentPerformanceDetail("a1", "r1", applied),
      { wrapper: wrapperFor(clientLikeTheApp()), initialProps: { applied: A } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ applied: B });
    await waitFor(() => expect(fx.requests).toHaveLength(2));
    expect(paramsOf(fx.requests[1]!.search)).toEqual({ repoId: "r1", ...B });
  });

  it("reads nothing until an agent, a repository and an applied range are all known", async () => {
    const fx = installFetch({ "GET /agents/a1/performance": detailOf(overviewOf().rows[0]!) });
    const client = clientLikeTheApp();
    const hooks = [
      renderHook(() => useAgentPerformanceDetail(null, "r1", A), { wrapper: wrapperFor(client) }),
      renderHook(() => useAgentPerformanceDetail("a1", null, A), { wrapper: wrapperFor(client) }),
      renderHook(() => useAgentPerformanceDetail("a1", "r1", null), { wrapper: wrapperFor(client) }),
    ];
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(fx.requests).toHaveLength(0);
    hooks.forEach((h) => expect(h.result.current.fetchStatus).toBe("idle"));
  });
});
