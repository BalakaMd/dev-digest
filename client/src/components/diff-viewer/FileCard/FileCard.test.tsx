import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { FileAnnotations } from "../annotations";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/foo.ts",
  additions: 1,
  deletions: 0,
  // hunk, one context line (RIGHT:1/LEFT:1), one added line (RIGHT:2 only).
  patch: "@@ -1,1 +1,2 @@\n const a = 1;\n+const b = 2;",
};

function renderCard(annotations?: FileAnnotations) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <FileCard file={FILE} annotations={annotations} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard annotation slots", () => {
  it("renders the marker next to the file path", () => {
    renderCard({
      byKey: new Map(),
      marker: <span data-testid="ann-marker">M</span>,
    });
    expect(screen.getByTestId("ann-marker")).toBeInTheDocument();
  });

  it("renders an annotation under the matching RIGHT:<line> row, ahead of the trailing block", () => {
    const { container } = renderCard({
      byKey: new Map([
        ["RIGHT:2", <div key="a">ANCHORED-LINE2</div>],
        ["RIGHT:999", <div key="b">UNANCHORED-NOTE</div>],
      ]),
      unanchoredTitle: "Findings outside the diff",
    });

    // The anchored node is present at all.
    expect(screen.getByText("ANCHORED-LINE2")).toBeInTheDocument();
    // The unanchored node lands in the trailing block, titled accordingly.
    expect(screen.getByText("Findings outside the diff")).toBeInTheDocument();
    expect(screen.getByText("UNANCHORED-NOTE")).toBeInTheDocument();

    // Document order: the added line's own text, then its anchored annotation,
    // then the trailing block's title, then the unanchored node — i.e. the
    // matched annotation renders right under its line, not at the end.
    const text = container.textContent ?? "";
    const iLine = text.indexOf("const b = 2;");
    const iAnchored = text.indexOf("ANCHORED-LINE2");
    const iTitle = text.indexOf("Findings outside the diff");
    const iUnanchored = text.indexOf("UNANCHORED-NOTE");
    expect(iLine).toBeGreaterThan(-1);
    expect(iAnchored).toBeGreaterThan(iLine);
    expect(iTitle).toBeGreaterThan(iAnchored);
    expect(iUnanchored).toBeGreaterThan(iTitle);
  });

  it("puts a finding whose key matches nothing rendered into the trailing block, never dropping it", () => {
    renderCard({
      byKey: new Map([["RIGHT:12345", <div key="a">FAR-AWAY-FINDING</div>]]),
      unanchoredTitle: "Findings outside the diff",
    });
    expect(screen.getByText("FAR-AWAY-FINDING")).toBeInTheDocument();
  });

  it("changes nothing when no annotations prop is given (backward compatible)", () => {
    renderCard(undefined);
    expect(screen.getByText("src/foo.ts")).toBeInTheDocument();
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();
    expect(screen.queryByTestId("ann-marker")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings outside the diff")).not.toBeInTheDocument();
  });

  it("colours the matching line and renders the label when lineDecor has an entry for it", () => {
    renderCard({
      byKey: new Map(),
      lineDecor: new Map([["RIGHT:2", { color: "var(--crit)", label: "BLOCKER" }]]),
    });

    // The matching row (RIGHT:2, "const b = 2;") gets the left bar + label.
    const decorated = screen.getByText("const b = 2;").parentElement as HTMLElement;
    expect(decorated.style.borderLeftColor).toBe("var(--crit)");
    expect(decorated.style.borderLeftWidth).toBe("3px");
    expect(screen.getByText("BLOCKER")).toBeInTheDocument();

    // The earlier, non-matching context row (RIGHT:1/LEFT:1) gets neither.
    const undecorated = screen.getByText("const a = 1;").parentElement as HTMLElement;
    expect(undecorated.style.borderLeftColor).toBe("");
  });

  it("is a no-op (no bar, no label) when lineDecor is omitted", () => {
    renderCard({ byKey: new Map() }); // annotations present, but no lineDecor at all
    const row = screen.getByText("const b = 2;").parentElement as HTMLElement;
    expect(row.style.borderLeftColor).toBe("");
    expect(screen.queryByText("BLOCKER")).not.toBeInTheDocument();
  });
});
