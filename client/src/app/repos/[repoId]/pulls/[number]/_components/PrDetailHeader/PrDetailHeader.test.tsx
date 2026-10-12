import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrDetail } from "@/lib/types";
import agentPicker from "../../../../../../../../messages/en/agentPicker.json";

const mockLatest = vi.fn();

vi.mock("@/lib/hooks/multi-agent-review", () => ({
  useLatestMultiAgentRun: (prId: string | null) => mockLatest(prId),
}));
// The picker has its own tests; here it only has to be mounted.
vi.mock("../AgentPicker", () => ({ AgentPicker: () => <div data-testid="agent-picker" /> }));

import { PrDetailHeader } from "./PrDetailHeader";

afterEach(() => {
  cleanup();
  mockLatest.mockReset();
});

const PR = {
  number: 42,
  title: "Add pagination",
  author: "ada",
  branch: "feat/page",
  base: "main",
  additions: 3,
  deletions: 1,
  files_count: 2,
  status: "open",
} as unknown as PrDetail;

function renderHeader() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPicker }}>
      <PrDetailHeader
        pr={PR}
        prId="pr1"
        tab="overview"
        findingsCount={0}
        githubUrl={null}
        onSetTab={() => {}}
        onRunsStarted={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe('PrDetailHeader — "Latest multi-agent run" link (AC-59)', () => {
  it("links to the result page of the latest multi-agent run of this PR", () => {
    mockLatest.mockReturnValue({ data: { latest: { id: "mar-7", ran_at: "2026-10-11T10:00:00Z" } } });
    renderHeader();
    expect(mockLatest).toHaveBeenCalledWith("pr1");
    expect(screen.getByRole("link", { name: "Latest multi-agent run" })).toHaveAttribute(
      "href",
      "/multi-agent-review/mar-7",
    );
  });

  it("shows no link when the PR has no multi-agent run", () => {
    mockLatest.mockReturnValue({ data: { latest: null } });
    renderHeader();
    expect(screen.queryByRole("link", { name: "Latest multi-agent run" })).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-picker")).toBeInTheDocument();
  });

  it("shows no link while the latest run is still loading", () => {
    mockLatest.mockReturnValue({ data: undefined });
    renderHeader();
    expect(screen.queryByRole("link", { name: "Latest multi-agent run" })).not.toBeInTheDocument();
  });
});
