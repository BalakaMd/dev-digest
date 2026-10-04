import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocEntry } from "@devdigest/shared";
import projectContext from "../../../../../../../../../messages/en/projectContext.json";
import contextDocs from "../../../../../../../../../messages/en/contextDocs.json";
import common from "../../../../../../../../../messages/en/common.json";
import { apiError, entry, installFetch, usageOf } from "../../../../../../../../test/context-docs-fixtures";
import { DocViewer } from "./DocViewer";

const BASE = "/repos/r1/context-docs";

let handlers: Record<"onEditCopy" | "onRevert" | "onOpenCopy" | "onKeptCopy" | "onDelete", ReturnType<typeof vi.fn>>;

function renderViewer(doc: ContextDocEntry) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ projectContext, contextDocs, common }}>
        <DocViewer
          repoId="r1"
          doc={doc}
          guard={(leave) => leave()}
          onDirtyChange={() => {}}
          onSaved={() => {}}
          onConflict={() => {}}
          {...handlers}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const repoContent = (over: Record<string, unknown> = {}) => ({
  path: "docs/guide.md",
  source: "repo",
  content: "# Guide",
  version: "repo-v3",
  size_bytes: 7,
  ...over,
});

beforeEach(() => {
  handlers = {
    onEditCopy: vi.fn(),
    onRevert: vi.fn(),
    onOpenCopy: vi.fn(),
    onKeptCopy: vi.fn(),
    onDelete: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocViewer — repository document (AC-4, AC-5, AC-8)", () => {
  it('"Edit a copy" hands the freshly read repository text and its version to the page, with no request that writes', async () => {
    const net = installFetch({
      [`GET ${BASE}/content`]: repoContent(),
      [`GET ${BASE}/usage`]: usageOf(),
    });
    renderViewer(entry("docs/guide.md"));
    const button = screen.getByRole("button", { name: "Edit a copy of docs/guide.md" });
    expect(button).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() => expect(handlers.onEditCopy).toHaveBeenCalledTimes(1));
    expect(handlers.onEditCopy.mock.calls[0]![1]).toEqual({ initialText: "# Guide", originVersion: "repo-v3" });
    expect(net.requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  });

  it('is disabled with the reason "Too large" for a document over the size limit', () => {
    installFetch({ [`GET ${BASE}/usage`]: usageOf(), [`GET ${BASE}/content`]: repoContent() });
    renderViewer(entry("docs/guide.md", { too_large: true, tokens: null, size_bytes: 70_000 }));
    const button = screen.getByRole("button", { name: "Edit a copy of docs/guide.md" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Too large");
    fireEvent.click(button);
    expect(handlers.onEditCopy).not.toHaveBeenCalled();
  });

  it('is disabled with the reason "Not valid UTF-8" when the repository text cannot be read as UTF-8', async () => {
    installFetch({
      [`GET ${BASE}/usage`]: usageOf(),
      [`GET ${BASE}/content`]: () => apiError(422, "not valid UTF-8", { reason: "not_utf8" }, "validation_error"),
    });
    renderViewer(entry("docs/guide.md"));
    const button = screen.getByRole("button", { name: "Edit a copy of docs/guide.md" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAccessibleDescription("Not valid UTF-8");
    expect(handlers.onEditCopy).not.toHaveBeenCalled();
  });
});

describe("DocViewer — overridden repository document (AC-12, AC-26, AC-27)", () => {
  it("is a read-only preview with a disabled, explained Edit toggle and a link to the copy; it is not used and cannot be deleted", async () => {
    const net = installFetch({
      [`GET ${BASE}/content`]: repoContent({ content: "# Original" }),
      [`GET ${BASE}/usage`]: usageOf(),
    });
    renderViewer(entry("docs/guide.md", { overridden: true }));

    const edit = screen.getByRole("button", { name: "Edit" });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription("A local copy overrides this document.");
    expect(screen.queryByRole("button", { name: /Edit a copy/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revert/ })).not.toBeInTheDocument();
    expect(screen.getByText("Not used — overridden by a local copy")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Coverage/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Original" })).toBeInTheDocument();
    expect(net.count("GET", `${BASE}/usage`)).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Open local copy of docs/guide.md" }));
    expect(handlers.onOpenCopy).toHaveBeenCalledTimes(1);
  });
});

describe("DocViewer — local override copy (AC-20, AC-21, AC-22)", () => {
  const copy = (over: Partial<ContextDocEntry> = {}) => entry("docs/guide.md", { source: "local", overrides_repo: true, ...over });

  it('offers "Revert to repository version" instead of Delete, and Edit', () => {
    installFetch({ [`GET ${BASE}/content`]: repoContent({ source: "local" }), [`GET ${BASE}/usage`]: usageOf() });
    renderViewer(copy());
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByText("Repository changed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revert docs/guide.md to repository version" }));
    expect(handlers.onRevert).toHaveBeenCalledTimes(1);
  });

  it('when the repository changed it shows "Repository changed" and "Keep my copy" posts the keep and reports it', async () => {
    const net = installFetch({
      [`GET ${BASE}/content`]: repoContent({ source: "local" }),
      [`GET ${BASE}/usage`]: usageOf(),
      [`POST ${BASE}/local/keep-copy`]: { ok: true },
    });
    renderViewer(copy({ repo_changed: true }));
    expect(screen.getByText("Repository changed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep my copy of docs/guide.md" }));
    await waitFor(() => expect(handlers.onKeptCopy).toHaveBeenCalledTimes(1));
    expect(net.requests.find((r) => r.method === "POST")!.body).toEqual({ path: "docs/guide.md" });
  });
});
