import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import shell from "../../../../messages/en/shell.json";
import { apiError, installFetch } from "../../../test/context-docs-fixtures";

const push = vi.fn();
const mutate = vi.fn();
let pathname = "/repos/r1/pulls";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("../../../lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../../lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    repos: [
      { id: "r1", full_name: "acme/payments-api", default_branch: "main", last_polled_at: null },
      { id: "r2", full_name: "acme/web", default_branch: "main", last_polled_at: null },
    ],
    activeRepo: { id: "r1", full_name: "acme/payments-api", default_branch: "main", last_polled_at: null },
    reposLoaded: true,
    setRepoId: vi.fn(),
  }),
}));
// Only the two platform hooks are replaced; `fetchLocalDocCount` stays real and goes through the mocked fetch.
vi.mock("../../../lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/hooks")>()),
  usePulls: () => ({ data: [] }),
  useDeleteRepo: () => ({ mutate }),
}));

import { useShellContext } from "./useShellContext";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useShellContext({ onOpenCommandPalette: () => {} }), { wrapper });
}

let confirm: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pathname = "/repos/r1/pulls";
  push.mockReset();
  mutate.mockReset();
  confirm = vi.fn(() => true);
  vi.stubGlobal("confirm", confirm);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useShellContext — sidebar entry (AC-51)", () => {
  it('marks "context" active on the Project Context route, not the pull requests entry', () => {
    pathname = "/repos/r1/context";
    expect(setup().result.current.activeKey).toBe("context");
  });

  it('keeps "pulls" active on a pull request route', () => {
    pathname = "/repos/r1/pulls/12";
    expect(setup().result.current.activeKey).toBe("pulls");
  });
});

describe("useShellContext — removing a repository (AC-87)", () => {
  it("states how many local documents will be deleted, then removes the repository", async () => {
    const net = installFetch({ "GET /repos/r2/context-docs/local-count": { count: 3 } });
    const { result } = setup();
    await result.current.onRemoveRepo!("r2");

    expect(net.requests[0]).toMatchObject({ method: "GET", path: "/repos/r2/context-docs/local-count" });
    expect(confirm).toHaveBeenCalledTimes(1);
    const message = confirm.mock.calls[0]![0] as string;
    expect(message).toContain("acme/web");
    expect(message).toContain("3 local documents");
    expect(mutate).toHaveBeenCalledWith("r2", expect.any(Object));
  });

  it("uses the singular for one document", async () => {
    installFetch({ "GET /repos/r2/context-docs/local-count": { count: 1 } });
    await setup().result.current.onRemoveRepo!("r2");
    expect(confirm.mock.calls[0]![0]).toContain("1 local document ");
  });

  it("keeps the plain confirmation when the repository has no local documents", async () => {
    installFetch({ "GET /repos/r2/context-docs/local-count": { count: 0 } });
    await setup().result.current.onRemoveRepo!("r2");
    const message = confirm.mock.calls[0]![0] as string;
    expect(message).toContain("acme/web");
    expect(message).not.toContain("local document");
  });

  it("falls back to the plain confirmation when the count cannot be read", async () => {
    installFetch({ "GET /repos/r2/context-docs/local-count": apiError(500, "boom") });
    await setup().result.current.onRemoveRepo!("r2");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).not.toContain("local document");
    expect(mutate).toHaveBeenCalled();
  });

  it("removes nothing when the user declines", async () => {
    installFetch({ "GET /repos/r2/context-docs/local-count": { count: 2 } });
    confirm.mockReturnValue(false);
    await setup().result.current.onRemoveRepo!("r2");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("moves to another repository after removing the active one", async () => {
    installFetch({ "GET /repos/r1/context-docs/local-count": { count: 0 } });
    await setup().result.current.onRemoveRepo!("r1");
    const opts = mutate.mock.calls[0]![1] as { onSuccess: () => void };
    opts.onSuccess();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/repos/r2/pulls"));
  });
});
