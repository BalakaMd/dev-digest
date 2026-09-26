import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import { SkillBodyEditor } from "./SkillBodyEditor";

afterEach(cleanup);

function renderEditor(value: string, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <SkillBodyEditor fileName="payments-api-conventions" value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("SkillBodyEditor", () => {
  it("shows the file name, the unsaved badge and a token estimate", () => {
    renderEditor("# title\n\nbody text");
    expect(screen.getByText("payments-api-conventions.md")).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("~5 tokens")).toBeInTheDocument();
  });

  it("numbers every line in the gutter", () => {
    renderEditor("a\nb\nc");
    expect(screen.getByTestId("skill-body-gutter").textContent).toBe("123");
  });

  it("is editable", () => {
    const onChange = renderEditor("a");
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "a\nb" } });
    expect(onChange).toHaveBeenCalledWith("a\nb");
  });
});
