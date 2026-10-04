import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
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

describe("FileCard openCommand", () => {
  function renderWith(openCommand: { open: boolean } | null) {
    return (
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <FileCard file={FILE} openCommand={openCommand} />
      </NextIntlClientProvider>
    );
  }

  it("keeps the auto-expand default while there is no command", () => {
    render(renderWith(null));
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();
  });

  it("closes on { open: false } and reopens on a later { open: true }", () => {
    const { rerender } = render(renderWith(null));
    rerender(renderWith({ open: false }));
    expect(screen.queryByText("const b = 2;")).not.toBeInTheDocument();
    expect(screen.getByText("src/foo.ts")).toBeInTheDocument();

    rerender(renderWith({ open: true }));
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();
  });

  it("still lets the user toggle by hand, and a new command re-applies", () => {
    const collapse = { open: false };
    const { rerender } = render(renderWith(collapse));
    expect(screen.queryByText("const b = 2;")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("src/foo.ts"));
    rerender(renderWith(collapse)); // same command object — not re-applied
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();

    rerender(renderWith({ open: false })); // a new request closes it again
    expect(screen.queryByText("const b = 2;")).not.toBeInTheDocument();
  });
});

describe("FileCard deep-link target", () => {
  // A big file starts collapsed (> AUTO_EXPAND_MAX_LINES); `const b` is new-side line 2.
  const BIG: PrFile = { ...FILE, additions: 5000 };
  const scrollIntoView = vi.fn();

  function renderBig(target?: React.ComponentProps<typeof FileCard>["target"]) {
    return (
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <FileCard file={BIG} target={target} />
      </NextIntlClientProvider>
    );
  }

  beforeEach(() => {
    // jsdom has no scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("expands a collapsed file, scrolls to and marks the target line (for at least 2 s), and focuses the header", () => {
    const { rerender } = render(renderBig(null));
    expect(screen.queryByText("const b = 2;")).not.toBeInTheDocument();

    rerender(renderBig({ file: "src/foo.ts", line: 2, note: "outside", scrollMarginTop: "10px" }));

    const row = screen.getByText("const b = 2;").closest("[data-target-line]") as HTMLElement;
    expect(row).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(row);
    expect(screen.getByText("src/foo.ts").closest("[tabindex='-1']")).toBe(document.activeElement);
    // the other line is not marked, and no "outside" note is shown for a visible line
    expect(screen.getByText("const a = 1;").closest("[data-target-line]")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("const b = 2;").closest("[data-target-line]")).toBe(row);
  });
});
