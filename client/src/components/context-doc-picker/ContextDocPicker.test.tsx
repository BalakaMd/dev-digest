import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import contextDocs from "../../../messages/en/contextDocs.json";
import { apiError, entry, installFetch, listOf } from "../../test/context-docs-fixtures";
import { ContextDocPicker, type ContextDocPickerProps } from "./ContextDocPicker";

/**
 * Real hook + real QueryClient against a mocked `fetch`: the picker is driven
 * through the same `GET /repos/:id/context-docs` the app uses. A tiny harness
 * plays the part of the owning tab (it keeps the saved list).
 */

const LIST_PATH = "/repos/r1/context-docs";

const DOCS = [
  entry("docs/zeta.md", { tokens: 50 }),
  entry("specs/api.md", { tokens: 120 }),
  entry("docs/alpha.md", { tokens: 30, source: "local" }),
  entry("insights/learned.md", { tokens: 40 }),
];

let onSave: ReturnType<typeof vi.fn>;

function Harness({
  initial,
  repoId = "r1",
  ...rest
}: { initial: string[] } & Partial<Omit<ContextDocPickerProps, "attached" | "onSave">>) {
  const [attached, setAttached] = React.useState(initial);
  return (
    <ContextDocPicker
      repoId={repoId}
      title="Project context"
      {...rest}
      attached={attached}
      onSave={async (paths) => {
        await onSave(paths);
        setAttached(paths);
      }}
    />
  );
}

function renderPicker(props: React.ComponentProps<typeof Harness>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ contextDocs }}>
        <Harness {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rowPaths = () => screen.getAllByTestId(/^context-row-/).map((el) => el.getAttribute("data-testid")!.replace("context-row-", ""));
const row = (path: string) => screen.getByTestId(`context-row-${path}`);

beforeEach(() => {
  onSave = vi.fn().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ContextDocPicker — list", () => {
  beforeEach(() => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf(DOCS) });
  });

  it("shows the header: title, N of M counter, filter input and the order hint (AC-12)", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    expect(await screen.findByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.getByText("2 of 4 attached")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter documents…")).toBeInTheDocument();
    expect(screen.getByText(/earlier docs appear earlier in the assembled ## Project context block/)).toBeInTheDocument();
  });

  it("lays rows out attached (in attachment order) → inherited → the rest by path (AC-11)", async () => {
    renderPicker({
      initial: ["specs/api.md", "docs/zeta.md"],
      inherited: [{ path: "insights/learned.md", via: "rubric" }],
    });
    await screen.findByTestId("context-row-specs/api.md");
    expect(rowPaths()).toEqual(["specs/api.md", "docs/zeta.md", "insights/learned.md", "docs/alpha.md"]);
  });

  it("gives each row a path-labelled checkbox, name, folder, type badge, tokens and a Preview control (AC-11, AC-22)", async () => {
    renderPicker({ initial: ["specs/api.md"] });
    const r = within(await screen.findByTestId("context-row-specs/api.md"));
    expect(r.getByRole("checkbox", { name: "specs/api.md" })).toBeChecked();
    expect(r.getByText("api.md")).toBeInTheDocument();
    expect(r.getAllByText("specs")).toHaveLength(2); // parent folder and document-type badge
    expect(r.getByText("120 tokens")).toBeInTheDocument();
    expect(r.getByRole("button", { name: "Preview specs/api.md" })).toBeInTheDocument();
    expect(r.getByRole("button", { name: /Reorder specs\/api\.md/ })).toBeInTheDocument();
  });

  it('marks local documents with a "Local" badge, and only those (AC-11, AC-61)', async () => {
    renderPicker({ initial: [] });
    await screen.findByTestId("context-row-docs/alpha.md");
    expect(within(row("docs/alpha.md")).getByText("Local")).toBeInTheDocument();
    expect(within(row("docs/zeta.md")).queryByText("Local")).not.toBeInTheDocument();
  });

  it('shows inherited rows as "via <skill>", unchecked, once; a doc that is also attached shows as attached', async () => {
    renderPicker({
      initial: ["docs/zeta.md"],
      inherited: [
        { path: "docs/zeta.md", via: "rubric" },
        { path: "insights/learned.md", via: "rubric" },
      ],
    });
    await screen.findByTestId("context-row-docs/zeta.md");
    expect(within(row("insights/learned.md")).getByText("via rubric")).toBeInTheDocument();
    expect(within(row("docs/zeta.md")).queryByText(/^via /)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("context-row-docs/zeta.md")).toHaveLength(1);
  });

  it("gives an inherited row a disabled checkbox that explains the source, and clicking it saves nothing (AC-46)", async () => {
    renderPicker({
      initial: ["docs/zeta.md"],
      inherited: [{ path: "insights/learned.md", via: "rubric" }],
    });
    await screen.findByTestId("context-row-insights/learned.md");
    const box = within(row("insights/learned.md")).getByRole("checkbox", { name: "insights/learned.md" });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute("title", "via rubric");

    // `HTMLElement.click()` is what a user's click does: it is ignored on a disabled control.
    // (`fireEvent.click` dispatches a synthetic event that jsdom delivers to disabled inputs too.)
    box.click();
    expect(onSave).not.toHaveBeenCalled();
    expect(box).not.toBeChecked();
    expect(screen.getByText("1 of 4 attached")).toBeInTheDocument();
    // An ordinary unattached row stays toggleable.
    expect(screen.getByRole("checkbox", { name: "specs/api.md" })).toBeEnabled();
  });

  it("shows one row for an overridden path, with the Local and Overrides repo badges (AC-16)", async () => {
    installFetch({
      [`GET ${LIST_PATH}`]: listOf([
        entry("docs/a.md", { overridden: true }),
        entry("docs/a.md", { source: "local", overrides_repo: true }),
      ]),
    });
    renderPicker({ initial: [] });
    await screen.findByTestId("context-row-docs/a.md");
    expect(screen.getAllByTestId("context-row-docs/a.md")).toHaveLength(1);
    const r = within(row("docs/a.md"));
    expect(r.getByText("Local")).toBeInTheDocument();
    expect(r.getByText("Overrides repo")).toBeInTheDocument();
  });

  it("counts the override copy's tokens, not the repository document's, in the row and the budget bar (AC-16)", async () => {
    installFetch({
      [`GET ${LIST_PATH}`]: listOf([
        entry("docs/a.md", { overridden: true, tokens: 10 }),
        entry("docs/a.md", { source: "local", overrides_repo: true, tokens: 42 }),
      ]),
    });
    renderPicker({ initial: ["docs/a.md"] });
    const r = within(await screen.findByTestId("context-row-docs/a.md"));
    expect(r.getByText("42 tokens")).toBeInTheDocument();
    expect(r.queryByText("10 tokens")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  });

  it('shows "Too large" with both badges on an override copy over the limit, and its checkbox is disabled (AC-16, NFR-2)', async () => {
    installFetch({
      [`GET ${LIST_PATH}`]: listOf([
        entry("docs/a.md", { overridden: true }),
        entry("docs/a.md", { source: "local", overrides_repo: true, too_large: true, tokens: null, size_bytes: 70_000 }),
      ]),
    });
    renderPicker({ initial: [] });
    const r = within(await screen.findByTestId("context-row-docs/a.md"));
    expect(r.getByText("Too large")).toBeInTheDocument();
    expect(r.getByText("Local")).toBeInTheDocument();
    const badge = r.getByText("Overrides repo");
    expect(badge).toHaveAttribute("title"); // tooltip explains it; the text itself is not colour-only
    expect(badge.getAttribute("title")).not.toBe("");
    expect(r.getByRole("checkbox", { name: "docs/a.md" })).toBeDisabled();
  });

  it('shows a "Too large" badge and a disabled checkbox for a document over the limit (AC-6)', async () => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf([entry("docs/big.md", { too_large: true, tokens: null, size_bytes: 70_000 }), entry("docs/ok.md")]) });
    renderPicker({ initial: [] });
    const big = within(await screen.findByTestId("context-row-docs/big.md"));
    expect(big.getByText("Too large")).toBeInTheDocument();
    expect(big.getByRole("checkbox", { name: "docs/big.md" })).toBeDisabled();
    expect(within(row("docs/ok.md")).getByRole("checkbox")).toBeEnabled();
  });

  it("notes that the list is truncated (AC-42)", async () => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf(DOCS, { truncated: true }) });
    renderPicker({ initial: [] });
    expect(await screen.findByText(/only the first ones are listed/)).toBeInTheDocument();
  });

  it("shows the budget bar total and the fixed injected-block line (AC-17)", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    expect(await screen.findByText("≈ 170 tokens")).toBeInTheDocument();
    expect(screen.getByText("Injected as an untrusted block (## Project context) into every run.")).toBeInTheDocument();
  });

  it("counts inherited documents in the budget total, de-duplicated against attached ones (AC-17)", async () => {
    renderPicker({
      initial: ["specs/api.md"],
      inherited: [
        { path: "specs/api.md", via: "rubric" },
        { path: "insights/learned.md", via: "rubric" },
      ],
    });
    expect(await screen.findByText("≈ 160 tokens")).toBeInTheDocument(); // 120 + 40, api.md once
  });

  it("warns, naming the documents a run would skip, when the attached set exceeds the budget (AC-47)", async () => {
    installFetch({
      [`GET ${LIST_PATH}`]: listOf([
        entry("docs/one.md", { tokens: 5000 }),
        entry("docs/two.md", { tokens: 4000 }),
        entry("docs/three.md", { tokens: 2500 }),
      ]),
    });
    renderPicker({ initial: ["docs/one.md", "docs/two.md", "docs/three.md"] });
    const warn = await screen.findByText(/Over the 8000-token budget/);
    expect(warn).toHaveTextContent("docs/two.md");
    expect(warn).not.toHaveTextContent("docs/one.md");
    expect(warn).not.toHaveTextContent("docs/three.md");
    expect(screen.getByText("≈ 7500 tokens")).toBeInTheDocument();
  });

  it("shows a budget progressbar: max = the list's token budget, now = the injected total, not over budget (AC-17)", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    const bar = await screen.findByRole("progressbar", { name: "Project context token budget" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "8000");
    expect(bar).toHaveAttribute("aria-valuenow", "170");
    expect(bar).toHaveAttribute("aria-valuetext", "≈ 170 tokens / 8,000 budget");
    expect(bar).toHaveAttribute("data-over-budget", "false");
    // The text total stays its own element beside the "/ budget" label.
    expect(screen.getByText("≈ 170 tokens")).toBeInTheDocument();
    expect(screen.getByText("/ 8,000 budget")).toBeInTheDocument();
  });

  it("takes the progressbar maximum from limits.token_budget, not a constant (AC-17)", async () => {
    installFetch({
      [`GET ${LIST_PATH}`]: listOf(DOCS, { limits: { max_doc_bytes: 65_536, max_attachments: 20, token_budget: 500 } }),
    });
    renderPicker({ initial: ["specs/api.md"] });
    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "500");
    expect(bar).toHaveAttribute("aria-valuenow", "120");
    expect(screen.getByText("/ 500 budget")).toBeInTheDocument();
  });

  it("counts inherited documents in the progressbar value (AC-17)", async () => {
    renderPicker({ initial: ["specs/api.md"], inherited: [{ path: "insights/learned.md", via: "rubric" }] });
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "160");
  });

  it("marks the progressbar over budget when a document is skipped for it (AC-17)", async () => {
    installFetch({
      [`GET ${LIST_PATH}`]: listOf([
        entry("docs/one.md", { tokens: 5000 }),
        entry("docs/two.md", { tokens: 4000 }),
        entry("docs/three.md", { tokens: 2500 }),
      ]),
    });
    renderPicker({ initial: ["docs/one.md", "docs/two.md", "docs/three.md"] });
    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("data-over-budget", "true");
    expect(bar).toHaveAttribute("aria-valuemax", "8000");
    expect(bar).toHaveAttribute("aria-valuenow", "7500"); // what a run would actually inject
    expect(screen.getByText("≈ 7500 tokens")).toBeInTheDocument();
  });

  it("shows no budget warning while the documents fit", async () => {
    renderPicker({ initial: ["specs/api.md"] });
    await screen.findByTestId("context-row-specs/api.md");
    expect(screen.queryByText(/Over the .*-token budget/)).not.toBeInTheDocument();
  });
});

describe("ContextDocPicker — missing attachments (AC-45)", () => {
  beforeEach(() => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf([entry("docs/a.md"), entry("docs/b.md")]) });
  });

  it('shows an attached path with no document as a checked row with a "Missing" badge, first in order', async () => {
    renderPicker({ initial: ["docs/gone.md", "docs/a.md"] });
    const gone = within(await screen.findByTestId("context-row-docs/gone.md"));
    expect(gone.getByText("Missing")).toBeInTheDocument();
    expect(gone.getByRole("checkbox", { name: "docs/gone.md" })).toBeChecked();
    expect(rowPaths()[0]).toBe("docs/gone.md");
  });

  it('counts it in the "N of M attached" counter (N includes the missing one)', async () => {
    renderPicker({ initial: ["docs/gone.md", "docs/a.md", "docs/b.md"] });
    const counter = await screen.findByText(/^\d+ of \d+ attached$/);
    // The spec fixes only N (AC-45: "count it in N of M attached"); M is not
    // specified, so it is deliberately not asserted (see the report: today it
    // excludes missing rows, which renders "3 of 2").
    expect(counter.textContent!.match(/\d+/g)!.map(Number)[0]).toBe(3);
  });

  it("lets the user uncheck it to detach it", async () => {
    renderPicker({ initial: ["docs/gone.md", "docs/a.md"] });
    await screen.findByTestId("context-row-docs/gone.md");
    fireEvent.click(screen.getByRole("checkbox", { name: "docs/gone.md" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(["docs/a.md"]));
  });

  it("has no Preview control — there is nothing to preview", async () => {
    renderPicker({ initial: ["docs/gone.md"] });
    const gone = within(await screen.findByTestId("context-row-docs/gone.md"));
    expect(gone.queryByRole("button", { name: /Preview/ })).not.toBeInTheDocument();
  });
});

describe("ContextDocPicker — checking and unchecking (AC-13)", () => {
  beforeEach(() => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf(DOCS) });
  });

  it("saves the full ordered list when a row is checked, and updates the counter and budget bar", async () => {
    renderPicker({ initial: ["specs/api.md"] });
    await screen.findByText("1 of 4 attached");
    fireEvent.click(screen.getByRole("checkbox", { name: "docs/zeta.md" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(["specs/api.md", "docs/zeta.md"]));
    expect(await screen.findByText("2 of 4 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 170 tokens")).toBeInTheDocument();
  });

  it("saves the list without the row when it is unchecked", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    await screen.findByText("2 of 4 attached");
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/api.md" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(["docs/zeta.md"]));
    expect(await screen.findByText("1 of 4 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 50 tokens")).toBeInTheDocument();
  });

  it("keeps a toggled row where it is", async () => {
    renderPicker({ initial: ["specs/api.md"] });
    await screen.findByTestId("context-row-specs/api.md");
    const before = rowPaths();
    fireEvent.click(screen.getByRole("checkbox", { name: "insights/learned.md" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(rowPaths()).toEqual(before);
  });

  it("announces the saved result in a polite live region (NFR-3)", async () => {
    renderPicker({ initial: [] });
    await screen.findByTestId("context-row-specs/api.md");
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/api.md" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => {
      const live = document.querySelector('[aria-live="polite"]');
      expect(live).toHaveTextContent("Saved");
    });
  });

  it("disables the unchecked rows once 20 documents are attached", async () => {
    const many = Array.from({ length: 21 }, (_, i) => entry(`docs/d${String(i).padStart(2, "0")}.md`));
    installFetch({ [`GET ${LIST_PATH}`]: listOf(many) });
    renderPicker({ initial: many.slice(0, 20).map((d) => d.path) });
    await screen.findByText("20 of 21 attached");
    expect(screen.getByRole("checkbox", { name: "docs/d20.md" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "docs/d00.md" })).toBeEnabled();
  });
});

describe("ContextDocPicker — reordering (AC-14)", () => {
  beforeEach(() => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf(DOCS) });
  });

  /** jsdom has no layout: give the rows tops 0 / 50 / 100 … */
  function placeRows() {
    screen.getAllByTestId(/^context-row-/).forEach((el, i) => {
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: i * 50, bottom: i * 50 + 40 } as DOMRect);
    });
  }

  it("↓ on a focused handle moves the attached row down by one and saves the new order", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    const handle = await screen.findByRole("button", { name: /Reorder specs\/api\.md/ });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(["docs/zeta.md", "specs/api.md"]));
    await waitFor(() => expect(rowPaths().slice(0, 2)).toEqual(["docs/zeta.md", "specs/api.md"]));
  });

  it("↑ on a focused handle moves the row up and saves", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    const handle = await screen.findByRole("button", { name: /Reorder docs\/zeta\.md/ });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(["docs/zeta.md", "specs/api.md"]));
  });

  it("↑ on the first attached row does nothing", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    const handle = await screen.findByRole("button", { name: /Reorder specs\/api\.md/ });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("dragging a handle onto another row (pointer events) saves the new order", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    const handle = await screen.findByTestId("context-handle-docs/zeta.md");
    placeRows();
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 60 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 5 });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(["docs/zeta.md", "specs/api.md"]));
  });

  it("an unattached row has no usable handle", async () => {
    renderPicker({ initial: ["specs/api.md"] });
    await screen.findByTestId("context-row-docs/zeta.md");
    expect(within(row("docs/zeta.md")).queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
    placeRows();
    const handle = screen.getByTestId("context-handle-docs/zeta.md");
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 60 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 0 });
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("ContextDocPicker — filter (AC-15)", () => {
  beforeEach(() => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf(DOCS) });
  });

  it("shows only rows whose path contains the text, case-insensitively, and disables reordering", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    await screen.findByTestId("context-row-specs/api.md");
    expect(screen.getAllByRole("button", { name: /Reorder/ })).toHaveLength(2);

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "API" } });
    expect(rowPaths()).toEqual(["specs/api.md"]);
    expect(screen.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Clear the filter to reorder/)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("context-handle-specs/api.md"), { key: "ArrowDown" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("re-enables reordering when the filter is cleared", async () => {
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    await screen.findByTestId("context-row-specs/api.md");
    const filter = screen.getByPlaceholderText("Filter documents…");
    fireEvent.change(filter, { target: { value: "alpha" } });
    fireEvent.change(filter, { target: { value: "" } });
    expect(screen.getAllByRole("button", { name: /Reorder/ })).toHaveLength(2);
    expect(rowPaths()).toHaveLength(4);
  });

  it("says so when nothing matches", async () => {
    renderPicker({ initial: [] });
    await screen.findByTestId("context-row-specs/api.md");
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "zzz" } });
    expect(screen.getByText(/No documents match/)).toBeInTheDocument();
  });
});

describe("ContextDocPicker — a failed save (AC-21)", () => {
  it("restores the last saved state of every row and shows an alert", async () => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf(DOCS) });
    onSave.mockRejectedValue(new Error("boom"));
    renderPicker({ initial: ["specs/api.md"] });
    await screen.findByText("1 of 4 attached");

    fireEvent.click(screen.getByRole("checkbox", { name: "docs/zeta.md" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t save the change");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "docs/zeta.md" })).not.toBeChecked());
    expect(screen.getByRole("checkbox", { name: "specs/api.md" })).toBeChecked();
    expect(screen.getByText("1 of 4 attached")).toBeInTheDocument();
  });

  it("restores the previous order after a failed reorder", async () => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf(DOCS) });
    onSave.mockRejectedValue(new Error("boom"));
    renderPicker({ initial: ["specs/api.md", "docs/zeta.md"] });
    const handle = await screen.findByRole("button", { name: /Reorder specs\/api\.md/ });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    await screen.findByRole("alert");
    await waitFor(() => expect(rowPaths().slice(0, 2)).toEqual(["specs/api.md", "docs/zeta.md"]));
  });
});

describe("ContextDocPicker — states", () => {
  it("shows a skeleton while the list is loading (AC-18)", async () => {
    installFetch({ [`GET ${LIST_PATH}`]: () => new Promise(() => {}) });
    const { container } = renderPicker({ initial: [] });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows an error state on failure, and Retry re-runs the request (AC-18)", async () => {
    let fail = true;
    const net = installFetch({ [`GET ${LIST_PATH}`]: () => (fail ? apiError(500, "down") : listOf(DOCS)) });
    renderPicker({ initial: [] });
    expect(await screen.findByText("Couldn’t load project documents")).toBeInTheDocument();
    expect(net.count("GET", LIST_PATH)).toBe(1);

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByTestId("context-row-specs/api.md")).toBeInTheDocument();
    expect(net.count("GET", LIST_PATH)).toBe(2);
  });

  it("names the search roots when no document matches (AC-19)", async () => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf([], { search_globs: ["**/{specs,docs,insights}/**/*.md"] }) });
    renderPicker({ initial: [] });
    const empty = await screen.findByText(/No markdown files matched under/);
    for (const root of ["specs", "docs", "insights"]) expect(empty).toHaveTextContent(root);
  });

  it('shows "Repository not cloned yet" instead of the list, and saves nothing (AC-7, AC-20)', async () => {
    installFetch({ [`GET ${LIST_PATH}`]: listOf([], { state: "not_cloned" }) });
    renderPicker({ initial: ["specs/api.md"] });
    expect(await screen.findByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("without an active repository, shows an empty state that links to adding one — and makes no request (AC-44)", () => {
    const net = installFetch({});
    renderPicker({ initial: ["specs/api.md"], repoId: null as unknown as string });
    expect(screen.getByText("No repository selected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to onboarding" })).toHaveAttribute("href", "/onboarding");
    expect(net.requests).toHaveLength(0);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("ContextDocPicker — preview", () => {
  it("opens the document's current text rendered as markdown (AC-16)", async () => {
    const net = installFetch({
      [`GET ${LIST_PATH}`]: listOf(DOCS),
      [`GET ${LIST_PATH}/content`]: { path: "specs/api.md", source: "repo", content: "# API rules\n\nNo direct db access.", version: "v1", size_bytes: 30 },
    });
    renderPicker({ initial: [] });
    fireEvent.click(await screen.findByRole("button", { name: "Preview specs/api.md" }));
    expect(await screen.findByRole("heading", { name: "API rules" })).toBeInTheDocument();
    expect(screen.getByText("No direct db access.")).toBeInTheDocument();
    const read = net.requests.find((r) => r.path === `${LIST_PATH}/content`)!;
    expect(new URLSearchParams(read.search).get("path")).toBe("specs/api.md");
    expect(new URLSearchParams(read.search).get("source")).toBe("repo");
  });

  it("requests a local document by its local source", async () => {
    const net = installFetch({
      [`GET ${LIST_PATH}`]: listOf(DOCS),
      [`GET ${LIST_PATH}/content`]: { path: "docs/alpha.md", source: "local", content: "local text", version: "v1", size_bytes: 10 },
    });
    renderPicker({ initial: [] });
    fireEvent.click(await screen.findByRole("button", { name: "Preview docs/alpha.md" }));
    await screen.findByText("local text");
    const read = net.requests.find((r) => r.path === `${LIST_PATH}/content`)!;
    expect(new URLSearchParams(read.search).get("source")).toBe("local");
  });

  it("previews the override copy's text (source local), not the repository document's (AC-16)", async () => {
    const net = installFetch({
      [`GET ${LIST_PATH}`]: listOf([
        entry("docs/a.md", { overridden: true }),
        entry("docs/a.md", { source: "local", overrides_repo: true }),
      ]),
      [`GET ${LIST_PATH}/content`]: { path: "docs/a.md", source: "local", content: "copy text", version: "v1", size_bytes: 9 },
    });
    renderPicker({ initial: [] });
    fireEvent.click(await screen.findByRole("button", { name: "Preview docs/a.md" }));
    await screen.findByText("copy text");
    const reads = net.requests.filter((r) => r.path === `${LIST_PATH}/content`);
    expect(reads).toHaveLength(1);
    expect(new URLSearchParams(reads[0]!.search).get("source")).toBe("local");
  });
});
