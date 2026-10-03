import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import projectContext from "../../../../../../../../../messages/en/projectContext.json";
import { apiError, installFetch } from "../../../../../../../../test/context-docs-fixtures";
import { UploadDialog } from "./UploadDialog";

const BASE = "/repos/r1/context-docs";
const b64 = (s: string) => btoa(s);

let onDone: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

function renderDialog(defaultFolder = "docs") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ projectContext }}>
        <UploadDialog repoId="r1" defaultFolder={defaultFolder} onDone={onDone} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const pick = (...files: File[]) =>
  fireEvent.change(screen.getByLabelText("Markdown files"), { target: { files } });
const md = (name: string, text: string) => new File([text], name, { type: "text/markdown" });

beforeEach(() => {
  onDone = vi.fn();
  onClose = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UploadDialog — per-file rejections (AC-70)", () => {
  it("posts every chosen file base64-encoded into the folder, then lists the stored count and each rejected file by name with its reason", async () => {
    const net = installFetch({
      [`POST ${BASE}/local/upload`]: {
        stored: ["docs/a.md", "docs/b.md"],
        rejected: [{ name: "c.txt", reason: "only .md files are accepted" }],
      },
    });
    renderDialog();
    pick(md("a.md", "# A"), md("b.md", "# B"), md("c.txt", "plain"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(await screen.findByText("2 files stored.")).toBeInTheDocument();
    expect(screen.getByText("Not stored")).toBeInTheDocument();
    expect(screen.getByText("c.txt — only .md files are accepted")).toBeInTheDocument();

    const req = net.requests.find((r) => r.method === "POST")!;
    expect(req.body).toEqual({
      folder: "docs",
      files: [
        { name: "a.md", content_b64: b64("# A") },
        { name: "b.md", content_b64: b64("# B") },
        { name: "c.txt", content_b64: b64("plain") },
      ],
    });
    expect(onDone).toHaveBeenCalledWith({
      stored: ["docs/a.md", "docs/b.md"],
      rejected: [{ name: "c.txt", reason: "only .md files are accepted" }],
    });
  });

  it("shows no rejection list when every file was stored", async () => {
    installFetch({ [`POST ${BASE}/local/upload`]: { stored: ["docs/a.md"], rejected: [] } });
    renderDialog();
    pick(md("a.md", "# A"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("1 file stored.")).toBeInTheDocument();
    expect(screen.queryByText("Not stored")).not.toBeInTheDocument();
  });

  it("sends the folder the user typed, without surrounding slashes", async () => {
    const net = installFetch({ [`POST ${BASE}/local/upload`]: { stored: ["specs/x/a.md"], rejected: [] } });
    renderDialog("");
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "/specs/x/" } });
    pick(md("a.md", "# A"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await screen.findByText("1 file stored.");
    expect((net.requests.find((r) => r.method === "POST")!.body as { folder: string }).folder).toBe("specs/x");
  });

  it("asks for at least one file and sends nothing when none is chosen", () => {
    const net = installFetch({});
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select at least one file.");
    expect(net.requests).toHaveLength(0);
  });

  it("shows the server's message when the whole request fails", async () => {
    installFetch({ [`POST ${BASE}/local/upload`]: apiError(500, "disk full") });
    renderDialog();
    pick(md("a.md", "# A"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(onDone).not.toHaveBeenCalled();
  });
});
