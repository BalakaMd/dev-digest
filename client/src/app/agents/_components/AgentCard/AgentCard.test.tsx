import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import common from "../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../lib/toast";

const deleteAgent = vi.fn();
vi.mock("../../../../lib/hooks/agents", () => ({
  useDeleteAgent: () => ({ mutateAsync: deleteAgent, isPending: false }),
}));

import { AgentCard } from "./AgentCard";

afterEach(cleanup);
beforeEach(() => deleteAgent.mockReset().mockResolvedValue({ ok: true }));

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("AgentCard", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting, and cancelling deletes nothing", () => {
    const onClick = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onClick={onClick} />);
    fireEvent.click(screen.getByLabelText("Delete Security Reviewer"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete agent?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteAgent).not.toHaveBeenCalled();
    // Neither opening nor cancelling the dialog navigates into the agent.
    expect(onClick).not.toHaveBeenCalled();
  });

  it("closes on the modal's ✕ without deleting", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByLabelText("Delete Security Reviewer"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteAgent).not.toHaveBeenCalled();
  });

  it("deletes the agent once confirmed", async () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByLabelText("Delete Security Reviewer"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteAgent).toHaveBeenCalledWith("ag1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
