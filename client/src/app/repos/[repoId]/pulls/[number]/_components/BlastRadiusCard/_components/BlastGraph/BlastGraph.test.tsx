import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { GRAPH_MAX_SYMBOLS } from "./constants";
import { BlastGraph } from "./BlastGraph";

const BASE: PrBlastRadiusResponse = {
  changed_symbols: [{ name: "charge", file: "src/pay.ts", kind: "function" }],
  downstream: [
    {
      symbol: "charge",
      callers: [{ name: "checkout", file: "src/api/checkout.ts", line: 12 }],
      endpoints_affected: ["POST /a-very-long-endpoint-path/that-gets-cut"],
      crons_affected: [],
    },
  ],
  summary: "",
  degraded: false,
  degraded_reason: null,
  indexed_sha: null,
};

function renderGraph(data: PrBlastRadiusResponse) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastGraph data={data} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("BlastGraph", () => {
  it("renders an accessible svg with headers and the legend from blast.json", () => {
    renderGraph(BASE);
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.getByText("Changed symbols")).toBeInTheDocument();
    expect(screen.getByText("Callers")).toBeInTheDocument();
    expect(screen.getByText("Endpoints and crons")).toBeInTheDocument();
    expect(screen.getByText("Changed symbol")).toBeInTheDocument();
    expect(screen.getByText("Caller (solid line)")).toBeInTheDocument();
    expect(screen.getByText(/^HTTP endpoint/)).toBeInTheDocument();
  });

  it("truncates long labels and exposes the full text as a tooltip", () => {
    renderGraph(BASE);
    const full = "POST /a-very-long-endpoint-path/that-gets-cut";
    // Testing Library's getByTitle only sees <title> directly under <svg>; nodes nest theirs in <g>.
    expect(screen.getByText(full).tagName.toLowerCase()).toBe("title");
    expect(screen.getByText("POST /a-very-lo…").tagName.toLowerCase()).toBe("text");
    expect(screen.getByText("checkout — src/api/checkout.ts:12").tagName.toLowerCase()).toBe("title");
  });

  it("shows the cron legend entry only when a cron node exists", () => {
    const { unmount } = renderGraph(BASE);
    expect(screen.queryByText(/^Cron job/)).toBeNull();
    unmount();
    renderGraph({
      ...BASE,
      downstream: [{ ...BASE.downstream[0]!, crons_affected: ["nightly"] }],
    });
    expect(screen.getByText(/^Cron job/)).toBeInTheDocument();
    expect(screen.getAllByText("nightly")).toHaveLength(2);
  });

  it("says how many items are not shown when a cap is hit", () => {
    const downstream = Array.from({ length: GRAPH_MAX_SYMBOLS + 1 }, (_, i) => ({
      symbol: `s${i}`,
      callers: [],
      endpoints_affected: [],
      crons_affected: [],
    }));
    renderGraph({ ...BASE, downstream });
    expect(screen.getByText("1 more item not shown — see Tree")).toBeInTheDocument();
  });

  it("shows the empty text and no svg without downstream callers", () => {
    renderGraph({ ...BASE, downstream: [] });
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
