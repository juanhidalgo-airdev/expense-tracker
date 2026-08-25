import { describe, expect, test } from "vitest";
import { Doc, Id } from "../_generated/dataModel";
import { canDecide, canEdit, canView, canWithdraw } from "./permissions";

/**
 * The authorization matrix.
 *
 * These four functions are the whole access-control model, so this is the test
 * that actually encodes the requirements: every actor type against every action
 * against every status. If a rule is wrong, it is wrong here first.
 */

const OWNER = "user_owner" as Id<"users">;
const OTHER = "user_other" as Id<"users">;

function user(id: Id<"users">, role: "employee" | "manager"): Doc<"users"> {
  return {
    _id: id,
    _creationTime: 0,
    email: `${id}@test.local`,
    role,
    isActive: true,
  } as Doc<"users">;
}

function expense(status: Doc<"expenses">["status"], userId: Id<"users"> = OWNER): Doc<"expenses"> {
  return {
    _id: "expense_1" as Id<"expenses">,
    _creationTime: 0,
    userId,
    description: "Test",
    amountMinor: 1000,
    currency: "USD",
    categoryId: "cat_1" as Id<"categories">,
    expenseDate: "2026-08-01",
    status,
  } as Doc<"expenses">;
}

const owner = user(OWNER, "employee");
const otherEmployee = user(OTHER, "employee");
const manager = user(OTHER, "manager");
/** A manager looking at an expense they submitted themselves. */
const managerWhoOwns = user(OWNER, "manager");

const STATUSES = ["draft", "submitted", "approved", "rejected"] as const;

describe("canView", () => {
  test.each(STATUSES)("owner can view their own %s expense", (status) => {
    expect(canView(owner, expense(status))).toBe(true);
  });

  test.each(STATUSES)("another employee cannot view someone else's %s expense", (status) => {
    expect(canView(otherEmployee, expense(status))).toBe(false);
  });

  test.each(["submitted", "approved", "rejected"] as const)(
    "any manager can view any %s expense",
    (status) => {
      // Follows from the client's answer that any manager may approve anything.
      expect(canView(manager, expense(status))).toBe(true);
    },
  );

  test("a manager cannot view someone else's draft", () => {
    // A draft has not been shared with anyone. The spec calls it "not yet
    // visible to any manager", and this function once disagreed — it returned
    // true for a manager regardless of status, so a manager holding the URL
    // could read a half-written expense. Drafts never reach the queue, which is
    // why nothing surfaced it.
    expect(canView(manager, expense("draft"))).toBe(false);
  });

  test("the owner can still view their own draft", () => {
    expect(canView(owner, expense("draft"))).toBe(true);
  });
});

describe("canEdit", () => {
  test("owner can edit a draft", () => {
    expect(canEdit(owner, expense("draft"))).toBe(true);
  });

  test("owner can edit a rejected expense to correct and resubmit it", () => {
    expect(canEdit(owner, expense("rejected"))).toBe(true);
  });

  test("owner cannot edit while pending — a manager could otherwise approve something they did not read", () => {
    expect(canEdit(owner, expense("submitted"))).toBe(false);
  });

  test("owner cannot edit once approved", () => {
    expect(canEdit(owner, expense("approved"))).toBe(false);
  });

  test.each(STATUSES)("a manager cannot edit someone else's %s expense", (status) => {
    expect(canEdit(manager, expense(status))).toBe(false);
  });
});

describe("canWithdraw", () => {
  test("owner can withdraw a pending expense back to draft", () => {
    expect(canWithdraw(owner, expense("submitted"))).toBe(true);
  });

  test.each(["draft", "approved", "rejected"] as const)(
    "owner cannot withdraw a %s expense",
    (status) => {
      expect(canWithdraw(owner, expense(status))).toBe(false);
    },
  );

  test("a manager cannot withdraw someone else's expense", () => {
    expect(canWithdraw(manager, expense("submitted"))).toBe(false);
  });
});

describe("canDecide", () => {
  test("any manager can decide a pending expense, with no reporting line involved", () => {
    expect(canDecide(manager, expense("submitted"))).toBe(true);
  });

  test.each(["draft", "approved", "rejected"] as const)(
    "a manager cannot decide a %s expense",
    (status) => {
      expect(canDecide(manager, expense(status))).toBe(false);
    },
  );

  test("an employee can never decide, even on a pending expense", () => {
    expect(canDecide(otherEmployee, expense("submitted"))).toBe(false);
  });

  test("a manager cannot approve their OWN expense", () => {
    // The rule most likely to be got wrong: the expense is visible in their
    // queue, and must simply not be actionable by them.
    expect(canDecide(managerWhoOwns, expense("submitted", OWNER))).toBe(false);
  });

  test("but another manager can decide it", () => {
    expect(canDecide(manager, expense("submitted", OWNER))).toBe(true);
  });

  test("the owner cannot decide their own expense even if they are an employee", () => {
    expect(canDecide(owner, expense("submitted"))).toBe(false);
  });
});
