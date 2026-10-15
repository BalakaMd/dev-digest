import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FocusTip } from "./FocusTip";

afterEach(cleanup);

const tip = (container: HTMLElement) => container.querySelector("[data-focus-tip]");
/** A real focus move (jsdom evaluates `:focus-visible` for it); `fireEvent.focus` would not move focus. */
const focus = (el: HTMLElement) => act(() => el.focus());

describe("FocusTip — description on keyboard focus (AC-68, NFR-3)", () => {
  it("shows its lines while focus is inside, hides them on blur and on Escape, and the bubble is aria-hidden", () => {
    const { container } = render(
      <FocusTip lines={["Full agent name", "High (≥70%)"]}>
        <button type="button">open</button>
      </FocusTip>,
    );
    const button = screen.getByRole("button", { name: "open" });
    expect(tip(container)).toBeNull();

    focus(button);
    const bubble = tip(container) as HTMLElement;
    expect(bubble).not.toBeNull();
    expect(bubble).toHaveAttribute("aria-hidden", "true");
    expect(bubble).toHaveTextContent("Full agent name");
    expect(bubble).toHaveTextContent("High (≥70%)");

    act(() => button.blur());
    expect(tip(container)).toBeNull();

    focus(button);
    expect(tip(container)).not.toBeNull();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(tip(container)).toBeNull();
  });

  it("opens only for keyboard-visible focus (:focus-visible), so a mouse click keeps relying on hover", () => {
    const { container } = render(
      <FocusTip lines={["x"]}>
        <button type="button">open</button>
      </FocusTip>,
    );
    const button = screen.getByRole("button", { name: "open" });
    // A pointer-initiated focus: the browser would not match :focus-visible.
    button.matches = (sel: string) => sel !== ":focus-visible";
    focus(button);
    expect(tip(container)).toBeNull();
  });

  it("falls back to showing the tip where :focus-visible is not supported", () => {
    const { container } = render(
      <FocusTip lines={["x"]}>
        <button type="button">open</button>
      </FocusTip>,
    );
    const button = screen.getByRole("button", { name: "open" });
    button.matches = () => {
      throw new SyntaxError("unsupported selector");
    };
    focus(button);
    expect(tip(container)).not.toBeNull();
  });

  it("with `focusable` the wrapper itself is a tab stop; without it, it is not", () => {
    const { container, rerender } = render(<FocusTip lines={["x"]}>value</FocusTip>);
    expect(container.firstElementChild).not.toHaveAttribute("tabindex");
    rerender(
      <FocusTip focusable lines={["x"]}>
        value
      </FocusTip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveAttribute("tabindex", "0");
    focus(wrapper);
    expect(document.activeElement).toBe(wrapper);
    expect(tip(container)).not.toBeNull();
  });
});
