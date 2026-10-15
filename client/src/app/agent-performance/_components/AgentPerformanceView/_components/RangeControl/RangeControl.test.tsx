import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import agentPerformance from "../../../../../../../messages/en/agentPerformance.json";
import type { RangeSelection } from "../../../../_model/range";
import { RangeControl } from "./RangeControl";

afterEach(cleanup);

function renderControl(value: RangeSelection = { kind: "30d" }) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance }}>
      <RangeControl value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

const choice = (name: string) => screen.getByRole("button", { name });
const setDates = (start: string, end: string) => {
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("End date"), { target: { value: end } });
};

describe("RangeControl — choices (AC-3, AC-4)", () => {
  it('offers "1 day", "30 days" and "Custom range", with "30 days" selected by default', () => {
    renderControl();
    expect(choice("30 days")).toHaveAttribute("aria-pressed", "true");
    expect(choice("1 day")).toHaveAttribute("aria-pressed", "false");
    expect(choice("Custom range")).toHaveAttribute("aria-pressed", "false");
  });

  it("applies a preset at once", () => {
    const { onChange } = renderControl();
    fireEvent.click(choice("1 day"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: "1d" });
  });

  it("opens the date fields for a custom range without sending anything until it is applied", () => {
    const { onChange } = renderControl();
    fireEvent.click(choice("Custom range"));
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
    expect(choice("Custom range")).toHaveAttribute("aria-pressed", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies a valid custom range", () => {
    const { onChange } = renderControl();
    fireEvent.click(choice("Custom range"));
    setDates("2026-09-01", "2026-09-30");
    fireEvent.click(choice("Apply"));
    expect(onChange).toHaveBeenCalledWith({ kind: "custom", start: "2026-09-01", end: "2026-09-30" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the date fields of a custom range taken from the address", () => {
    renderControl({ kind: "custom", start: "2026-09-01", end: "2026-09-30" });
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-09-30");
  });
});

describe("RangeControl — invalid custom ranges (AC-6)", () => {
  it.each([
    ["2026-09-30", "2026-09-01", "The end date is before the start date."],
    ["2999-12-30", "2999-12-31", "The end date is in the future."],
    ["2020-01-01", "2021-06-01", "The range covers more than 366 days."],
  ])("rejects %s to %s with an inline error and sends nothing", (start, end, message) => {
    const { onChange } = renderControl();
    fireEvent.click(choice("Custom range"));
    setDates(start, end);
    fireEvent.click(choice("Apply"));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("End date")).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the error once a preset is chosen", () => {
    const { onChange } = renderControl();
    fireEvent.click(choice("Custom range"));
    setDates("2026-09-30", "2026-09-01");
    fireEvent.click(choice("Apply"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(choice("1 day"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({ kind: "1d" });
  });
});
