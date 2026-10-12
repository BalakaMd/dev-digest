import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ci from "../../../messages/en/ci.json";
import { runOf } from "../../test/ci-fixtures";
import { CiRunsTable, type CiRunsTableProps } from "./CiRunsTable";

afterEach(cleanup);

function renderTable(props: CiRunsTableProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci }}>
      <CiRunsTable {...props} />
    </NextIntlClientProvider>,
  );
}

const row = (id: string) => within(screen.getByTestId(`ci-run-${id}`));

describe("CiRunsTable — columns and links (AC-47)", () => {
  it("shows repository, PR, agent, verdict, findings, cost, duration and the job link, with both links opening a new tab", () => {
    renderTable({ items: [runOf("r1", { verdict: "request_changes" })] });

    for (const name of ["Time", "Pull request", "Agent", "Verdict", "Findings", "Cost", "Duration", "Job"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const r = row("r1");
    expect(r.getByText("acme/api")).toBeInTheDocument();
    expect(r.getByText("Security Reviewer")).toBeInTheDocument();
    expect(r.getByText("3")).toBeInTheDocument();
    expect(r.getByText("$0.0123")).toBeInTheDocument();

    const pr = r.getByRole("link", { name: "#42" });
    expect(pr).toHaveAttribute("href", "https://github.com/acme/api/pull/42");
    const job = r.getByRole("link", { name: "Actions job" });
    expect(job).toHaveAttribute("href", "https://github.com/acme/api/actions/runs/9/job/1");
    for (const a of [pr, job]) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("hides the agent column on request and offers a details button only when onOpen is given", () => {
    const onOpen = vi.fn();
    const items = [runOf("r1")];
    const { unmount } = renderTable({ items, hideAgent: true });
    expect(screen.queryByRole("columnheader", { name: "Agent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Details/ })).not.toBeInTheDocument();
    unmount();

    renderTable({ items, onOpen });
    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(onOpen).toHaveBeenCalledWith(items[0]);
  });
});

describe("CiRunsTable — verdict, missing values, durations (AC-48, AC-49, AC-52, EC-23)", () => {
  it("shows the stored verdict as text, whatever the agent's current Fail CI on is", () => {
    renderTable({
      items: [runOf("r1", { verdict: "request_changes" }), runOf("r2", { verdict: "approve" })],
    });
    expect(row("r1").getByText("Request changes")).toBeInTheDocument();
    expect(row("r2").getByText("Approve")).toBeInTheDocument();
  });

  it("shows a failed run as \"Failed\" with a dash for every value it did not report", () => {
    renderTable({
      items: [
        runOf("f1", {
          verdict: "failed",
          findings_count: null,
          cost_usd: null,
          duration_ms: null,
          agent_name: null,
        }),
      ],
    });
    const r = row("f1");
    expect(r.getByText("Failed")).toBeInTheDocument();
    // agent, findings, cost, duration
    expect(r.getAllByText("—")).toHaveLength(4);
  });

  it("shows durations in seconds or minutes, never as raw milliseconds", () => {
    renderTable({
      items: [runOf("s", { duration_ms: 12_000 }), runOf("m", { duration_ms: 65_000 })],
    });
    expect(row("s").getByText("12 s")).toBeInTheDocument();
    expect(row("m").getByText("1.1 min")).toBeInTheDocument();
    expect(screen.queryByText(/12000|65000/)).not.toBeInTheDocument();
  });
});

describe("CiRunsTable — hostile data stays inert (NFR-2)", () => {
  it("renders strings as text and never follows a non-github.com link", () => {
    renderTable({
      items: [
        runOf("x", {
          agent_name: "<img src=x onerror=alert(1)>",
          repo: "evil/<b>repo</b>",
          pr_url: "https://evil.example/pull/1",
          job_url: "javascript:alert(1)",
        }),
      ],
    });
    const r = row("x");
    expect(r.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();

    // The job link is dropped; the PR link falls back to a github.com URL built from repo + number.
    expect(r.queryByRole("link", { name: "Actions job" })).not.toBeInTheDocument();
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.every((h) => h.startsWith("https://github.com/"))).toBe(true);
    expect(hrefs.some((h) => h.includes("evil.example") || h.startsWith("javascript:"))).toBe(false);
  });
});
