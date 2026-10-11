import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseFromFindingResponse, EvalCaseSuggestion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { installFetch, apiError } from "../../../../../../../test/context-docs-fixtures";
import { EvalCaseButton } from "./EvalCaseButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BUTTON = { name: "Turn into eval case" };
const BUTTON_EXISTS = { name: "Already an eval case" };

function caseResponse(created: boolean, name = "stripe-key-leak"): EvalCaseFromFindingResponse {
  return {
    created,
    case: {
      id: "c1",
      agent_id: "a1",
      name,
      expected_output: [{ type: "must_find", file: "src/config.ts", start_line: 11, end_line: 11 }],
      source_finding_id: "f1",
      created_at: "2026-10-08T00:00:00Z",
      last_result: null,
      input_diff: "diff --git a/src/config.ts b/src/config.ts",
      input_meta: { title: "t", body: "b" },
      input_files: ["src/config.ts"],
    },
  };
}

const SUGGEST = "GET /findings/f1/eval-case/suggestion";
const CREATE = "POST /findings/f1/eval-case";

/** A suggestion response; with no override, suggested equals cited (the single-activation path). */
function suggestionResponse(over: { cited?: [number, number]; suggested?: [number, number]; fingerprint?: string } = {}): EvalCaseSuggestion {
  const [cs, ce] = over.cited ?? [11, 11];
  const [ss, se] = over.suggested ?? [cs, ce];
  return {
    existing_case: null,
    suggestion: {
      file: "src/config.ts",
      type: "must_find",
      cited: { start_line: cs, end_line: ce },
      suggested: { start_line: ss, end_line: se },
      reason: { terms: [], expanded_to_function: null, function_too_long: false, structure_available: true },
      patch_lines: Array.from({ length: 20 }, (_, i) => ({ line: i + 1, text: `line ${i + 1}` })),
      hunks: [{ start_line: 1, end_line: 20 }],
      patch_fingerprint: over.fingerprint ?? "fp1",
    },
  };
}

function renderButton(decided: boolean, existingCaseName?: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <EvalCaseButton findingId="f1" decided={decided} existingCaseName={existingCaseName} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalCaseButton", () => {
  it("stays disabled with an accessible reason until the finding is decided, and sends nothing (AC-4)", () => {
    const net = installFetch({});
    renderButton(false);
    const button = screen.getByRole("button", BUTTON);
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/accept or dismiss this finding first/i);
    fireEvent.click(button);
    expect(net.requests).toHaveLength(0);
  });

  it("creates the case on a single click, with no dialog, and announces it by name (AC-1, AC-3, AC-5, AC-66)", async () => {
    const net = installFetch({ [SUGGEST]: suggestionResponse(), [CREATE]: caseResponse(true) });
    renderButton(true);
    fireEvent.click(screen.getByRole("button", BUTTON));

    expect(await screen.findByRole("status")).toHaveTextContent("Eval case created: stripe-key-leak");
    expect(net.requests.map((r) => `${r.method} ${r.path}`)).toEqual([SUGGEST, CREATE]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("states that the finding is already an eval case, naming the existing one (AC-9)", async () => {
    installFetch({ [SUGGEST]: suggestionResponse(), [CREATE]: caseResponse(false, "existing-case") });
    renderButton(true);
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("status")).toHaveTextContent("Already an eval case: existing-case");
    expect(screen.getByRole("button", BUTTON_EXISTS)).toBeDisabled();
  });

  it("shows the API error message and keeps the button available for a retry (AC-6, AC-7)", async () => {
    let calls = 0;
    installFetch({
      [SUGGEST]: suggestionResponse(),
      [CREATE]: () => {
        calls++;
        return calls === 1
          ? apiError(409, "The agent that produced this finding was deleted", undefined, "agent_deleted")
          : caseResponse(true);
      },
    });
    renderButton(true);
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent("The agent that produced this finding was deleted");
    expect(screen.getByRole("button", BUTTON)).toBeEnabled();

    fireEvent.click(screen.getByRole("button", BUTTON));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent("stripe-key-leak");
  });

  it("is disabled and names the existing case when one already exists, sending nothing (AC-2)", () => {
    const net = installFetch({});
    renderButton(true, "stripe-key");
    const button = screen.getByRole("button", BUTTON_EXISTS);
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Already an eval case: stripe-key");
    fireEvent.click(button);
    expect(net.requests).toHaveLength(0);
  });

  it("prefers 'already exists' over the needs-decision hint for an undecided finding (Q-3)", () => {
    installFetch({});
    renderButton(false, "stripe-key");
    expect(screen.getByRole("button", BUTTON_EXISTS)).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Already an eval case: stripe-key");
    expect(screen.queryByText(/accept or dismiss this finding first/i)).not.toBeInTheDocument();
  });

  it.each([true, false])("disables the button after the click when created=%s (AC-2)", async (created) => {
    installFetch({ [SUGGEST]: suggestionResponse(), [CREATE]: caseResponse(created) });
    renderButton(true);
    fireEvent.click(screen.getByRole("button", BUTTON));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/stripe-key-leak/));
    expect(screen.getByRole("button", BUTTON_EXISTS)).toBeDisabled();
    expect(screen.queryByRole("button", BUTTON)).not.toBeInTheDocument();
  });

  it("keeps the 'Turn into eval case' label when no case exists", () => {
    installFetch({});
    renderButton(true);
    expect(screen.getByRole("button", BUTTON)).toBeEnabled();
    expect(screen.queryByRole("button", BUTTON_EXISTS)).not.toBeInTheDocument();
  });

  it("does not stretch the button to the status text: wrapper aligns items to start (R1)", () => {
    installFetch({});
    const { container } = renderButton(true, "a-very-long-eval-case-name-that-would-otherwise-widen-the-button");
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.style.alignItems).toBe("flex-start");
    expect(wrap.style.maxWidth).not.toBe("");
  });

  it("renders the case name as text, never as markup (NFR-3)", async () => {
    installFetch({ [SUGGEST]: suggestionResponse(), [CREATE]: caseResponse(true, "<img src=x onerror=alert(1)>") });
    renderButton(true);
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(document.body.querySelector("img")).toBeNull();
  });

  describe("line-range suggestion (SPEC-07)", () => {
    const click = () => fireEvent.click(screen.getByRole("button", BUTTON));
    const dialogFields = () => ({
      start: screen.getByLabelText("Start line") as HTMLInputElement,
      end: screen.getByLabelText("End line") as HTMLInputElement,
    });

    it("asks for the suggestion before any POST, and an equal range creates with no body and no dialog (AC-3, AC-24)", async () => {
      const net = installFetch({ [SUGGEST]: suggestionResponse({ cited: [19, 16], suggested: [16, 19] }), [CREATE]: caseResponse(true) });
      renderButton(true);
      click();
      expect(await screen.findByRole("status")).toHaveTextContent("Eval case created");
      expect(net.requests.map((r) => `${r.method} ${r.path}`)).toEqual([SUGGEST, CREATE]);
      expect(net.requests[1]!.body).toBeUndefined();
      const post = net.fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
      const headers = (post[1] as RequestInit).headers as Record<string, string>;
      expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("content-type");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens the dialog when the range differs and creates nothing until confirmed (AC-1)", async () => {
      const net = installFetch({ [SUGGEST]: suggestionResponse({ cited: [6, 8], suggested: [16, 19] }), [CREATE]: caseResponse(true) });
      renderButton(true);
      click();
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(net.count("POST", "/findings/f1/eval-case")).toBe(0);
    });

    it.each([
      ["Cancel", () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }))],
      ["Escape", () => fireEvent.keyDown(screen.getByLabelText("Start line"), { key: "Escape" })],
    ])("%s closes the dialog, creates nothing and returns focus to the button (AC-2)", async (_n, act) => {
      const net = installFetch({ [SUGGEST]: suggestionResponse({ cited: [6, 8], suggested: [16, 19] }) });
      renderButton(true);
      click();
      await screen.findByRole("dialog");
      act();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(net.count("POST", "/findings/f1/eval-case")).toBe(0);
      expect(screen.getByRole("button", BUTTON)).toHaveFocus();
    });

    it("shows the button busy and disabled while the suggestion is pending (AC-26)", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      installFetch({
        [SUGGEST]: async () => {
          await gate;
          return suggestionResponse({ cited: [6, 8], suggested: [16, 19] });
        },
      });
      renderButton(true);
      click();
      await waitFor(() => expect(screen.getByRole("button", BUTTON)).toBeDisabled());
      release();
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", BUTTON)).toBeEnabled();
    });

    it("shows the API error of a failed suggestion and keeps the button available (AC-27)", async () => {
      const net = installFetch({ [SUGGEST]: apiError(422, "The diff of this file is not available", undefined, "diff_unavailable") });
      renderButton(true);
      click();
      expect(await screen.findByRole("alert")).toHaveTextContent("The diff of this file is not available");
      expect(screen.getByRole("button", BUTTON)).toBeEnabled();
      expect(net.count("POST", "/findings/f1/eval-case")).toBe(0);
    });

    it("states that the finding is already an eval case, naming it, with no dialog and no POST (AC-35)", async () => {
      const net = installFetch({ [SUGGEST]: { existing_case: { id: "c9", name: "made-elsewhere" }, suggestion: null } });
      renderButton(true);
      click();
      expect(await screen.findByRole("status")).toHaveTextContent("Already an eval case: made-elsewhere");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(net.count("POST", "/findings/f1/eval-case")).toBe(0);
      expect(screen.getByRole("button", BUTTON_EXISTS)).toBeDisabled();
    });

    it("confirms with the range and the fingerprint, closes and announces the case (AC-14, AC-16)", async () => {
      const net = installFetch({
        [SUGGEST]: suggestionResponse({ cited: [6, 8], suggested: [16, 19], fingerprint: "fp-xyz" }),
        [CREATE]: caseResponse(true),
      });
      renderButton(true);
      click();
      await screen.findByRole("dialog");
      fireEvent.click(screen.getByRole("button", { name: "Create eval case" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Eval case created: stripe-key-leak");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(net.requests.find((r) => r.method === "POST")!.body).toEqual({ start_line: 16, end_line: 19, patch_fingerprint: "fp-xyz" });
    });

    it("sends the normalised range of a reversed entry (AC-46)", async () => {
      const net = installFetch({ [SUGGEST]: suggestionResponse({ cited: [6, 8], suggested: [16, 19] }), [CREATE]: caseResponse(true) });
      renderButton(true);
      click();
      await screen.findByRole("dialog");
      const { start, end } = dialogFields();
      fireEvent.change(start, { target: { value: "19" } });
      fireEvent.change(end, { target: { value: "16" } });
      fireEvent.click(screen.getByRole("button", { name: "Create eval case" }));
      await screen.findByRole("status");
      expect(net.requests.find((r) => r.method === "POST")!.body).toMatchObject({ start_line: 16, end_line: 19 });
    });

    it("keeps the dialog open with the API reason and the entered range on a rejected range (AC-15, AC-17)", async () => {
      installFetch({
        [SUGGEST]: suggestionResponse({ cited: [6, 8], suggested: [16, 19] }),
        [CREATE]: apiError(422, "Lines 16-19 of src/config.ts are not in the diff", undefined, "validation_error"),
      });
      renderButton(true);
      click();
      await screen.findByRole("dialog");
      fireEvent.change(dialogFields().start, { target: { value: "17" } });
      fireEvent.click(screen.getByRole("button", { name: "Create eval case" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("are not in the diff");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(dialogFields().start.value).toBe("17");
      expect(screen.getByRole("button", { name: "Create eval case" })).toBeEnabled();
    });

    it("reloads the suggestion on 409 diff_changed and keeps the typed numbers (AC-43)", async () => {
      let gets = 0;
      let posts = 0;
      const net = installFetch({
        [SUGGEST]: () => {
          gets++;
          return gets === 1
            ? suggestionResponse({ cited: [6, 8], suggested: [16, 19], fingerprint: "fp-old" })
            : suggestionResponse({ cited: [6, 8], suggested: [15, 19], fingerprint: "fp-new" });
        },
        [CREATE]: () => {
          posts++;
          return posts === 1 ? apiError(409, "The diff changed", undefined, "diff_changed") : caseResponse(true);
        },
      });
      renderButton(true);
      click();
      await screen.findByRole("dialog");
      fireEvent.change(dialogFields().start, { target: { value: "17" } });
      fireEvent.click(screen.getByRole("button", { name: "Create eval case" }));
      expect(await screen.findByRole("radio", { name: /Suggested 15–19/ })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("The diff changed");
      expect(dialogFields().start.value).toBe("17");
      expect(net.count("GET", "/findings/f1/eval-case/suggestion")).toBe(2);

      await waitFor(() => expect(screen.getByRole("button", { name: "Create eval case" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Create eval case" }));
      await screen.findByRole("status");
      expect(net.requests.filter((r) => r.method === "POST")[1]!.body).toEqual({ start_line: 17, end_line: 19, patch_fingerprint: "fp-new" });
    });

    it("closes the dialog and states 'already an eval case' when confirm finds one (AC-18)", async () => {
      installFetch({
        [SUGGEST]: suggestionResponse({ cited: [6, 8], suggested: [16, 19] }),
        [CREATE]: caseResponse(false, "made-elsewhere"),
      });
      renderButton(true);
      click();
      await screen.findByRole("dialog");
      fireEvent.click(screen.getByRole("button", { name: "Create eval case" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Already an eval case: made-elsewhere");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
