import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import projectContext from "../../../../../../../../../messages/en/projectContext.json";
import common from "../../../../../../../../../messages/en/common.json";
import { installFetch, usageOf } from "../../../../../../../../test/context-docs-fixtures";
import { RevertCopyDialog } from "./RevertCopyDialog";

const BASE = "/repos/r1/context-docs";

let onReverted: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ projectContext, common }}>
        <RevertCopyDialog repoId="r1" path="specs/api.md" onReverted={onReverted} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const usage = usageOf({
  attached_by_agents: [{ id: "a1", name: "Security reviewer" }],
  attached_by_skills: [{ id: "s1", name: "API rubric" }],
});

beforeEach(() => {
  onReverted = vi.fn();
  onClose = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RevertCopyDialog — revert a local copy to the repository version (AC-14)", () => {
  it("names the edits that are discarded and the agents and skills that use the repository document again; Revert deletes the copy", async () => {
    const net = installFetch({ [`GET ${BASE}/usage`]: usage, [`DELETE ${BASE}/local`]: { ok: true } });
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Revert to repository version?")).toBeInTheDocument();
    expect(within(dialog).getByText("The edits of your copy of specs/api.md are discarded.")).toBeInTheDocument();
    expect(await within(dialog).findByText("Security reviewer")).toBeInTheDocument();
    expect(within(dialog).getByText("API rubric")).toBeInTheDocument();
    expect(within(dialog).getByText("These will use the repository document again:")).toBeInTheDocument();
    expect(net.count("DELETE", `${BASE}/local`)).toBe(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Revert" }));
    await waitFor(() => expect(onReverted).toHaveBeenCalledTimes(1));
    const del = net.requests.find((r) => r.method === "DELETE")!;
    expect(new URLSearchParams(del.search).get("path")).toBe("specs/api.md");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel closes the dialog and deletes nothing", async () => {
    const net = installFetch({ [`GET ${BASE}/usage`]: usage });
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Security reviewer");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReverted).not.toHaveBeenCalled();
    expect(net.requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  });
});
