import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";
import { confidenceColor, evidenceRef } from "./evidence-display";

const candidate: ConventionCandidate = {
  id: "c1",
  category: "async",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  line_start: 23,
  line_end: 31,
  evidence: [
    { path: "src/api/users.ts", line_start: 23, line_end: 31, snippet: "const user = await db.users.find(id);" },
    { path: "src/api/orders.ts", line_start: 4, line_end: 4, snippet: "const order = await db.orders.find(id);" },
  ],
  confidence: 0.78,
  status: "pending",
  created_at: new Date(0).toISOString(),
};

function renderCard(
  handlers: Partial<Parameters<typeof ConventionCard>[0]> = {},
  over: Partial<ConventionCandidate> = {},
) {
  const props = { onToggleAccept: vi.fn(), onReject: vi.fn(), onSave: vi.fn(), onRestore: vi.fn(), ...handlers };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ConventionCard candidate={{ ...candidate, ...over }} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

afterEach(cleanup);

describe("ConventionCard", () => {
  it("shows rule, category, primary evidence, and more files on demand", () => {
    renderCard();
    expect(screen.getByText(candidate.rule)).toBeInTheDocument();
    expect(screen.getByText("Async")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.queryByText("src/api/orders.ts:4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /\+1 more file/ }));
    expect(screen.getByText("src/api/orders.ts:4")).toBeInTheDocument();
  });

  it("edits rule and category inline and saves them", () => {
    const { onSave } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const rule = screen.getByLabelText("Rule");
    fireEvent.change(rule, { target: { value: "  Prefer async/await  " } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "naming" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ rule: "Prefer async/await", category: "naming" });
    expect(screen.queryByLabelText("Rule")).not.toBeInTheDocument();
  });

  it("cancelling an edit keeps the card unchanged and saves nothing", () => {
    const { onSave } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(candidate.rule)).toBeInTheDocument();
  });

  it("wires Accept and Reject", () => {
    const { onToggleAccept, onReject } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onToggleAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});

describe("ConventionCard — rejected", () => {
  it("offers only Restore", () => {
    const { onRestore } = renderCard({}, { status: "rejected" });
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    for (const name of ["Accept", "Reject", "Edit"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});

describe("evidence display", () => {
  it("formats refs and picks confidence colours", () => {
    expect(evidenceRef({ path: "a.ts", line_start: 3, line_end: 3 })).toBe("a.ts:3");
    expect(evidenceRef({ path: "a.ts", line_start: 3, line_end: 9 })).toBe("a.ts:3-9");
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.78)).toBe("var(--warn)");
    expect(confidenceColor(0.4)).toBe("var(--crit)");
  });
});
