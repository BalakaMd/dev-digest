import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionsState } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/repos/r1/conventions",
  useSearchParams: () => new URLSearchParams(),
}));
// The app shell is chrome; this test is about the page.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", name: "payments-api" } }),
  useRepoNotFound: () => false,
}));

const extract = vi.fn();
const update = vi.fn();
let state: ConventionsState | undefined;
let extracting = false;
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: state, isLoading: false, isError: false }),
  useExtractConventions: () => ({ mutate: extract, isPending: extracting }),
  useUpdateConvention: () => ({ mutate: update }),
  useConventionSkillDrafts: () => ({ data: [], isLoading: false, isError: false }),
  useCreateConventionSkills: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

const candidate = (id: string, extra: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id,
  category: "async",
  rule: `Rule ${id}`,
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  line_start: 23,
  line_end: 31,
  evidence: [{ path: "src/api/users.ts", line_start: 23, line_end: 31, snippet: "const user = await db.users.find(id);" }],
  confidence: 0.91,
  status: "pending",
  created_at: new Date().toISOString(),
  ...extra,
});

const scan = {
  id: "s1",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  sample_files: ["tsconfig.json", "src/api/users.ts"],
  proposed: 3,
  kept: 2,
  dropped_unverified: 1,
  merged_duplicates: 0,
  created_at: new Date().toISOString(),
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills, common }}>
      <ToastProvider>
        <ConventionsView repoId="r1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  extract.mockReset();
  update.mockReset();
  extracting = false;
  state = undefined;
});
afterEach(cleanup);

describe("Conventions page", () => {
  it("offers Run Scan before the first scan, and no ReScan", () => {
    state = { scan: null, candidates: [], rejected: [] };
    renderView();
    expect(screen.getByText("Conventions in")).toBeInTheDocument();
    expect(screen.getByText("payments-api")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ReScan/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run Scan" }));
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("after a scan shows ReScan, the scan summary and the candidate cards", () => {
    state = { scan, candidates: [candidate("a"), candidate("b", { category: "naming", confidence: 0.6 })], rejected: [] };
    renderView();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ReScan/ }));
    expect(extract).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Detected from 2 sample files/)).toBeInTheDocument();
    expect(screen.getByText(/1 unverified candidate dropped/)).toBeInTheDocument();

    const card = screen.getByTestId("convention-a");
    expect(within(card).getByText("Rule a")).toBeInTheDocument();
    expect(within(card).getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(within(card).getByText("91%")).toBeInTheDocument();
    for (const name of ["Accept", "Reject", "Edit"]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("hides Create skill until a candidate is accepted", () => {
    state = { scan, candidates: [candidate("a")], rejected: [] };
    renderView();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
    expect(screen.getByText("0 of 1 accepted")).toBeInTheDocument();
    cleanup();

    state = { scan, candidates: [candidate("a", { status: "accepted" })], rejected: [] };
    renderView();
    expect(screen.getByText("1 of 1 accepted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
  });

  it("accepts, un-accepts and rejects through the update mutation", () => {
    state = { scan, candidates: [candidate("a"), candidate("b", { status: "accepted" })], rejected: [] };
    renderView();
    fireEvent.click(within(screen.getByTestId("convention-a")).getByRole("button", { name: "Accept" }));
    expect(update).toHaveBeenLastCalledWith({ id: "a", patch: { status: "accepted" } });
    fireEvent.click(within(screen.getByTestId("convention-b")).getByRole("button", { name: "Accepted" }));
    expect(update).toHaveBeenLastCalledWith({ id: "b", patch: { status: "pending" } });
    fireEvent.click(within(screen.getByTestId("convention-a")).getByRole("button", { name: "Reject" }));
    expect(update).toHaveBeenLastCalledWith({ id: "a", patch: { status: "rejected" } });
  });

  it("keeps rejected cards behind a Rejected (N) filter and restores them", () => {
    state = {
      scan,
      candidates: [candidate("a")],
      rejected: [candidate("r", { status: "rejected", rule: "Rejected rule" })],
    };
    renderView();
    expect(screen.queryByTestId("convention-r")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 1 accepted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Rejected/ }));
    expect(screen.queryByTestId("convention-a")).not.toBeInTheDocument();
    const card = screen.getByTestId("convention-r");
    expect(within(card).queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Restore" }));
    expect(update).toHaveBeenLastCalledWith({ id: "r", patch: { status: "pending" } });
  });

  it("hides the Rejected filter when nothing is rejected", () => {
    state = { scan, candidates: [candidate("a")], rejected: [] };
    renderView();
    expect(screen.queryByRole("button", { name: /Rejected/ })).not.toBeInTheDocument();
  });

  it("filters cards by category", () => {
    state = { scan, candidates: [candidate("a"), candidate("b", { category: "naming" })], rejected: [] };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Naming/ }));
    expect(screen.queryByTestId("convention-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("convention-b")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(screen.getByTestId("convention-a")).toBeInTheDocument();
  });
});
