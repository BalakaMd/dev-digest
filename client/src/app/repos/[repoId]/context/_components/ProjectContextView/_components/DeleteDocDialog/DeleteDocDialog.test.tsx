import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import projectContext from "../../../../../../../../../messages/en/projectContext.json";
import common from "../../../../../../../../../messages/en/common.json";
import { apiError, installFetch, usageOf } from "../../../../../../../../test/context-docs-fixtures";
import { DeleteDocDialog, type DeleteTarget } from "./DeleteDocDialog";

const BASE = "/repos/r1/context-docs";

let onDeleted: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

function renderDialog(target: DeleteTarget) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ projectContext, common }}>
        <DeleteDocDialog repoId="r1" target={target} onDeleted={onDeleted} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const DOC: DeleteTarget = { kind: "doc", path: "docs/notes.md" };

beforeEach(() => {
  onDeleted = vi.fn();
  onClose = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeleteDocDialog — a local document (AC-86)", () => {
  it('lists the agents and skills that attach it and says their attachments stay as "Missing"', async () => {
    installFetch({
      [`GET ${BASE}/usage`]: usageOf({
        attached_by_agents: [
          { id: "a1", name: "Security reviewer" },
          { id: "a2", name: "Perf reviewer" },
        ],
        attached_by_skills: [{ id: "s1", name: "API rubric" }],
      }),
    });
    renderDialog(DOC);
    expect(await screen.findByText("Security reviewer")).toBeInTheDocument();
    expect(screen.getByText("Perf reviewer")).toBeInTheDocument();
    expect(screen.getByText("API rubric")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText(/stay and will show as “Missing”/)).toBeInTheDocument();
    expect(screen.getByText(/docs\/notes\.md will be removed/)).toBeInTheDocument();
  });

  it("says so when nothing attaches it", async () => {
    installFetch({ [`GET ${BASE}/usage`]: usageOf() });
    renderDialog(DOC);
    expect(await screen.findByText("No agents or skills attach it.")).toBeInTheDocument();
  });

  it("renders attaching names as text, never as markup", async () => {
    installFetch({
      [`GET ${BASE}/usage`]: usageOf({ attached_by_agents: [{ id: "a1", name: "<img src=x onerror=alert(1)>" }] }),
    });
    renderDialog(DOC);
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.body.querySelector("img")).toBeNull();
  });

  it("deletes only after Delete is pressed, by path, then reports it", async () => {
    const net = installFetch({
      [`GET ${BASE}/usage`]: usageOf(),
      [`DELETE ${BASE}/local`]: { ok: true },
    });
    renderDialog(DOC);
    await screen.findByText("No agents or skills attach it.");
    expect(net.count("DELETE", `${BASE}/local`)).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    const del = net.requests.find((r) => r.method === "DELETE")!;
    expect(new URLSearchParams(del.search).get("path")).toBe("docs/notes.md");
  });

  it("Cancel deletes nothing", async () => {
    const net = installFetch({ [`GET ${BASE}/usage`]: usageOf() });
    renderDialog(DOC);
    await screen.findByText("No agents or skills attach it.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(net.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("shows the failure and keeps the dialog open when the delete fails", async () => {
    installFetch({
      [`GET ${BASE}/usage`]: usageOf(),
      [`DELETE ${BASE}/local`]: apiError(500, "cannot delete"),
    });
    renderDialog(DOC);
    await screen.findByText("No agents or skills attach it.");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot delete");
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("DeleteDocDialog — an empty folder", () => {
  it("does not ask which agents use it and deletes the folder by path", async () => {
    const net = installFetch({ [`DELETE ${BASE}/local/folders`]: { ok: true } });
    renderDialog({ kind: "folder", path: "docs/new" });
    expect(screen.getByText("Delete empty folder?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(net.requests.some((r) => r.path === `${BASE}/usage`)).toBe(false);
    expect(new URLSearchParams(net.requests.find((r) => r.method === "DELETE")!.search).get("path")).toBe("docs/new");
  });
});
