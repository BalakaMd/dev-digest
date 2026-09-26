import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  FindingRecord,
  PrFile,
  PrReviewComment,
  ReviewRecord,
  SmartDiffResponse,
} from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

// ---- controllable hook state (reset in beforeEach) ----
let reviewsData: ReviewRecord[] | undefined;
let reviewsFetched = true;
let smartData: SmartDiffResponse | undefined;
let smartLoading = false;
let smartError = false;
let commentsData: PrReviewComment[] = [];
const actionMutate = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: commentsData }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: reviewsData, isFetched: reviewsFetched }),
  useFindingAction: () => ({ mutate: actionMutate, isPending: false, variables: undefined }),
}));

vi.mock("@/lib/hooks/smart-diff", () => ({
  usePrSmartDiff: () => ({ data: smartData, isLoading: smartLoading, isError: smartError }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "finding",
    file: "src/app.ts",
    start_line: 5,
    end_line: 5,
    rationale: "rationale text",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: "agent-a",
    run_id: null,
    agent_name: "Agent A",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    grounding: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...o,
  } as ReviewRecord;
}

function prFile(path: string, patch: string | null = null): PrFile {
  return { path, additions: 1, deletions: 0, patch };
}

// ---- fixed fixture: one file per role, core has three files (app/other/third) ----
const APP = prFile("src/app.ts", "@@ -4,0 +5,2 @@\n+line5\n+line6");
const OTHER = prFile("src/other.ts", "@@ -1,0 +1,1 @@\n+untouched");
const THIRD = prFile("src/third.ts", "@@ -2,0 +3,1 @@\n+line3");
const TEST_FILE = prFile("src/foo.test.ts");
const WIRING_FILE = prFile("src/index.ts");
const DOCS_FILE = prFile("README.md");
const LOCK_FILE = prFile("pnpm-lock.yaml");

const FILES: PrFile[] = [APP, OTHER, THIRD, TEST_FILE, WIRING_FILE, DOCS_FILE, LOCK_FILE];

const SMART: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/app.ts", additions: 2, deletions: 0, finding_lines: [5, 6] },
        { path: "src/other.ts", additions: 1, deletions: 0, finding_lines: [] },
        { path: "src/third.ts", additions: 1, deletions: 0, finding_lines: [3] },
      ],
    },
    { role: "tests", files: [{ path: "src/foo.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [{ path: "src/index.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
    {
      role: "boilerplate",
      files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 7, proposed_splits: [] },
};

const CRITICAL_FINDING = finding({
  id: "f-crit",
  severity: "CRITICAL",
  title: "Hardcoded secret",
  file: "src/app.ts",
  start_line: 5,
});
const WARNING_FINDING = finding({
  id: "f-warn",
  severity: "WARNING",
  title: "Unbounded loop",
  file: "src/app.ts",
  start_line: 6,
});
const SUGGESTION_FINDING = finding({
  id: "f-sugg",
  severity: "SUGGESTION",
  title: "Magic number",
  file: "src/third.ts",
  start_line: 3,
});

const REVIEW_WITH_FINDINGS: ReviewRecord = review({
  findings: [CRITICAL_FINDING, WARNING_FINDING, SUGGESTION_FINDING],
});

function renderTab(props: Partial<React.ComponentProps<typeof DiffTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  reviewsData = [REVIEW_WITH_FINDINGS];
  reviewsFetched = true;
  smartData = SMART;
  smartLoading = false;
  smartError = false;
  commentsData = [];
  actionMutate.mockReset();
});

describe("DiffTab — role groups", () => {
  it("orders the groups core -> tests -> wiring -> docs -> boilerplate", () => {
    const { container } = renderTab();
    const text = container.textContent ?? "";
    const order = ["Core", "Tests", "Wiring", "Docs", "Boilerplate"].map((label) => text.indexOf(label));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("lands the lock file in the Boilerplate group", () => {
    const { container } = renderTab();
    // Boilerplate starts collapsed — open it, then confirm the lock file is
    // inside its section and not, e.g., under Docs (the group right before it).
    fireEvent.click(screen.getByText("Boilerplate"));
    const text = container.textContent ?? "";
    const iDocs = text.indexOf("Docs");
    const iBoilerplate = text.indexOf("Boilerplate");
    const iLock = text.indexOf("pnpm-lock.yaml");
    expect(iLock).toBeGreaterThan(iBoilerplate);
    expect(iBoilerplate).toBeGreaterThan(iDocs);
  });

  it("starts docs and boilerplate collapsed, core/tests/wiring open", () => {
    renderTab();
    // core/tests/wiring files are visible without any click
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("src/foo.test.ts")).toBeInTheDocument();
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    // docs/boilerplate files are not, until their header is opened
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("shows a group header count of files-with-findings (2), not the number of findings (3)", () => {
    const { container } = renderTab();
    const text = container.textContent ?? "";
    const iCore = text.indexOf("Core");
    const iFilesCount = text.indexOf("3 files", iCore);
    const iDotCount = text.indexOf("2", iCore);
    expect(iFilesCount).toBeGreaterThan(-1);
    expect(iDotCount).toBeGreaterThan(iCore);
    expect(iDotCount).toBeLessThan(iFilesCount);
  });

  it("hides an empty role group — Wiring, when the response reports no files for it", () => {
    const smartNoWiring: SmartDiffResponse = {
      ...SMART,
      groups: SMART.groups.map((g) => (g.role === "wiring" ? { ...g, files: [] } : g)),
    };
    smartData = smartNoWiring;
    renderTab();
    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
    // the other, non-empty groups still render
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Tests")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
  });
});

describe("DiffTab — file dot indicator", () => {
  it("marks only the files that have findings", () => {
    renderTab();
    // app.ts and third.ts have findings; other.ts does not.
    expect(screen.getAllByTitle("This file has review findings")).toHaveLength(2);
  });

  it("keeps the finding dot and the GitHub comment counter as two separate elements on the same file", () => {
    commentsData = [
      {
        id: 101,
        path: "src/app.ts",
        line: 5,
        original_line: 5,
        side: "RIGHT",
        body: "Please fix this before merging.",
        user: "octocat",
        created_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/acme/repo/pull/1#discussion_r101",
        in_reply_to_id: null,
        is_outdated: false,
      },
    ];
    const { container } = renderTab();

    // src/app.ts has both a review finding (the dot) and a GitHub comment.
    const markers = screen.getAllByTitle("This file has review findings");
    expect(markers).toHaveLength(2); // app.ts and third.ts, as above
    const marker = markers[0]!;

    const commentIcon = container.querySelector("svg.lucide-message-square");
    expect(commentIcon).not.toBeNull();
    expect(commentIcon!.parentElement!.textContent).toContain("1");

    // distinct elements — the dot never doubles as the GitHub comment counter.
    expect(marker).not.toBe(commentIcon);
    expect(marker.contains(commentIcon)).toBe(false);
    expect(commentIcon!.contains(marker)).toBe(false);
  });
});

describe("DiffTab — inline findings", () => {
  it("renders each finding under its file, with the right severity word", () => {
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Unbounded loop")).toBeInTheDocument();
    expect(screen.getByText("Magic number")).toBeInTheDocument();
    // Each severity word appears exactly twice with this fixture: once on the
    // InlineFinding card's own header, once on the code line's decoration
    // pill (one finding per line here, so no "most severe" collapsing).
    expect(screen.getAllByText("blocker")).toHaveLength(2);
    expect(screen.getAllByText("warning")).toHaveLength(2);
    expect(screen.getAllByText("suggestion")).toHaveLength(2);
  });

  it("anchors a finding to the code line matching its start_line, not just anywhere in the file", () => {
    const { container } = renderTab();
    const text = container.textContent ?? "";
    // "line5" (the code line at RIGHT:5) should precede its finding's title,
    // which should precede the next code line ("line6").
    const iLine5 = text.indexOf("line5");
    const iFinding = text.indexOf("Hardcoded secret");
    const iLine6 = text.indexOf("line6");
    expect(iLine5).toBeGreaterThan(-1);
    expect(iFinding).toBeGreaterThan(iLine5);
    expect(iFinding).toBeLessThan(iLine6);
  });

  it("renders a finding whose start_line isn't in the patch in the trailing 'outside the diff' block, never dropping it", () => {
    const outsideFinding = finding({
      id: "f-outside",
      severity: "WARNING",
      title: "Stale suppression comment",
      file: "src/app.ts",
      start_line: 999, // not among app.ts's patch lines (5, 6)
    });
    reviewsData = [
      review({ findings: [CRITICAL_FINDING, WARNING_FINDING, SUGGESTION_FINDING, outsideFinding] }),
    ];
    const { container } = renderTab();

    expect(screen.getByText("Stale suppression comment")).toBeInTheDocument();
    expect(screen.getByText("Findings outside the diff")).toBeInTheDocument();

    // it sits after the file's last code line and after the trailing block's
    // own title — i.e. in the trailing block, not anchored to a code line.
    const text = container.textContent ?? "";
    const iLine6 = text.indexOf("line6");
    const iTitle = text.indexOf("Findings outside the diff");
    const iOutside = text.indexOf("Stale suppression comment");
    expect(iLine6).toBeGreaterThan(-1);
    expect(iTitle).toBeGreaterThan(iLine6);
    expect(iOutside).toBeGreaterThan(iTitle);
  });
});

describe("DiffTab — finding actions", () => {
  it("calls useFindingAction().mutate with { findingId, action, prId } on Accept and Dismiss", () => {
    renderTab();
    const card = screen.getByText("Hardcoded secret").closest("[data-finding-id]") as HTMLElement;

    fireEvent.click(within(card).getByText("Accept"));
    expect(actionMutate).toHaveBeenCalledWith({ findingId: "f-crit", action: "accept", prId: "pr1" });

    fireEvent.click(within(card).getByText("Reject")); // the Dismiss button, labelled "Reject"
    expect(actionMutate).toHaveBeenCalledWith({ findingId: "f-crit", action: "dismiss", prId: "pr1" });
  });
});

describe("DiffTab — order toggle", () => {
  it("switches to the flat original (GitHub) order and drops the role groups", () => {
    renderTab();
    expect(screen.getByText("Core")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Original order"));

    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.queryByText("Tests")).not.toBeInTheDocument();
    // every file (including the ones that were collapsed under docs/boilerplate)
    // is now visible, flat, in pr.files order.
    const container = screen.getByText("src/app.ts").closest("section") as HTMLElement;
    const text = container.textContent ?? "";
    const order = FILES.map((f) => text.indexOf(f.path));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    // toggling back restores Smart order
    fireEvent.click(screen.getByText("Smart order"));
    expect(screen.getByText("Core")).toBeInTheDocument();
  });
});

describe("DiffTab — comments toggle", () => {
  it("hides inline findings when toggled off, and restores them when toggled back on", () => {
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Hide comments/));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Unbounded loop")).not.toBeInTheDocument();
    expect(screen.queryByText("Magic number")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Show comments/));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("keeps the line's severity pill visible even while the InlineFinding cards are hidden", () => {
    renderTab();
    // before toggling: "blocker" appears twice (the card's header + the line pill)
    expect(screen.getAllByText("blocker")).toHaveLength(2);

    fireEvent.click(screen.getByText(/Hide comments/));

    // the InlineFinding card (and its title) is gone...
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    // ...but the line's own severity pill is still there, on its own.
    expect(screen.getAllByText("blocker")).toHaveLength(1);
  });
});

describe("DiffTab — shared-line decoration", () => {
  it("uses the most severe finding's colour and label when two findings share a line", () => {
    const file = prFile("src/shared-line.ts", "@@ -0,0 +1,1 @@\n+shared line text");
    const critical = finding({
      id: "f-shared-crit",
      severity: "CRITICAL",
      title: "Critical one",
      file: "src/shared-line.ts",
      start_line: 1,
    });
    const warning = finding({
      id: "f-shared-warn",
      severity: "WARNING",
      title: "Warning one",
      file: "src/shared-line.ts",
      start_line: 1,
    });
    reviewsData = [review({ findings: [warning, critical] })]; // deliberately not severity-sorted
    smartData = {
      groups: [
        {
          role: "core",
          files: [{ path: "src/shared-line.ts", additions: 1, deletions: 0, finding_lines: [1] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
    };

    renderTab({ files: [file], filesCount: 1 });

    // both findings still render their own cards...
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.getByText("Warning one")).toBeInTheDocument();
    // "blocker" appears twice (CRITICAL's own card + the shared line's pill);
    // "warning" appears only once (WARNING's own card) — there is no second,
    // lower-severity pill for the same line.
    expect(screen.getAllByText("blocker")).toHaveLength(2);
    expect(screen.getAllByText("warning")).toHaveLength(1);

    // ...and the shared line's own bar uses the CRITICAL colour, not WARNING's.
    const row = screen.getByText("shared line text").parentElement as HTMLElement;
    expect(row.style.borderLeftColor).toBe("var(--crit)");
  });
});

describe("DiffTab — before any review", () => {
  it('shows the "review not run yet" hint and no findings-count badges', () => {
    reviewsData = [];
    renderTab();
    expect(
      screen.getByText("Review not run yet — run a review to see findings in the diff"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByTitle("This file has review findings")).not.toBeInTheDocument();
    // groups still render (grouping works before the first review), but with
    // no dot/count badge next to "N files".
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("3 files")).toBeInTheDocument();
  });
});
