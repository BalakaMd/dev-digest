import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BriefText, BriefCode } from "./index";

afterEach(cleanup);

describe("BriefText / BriefCode (Hebrew brief)", () => {
  it("sets dir=rtl on Hebrew prose and dir=ltr + isolation on a path, keeping the DOM order", () => {
    const { container } = render(
      <p>
        <BriefText language="Hebrew">הסבר על הסיכון</BriefText> <BriefCode>src/app.ts:12</BriefCode>{" "}
        <BriefText language="Hebrew">המשך</BriefText>
      </p>,
    );
    const prose = screen.getByText("הסבר על הסיכון");
    expect(prose).toHaveAttribute("dir", "rtl");
    // block-level box, so dir drives paragraph alignment (not an inline-only dir=rtl)
    expect(prose.style.display).toBe("block");
    expect(prose.style.textAlign).toBe("start");
    const code = screen.getByText("src/app.ts:12");
    expect(code).toHaveAttribute("dir", "ltr");
    expect(code.style.unicodeBidi).toBe("isolate");
    // same DOM order as in English: text, path, text (no reversed markup)
    expect(Array.from(container.querySelectorAll("[dir]")).map((e) => e.textContent)).toEqual([
      "הסבר על הסיכון",
      "src/app.ts:12",
      "המשך",
    ]);
  });
});
