import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocList, ContextDocUsage } from "@devdigest/shared";
import projectContext from "../../../../../../../messages/en/projectContext.json";
import contextDocs from "../../../../../../../messages/en/contextDocs.json";
import common from "../../../../../../../messages/en/common.json";
import { apiError, entry, installFetch, listOf, usageOf } from "../../../../../../test/context-docs-fixtures";

// A tiny in-memory router: `replace` rewrites the search params and re-renders
// the subscribers, so selection through `?doc=` can be followed end to end.
const nav = vi.hoisted(() => ({
  search: new URLSearchParams(),
  listeners: new Set<() => void>(),
  replace: undefined as unknown as (url: string) => void,
  push: undefined as unknown as (url: string) => void,
}));
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    useRouter: () => ({ replace: nav.replace, push: nav.push }),
    useSearchParams: () =>
      React.useSyncExternalStore(
        (cb) => {
          nav.listeners.add(cb);
          return () => nav.listeners.delete(cb);
        },
        () => nav.search,
        () => nav.search,
      ),
  };
});
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav aria-label="Breadcrumb">{(crumb ?? []).map((c) => c.label).join(" › ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", repos: [], activeRepo: { id: "r1", full_name: "acme/payments-api" }, reposLoaded: true, setRepoId: () => {} }),
  useRepoNotFound: () => false,
}));

import { ProjectContextView } from "./ProjectContextView";

const BASE = "/repos/r1/context-docs";
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

const DOCS = [
  entry("docs/guide.md"),
  entry("docs/notes.md", { source: "local" }),
  entry("specs/big.md", { too_large: true, tokens: null, size_bytes: 70_000 }),
  entry("specs/api.md", { overridden: true }),
  entry("specs/api.md", { source: "local", overrides_repo: true }),
];

let list: ContextDocList;
let usage: ContextDocUsage;
let contents: Record<string, string>;
let net: ReturnType<typeof installFetch>;
let extraRoutes: Record<string, unknown>;

function setup(over: { list?: ContextDocList; url?: string } = {}) {
  list = over.list ?? listOf(DOCS, { scanned_at: minutesAgo(2) });
  nav.search = new URLSearchParams(over.url ?? "");
  net = installFetch({
    [`GET ${BASE}`]: () => list,
    [`GET ${BASE}/content`]: (req) => {
      const path = new URLSearchParams(req.search).get("path")!;
      return { path, source: "repo", content: contents[path] ?? `# ${path}`, version: "v1", size_bytes: 10 };
    },
    [`GET ${BASE}/usage`]: () => usage,
    ...extraRoutes,
  } as Parameters<typeof installFetch>[0]);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ projectContext, contextDocs, common }}>
        <ProjectContextView repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const tree = () => screen.getByRole("navigation", { name: "Project documents" });
const selectedName = () => within(tree()).getByRole("button", { current: true }).getAttribute("title");

beforeEach(() => {
  nav.replace = vi.fn((url: string) => {
    nav.search = new URLSearchParams(new URL(url, "http://x").search);
    nav.listeners.forEach((l) => l());
  });
  nav.push = vi.fn();
  usage = usageOf({ used_by_agents: 1, enabled_agents: 2, coverage_pct: 50 });
  contents = { "docs/guide.md": "# Guide\n\nHow we work." };
  extraRoutes = {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Project Context page — document list (AC-52, AC-61, AC-65, AC-6)", () => {
  it("lists every document by file name under the folder it belongs to", async () => {
    setup();
    renderView();
    const panel = await screen.findByRole("navigation", { name: "Project documents" });
    const folders = within(panel).getAllByText(/^(docs|specs)$/);
    expect(folders.map((f) => f.textContent)).toEqual(["docs", "specs"]);
    for (const name of ["guide.md", "notes.md", "big.md"]) {
      expect(within(panel).getAllByText(name)).toHaveLength(1);
    }
    // api.md appears twice: the overridden repository document and its local copy.
    expect(within(panel).getAllByText("api.md")).toHaveLength(2);
  });

  it('badges local documents "Local", override copies "Overrides repo", overridden documents "Overridden" and oversize ones "Too large"', async () => {
    setup();
    renderView();
    const docsNav = await screen.findByRole("navigation", { name: "Project documents" });
    const btn = (title: string, i = 0) => within(docsNav).getAllByTitle(title)[i]!;

    expect(within(btn("docs/notes.md")).getByText("Local")).toBeInTheDocument();
    expect(within(btn("docs/guide.md")).queryByText("Local")).not.toBeInTheDocument();
    expect(within(btn("specs/big.md")).getByText("Too large")).toBeInTheDocument();
    // specs/api.md: the overridden repository row first, then its local copy.
    const overridden = btn("specs/api.md", 0);
    expect(within(overridden).getByText("Overridden")).toBeInTheDocument();
    expect(within(overridden).queryByText("Local")).not.toBeInTheDocument();
    const copy = btn("specs/api.md", 1);
    expect(within(copy).getByText("Local")).toBeInTheDocument();
    expect(within(copy).getByText("Overrides repo")).toBeInTheDocument();
  });

  it("shows a local folder in the panel even while it is empty (AC-69)", async () => {
    setup({ list: listOf(DOCS, { local_folders: ["docs/new"], scanned_at: minutesAgo(1) }) });
    renderView();
    expect(await screen.findByText("docs/new")).toBeInTheDocument();
    expect(screen.getByText("Empty folder")).toBeInTheDocument();
  });

  it("notes a truncated list (AC-42)", async () => {
    setup({ list: listOf(DOCS, { truncated: true, scanned_at: minutesAgo(1) }) });
    renderView();
    expect(await screen.findByText(/Too many documents/)).toBeInTheDocument();
  });

  it('puts "<repo> › Project Context" in the breadcrumb (AC-51)', async () => {
    setup();
    renderView();
    await screen.findByRole("navigation", { name: "Project documents" });
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("acme/payments-api › Project Context");
  });
});

describe("Project Context page — selection in the URL (AC-73)", () => {
  it("selects the first listed document and writes it to ?doc= when the page opens without one", async () => {
    setup();
    renderView();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/repos/r1/context?doc=${encodeURIComponent("docs/guide.md")}`));
    expect(await screen.findByRole("heading", { name: "guide.md" })).toBeInTheDocument();
    expect(selectedName()).toBe("docs/guide.md");
  });

  it("selects the first document when ?doc= names a path that is not listed", async () => {
    setup({ url: "doc=docs%2Fmissing.md" });
    renderView();
    expect(await screen.findByRole("heading", { name: "guide.md" })).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/repos/r1/context?doc=${encodeURIComponent("docs/guide.md")}`));
  });

  it("opens the document named by ?doc=", async () => {
    setup({ url: "doc=specs%2Fapi.md" });
    renderView();
    expect(await screen.findByRole("heading", { name: "api.md" })).toBeInTheDocument();
    expect(selectedName()).toBe("specs/api.md");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("selecting another document puts its path in the URL and shows it", async () => {
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    fireEvent.click(within(tree()).getAllByTitle("specs/api.md")[0]!);
    // The overridden repository row carries an explicit source (AC-13).
    expect(nav.replace).toHaveBeenCalledWith(`/repos/r1/context?doc=${encodeURIComponent("specs/api.md")}&source=repo`);
    expect(await screen.findByRole("heading", { name: "api.md" })).toBeInTheDocument();
  });
});

describe("Project Context page — selected document (AC-53, AC-59, AC-71, AC-72)", () => {
  it('shows the file name, Preview mode with "Edit a copy", the rendered markdown, usage and coverage', async () => {
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    expect(await screen.findByRole("heading", { name: "guide.md" })).toBeInTheDocument();

    const mode = screen.getByRole("group", { name: "Document mode" });
    expect(within(mode).getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
    expect(within(mode).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit a copy of docs/guide.md" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "Guide" })).toBeInTheDocument();
    expect(screen.getByText("How we work.")).toBeInTheDocument();
    expect(await screen.findByText("Used by 1 agent")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Coverage 50%" })).toBeInTheDocument();
  });

  it("renders raw HTML in the document as text, never as elements", async () => {
    contents["docs/guide.md"] = "# Guide\n\n<script>alert(1)</script>";
    setup({ url: "doc=docs%2Fguide.md" });
    const { container } = renderView();
    await screen.findByRole("heading", { name: "Guide" });
    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("<script>alert(1)</script>");
  });

  it('counts agents in plural form: "Used by 3 agents"', async () => {
    usage = usageOf({ used_by_agents: 3, enabled_agents: 4, coverage_pct: 75 });
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    expect(await screen.findByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Coverage 75%" })).toBeInTheDocument();
  });

  it('shows "—" for the Coverage ring when the workspace has no enabled agent', async () => {
    usage = usageOf({ used_by_agents: 0, enabled_agents: 0, coverage_pct: null });
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    const ring = await screen.findByRole("img", { name: /Coverage not available/ });
    expect(ring).toHaveTextContent("—");
    expect(ring).not.toHaveTextContent("%");
  });

  it("asks the usage endpoint about the selected path", async () => {
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByText("Used by 1 agent");
    const req = net.requests.find((r) => r.path === `${BASE}/usage`)!;
    expect(new URLSearchParams(req.search).get("path")).toBe("docs/guide.md");
  });
});

describe("Project Context page — footer and refresh (AC-54, AC-57)", () => {
  it('shows "Indexed: N files · scanned <relative time> ago"', async () => {
    setup({ list: listOf([entry("docs/a.md"), entry("docs/b.md"), entry("docs/c.md")], { scanned_at: minutesAgo(2) }) });
    renderView();
    expect(await screen.findByText(/^Indexed: 3 files · scanned 2 minutes ago$/)).toBeInTheDocument();
  });

  it("refresh re-reads only the document list and updates the scan time — no sync, no other request", async () => {
    setup({ url: "doc=docs%2Fguide.md", list: listOf(DOCS, { scanned_at: minutesAgo(10) }) });
    renderView();
    expect(await screen.findByText(/scanned 10 minutes ago/)).toBeInTheDocument();
    await screen.findByText("Used by 1 agent");
    const before = net.requests.length;

    list = listOf(DOCS, { scanned_at: minutesAgo(5) });
    fireEvent.click(screen.getByRole("button", { name: "Refresh document list" }));
    expect(await screen.findByText(/scanned 5 minutes ago/)).toBeInTheDocument();

    const added = net.requests.slice(before);
    expect(added.map((r) => `${r.method} ${r.path}`)).toEqual([`GET ${BASE}`]);
    expect(net.count("POST", `${BASE}/sync`)).toBe(0);
  });
});

describe("Project Context page — Sync with GitHub (AC-82, AC-83)", () => {
  it("asks for confirmation first; cancelling syncs nothing", async () => {
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    fireEvent.click(screen.getByRole("button", { name: "Sync with GitHub" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Sync with GitHub?")).toBeInTheDocument();
    expect(net.count("POST", `${BASE}/sync`)).toBe(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(net.count("POST", `${BASE}/sync`)).toBe(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("syncs after confirming, shows progress while it runs, then re-reads the list", async () => {
    let finish!: () => void;
    extraRoutes = { [`POST ${BASE}/sync`]: () => new Promise((resolve) => (finish = () => resolve({ head: "abc123" }))) };
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    const listReads = () => net.count("GET", BASE);
    expect(listReads()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Sync with GitHub" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sync" }));

    // Running: the action shows progress and a second click does nothing.
    const running = await screen.findByRole("button", { name: "Syncing with GitHub…" });
    fireEvent.click(running);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(net.count("POST", `${BASE}/sync`)).toBe(1));
    expect(listReads()).toBe(1);

    finish();
    await waitFor(() => expect(listReads()).toBe(2));
    expect(await screen.findByRole("button", { name: "Sync with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Repository synced");
  });

  it("disables the Sync control while the request is pending and enables it again once it settles (AC-82)", async () => {
    let finish!: () => void;
    extraRoutes = { [`POST ${BASE}/sync`]: () => new Promise((resolve) => (finish = () => resolve({ head: "abc123" }))) };
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    expect(screen.getByRole("button", { name: "Sync with GitHub" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Sync with GitHub" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sync" }));

    const running = await screen.findByRole("button", { name: "Syncing with GitHub…" });
    expect(running).toBeDisabled();
    expect(running).toHaveAttribute("aria-busy", "true");
    fireEvent.click(running);
    await waitFor(() => expect(net.count("POST", `${BASE}/sync`)).toBe(1));

    finish();
    const idle = await screen.findByRole("button", { name: "Sync with GitHub" });
    expect(idle).toBeEnabled();
    expect(idle).toHaveAttribute("aria-busy", "false");
  });

  it("enables the Sync control again after a failed sync (AC-82)", async () => {
    extraRoutes = { [`POST ${BASE}/sync`]: () => apiError(502, "git failed") };
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    fireEvent.click(screen.getByRole("button", { name: "Sync with GitHub" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sync" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Sync with GitHub" })).toBeEnabled();
  });

  it("on failure shows the error with a retry and keeps the previous list", async () => {
    let fail = true;
    extraRoutes = { [`POST ${BASE}/sync`]: () => (fail ? apiError(502, "git failed") : { head: "abc" }) };
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });

    fireEvent.click(screen.getByRole("button", { name: "Sync with GitHub" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sync" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sync failed");
    expect(within(tree()).getAllByTitle("docs/guide.md")).toHaveLength(1); // previous list still shown
    expect(screen.getByRole("heading", { name: "guide.md" })).toBeInTheDocument();

    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry sync" }));
    await waitFor(() => expect(net.count("POST", `${BASE}/sync`)).toBe(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("Project Context page — states (AC-58, AC-6, AC-7)", () => {
  it("shows skeletons while loading", () => {
    nav.search = new URLSearchParams();
    net = installFetch({ [`GET ${BASE}`]: () => new Promise(() => {}) });
    const { container } = renderView();
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
  });

  it("shows an error state with a retry that re-runs the request", async () => {
    let fail = true;
    setup();
    net = installFetch({ [`GET ${BASE}`]: () => (fail ? apiError(500, "down") : list) });
    renderView();
    expect(await screen.findByText("Couldn’t load project documents")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await within(await screen.findByRole("navigation", { name: "Project documents" })).findAllByTitle("docs/guide.md")).toHaveLength(1);
    expect(net.count("GET", BASE)).toBe(2);
  });

  it("names the search roots in the empty state", async () => {
    setup({ list: listOf([], { scanned_at: minutesAgo(1) }) });
    renderView();
    const body = await screen.findByText(/No markdown files matched under/);
    for (const root of ["specs", "docs", "insights"]) expect(body).toHaveTextContent(root);
  });

  it('shows "Repository not cloned yet" instead of the list', async () => {
    setup({ list: listOf([], { state: "not_cloned" }) });
    renderView();
    expect(await screen.findByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Project documents" })).not.toBeInTheDocument();
  });
});

describe("Project Context page — accessibility (AC-59, NFR-3)", () => {
  it("gives every icon-only toolbar control an accessible name", async () => {
    setup();
    renderView();
    const toolbar = await screen.findByRole("toolbar");
    const buttons = within(toolbar).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(
      expect.arrayContaining(["New file", "New folder", "Upload files", "Refresh document list", "Sync with GitHub"]),
    );
    for (const b of buttons) expect(b).toHaveAccessibleName();
  });

  it("announces a refresh through the polite live region", async () => {
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Refresh document list" }));
    await waitFor(() => expect(live).toHaveTextContent("Document list refreshed."));
  });
});

describe("Project Context page — repository documents are read-only (AC-67, AC-4)", () => {
  it('offers "Edit a copy" instead of the Edit toggle for a repository document', async () => {
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    const edit = screen.getByRole("button", { name: "Edit a copy of docs/guide.md" });
    expect(edit).toBeEnabled();
    expect(edit).toHaveAccessibleDescription("The copy is stored in DevDigest only; the repository is not changed.");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("enables Edit (and Delete) for a local document", async () => {
    setup({ url: "doc=docs%2Fnotes.md" });
    renderView();
    await screen.findByRole("heading", { name: "notes.md" });
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });
});

describe("Project Context page — new file (AC-68)", () => {
  const draftEditor = () => screen.findByRole("textbox", { name: "Markdown source of the new document plan.md" });

  async function openDraft() {
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("File name"), { target: { value: "plan" } });
    fireEvent.change(within(dialog).getByLabelText("Folder"), { target: { value: "docs" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    return draftEditor();
  }

  it("opens an empty editor for name + folder and creates no file until Save", async () => {
    extraRoutes = { [`PUT ${BASE}/local`]: { path: "docs/plan.md", source: "local", content: "", version: "v1", size_bytes: 0 } };
    const editor = (await openDraft()) as HTMLTextAreaElement;
    expect(editor.value).toBe("");
    expect(screen.getByText("New document — it is created in docs when you save.")).toBeInTheDocument();
    expect(net.requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  });

  it("Save writes the new document with the typed folder and a .md name, without a base version", async () => {
    extraRoutes = { [`PUT ${BASE}/local`]: { path: "docs/plan.md", source: "local", content: "# Plan", version: "v1", size_bytes: 6 } };
    const editor = await openDraft();
    fireEvent.change(editor, { target: { value: "# Plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.count("PUT", `${BASE}/local`)).toBe(1));
    expect(net.requests.find((r) => r.method === "PUT")!.body).toEqual({ folder: "docs", name: "plan.md", content: "# Plan" });
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(`/repos/r1/context?doc=${encodeURIComponent("docs/plan.md")}`),
    );
  });

  it("rejects a name with a slash in the dialog and opens no draft", async () => {
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("File name"), { target: { value: "a/b" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a file name without slashes.");
    expect(screen.queryByRole("textbox", { name: /Markdown source of/ })).not.toBeInTheDocument();
  });
});

describe("Project Context page — unsaved changes guard (AC-74)", () => {
  async function editNotes() {
    contents = { "docs/notes.md": "original", "docs/guide.md": "# Guide" };
    setup({ url: "doc=docs%2Fnotes.md" });
    renderView();
    await screen.findByRole("heading", { name: "notes.md" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = (await screen.findByRole("textbox", { name: "Markdown source of notes.md" })) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe("original"));
    fireEvent.change(editor, { target: { value: "changed" } });
    return editor;
  }

  it('asks before leaving for another document; "Keep editing" keeps the text and the selection', async () => {
    const editor = await editNotes();
    nav.replace = vi.fn(nav.replace);
    fireEvent.click(within(tree()).getAllByTitle("docs/guide.md")[0]!);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Discard unsaved changes?")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(editor.value).toBe("changed");
    expect(screen.getByRole("heading", { name: "notes.md" })).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('"Discard" drops the edits and opens the other document', async () => {
    await editNotes();
    fireEvent.click(within(tree()).getAllByTitle("docs/guide.md")[0]!);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard" }));
    expect(await screen.findByRole("heading", { name: "guide.md" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Markdown source of/ })).not.toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith(`/repos/r1/context?doc=${encodeURIComponent("docs/guide.md")}`);
  });

  it("registers a beforeunload warning while edits are unsaved, and not otherwise", async () => {
    const editor = await editNotes();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    fireEvent.change(editor, { target: { value: "original" } }); // back to the stored text
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });

  it("switches documents without asking when nothing was edited", async () => {
    setup({ url: "doc=docs%2Fnotes.md" });
    renderView();
    await screen.findByRole("heading", { name: "notes.md" });
    fireEvent.click(within(tree()).getAllByTitle("docs/guide.md")[0]!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "guide.md" })).toBeInTheDocument();
  });
});

describe("Project Context page — edit a copy of a repository document (AC-4, AC-5, AC-23, AC-25, AC-15)", () => {
  it("opens the editor at once with the repository text and the attachment notice, creates the copy only on Save, then selects it and announces it", async () => {
    usage = usageOf({ attached_by_agents: [{ id: "a1", name: "Security reviewer" }], used_by_agents: 1 });
    extraRoutes = {
      [`PUT ${BASE}/local`]: { path: "docs/guide.md", source: "local", content: "# Guide (mine)", version: "v1", size_bytes: 14 },
    };
    setup({ url: "doc=docs%2Fguide.md" });
    renderView();
    await screen.findByRole("heading", { name: "guide.md" });

    fireEvent.click(screen.getByRole("button", { name: "Edit a copy of docs/guide.md" }));
    const editor = (await screen.findByRole("textbox", {
      name: "Markdown source of the local copy of guide.md",
    })) as HTMLTextAreaElement;
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(editor.value).toBe("# Guide\n\nHow we work.");
    expect(await screen.findByText("Security reviewer")).toBeInTheDocument();
    expect(net.requests.filter((r) => r.method !== "GET")).toHaveLength(0);

    fireEvent.change(editor, { target: { value: "# Guide (mine)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(net.count("PUT", `${BASE}/local`)).toBe(1));
    expect(net.requests.find((r) => r.method === "PUT")!.body).toEqual({
      folder: "docs",
      name: "guide.md",
      content: "# Guide (mine)",
      override_repo: true,
      origin_version: "v1",
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Local copy of docs/guide.md created."));
    // The copy is selected by path, without a `source` (AC-13).
    expect(nav.replace).toHaveBeenLastCalledWith(`/repos/r1/context?doc=${encodeURIComponent("docs/guide.md")}`);
    expect(screen.queryByRole("textbox", { name: /Markdown source of/ })).not.toBeInTheDocument();
  });

});

describe("Project Context page — an overridden repository document (AC-12, AC-13, AC-26, AC-27)", () => {
  it("opens the repository row with ?source=repo as a read-only preview; \"Open local copy\" selects the copy and drops the source", async () => {
    setup({ url: "doc=specs%2Fapi.md" });
    renderView();
    await screen.findByRole("heading", { name: "api.md" });
    // `?doc=p` alone selects the copy (AC-13): it offers Revert, not "Open local copy".
    expect(screen.getByRole("button", { name: "Revert specs/api.md to repository version" })).toBeInTheDocument();

    fireEvent.click(within(tree()).getAllByTitle("specs/api.md")[0]!);
    expect(nav.replace).toHaveBeenLastCalledWith(`/repos/r1/context?doc=${encodeURIComponent("specs/api.md")}&source=repo`);
    expect(await screen.findByText("Not used — overridden by a local copy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Edit a copy/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open local copy of specs/api.md" }));
    expect(nav.replace).toHaveBeenLastCalledWith(`/repos/r1/context?doc=${encodeURIComponent("specs/api.md")}`);
    expect(await screen.findByRole("button", { name: "Revert specs/api.md to repository version" })).toBeInTheDocument();
    expect(await screen.findByText("Used by 1 agent")).toBeInTheDocument();
  });

  it("reloading ?doc=p&source=repo selects the repository row", async () => {
    setup({ url: "doc=specs%2Fapi.md&source=repo" });
    renderView();
    expect(await screen.findByText("Not used — overridden by a local copy")).toBeInTheDocument();
    expect(within(tree()).getAllByRole("button", { current: true })).toHaveLength(1);
    expect(within(tree()).getAllByTitle("specs/api.md")[0]).toHaveAttribute("aria-current", "true");
  });
});

describe("Project Context page — local override copy (AC-14, AC-20, AC-21, AC-22, AC-15)", () => {
  it("Revert asks first, then deletes the copy by path and announces it; Delete is not offered", async () => {
    extraRoutes = { [`DELETE ${BASE}/local`]: { ok: true } };
    setup({ url: "doc=specs%2Fapi.md" });
    renderView();
    await screen.findByRole("heading", { name: "api.md" });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revert specs/api.md to repository version" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Revert to repository version?")).toBeInTheDocument();
    expect(net.count("DELETE", `${BASE}/local`)).toBe(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Revert" }));
    await waitFor(() => expect(net.count("DELETE", `${BASE}/local`)).toBe(1));
    expect(new URLSearchParams(net.requests.find((r) => r.method === "DELETE")!.search).get("path")).toBe("specs/api.md");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Reverted specs/api.md to the repository version."),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it('"Keep my copy" records the kept copy, clears "Repository changed" and announces it', async () => {
    const changed = [
      entry("specs/api.md", { overridden: true }),
      entry("specs/api.md", { source: "local", overrides_repo: true, repo_changed: true }),
    ];
    extraRoutes = {
      [`POST ${BASE}/local/keep-copy`]: () => {
        list = listOf(
          [changed[0]!, entry("specs/api.md", { source: "local", overrides_repo: true })],
          { scanned_at: minutesAgo(1) },
        );
        return { ok: true };
      },
    };
    setup({ url: "doc=specs%2Fapi.md", list: listOf(changed, { scanned_at: minutesAgo(1) }) });
    renderView();
    await screen.findByRole("heading", { name: "api.md" });
    // The badge is on the tree row and in the viewer (AC-21).
    expect(within(tree()).getByText("Repository changed")).toBeInTheDocument();
    expect(screen.getAllByText("Repository changed")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Keep my copy of specs/api.md" }));
    await waitFor(() => expect(net.count("POST", `${BASE}/local/keep-copy`)).toBe(1));
    expect(net.requests.find((r) => r.method === "POST")!.body).toEqual({ path: "specs/api.md" });
    await waitFor(() => expect(screen.queryByText("Repository changed")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Kept your copy of specs/api.md.");
  });
});

describe("Project Context page — tree rows of override states (AC-11, AC-21, AC-24, NFR-2)", () => {
  it('shows "Repository changed" with a tooltip on the copy row; a plain local row carries only "Local"', async () => {
    setup({
      list: listOf(
        [
          entry("docs/notes.md", { source: "local" }),
          entry("specs/api.md", { overridden: true }),
          entry("specs/api.md", { source: "local", overrides_repo: true, repo_changed: true }),
        ],
        { scanned_at: minutesAgo(1) },
      ),
    });
    renderView();
    const panel = await screen.findByRole("navigation", { name: "Project documents" });

    const copyRow = within(panel).getAllByTitle("specs/api.md")[1]!;
    const changed = within(copyRow).getByText("Repository changed");
    expect(changed.closest("[title]")).toHaveAttribute(
      "title",
      "The repository text changed since this copy was made; the copy is still used",
    );
    expect(within(copyRow).getByText("Overrides repo").closest("[title]")).toHaveAttribute(
      "title",
      "This local copy replaces the repository document with the same path",
    );

    const plain = within(panel).getByTitle("docs/notes.md");
    expect(within(plain).getByText("Local")).toBeInTheDocument();
    for (const text of ["Overrides repo", "Overridden", "Repository changed"]) {
      expect(within(plain).queryByText(text)).not.toBeInTheDocument();
    }
  });
});
