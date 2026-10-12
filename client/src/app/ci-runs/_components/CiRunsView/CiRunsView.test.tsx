import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ci from "../../../../../messages/en/ci.json";
import common from "../../../../../messages/en/common.json";
import { installFetch } from "../../../../test/context-docs-fixtures";
import { runDetailOf, runOf, traceOf } from "../../../../test/ci-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/ci-runs",
  useSearchParams: () => new URLSearchParams(),
}));
// The app shell is chrome; this test is about the page.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ ci, common }}>
        <CiRunsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const OK = { degraded: false, message: null };

describe("CiRunsView — list and refresh (AC-47, AC-59)", () => {
  it("collects from GitHub once when the page opens and lists the stored runs", async () => {
    const fx = installFetch({
      "POST /ci/refresh": OK,
      "GET /ci/runs": { items: [runOf("r1"), runOf("r2", { pr_number: 43, verdict: "failed" })], next_cursor: null },
    });
    renderView();
    expect(await screen.findByTestId("ci-run-r1")).toBeInTheDocument();
    expect(screen.getByTestId("ci-run-r2")).toBeInTheDocument();
    expect(fx.count("POST", "/ci/refresh")).toBe(1);
    expect(screen.queryByTestId("ci-degraded")).not.toBeInTheDocument();
  });

  it("collects again when the user presses Refresh", async () => {
    const fx = installFetch({
      "POST /ci/refresh": OK,
      "GET /ci/runs": { items: [runOf("r1")], next_cursor: null },
    });
    renderView();
    await screen.findByTestId("ci-run-r1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fx.count("POST", "/ci/refresh")).toBe(2));
  });
});

describe("CiRunsView — empty state (AC-50)", () => {
  it("explains where CI runs come from and links to the Agents page", async () => {
    installFetch({ "POST /ci/refresh": OK, "GET /ci/runs": { items: [], next_cursor: null } });
    renderView();
    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();
    expect(screen.getByText(/CI runs appear here after an exported agent reviews a pull request/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agents page." })).toHaveAttribute("href", "/agents");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("CiRunsView — GitHub unreachable (AC-58)", () => {
  it("keeps the stored runs and shows a notice instead of an error", async () => {
    installFetch({
      "POST /ci/refresh": { degraded: true, message: "GitHub rate limit reached." },
      "GET /ci/runs": { items: [runOf("r1")], next_cursor: null },
    });
    renderView();
    const notice = await screen.findByTestId("ci-degraded");
    expect(notice).toHaveTextContent("GitHub rate limit reached.");
    expect(notice).toHaveTextContent("Showing the runs stored so far.");
    expect(screen.getByTestId("ci-run-r1")).toBeInTheDocument();
    expect(screen.queryByText("Could not load CI runs")).not.toBeInTheDocument();
  });
});

describe("CiRunsView — run details (AC-51)", () => {
  it("shows manifest version and hash, model, dependencies, skill hashes and the reviewed commit", async () => {
    installFetch({
      "POST /ci/refresh": OK,
      "GET /ci/runs": { items: [runOf("r1")], next_cursor: null },
      "GET /ci/runs/r1": runDetailOf("r1", {
        trace: traceOf({
          manifest: { agent_version: 7, sha256: "1".repeat(64) },
          runner_version: "0.2.0",
          reviewer_core_revision: "2".repeat(40),
          node_version: "v22.11.0",
          skill_hashes: [{ slug: "owasp-top-10", sha256: "3".repeat(64) }],
        }),
        head_sha: "4".repeat(40),
        model: "openai/gpt-4.1",
      }),
    });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: /Details/ }));

    const drawer = within(await screen.findByRole("dialog"));
    expect(await drawer.findByText("v7")).toBeInTheDocument();
    for (const value of [
      "1".repeat(64),
      "openai/gpt-4.1",
      "0.2.0",
      "2".repeat(40),
      "v22.11.0",
      "4".repeat(40),
      "owasp-top-10",
      "3".repeat(64),
    ]) {
      expect(drawer.getByText(value)).toBeInTheDocument();
    }
  });

  it("shows a dash for the trace of a run that has none (failed run or older runner)", async () => {
    installFetch({
      "POST /ci/refresh": OK,
      "GET /ci/runs": { items: [runOf("f1", { verdict: "failed" })], next_cursor: null },
      "GET /ci/runs/f1": runDetailOf("f1", { verdict: "failed", trace: null, model: null, head_sha: null }),
    });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: /Details/ }));

    const drawer = within(await screen.findByRole("dialog"));
    const label = await drawer.findByText("Manifest SHA-256");
    expect(label.nextElementSibling).toHaveTextContent("—");
    expect(drawer.getByText("Agent version").nextElementSibling).toHaveTextContent("—");
    expect(drawer.getByText("Model").nextElementSibling).toHaveTextContent("—");
  });
});
