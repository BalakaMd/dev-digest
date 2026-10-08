import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseFromFindingResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { installFetch, apiError } from "../../../../../../../../../test/context-docs-fixtures";
import { EvalCaseButton } from "./EvalCaseButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BUTTON = { name: "Turn into eval case" };

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

function renderButton(decided: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <EvalCaseButton findingId="f1" decided={decided} />
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
    const net = installFetch({ "POST /findings/f1/eval-case": caseResponse(true) });
    renderButton(true);
    fireEvent.click(screen.getByRole("button", BUTTON));

    expect(await screen.findByRole("status")).toHaveTextContent("Eval case created: stripe-key-leak");
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]!.path).toBe("/findings/f1/eval-case");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("states that the finding is already an eval case, naming the existing one (AC-9)", async () => {
    installFetch({ "POST /findings/f1/eval-case": caseResponse(false, "existing-case") });
    renderButton(true);
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("status")).toHaveTextContent("Already an eval case: existing-case");
  });

  it("shows the API error message and keeps the button available for a retry (AC-6, AC-7)", async () => {
    let calls = 0;
    installFetch({
      "POST /findings/f1/eval-case": () => {
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

  it("renders the case name as text, never as markup (NFR-3)", async () => {
    installFetch({ "POST /findings/f1/eval-case": caseResponse(true, "<img src=x onerror=alert(1)>") });
    renderButton(true);
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(document.body.querySelector("img")).toBeNull();
  });
});
