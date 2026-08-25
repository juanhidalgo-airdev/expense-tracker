import { describe, expect, test } from "vitest";
import { assertTransition, canTransition, Status } from "./transitions";

const STATUSES: Status[] = ["draft", "submitted", "approved", "rejected"];

/** Every transition the lifecycle permits. Anything absent must be refused. */
const ALLOWED: Array<[Status, Status]> = [
  ["draft", "submitted"],
  ["submitted", "approved"],
  ["submitted", "rejected"],
  ["submitted", "draft"], // withdraw
  ["rejected", "submitted"], // correct and resubmit
];

describe("the transition map", () => {
  test.each(ALLOWED)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  test("refuses every transition not on the allow-list", () => {
    const refused: string[] = [];

    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const isAllowed = ALLOWED.some(([f, t]) => f === from && t === to);
        if (!isAllowed && canTransition(from, to)) {
          refused.push(`${from} -> ${to}`);
        }
      }
    }

    expect(refused).toEqual([]);
  });

  test("approved is terminal — decisions are final", () => {
    for (const to of STATUSES) {
      expect(canTransition("approved", to)).toBe(false);
    }
  });

  test("a rejected expense can only go back for review, never straight to approved", () => {
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("rejected", "submitted")).toBe(true);
  });
});

describe("assertTransition", () => {
  test("passes silently on an allowed transition", () => {
    expect(() => assertTransition("submitted", "approved")).not.toThrow();
  });

  test("reports an already-decided expense in terms a user can act on", () => {
    // This is the message a second manager sees when they lose the race.
    expect(() => assertTransition("approved", "rejected")).toThrow(/already been decided/);
    expect(() => assertTransition("rejected", "approved")).toThrow(/already been decided/);
  });

  test("rejects a nonsensical transition", () => {
    expect(() => assertTransition("draft", "approved")).toThrow(/cannot go from draft to approved/);
  });
});
