import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { BlastSymbolRow } from "./BlastSymbolRow";

type Item = PrBlastRadiusResponse["downstream"][number];

const ITEM: Item = {
  symbol: "charge",
  callers: [
    { name: "checkout", file: "src/api/checkout.ts", line: 12 },
    { name: "refundAll", file: "src/api/my file.ts", line: 7 },
  ],
  endpoints_affected: ["POST /checkout"],
  crons_affected: ["nightly-settlement"],
};

function renderRow(props: Partial<React.ComponentProps<typeof BlastSymbolRow>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastSymbolRow item={ITEM} repoFullName="acme/payments-api" sha="deadbeef" defaultOpen {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("BlastSymbolRow", () => {
  it("shows the symbol name and its caller count in the toggle", () => {
    renderRow();
    const toggle = screen.getByRole("button", { name: /charge/ });
    expect(toggle).toHaveTextContent("2 callers");
  });

  it("says '1 caller' (singular) for a symbol with a single caller", () => {
    renderRow({ item: { ...ITEM, callers: ITEM.callers.slice(0, 1) } });
    expect(screen.getByRole("button", { name: /charge/ })).toHaveTextContent(/1 caller$/);
  });

  it("renders each caller as file:line linking to that exact line on GitHub, in a new tab", () => {
    renderRow();
    const link = screen.getByRole("link", { name: "src/api/checkout.ts:12" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/deadbeef/src/api/checkout.ts#L12",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("title", "Open on GitHub");
  });

  it("URL-encodes odd path segments but keeps the slashes", () => {
    renderRow();
    expect(screen.getByRole("link", { name: "src/api/my file.ts:7" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/deadbeef/src/api/my%20file.ts#L7",
    );
  });

  it("renders callers as plain text when the repo full name is unknown", () => {
    renderRow({ repoFullName: null });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("src/api/checkout.ts:12")).toBeInTheDocument();
  });

  it("lists HTTP endpoints and cron jobs in two separate labelled groups", () => {
    renderRow();
    const endpointsGroup = screen.getByText("HTTP endpoints").parentElement!;
    const cronsGroup = screen.getByText("Cron jobs").parentElement!;
    expect(endpointsGroup).not.toBe(cronsGroup);
    expect(endpointsGroup).toHaveTextContent("POST /checkout");
    expect(endpointsGroup).not.toHaveTextContent("nightly-settlement");
    expect(cronsGroup).toHaveTextContent("nightly-settlement");
    expect(cronsGroup).not.toHaveTextContent("POST /checkout");
  });

  it("omits a group that has nothing in it", () => {
    renderRow({ item: { ...ITEM, endpoints_affected: [], crons_affected: [] } });
    expect(screen.queryByText("HTTP endpoints")).toBeNull();
    expect(screen.queryByText("Cron jobs")).toBeNull();
  });

  it("starts collapsed by default, and expands and collapses on click", () => {
    renderRow({ defaultOpen: false });
    const toggle = screen.getByRole("button", { name: /charge/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link")).toHaveLength(2);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
