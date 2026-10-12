import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AgentMark } from "./AgentMark";

afterEach(cleanup);

describe("AgentMark", () => {
  it("is decorative: aria-hidden and carries the agent colour in data-agent-color", () => {
    const { container } = render(<AgentMark agent={{ id: "a1", name: "Security" }} />);
    const mark = container.firstElementChild as HTMLElement;
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("data-agent-color", "#ef4444");
    expect(mark.querySelector("svg")).not.toBeNull();
  });

  it("contributes no text and is invisible to the accessibility tree", () => {
    const { container } = render(<AgentMark agent={{ id: "a1", name: "Security" }} size={40} />);
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("different keywords give different marks", () => {
    const { container } = render(
      <>
        <AgentMark agent={{ id: "a1", name: "Security" }} />
        <AgentMark agent={{ id: "a2", name: "Performance" }} />
      </>,
    );
    const colors = Array.from(container.querySelectorAll("[data-agent-color]")).map((e) => e.getAttribute("data-agent-color"));
    expect(colors).toEqual(["#ef4444", "#f59e0b"]);
  });
});
