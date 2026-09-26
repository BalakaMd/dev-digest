import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { SmartDiffGroup } from "./SmartDiffGroup";

afterEach(cleanup);

function renderGroup(props: Partial<React.ComponentProps<typeof SmartDiffGroup>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SmartDiffGroup
        role="core"
        filesCount={3}
        filesWithFindings={null}
        defaultCollapsed={false}
        {...props}
      >
        {() => <div>a file card</div>}
      </SmartDiffGroup>
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffGroup", () => {
  it("shows the role label and the file count", () => {
    renderGroup({ filesCount: 3 });
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("3 files")).toBeInTheDocument();
  });

  it("shows a dot + count only once filesWithFindings is provided", () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SmartDiffGroup role="core" filesCount={3} filesWithFindings={null} defaultCollapsed={false}>
          {() => <div>a file card</div>}
        </SmartDiffGroup>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTitle("2")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SmartDiffGroup role="core" filesCount={3} filesWithFindings={2} defaultCollapsed={false}>
          {() => <div>a file card</div>}
        </SmartDiffGroup>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTitle("2")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows no dot/count when filesWithFindings is 0 — only a positive count earns one", () => {
    renderGroup({ filesWithFindings: 0 });
    expect(screen.queryByTitle("0")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    // "N files" still renders regardless
    expect(screen.getByText("3 files")).toBeInTheDocument();
  });

  it("renders children (open) when defaultCollapsed is false", () => {
    renderGroup({ defaultCollapsed: false });
    expect(screen.getByText("a file card")).toBeInTheDocument();
  });

  it("starts collapsed and hides children when defaultCollapsed is true", () => {
    renderGroup({ defaultCollapsed: true });
    expect(screen.queryByText("a file card")).not.toBeInTheDocument();
  });

  it("toggles open/closed when the header is clicked", () => {
    renderGroup({ defaultCollapsed: true });
    expect(screen.queryByText("a file card")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Core"));
    expect(screen.getByText("a file card")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Core"));
    expect(screen.queryByText("a file card")).not.toBeInTheDocument();
  });

  describe("Collapse all / Expand all", () => {
    function renderWithCommand(defaultCollapsed = false) {
      const seen: Array<{ open: boolean } | null> = [];
      render(
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <SmartDiffGroup role="core" filesCount={3} filesWithFindings={null} defaultCollapsed={defaultCollapsed}>
            {(cmd) => {
              seen.push(cmd);
              return <div>a file card</div>;
            }}
          </SmartDiffGroup>
        </NextIntlClientProvider>,
      );
      return seen;
    }

    it("hands the files no command until the user asks", () => {
      const seen = renderWithCommand();
      expect(seen.at(-1)).toBeNull();
      expect(screen.getByRole("button", { name: /Collapse all/ })).toBeInTheDocument();
    });

    it("Collapse all sends { open: false } and keeps the group itself open", () => {
      const seen = renderWithCommand();
      fireEvent.click(screen.getByRole("button", { name: /Collapse all/ }));
      expect(seen.at(-1)).toEqual({ open: false });
      // the button click must not bubble into the header's own group toggle
      expect(screen.getByText("a file card")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Expand all/ })).toBeInTheDocument();
    });

    it("Expand all then sends { open: true } and flips back to Collapse all", () => {
      const seen = renderWithCommand();
      fireEvent.click(screen.getByRole("button", { name: /Collapse all/ }));
      fireEvent.click(screen.getByRole("button", { name: /Expand all/ }));
      expect(seen.at(-1)).toEqual({ open: true });
      expect(screen.getByRole("button", { name: /Collapse all/ })).toBeInTheDocument();
    });

    it("opens a collapsed group so the file list is visible", () => {
      renderWithCommand(true);
      expect(screen.queryByText("a file card")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Collapse all/ }));
      expect(screen.getByText("a file card")).toBeInTheDocument();
    });
  });
});
