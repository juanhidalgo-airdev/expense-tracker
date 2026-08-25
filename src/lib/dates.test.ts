import { describe, expect, test } from "vitest";
import {
  formatCalendarDate,
  isCalendarDate,
  isFutureCalendarDate,
  todayCalendarDate,
} from "./dates";

describe("isCalendarDate", () => {
  test("accepts a well-formed date", () => {
    expect(isCalendarDate("2026-08-24")).toBe(true);
  });

  test.each(["2026-8-24", "24-08-2026", "2026/08/24", "", "today"])(
    "rejects %s",
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );

  test("rejects a date that does not exist", () => {
    // Round-tripping through Date silently normalises this to 2026-03-03.
    expect(isCalendarDate("2026-02-31")).toBe(false);
  });

  test("accepts a real leap day and rejects a fake one", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
  });
});

describe("isFutureCalendarDate", () => {
  const now = new Date(2026, 7, 24, 12, 0, 0); // 24 Aug 2026, local

  test("today is not in the future", () => {
    expect(isFutureCalendarDate("2026-08-24", now)).toBe(false);
  });

  test("yesterday is not in the future", () => {
    expect(isFutureCalendarDate("2026-08-23", now)).toBe(false);
  });

  test("tomorrow is", () => {
    expect(isFutureCalendarDate("2026-08-25", now)).toBe(true);
  });

  test("compares by calendar date, not by instant", () => {
    // Late at night, an instant-based comparison can roll into tomorrow and
    // start rejecting today's expenses.
    const lateTonight = new Date(2026, 7, 24, 23, 59, 0);
    expect(isFutureCalendarDate("2026-08-24", lateTonight)).toBe(false);
  });
});

describe("todayCalendarDate", () => {
  test("zero-pads month and day", () => {
    expect(todayCalendarDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("formatCalendarDate", () => {
  test("renders the stored day, never one either side of it", () => {
    // The whole reason expenseDate is a string: formatting must not shift it.
    expect(formatCalendarDate("2026-08-24", "en-US")).toBe("Aug 24, 2026");
    expect(formatCalendarDate("2026-01-01", "en-US")).toBe("Jan 1, 2026");
    expect(formatCalendarDate("2026-12-31", "en-US")).toBe("Dec 31, 2026");
  });

  test("returns malformed input untouched rather than inventing a date", () => {
    expect(formatCalendarDate("not-a-date")).toBe("not-a-date");
  });
});
