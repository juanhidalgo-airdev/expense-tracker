import { describe, expect, test } from "vitest";
import { formatMinor, minorToInput, minorUnitExponent, parseAmountToMinor } from "./money";

describe("parseAmountToMinor", () => {
  test.each([
    ["12.34", 1234],
    ["12", 1200],
    ["0.05", 5],
    ["1234.56", 123456],
  ])("parses %s", (input, expected) => {
    expect(parseAmountToMinor(input)).toBe(expected);
  });

  test("tolerates a currency symbol and surrounding spaces", () => {
    expect(parseAmountToMinor(" $1,234.56 ")).toBe(123456);
  });

  test("handles both decimal conventions", () => {
    expect(parseAmountToMinor("1,234.56")).toBe(123456); // en
    expect(parseAmountToMinor("1.234,56")).toBe(123456); // de
  });

  test("reads a lone comma by position: decimal when it looks like one, thousands otherwise", () => {
    expect(parseAmountToMinor("1,50")).toBe(150);
    expect(parseAmountToMinor("1,500")).toBe(150000);
  });

  test.each(["0", "0.00", "-5"])("rejects %s — amounts must be greater than zero", (input) => {
    expect(() => parseAmountToMinor(input)).toThrow();
  });

  test("rejects more decimal places than the currency has", () => {
    expect(() => parseAmountToMinor("1.234")).toThrow(/at most 2 decimal places/);
  });

  test("rejects unreadable input rather than guessing", () => {
    expect(() => parseAmountToMinor("abc")).toThrow();
    expect(() => parseAmountToMinor("")).toThrow();
    expect(() => parseAmountToMinor(".")).toThrow();
  });

  test("rejects an amount too large to represent exactly", () => {
    expect(() => parseAmountToMinor("999999999999999999")).toThrow(/too large/);
  });

  test("no upper bound below that: a large legitimate expense is accepted", () => {
    // The client chose no amount ceiling, so a five-figure flight must pass.
    expect(parseAmountToMinor("48250.00")).toBe(4825000);
  });
});

describe("zero-decimal currencies", () => {
  test("JPY has no minor units", () => {
    expect(minorUnitExponent("JPY")).toBe(0);
    expect(parseAmountToMinor("1200", "JPY")).toBe(1200);
  });

  test("and rejects decimals outright", () => {
    expect(() => parseAmountToMinor("12.50", "JPY")).toThrow(/cannot have decimal places/);
  });
});

describe("formatMinor", () => {
  test("formats USD in en-US", () => {
    expect(formatMinor(123456, "USD", "en-US")).toBe("$1,234.56");
  });

  test("formats JPY without decimals", () => {
    expect(formatMinor(1200, "JPY", "en-US")).toBe("¥1,200");
  });

  test("round-trips through the input helper", () => {
    expect(parseAmountToMinor(minorToInput(4825000))).toBe(4825000);
  });
});
