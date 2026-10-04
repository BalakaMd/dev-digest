import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import projectContext from "../../../../../../../../../messages/en/projectContext.json";
import { installFetch, usageOf } from "../../../../../../../../test/context-docs-fixtures";
import { CopyDraftNotice } from "./CopyDraftNotice";

const BASE = "/repos/r1/context-docs";

function renderNotice() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ projectContext }}>
        <CopyDraftNotice repoId="r1" path="specs/api.md" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CopyDraftNotice — who uses the copy (AC-25)", () => {
  it("names the agents and skills that attach the path and says they use the copy from their next run", async () => {
    installFetch({
      [`GET ${BASE}/usage`]: usageOf({
        attached_by_agents: [{ id: "a1", name: "Security reviewer" }],
        attached_by_skills: [{ id: "s1", name: "API rubric" }],
      }),
    });
    renderNotice();
    const note = await screen.findByRole("note");
    expect(await screen.findByText("Security reviewer")).toBeInTheDocument();
    expect(screen.getByText("API rubric")).toBeInTheDocument();
    expect(note).toHaveTextContent("will use your copy from their next run on");
  });
});
