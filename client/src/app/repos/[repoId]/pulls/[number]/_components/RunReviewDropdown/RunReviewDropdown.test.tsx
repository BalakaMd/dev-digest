import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const mockUseAgents = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => mockUseAgents(),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  mockMutateAsync.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function openDropdown() {
  fireEvent.click(screen.getByText("Run Review"));
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    mockUseAgents.mockReturnValue({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("lists an enabled agent with its model as a hint, and keeps Configure agents", () => {
    mockUseAgents.mockReturnValue({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openDropdown();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("Configure agents…")).toBeInTheDocument();
  });

  it("does not render a disabled agent", () => {
    mockUseAgents.mockReturnValue({
      data: [
        { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
        { id: "a2", name: "Style", model: "gpt-4o-mini", enabled: false },
      ],
    });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openDropdown();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.queryByText("Style")).not.toBeInTheDocument();
    expect(screen.queryByText("gpt-4o-mini")).not.toBeInTheDocument();
  });

  it("shows a muted placeholder when agents exist but none are enabled, and hides Configure agents", () => {
    mockUseAgents.mockReturnValue({
      data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: false }],
    });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openDropdown();
    expect(screen.getByText("No enabled agents — enable one")).toBeInTheDocument();
    expect(screen.queryByText("Security")).not.toBeInTheDocument();
    expect(screen.queryByText("Configure agents…")).not.toBeInTheDocument();
  });

  it("shows the create-agent placeholder when there are no agents at all", () => {
    mockUseAgents.mockReturnValue({ data: [] });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openDropdown();
    expect(screen.getByText("No agents yet — create one")).toBeInTheDocument();
    expect(screen.getByText("Configure agents…")).toBeInTheDocument();
  });

  it("does not run a review when clicking 'Run all enabled agents' with no enabled agent", () => {
    mockUseAgents.mockReturnValue({
      data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: false }],
    });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openDropdown();
    fireEvent.click(screen.getByText("Run all enabled agents"));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("runs a review when clicking 'Run all enabled agents' with an enabled agent", () => {
    mockMutateAsync.mockResolvedValue({ runs: [] });
    mockUseAgents.mockReturnValue({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openDropdown();
    fireEvent.click(screen.getByText("Run all enabled agents"));
    expect(mockMutateAsync).toHaveBeenCalledWith({ prId: "pr1", all: true });
  });
});
