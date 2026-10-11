import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseSuggestionDetail } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { RangeDialog } from "./RangeDialog";

afterEach(cleanup);

function suggestion(over: Partial<EvalCaseSuggestionDetail> = {}): EvalCaseSuggestionDetail {
  const patch_lines = [6, 7, 8, 15, 16, 17, 18, 19].map((line) => ({ line, text: `code ${line}` }));
  return {
    file: "src/routes.ts",
    type: "must_find",
    cited: { start_line: 6, end_line: 8 },
    suggested: { start_line: 16, end_line: 19 },
    reason: {
      terms: [{ term: "'/users'", count: 1 }],
      expanded_to_function: { name: null },
      function_too_long: false,
      structure_available: true,
    },
    patch_lines,
    hunks: [
      { start_line: 6, end_line: 8 },
      { start_line: 15, end_line: 19 },
    ],
    patch_fingerprint: "fp1",
    ...over,
  };
}

function setup(props: { s?: EvalCaseSuggestionDetail; pending?: boolean; error?: string | null } = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const ui = (s: EvalCaseSuggestionDetail) => (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RangeDialog suggestion={s} pending={props.pending ?? false} error={props.error ?? null} onConfirm={onConfirm} onCancel={onCancel} />
    </NextIntlClientProvider>
  );
  const view = render(ui(props.s ?? suggestion()));
  return { onConfirm, onCancel, rerender: (s: EvalCaseSuggestionDetail) => view.rerender(ui(s)) };
}

const start = () => screen.getByLabelText("Start line") as HTMLInputElement;
const end = () => screen.getByLabelText("End line") as HTMLInputElement;
const confirmBtn = () => screen.getByRole("button", { name: "Create eval case" });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe("RangeDialog", () => {
  it("has an accessible name and moves focus inside when it opens (NFR-5)", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Choose the lines for the eval case" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("wraps Tab and Shift+Tab inside the dialog (NFR-5)", () => {
    setup();
    const close = screen.getByRole("button", { name: "Close" });
    const last = confirmBtn();
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it.each([
    ["Escape", () => fireEvent.keyDown(screen.getByLabelText("Start line"), { key: "Escape" })],
    ["Cancel", () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }))],
    ["Close", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
  ])("%s calls onCancel and sends nothing (AC-2)", (_n, act) => {
    const { onCancel, onConfirm } = setup();
    act();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("opens on 'Suggested' with both options labelled by range and visible field labels (AC-20, NFR-6)", () => {
    setup();
    expect(screen.getByRole("radio", { name: /Suggested 16–19/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Cited 6–8/ })).not.toBeChecked();
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(start().value).toBe("16");
    expect(end().value).toBe("19");
  });

  it("sets the fields when an option is chosen (AC-33) and selects neither after editing (AC-40)", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: /Cited/ }));
    expect([start().value, end().value]).toEqual(["6", "8"]);
    expect(screen.getByRole("radio", { name: /Cited/ })).toBeChecked();
    type(start(), "7");
    expect(screen.getByRole("radio", { name: /Cited/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Suggested/ })).not.toBeChecked();
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
  });

  it("previews the new-side lines of the range with line numbers and follows edits (AC-21, AC-22)", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Lines 16–19" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Lines 16–19" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getByText("code 17")).toBeInTheDocument();
    type(end(), "17");
    expect(within(screen.getByRole("list", { name: "Lines 16–17" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders patch text as text, never as markup (AC-21)", () => {
    setup({ s: suggestion({ patch_lines: [{ line: 16, text: "<img src=x onerror=alert(1)>" }] }) });
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.body.querySelector("img")).toBeNull();
  });

  it("confirms a reversed range as lower-to-higher (AC-46)", () => {
    const { onConfirm } = setup();
    type(start(), "19");
    type(end(), "16");
    expect(screen.getByRole("heading", { name: "Lines 16–19" })).toBeInTheDocument();
    fireEvent.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledWith({ start_line: 16, end_line: 19 });
  });

  it.each([
    ["", "19", /Enter both a start and an end line/],
    ["abc", "19", /must be whole numbers/],
    ["900", "901", /not inside any changed part/],
  ])("start %j / end %j disables Confirm and announces the reason (AC-23, NFR-6)", (a, b, reasonRe) => {
    const { onConfirm } = setup();
    type(start(), a);
    type(end(), b);
    expect(screen.getByRole("alert")).toHaveTextContent(reasonRe);
    expect(confirmBtn()).toBeDisabled();
    fireEvent.keyDown(start(), { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Enter in a field confirms a valid range (AC-34)", () => {
    const { onConfirm } = setup();
    fireEvent.keyDown(end(), { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith({ start_line: 16, end_line: 19 });
  });

  it("keeps Confirm disabled and ignores Enter while a request is pending (AC-19)", () => {
    const { onConfirm } = setup({ pending: true });
    expect(confirmBtn()).toBeDisabled();
    fireEvent.keyDown(start(), { key: "Enter" });
    fireEvent.click(confirmBtn());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the API error and keeps the entered range and Confirm available (AC-17)", () => {
    setup({ error: "Something failed" });
    type(start(), "17");
    expect(screen.getByRole("alert")).toHaveTextContent("Something failed");
    expect(start().value).toBe("17");
    expect(confirmBtn()).toBeEnabled();
  });

  it("keeps the typed numbers when the suggestion is replaced after a reload (AC-43)", () => {
    const { rerender } = setup();
    type(start(), "17");
    rerender(suggestion({ patch_fingerprint: "fp2", suggested: { start_line: 15, end_line: 19 } }));
    expect(start().value).toBe("17");
    expect(screen.getByRole("radio", { name: /Suggested 15–19/ })).toBeInTheDocument();
  });

  it("explains the suggestion: matched terms and anonymous function (AC-32)", () => {
    setup();
    expect(screen.getByText("matched '/users' ×1")).toBeInTheDocument();
    expect(screen.getByText("expanded to the enclosing function")).toBeInTheDocument();
  });

  it("names a function and notes one longer than 80 lines (AC-32)", () => {
    setup({
      s: suggestion({
        reason: { terms: [], expanded_to_function: { name: "registerRoutes" }, function_too_long: true, structure_available: true },
      }),
    });
    expect(screen.getByText("expanded to function registerRoutes")).toBeInTheDocument();
    expect(screen.getByText(/longer than 80 lines/)).toBeInTheDocument();
  });

  it("notes when the structure is not available (AC-41)", () => {
    setup({
      s: suggestion({ reason: { terms: [], expanded_to_function: null, function_too_long: false, structure_available: false } }),
    });
    expect(screen.getByText("structure not available for this file type")).toBeInTheDocument();
    expect(screen.queryByText(/expanded to/)).not.toBeInTheDocument();
  });
});
