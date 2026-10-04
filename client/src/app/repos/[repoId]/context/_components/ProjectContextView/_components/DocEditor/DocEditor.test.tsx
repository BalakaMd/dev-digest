import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import projectContext from "../../../../../../../../../messages/en/projectContext.json";
import { apiError, installFetch } from "../../../../../../../../test/context-docs-fixtures";
import { DocEditor } from "./DocEditor";

const BASE = "/repos/r1/context-docs";
const stored = (content: string, version = "v1") => ({ path: "docs/notes.md", source: "local", content, version, size_bytes: content.length });

let onSaved: ReturnType<typeof vi.fn>;
let onCancel: ReturnType<typeof vi.fn>;
let onDirtyChange: ReturnType<typeof vi.fn>;
let onConflict: ReturnType<typeof vi.fn>;

function renderEditor(over: Partial<React.ComponentProps<typeof DocEditor>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ projectContext }}>
        <DocEditor
          repoId="r1"
          folder="docs"
          name="notes.md"
          existing
          onSaved={onSaved}
          onCancel={onCancel}
          onDirtyChange={onDirtyChange}
          onConflict={onConflict}
          {...over}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const textarea = () => screen.getByRole("textbox", { name: /Markdown source of/ }) as HTMLTextAreaElement;

beforeEach(() => {
  onSaved = vi.fn();
  onCancel = vi.fn();
  onDirtyChange = vi.fn();
  onConflict = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocEditor — editing a stored local document (AC-66)", () => {
  it("shows the stored markdown source in an editor with Save and Cancel", async () => {
    installFetch({ [`GET ${BASE}/content`]: stored("# Notes\n\nbody") });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("# Notes\n\nbody"));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("reads the local copy of the document", async () => {
    const net = installFetch({ [`GET ${BASE}/content`]: stored("x") });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("x"));
    const q = new URLSearchParams(net.requests[0]!.search);
    expect(q.get("path")).toBe("docs/notes.md");
    expect(q.get("source")).toBe("local");
  });

  it("Save stores the new content on the local endpoint, based on the version that was read, then reports it", async () => {
    const saved = stored("new text", "v2");
    const net = installFetch({ [`GET ${BASE}/content`]: stored("old"), [`PUT ${BASE}/local`]: saved });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    fireEvent.change(textarea(), { target: { value: "new text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0]![0]).toEqual(saved);
    const put = net.requests.find((r) => r.method === "PUT")!;
    expect(put.path).toBe(`${BASE}/local`);
    expect(put.body).toEqual({ folder: "docs", name: "notes.md", content: "new text", base_version: "v1" });
  });

  it("Cancel hands control back without saving anything", async () => {
    const net = installFetch({ [`GET ${BASE}/content`]: stored("old") });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    fireEvent.change(textarea(), { target: { value: "edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(net.requests.some((r) => r.method === "PUT")).toBe(false);
  });

  it("reports unsaved edits upward, and clears the report when the edit is reverted or the editor goes away (AC-74)", async () => {
    installFetch({ [`GET ${BASE}/content`]: stored("old") });
    const { unmount } = renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    expect(onDirtyChange).not.toHaveBeenCalled(); // nothing is reported on mount

    fireEvent.change(textarea(), { target: { value: "old!" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(textarea(), { target: { value: "old" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(textarea(), { target: { value: "again" } });
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("a successful save reports the editor as clean, while it is still mounted (AC-74)", async () => {
    installFetch({ [`GET ${BASE}/content`]: stored("old"), [`PUT ${BASE}/local`]: stored("new", "v2") });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    fireEvent.change(textarea(), { target: { value: "new" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("a failed save leaves the editor reported as dirty (AC-74)", async () => {
    installFetch({ [`GET ${BASE}/content`]: stored("old"), [`PUT ${BASE}/local`]: apiError(500, "down") });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    fireEvent.change(textarea(), { target: { value: "new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("shows the reason when the server rejects the save (422) and keeps the text", async () => {
    installFetch({
      [`GET ${BASE}/content`]: stored("old"),
      [`PUT ${BASE}/local`]: apiError(422, "document is too large: docs/notes.md", { reason: "too_large" }, "validation_error"),
    });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    fireEvent.change(textarea(), { target: { value: "huge" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("document is too large: docs/notes.md");
    expect(textarea().value).toBe("huge");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows a skeleton while loading, and an error with Retry when the document cannot be read", async () => {
    let fail = true;
    const net = installFetch({ [`GET ${BASE}/content`]: () => (fail ? apiError(500, "down") : stored("back")) });
    const { container } = renderEditor();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(await screen.findByText("Couldn’t load the document for editing.")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(textarea().value).toBe("back"));
    expect(net.count("GET", `${BASE}/content`)).toBe(2);
  });
});

describe("DocEditor — a save based on an older version (AC-85)", () => {
  const conflict = () =>
    apiError(409, "document changed", { current_content: "# Newer text", current_version: "v9" }, "conflict");

  it("shows a notice that the document changed elsewhere, with the newer content, and keeps the user's text", async () => {
    installFetch({ [`GET ${BASE}/content`]: stored("old"), [`PUT ${BASE}/local`]: conflict() });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    fireEvent.change(textarea(), { target: { value: "mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("This document changed elsewhere");
    expect(screen.getByLabelText("Newer content")).toHaveTextContent("# Newer text");
    expect(textarea().value).toBe("mine");
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('"Load the newer version" replaces the text and saves on top of the newer version', async () => {
    let call = 0;
    const net = installFetch({
      [`GET ${BASE}/content`]: stored("old"),
      [`PUT ${BASE}/local`]: () => (call++ === 0 ? conflict() : stored("# Newer text + more", "v10")),
    });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    fireEvent.change(textarea(), { target: { value: "mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Load the newer version" }));
    expect(textarea().value).toBe("# Newer text");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const puts = net.requests.filter((r) => r.method === "PUT");
    expect(puts[1]!.body).toMatchObject({ content: "# Newer text", base_version: "v9" });
  });

  it('"Keep my text and save over it" keeps the text and retries with the newer version', async () => {
    let call = 0;
    const net = installFetch({
      [`GET ${BASE}/content`]: stored("old"),
      [`PUT ${BASE}/local`]: () => (call++ === 0 ? conflict() : stored("mine", "v10")),
    });
    renderEditor();
    await waitFor(() => expect(textarea().value).toBe("old"));
    fireEvent.change(textarea(), { target: { value: "mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Keep my text and save over it" }));
    expect(textarea().value).toBe("mine");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(net.requests.filter((r) => r.method === "PUT")[1]!.body).toMatchObject({ content: "mine", base_version: "v9" });
  });
});

describe("DocEditor — a copy draft of a repository document (AC-5, AC-23)", () => {
  it("is prefilled with the repository text, sends nothing until Save, then creates the override with the origin version", async () => {
    const created = { path: "docs/guide.md", source: "local", content: "# Guide (mine)", version: "v1", size_bytes: 14 };
    const net = installFetch({ [`PUT ${BASE}/local`]: created });
    renderEditor({
      existing: false,
      folder: "docs",
      name: "guide.md",
      initialText: "# Guide",
      override: { originVersion: "repo-v7" },
      notice: <p>copy notice</p>,
    });
    const editor = screen.getByRole("textbox", { name: "Markdown source of the local copy of guide.md" }) as HTMLTextAreaElement;
    expect(editor.value).toBe("# Guide");
    expect(screen.getByText("copy notice")).toBeInTheDocument();
    expect(net.requests).toHaveLength(0);

    // Only a change from the repository text counts as unsaved.
    fireEvent.change(editor, { target: { value: "# Guide (mine)" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created));
    const puts = net.requests.filter((r) => r.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toEqual({
      folder: "docs",
      name: "guide.md",
      content: "# Guide (mine)",
      override_repo: true,
      origin_version: "repo-v7",
    });
  });
});

describe("DocEditor — a draft of a new file (AC-68)", () => {
  it("starts empty and makes no request until the first Save", async () => {
    const net = installFetch({});
    renderEditor({ existing: false, folder: "docs/guides", name: "setup.md" });
    expect(textarea().value).toBe("");
    expect(screen.getByRole("textbox", { name: "Markdown source of the new document setup.md" })).toBeInTheDocument();
    expect(screen.getByText(/created in docs\/guides when you save/)).toBeInTheDocument();
    fireEvent.change(textarea(), { target: { value: "# Setup" } });
    expect(net.requests).toHaveLength(0);
  });

  it("creates the document on Save, without a base version", async () => {
    const created = { path: "docs/guides/setup.md", source: "local", content: "# Setup", version: "v1", size_bytes: 7 };
    const net = installFetch({ [`PUT ${BASE}/local`]: created });
    renderEditor({ existing: false, folder: "docs/guides", name: "setup.md" });
    fireEvent.change(textarea(), { target: { value: "# Setup" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0]![0]).toEqual(created);
    const put = net.requests.find((r) => r.method === "PUT")!;
    expect(put.body).toEqual({ folder: "docs/guides", name: "setup.md", content: "# Setup" });
  });

  it("shows the server's reason when the new file is rejected (name conflict)", async () => {
    installFetch({
      [`PUT ${BASE}/local`]: apiError(422, "path already exists: docs/setup.md", { reason: "conflict" }, "validation_error"),
    });
    renderEditor({ existing: false, folder: "docs", name: "setup.md" });
    fireEvent.change(textarea(), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("path already exists: docs/setup.md");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
