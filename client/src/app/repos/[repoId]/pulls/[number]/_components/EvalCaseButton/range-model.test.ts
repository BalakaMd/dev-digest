import { describe, it, expect } from "vitest";
import {
  normaliseRange,
  sameRange,
  parseLineField,
  rangeIntersectsHunks,
  fieldsToRange,
  validateFields,
  selectedOption,
  previewLines,
} from "./range-model";

const r = (start_line: number, end_line: number) => ({ start_line, end_line });
const HUNKS = [r(5, 10), r(20, 25)];

describe("range-model", () => {
  it("normalises a reversed range and compares ranges after normalising (AC-46)", () => {
    expect(normaliseRange(r(19, 16))).toEqual(r(16, 19));
    expect(normaliseRange(r(3, 3))).toEqual(r(3, 3));
    expect(sameRange(r(19, 16), r(16, 19))).toBe(true);
    expect(sameRange(r(1, 2), r(1, 3))).toBe(false);
  });

  it.each([
    ["17", 17],
    [" 17 ", 17],
    ["", null],
    ["abc", null],
    ["1.5", null],
    ["-3", null],
    ["1e3", null],
  ])("parseLineField(%j) = %j", (text, expected) => {
    expect(parseLineField(text)).toBe(expected);
  });

  it("intersects hunks on a shared line and not in a gap", () => {
    expect(rangeIntersectsHunks(r(10, 12), HUNKS)).toBe(true);
    expect(rangeIntersectsHunks(r(11, 19), HUNKS)).toBe(false);
    expect(rangeIntersectsHunks(r(26, 30), HUNKS)).toBe(false);
    expect(rangeIntersectsHunks(r(25, 3), HUNKS)).toBe(true);
  });

  it("validates the fields: empty, not a number, off-hunk, and a reversed range is valid (AC-23, AC-46)", () => {
    expect(validateFields("", "7", HUNKS)).toBe("empty");
    expect(validateFields("6", "  ", HUNKS)).toBe("empty");
    expect(validateFields("abc", "7", HUNKS)).toBe("notNumber");
    expect(validateFields("6", "7.5", HUNKS)).toBe("notNumber");
    expect(validateFields("900", "901", HUNKS)).toBe("noHunk");
    expect(validateFields("6", "7", HUNKS)).toBeNull();
    expect(validateFields("9", "6", HUNKS)).toBeNull();
    expect(fieldsToRange("9", "6")).toEqual(r(6, 9));
    expect(fieldsToRange("x", "6")).toBeNull();
  });

  it("reports the selected option, and none once the fields equal neither (AC-20, AC-40)", () => {
    const suggested = r(16, 19);
    const cited = r(6, 8);
    expect(selectedOption("16", "19", suggested, cited)).toBe("suggested");
    expect(selectedOption("6", "8", suggested, cited)).toBe("cited");
    expect(selectedOption("19", "16", suggested, cited)).toBe("suggested");
    expect(selectedOption("17", "19", suggested, cited)).toBeNull();
    expect(selectedOption("", "19", suggested, cited)).toBeNull();
    expect(selectedOption("6", "8", r(6, 8), r(6, 8))).toBe("suggested");
  });

  it("previews only the patch lines inside the range, with gap lines absent (AC-21, AC-22)", () => {
    const lines = [5, 6, 7, 20, 21].map((line) => ({ line, text: `l${line}` }));
    expect(previewLines(lines, r(6, 20)).map((l) => l.line)).toEqual([6, 7, 20]);
    expect(previewLines(lines, r(21, 6)).map((l) => l.line)).toEqual([6, 7, 20, 21]);
    expect(previewLines(lines, r(8, 19))).toEqual([]);
  });
});
