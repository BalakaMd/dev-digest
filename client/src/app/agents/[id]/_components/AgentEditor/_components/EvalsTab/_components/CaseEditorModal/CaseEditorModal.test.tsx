import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCaseDetail } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import common from "../../../../../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../../../../../lib/toast";
import { apiError, installFetch } from "../../../../../../../../../test/context-docs-fixtures";
import { CaseEditorModal } from "./CaseEditorModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;
const EXPECTED = [{ type: "must_find", file: "src/config.ts", start_line: 12, end_line: 12 }];
const DIFF = "diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1 +1 @@\n+stripeKey";

const detail = (over: Partial<EvalCaseDetail> = {}): EvalCaseDetail => ({
  id: "c1",
  agent_id: "ag1",
  name: "stripe-key-leak",
  expected_output: EXPECTED as EvalCaseDetail["expected_output"],
  source_finding_id: null,
  created_at: "2026-10-01T00:00:00Z",
  last_result: null,
  input_diff: DIFF,
  input_meta: { title: "Add Stripe", body: "Wire it" },
  input_files: ["src/config.ts"],
  ...over,
});

function renderModal(caseId: string | null, onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <ToastProvider>
          <CaseEditorModal agent={AGENT} caseId={caseId} onClose={onClose} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const expectedBox = () => screen.getByLabelText("Expected output") as HTMLTextAreaElement;
const save = () => screen.getByRole("button", { name: "Save" });
const runBtn = () => screen.getByRole("button", { name: "Run case" });

function fillNew(name = "my-case") {
  type(screen.getByLabelText(/^Name/), name);
  type(screen.getByLabelText("Diff"), DIFF);
  type(expectedBox(), JSON.stringify(EXPECTED));
}

describe("CaseEditorModal — create (AC-46, 47, 48, 49)", () => {
  it("opens with Name, Input tabs, Expected output, Run on save and the three actions", () => {
    renderModal(null);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeRequired();
    for (const n of ["Diff", "Files", "PR meta"]) expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    expect(expectedBox()).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Run on save" })).toBeInTheDocument();
    for (const n of ["Cancel", "Run case", "Save"]) expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
  });

  it("marks an empty Name as required and disables Save (AC-49)", () => {
    renderModal(null);
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fillNew();
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it("shows 'invalid JSON' with the reason and disables Save and Run case (AC-47)", () => {
    renderModal(null);
    fillNew();
    type(expectedBox(), "[{ broken");
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByText(/not valid JSON/)).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(runBtn()).toBeDisabled();
    type(expectedBox(), JSON.stringify([{ type: "nope", file: "a", start_line: 1, end_line: 1 }]));
    expect(screen.getByText(/type must be must_find or must_not_flag/)).toBeInTheDocument();
    type(expectedBox(), JSON.stringify(EXPECTED));
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it("appends a skeleton with every field present and empty (AC-48)", () => {
    renderModal(null);
    type(expectedBox(), JSON.stringify(EXPECTED));
    fireEvent.click(screen.getByRole("button", { name: "Finding skeleton" }));
    const list = JSON.parse(expectedBox().value);
    expect(list).toHaveLength(2);
    expect(list[1]).toEqual({ type: "", file: "", start_line: null, end_line: null, title: "", severity: "", category: "" });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
  });

  it("shows the diff's file paths read-only in the Files tab and sends nothing extra (AC-54)", async () => {
    const h = installFetch({ "POST /agents/ag1/eval-cases": detail({ id: "new1" }), "GET /eval-cases/new1": detail({ id: "new1" }) });
    renderModal(null, vi.fn());
    fillNew();
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(screen.getByRole("list", { name: "Files in the diff" })).toHaveTextContent("src/config.ts");
    fireEvent.click(screen.getByRole("switch", { name: "Run on save" }));
    fireEvent.click(save());
    await waitFor(() => expect(h.count("POST", "/agents/ag1/eval-cases")).toBe(1));
    expect(h.requests.find((r) => r.method === "POST")?.body).toEqual({
      name: "my-case",
      input_diff: DIFF,
      input_meta: { title: "", body: "" },
      expected_output: EXPECTED,
    });
  });

  it("with Run on save on, runs the case after the save succeeds, then closes (AC-52)", async () => {
    const h = installFetch({
      "POST /agents/ag1/eval-cases": detail({ id: "new1" }),
      "GET /eval-cases/new1": detail({ id: "new1" }),
      "POST /eval-cases/new1/run": {},
    });
    const onClose = renderModal(null);
    fillNew();
    expect(screen.getByRole("switch", { name: "Run on save" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const order = h.requests.filter((r) => r.method === "POST").map((r) => r.path);
    expect(order).toEqual(["/agents/ag1/eval-cases", "/eval-cases/new1/run"]);
  });

  it("with Run on save off, saves without running (AC-52)", async () => {
    const h = installFetch({ "POST /agents/ag1/eval-cases": detail({ id: "new1" }), "GET /eval-cases/new1": detail({ id: "new1" }) });
    const onClose = renderModal(null);
    fillNew();
    fireEvent.click(screen.getByRole("switch", { name: "Run on save" }));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.requests.some((r) => r.path.endsWith("/run"))).toBe(false);
  });
});

describe("CaseEditorModal — edit (AC-50, 53)", () => {
  it("fills the stored values; Name and Expected output editable, Diff and PR meta read-only", async () => {
    installFetch({ "GET /eval-cases/c1": detail() });
    renderModal("c1");
    expect(await screen.findByLabelText(/^Name/)).toHaveValue("stripe-key-leak");
    expect(JSON.parse(expectedBox().value)).toEqual(EXPECTED);
    expect(screen.getByText("Eval case · stripe-key-leak")).toBeInTheDocument();
    // diff is plain text, not an input
    expect(screen.queryByRole("textbox", { name: "Diff" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Diff")).toHaveTextContent("+stripeKey");
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByText("Add Stripe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("saves only name and expected_output (input is immutable)", async () => {
    const h = installFetch({ "GET /eval-cases/c1": detail(), "PUT /eval-cases/c1": detail({ name: "renamed" }), "POST /eval-cases/c1/run": {} });
    const onClose = renderModal("c1");
    type(await screen.findByLabelText(/^Name/), "renamed");
    fireEvent.click(screen.getByRole("switch", { name: "Run on save" }));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.requests.find((r) => r.method === "PUT")?.body).toEqual({ name: "renamed", expected_output: EXPECTED });
  });

  it("shows the last outcome with counts, duration and cost (AC-53), or nothing when never run", async () => {
    installFetch({
      "GET /eval-cases/c1": detail({
        last_result: { passed: true, expected_count: 1, returned_count: 1, duration_ms: 1800, cost_usd: 0.02, ran_at: "x" },
      }),
    });
    renderModal("c1");
    const box = await screen.findByTestId("last-run");
    expect(box).toHaveTextContent("Last run passed · expected 1, got 1 · 1.8s · $0.02");
  });

  it("shows no last-run box for a never-run case and 'failed' for a failing one", async () => {
    installFetch({ "GET /eval-cases/c1": detail() });
    renderModal("c1");
    await screen.findByLabelText(/^Name/);
    expect(screen.queryByTestId("last-run")).not.toBeInTheDocument();
    cleanup();
    installFetch({ "GET /eval-cases/c1": detail({ last_result: { passed: false, expected_count: 2, returned_count: 0, duration_ms: null, cost_usd: null, ran_at: "x" } }) });
    renderModal("c1");
    expect(await screen.findByTestId("last-run")).toHaveTextContent("Last run failed · expected 2, got 0");
  });

  it("Run case runs the stored case without saving when nothing changed (AC-51)", async () => {
    const h = installFetch({ "GET /eval-cases/c1": detail(), "POST /eval-cases/c1/run": {} });
    renderModal("c1");
    await screen.findByLabelText(/^Name/);
    fireEvent.click(runBtn());
    await waitFor(() => expect(h.count("POST", "/eval-cases/c1/run")).toBe(1));
    expect(h.requests.some((r) => r.method === "PUT")).toBe(false);
  });
});

describe("CaseEditorModal — failures (AC-75, EC-14, NFR-3)", () => {
  it("shows the API's rejection reason in an alert and keeps Save disabled until the text changes (AC-75)", async () => {
    installFetch({
      "GET /eval-cases/c1": detail(),
      "PUT /eval-cases/c1": apiError(422, "Expectation 1: file src/nope.ts is not in the case's diff"),
    });
    const onClose = renderModal("c1");
    const box = await screen.findByLabelText("Expected output");
    type(box, JSON.stringify([{ ...EXPECTED[0], file: "src/nope.ts" }]));
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("file src/nope.ts is not in the case's diff");
    expect(onClose).not.toHaveBeenCalled();
    expect(save()).toBeDisabled();
    type(box, JSON.stringify([{ ...EXPECTED[0], file: "src/config.ts" }]));
    expect(save()).toBeEnabled();
  });

  it("shows the API message of an HTTP 413 in an alert, stays open and keeps the entered text (EC-14)", async () => {
    installFetch({ "POST /agents/ag1/eval-cases": apiError(413, "Request body is too large", undefined, "payload_too_large") });
    const onClose = renderModal(null);
    fillNew();
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Request body is too large");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Diff")).toHaveValue(DIFF);
    expect(screen.getByLabelText(/^Name/)).toHaveValue("my-case");
  });

  it("shows a run failure after a successful save in an alert and stays open", async () => {
    installFetch({
      "GET /eval-cases/c1": detail(),
      "PUT /eval-cases/c1": detail({ name: "renamed" }),
      "POST /eval-cases/c1/run": apiError(500, "provider down"),
    });
    const onClose = renderModal("c1");
    type(await screen.findByLabelText(/^Name/), "renamed");
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("provider down");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders stored diff, PR text and expectations as text, never as HTML (NFR-3)", async () => {
    const evil = '<img src=x onerror="window.__pwned=1">';
    installFetch({
      "GET /eval-cases/c1": detail({
        name: evil,
        input_diff: `+++ b/a.ts\n+${evil}`,
        input_meta: { title: evil, body: evil },
        expected_output: [{ type: "must_find", file: "a.ts", start_line: 1, end_line: 1, title: evil }] as EvalCaseDetail["expected_output"],
      }),
    });
    renderModal("c1");
    await screen.findByLabelText(/^Name/);
    expect(screen.getByLabelText("Diff")).toHaveTextContent(evil);
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getAllByText(evil)).toHaveLength(2);
    expect(JSON.parse(expectedBox().value)[0].title).toBe(evil);
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows an error with Cancel when the stored case cannot be loaded", async () => {
    installFetch({ "GET /eval-cases/c1": apiError(404, "Eval case not found") });
    const onClose = renderModal("c1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Eval case not found");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
