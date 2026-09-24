import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: SkillSummary = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "When the diff adds a credential, flag it.",
  type: "security",
  source: "imported",
  body: "# Rule",
  enabled: true,
  version: 3,
  agent_count: 2,
};

function renderCard(props: Partial<React.ComponentProps<typeof SkillCard>> = {}) {
  const handlers = { onOpen: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <SkillCard skill={SKILL} {...handlers} {...props} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe("SkillCard", () => {
  it("shows name, type, description, version, agent count and the imported badge", () => {
    renderCard();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("When the diff adds a credential, flag it.")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText(/2 agents/)).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("opens on click, while the toggle and delete do not open it", () => {
    const h = renderCard();
    fireEvent.click(screen.getByRole("switch"));
    expect(h.onToggle).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByLabelText("Delete secret-leakage-gate"));
    expect(h.onDelete).toHaveBeenCalled();
    expect(h.onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("secret-leakage-gate"));
    expect(h.onOpen).toHaveBeenCalled();
  });
});
