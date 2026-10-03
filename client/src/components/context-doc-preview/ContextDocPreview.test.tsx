import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import contextDocs from "../../../messages/en/contextDocs.json";
import { apiError, installFetch } from "../../test/context-docs-fixtures";
import { ContextDocPreview } from "./ContextDocPreview";
import { ContextDocPreviewDrawer } from "./ContextDocPreviewDrawer";

const CONTENT_PATH = "/repos/r1/context-docs/content";

const content = (text: string) => ({ path: "docs/a.md", source: "repo", content: text, version: "v1", size_bytes: text.length });

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ contextDocs }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ContextDocPreview — read-only markdown (AC-16)", () => {
  it("renders the document's markdown", async () => {
    installFetch({ [`GET ${CONTENT_PATH}`]: content("# Rules\n\nUse **strict** mode.") });
    const { container } = renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    expect(await screen.findByRole("heading", { name: "Rules" })).toBeInTheDocument();
    expect(screen.getByText("strict").tagName).toBe("STRONG");
    expect(container.textContent).not.toContain("##");
  });

  it("displays raw HTML as text and never renders or executes it", async () => {
    const raw = "<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n<div id=\"injected\">boom</div>";
    installFetch({ [`GET ${CONTENT_PATH}`]: content(`# Title\n\n${raw}`) });
    const { container } = renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    await screen.findByRole("heading", { name: "Title" });

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("#injected")).toBeNull();
    // The markup is visible as literal text instead.
    expect(container).toHaveTextContent("<script>alert(1)</script>");
    expect(container).toHaveTextContent("<img src=x onerror=alert(2)>");
  });

  it("requests the document by repo-relative path and source", async () => {
    const net = installFetch({ [`GET ${CONTENT_PATH}`]: content("hi") });
    renderWithProviders(<ContextDocPreview repoId="r1" path="docs/guides/a b.md" source="local" />);
    await screen.findByText("hi");
    const q = new URLSearchParams(net.requests[0]!.search);
    expect(q.get("path")).toBe("docs/guides/a b.md");
    expect(q.get("source")).toBe("local");
  });

  it("shows a loading state while the document is being read", () => {
    installFetch({ [`GET ${CONTENT_PATH}`]: () => new Promise(() => {}) });
    renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    expect(screen.getByLabelText("Loading document…")).toHaveAttribute("aria-busy", "true");
  });

  it("shows an error with Retry that re-requests the document", async () => {
    let fail = true;
    const net = installFetch({ [`GET ${CONTENT_PATH}`]: () => (fail ? apiError(500, "down") : content("recovered")) });
    renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    expect(await screen.findByText("Couldn’t load this document")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("recovered")).toBeInTheDocument();
    expect(net.count("GET", CONTENT_PATH)).toBe(2);
  });

  it("says so when the document is empty", async () => {
    installFetch({ [`GET ${CONTENT_PATH}`]: content("") });
    renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    expect(await screen.findByText("This document is empty.")).toBeInTheDocument();
  });
});

describe("ContextDocPreview — too large (AC-6)", () => {
  it('shows the "too large" state for a 422 whose details.reason is "too_large", without a Retry', async () => {
    installFetch({
      [`GET ${CONTENT_PATH}`]: apiError(422, "document is too large: docs/a.md", { reason: "too_large" }, "validation_error"),
    });
    renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    expect(await screen.findByText("This document is too large to preview.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn’t load this document")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("shows the generic load error for a 422 with another reason", async () => {
    installFetch({
      [`GET ${CONTENT_PATH}`]: apiError(422, "invalid path", { reason: "invalid_path" }, "validation_error"),
    });
    renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    expect(await screen.findByText("Couldn’t load this document")).toBeInTheDocument();
    expect(screen.queryByText("This document is too large to preview.")).not.toBeInTheDocument();
  });

  it("shows the generic load error for a 422 without details", async () => {
    installFetch({ [`GET ${CONTENT_PATH}`]: apiError(422, "bad", undefined, "validation_error") });
    renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    expect(await screen.findByText("Couldn’t load this document")).toBeInTheDocument();
  });

  it("treats a 413 as an ordinary load error — the state is keyed on details.reason, not the status", async () => {
    installFetch({ [`GET ${CONTENT_PATH}`]: apiError(413, "payload too large") });
    renderWithProviders(<ContextDocPreview repoId="r1" path="docs/a.md" />);
    expect(await screen.findByText("Couldn’t load this document")).toBeInTheDocument();
    expect(screen.queryByText("This document is too large to preview.")).not.toBeInTheDocument();
  });
});

describe("ContextDocPreviewDrawer", () => {
  it("shows the path as the title and the rendered document; Escape closes it", async () => {
    installFetch({ [`GET ${CONTENT_PATH}`]: content("# Spec text") });
    const onClose = vi.fn();
    renderWithProviders(<ContextDocPreviewDrawer repoId="r1" path="specs/a.md" onClose={onClose} />);
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Spec text" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
