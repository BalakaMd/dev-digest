import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { installFetch } from "@/test/context-docs-fixtures";
import { useEvalCases } from "./eval";
import { useFindingAction } from "./reviews";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const fx = installFetch({
    "GET /agents/a1/eval-cases": [],
    "POST /findings/f1/dismiss": { finding: { id: "f1" } },
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => ({ cases: useEvalCases("a1"), action: useFindingAction() }), { wrapper });
  return { fx, hook };
}

describe("useFindingAction eval-case invalidation", () => {
  it("refetches eval cases after a decision on a finding", async () => {
    const { fx, hook } = setup();
    await waitFor(() => expect(fx.count("GET", "/agents/a1/eval-cases")).toBe(1));
    await act(async () => {
      hook.result.current.action.mutate({ findingId: "f1", action: "dismiss", prId: "p1" });
    });
    await waitFor(() => expect(fx.count("GET", "/agents/a1/eval-cases")).toBe(2));
  });

  it("refetches eval cases even without prId", async () => {
    const { fx, hook } = setup();
    await waitFor(() => expect(fx.count("GET", "/agents/a1/eval-cases")).toBe(1));
    await act(async () => {
      hook.result.current.action.mutate({ findingId: "f1", action: "dismiss" });
    });
    await waitFor(() => expect(fx.count("GET", "/agents/a1/eval-cases")).toBe(2));
  });
});
