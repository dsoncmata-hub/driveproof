import { expect, it } from "vitest";
import { toCsv } from "./exporters";
it("exports separator, quotes and newlines as literal cells", () => {
  expect(toCsv([["a;b", 'c"d', "line1\nline2"]])).toBe('"a;b";"c""d";"line1\nline2"');
});
it("keeps numbers and measurements usable", () => {
  expect(toCsv([[-3, "-2.45", "1.23", null]])).toBe('"-3";"-2.45";"1.23";""');
});
it("neutralizes formula-like user content including Unicode variants", () => {
  for (const value of [
    '=HYPERLINK("https://example.invalid")',
    "+CMD",
    "-1+2",
    "@SUM(A1)",
    "  =1+1",
    "＝1+1",
  ])
    expect(toCsv([[value]])).toBe('"texto: ' + value.replace(/"/g, '""') + '"');
});
it("neutralizes leading spreadsheet control characters", () => {
  for (const value of ["\t=1+1", "\r+CMD", "\n@SUM(A1)"])
    expect(toCsv([[value]])).toBe('"texto: ' + value + '"');
});
