import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import projectContext from "../../../../../../../../../messages/en/projectContext.json";
import { apiError, installFetch } from "../../../../../../../../test/context-docs-fixtures";
import { NewFolderDialog } from "./NewFolderDialog";

const BASE = "/repos/r1/context-docs";

let onCreated: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ projectContext }}>
        <NewFolderDialog repoId="r1" onCreated={onCreated} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const type = (value: string) => fireEvent.change(screen.getByLabelText("Folder path"), { target: { value } });
const create = () => fireEvent.click(screen.getByRole("button", { name: "Create folder" }));

beforeEach(() => {
  onCreated = vi.fn();
  onClose = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NewFolderDialog (AC-69)", () => {
  it("creates the folder with the typed path (slashes trimmed) and reports it", async () => {
    const net = installFetch({ [`POST ${BASE}/local/folders`]: { ok: true } });
    renderDialog();
    type("/docs/new/");
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("docs/new"));
    expect(net.requests.find((r) => r.method === "POST")!.body).toEqual({ path: "docs/new" });
  });

  it("shows the server's reason for a path outside the search roots (`foo`) and does not report success", async () => {
    installFetch({
      [`POST ${BASE}/local/folders`]: apiError(422, "folder must be under specs, docs or insights: foo", undefined, "validation_error"),
    });
    renderDialog();
    type("foo");
    create();
    expect(await screen.findByRole("alert")).toHaveTextContent("folder must be under specs, docs or insights: foo");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("clears the error as soon as the path is edited", async () => {
    installFetch({ [`POST ${BASE}/local/folders`]: apiError(422, "nope") });
    renderDialog();
    type("foo");
    create();
    await screen.findByRole("alert");
    type("docs/foo");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for a path and sends nothing when the field is empty", () => {
    const net = installFetch({});
    renderDialog();
    create();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a folder path.");
    expect(net.requests).toHaveLength(0);
  });
});
