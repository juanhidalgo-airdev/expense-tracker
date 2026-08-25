import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

/**
 * Integration tests over the real Convex functions.
 *
 * The unit tests in lib/ prove the rules in isolation; these prove the
 * functions actually apply them — that authorization is enforced at the
 * function boundary rather than merely available in a helper nobody called.
 */

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      email: "owner@test.local",
      name: "Owner",
      role: "employee",
      isActive: true,
    });
    const other = await ctx.db.insert("users", {
      email: "other@test.local",
      name: "Other",
      role: "employee",
      isActive: true,
    });
    const manager = await ctx.db.insert("users", {
      email: "manager@test.local",
      name: "Manager",
      role: "manager",
      isActive: true,
    });
    const category = await ctx.db.insert("categories", {
      key: "travel",
      label: "Travel",
      sortOrder: 1,
      isActive: true,
    });
    const storageId = await ctx.storage.store(
      new Blob(["receipt"], { type: "image/png" }),
    );

    return { owner, other, manager, category, storageId };
  });

  return { t, ...ids };
}

function validArgs(category: Id<"categories">, storageId: Id<"_storage">, submit = false) {
  return {
    description: "Taxi to airport",
    amountMinor: 4200,
    categoryId: category,
    expenseDate: "2026-08-01",
    receiptStorageId: storageId,
    submit,
  };
}

describe("create", () => {
  test("refuses an unauthenticated caller", async () => {
    const { t, category, storageId } = await setup();
    await expect(t.mutation(api.expenses.create, validArgs(category, storageId))).rejects.toThrow();
  });

  test("creates a draft for the signed-in user", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });

    const expenseId = await asOwner.mutation(api.expenses.create, validArgs(category, storageId));

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense?.status).toBe("draft");
    expect(expense?.userId).toBe(owner);
    expect(expense?.submittedAt).toBeUndefined();
  });

  test("submits in the same call when asked, and records both events", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });

    const expenseId = await asOwner.mutation(
      api.expenses.create,
      validArgs(category, storageId, true),
    );

    const { status, events } = await t.run(async (ctx) => {
      const expense = await ctx.db.get(expenseId);
      const history = await ctx.db
        .query("expenseEvents")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect();
      return { status: expense?.status, events: history.map((e) => e.type) };
    });

    expect(status).toBe("submitted");
    expect(events).toEqual(["created", "submitted"]);
  });

  test.each([
    ["zero", 0],
    ["negative", -100],
    ["fractional minor units", 12.5],
  ])("rejects a %s amount", async (_label, amountMinor) => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });

    await expect(
      asOwner.mutation(api.expenses.create, {
        ...validArgs(category, storageId),
        amountMinor,
      }),
    ).rejects.toThrow();
  });

  test("rejects a blank description", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });

    await expect(
      asOwner.mutation(api.expenses.create, {
        ...validArgs(category, storageId),
        description: "   ",
      }),
    ).rejects.toThrow();
  });

  test("rejects a date well in the future", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });

    await expect(
      asOwner.mutation(api.expenses.create, {
        ...validArgs(category, storageId),
        expenseDate: "2099-01-01",
      }),
    ).rejects.toThrow();
  });

  test("rejects a retired category", async () => {
    const { t, owner, category, storageId } = await setup();
    await t.run(async (ctx) => ctx.db.patch(category, { isActive: false }));
    const asOwner = t.withIdentity({ subject: owner });

    await expect(
      asOwner.mutation(api.expenses.create, validArgs(category, storageId)),
    ).rejects.toThrow();
  });
});

describe("listMine", () => {
  test("returns only the caller's own expenses", async () => {
    const { t, owner, other, category, storageId } = await setup();

    await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, validArgs(category, storageId));
    await t.withIdentity({ subject: other }).mutation(api.expenses.create, {
      ...validArgs(category, storageId),
      description: "Someone else's expense",
    });

    const mine = await t.withIdentity({ subject: owner }).query(api.expenses.listMine);

    expect(mine).toHaveLength(1);
    expect(mine[0].description).toBe("Taxi to airport");
  });

  test("a manager's own list is still only their own — the queue is a separate view", async () => {
    const { t, owner, manager, category, storageId } = await setup();

    await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, validArgs(category, storageId));

    const managerList = await t.withIdentity({ subject: manager }).query(api.expenses.listMine);
    expect(managerList).toHaveLength(0);
  });
});

describe("update", () => {
  test("refuses someone else's expense, without revealing that it exists", async () => {
    const { t, owner, other, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, validArgs(category, storageId));

    await expect(
      t.withIdentity({ subject: other }).mutation(api.expenses.update, {
        expenseId,
        description: "Hijacked",
        amountMinor: 999999,
        categoryId: category,
        expenseDate: "2026-08-01",
        receiptStorageId: storageId,
      }),
    ).rejects.toThrow(/not found/i);
  });

  test("refuses a manager editing an employee's expense", async () => {
    const { t, owner, manager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, validArgs(category, storageId));

    await expect(
      t.withIdentity({ subject: manager }).mutation(api.expenses.update, {
        expenseId,
        description: "Manager edit",
        amountMinor: 4200,
        categoryId: category,
        expenseDate: "2026-08-01",
        receiptStorageId: storageId,
      }),
    ).rejects.toThrow(/not found/i);
  });

  test("refuses while pending, and says how to proceed", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });
    const expenseId = await asOwner.mutation(
      api.expenses.create,
      validArgs(category, storageId, true),
    );

    await expect(
      asOwner.mutation(api.expenses.update, {
        expenseId,
        description: "Changed after submitting",
        amountMinor: 4200,
        categoryId: category,
        expenseDate: "2026-08-01",
        receiptStorageId: storageId,
      }),
    ).rejects.toThrow(/withdraw/i);
  });

  test("records field-level before and after values", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });
    const expenseId = await asOwner.mutation(api.expenses.create, validArgs(category, storageId));

    await asOwner.mutation(api.expenses.update, {
      expenseId,
      description: "Taxi to airport (corrected)",
      amountMinor: 5000,
      categoryId: category,
      expenseDate: "2026-08-01",
      receiptStorageId: storageId,
    });

    const edit = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("expenseEvents")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect();
      return events.find((e) => e.type === "edited");
    });

    expect(edit?.changes).toEqual(
      expect.arrayContaining([
        { field: "amountMinor", from: "4200", to: "5000" },
        { field: "description", from: "Taxi to airport", to: "Taxi to airport (corrected)" },
      ]),
    );
  });
});

describe("withdraw", () => {
  test("owner can pull a pending expense back to draft", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });
    const expenseId = await asOwner.mutation(
      api.expenses.create,
      validArgs(category, storageId, true),
    );

    await asOwner.mutation(api.expenses.withdraw, { expenseId });

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense?.status).toBe("draft");
    expect(expense?.submittedAt).toBeUndefined();
  });

  test("a manager cannot withdraw an employee's expense", async () => {
    const { t, owner, manager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, validArgs(category, storageId, true));

    await expect(
      t.withIdentity({ subject: manager }).mutation(api.expenses.withdraw, { expenseId }),
    ).rejects.toThrow();
  });

  test("cannot withdraw a draft", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });
    const expenseId = await asOwner.mutation(api.expenses.create, validArgs(category, storageId));

    await expect(asOwner.mutation(api.expenses.withdraw, { expenseId })).rejects.toThrow();
  });
});

describe("getReceiptUrl", () => {
  test("returns a URL to the owner", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });
    const expenseId = await asOwner.mutation(api.expenses.create, validArgs(category, storageId));

    const url = await asOwner.query(api.receipts.getReceiptUrl, { expenseId });
    expect(url).toBeTruthy();
  });

  test("returns a URL to any manager", async () => {
    const { t, owner, manager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, validArgs(category, storageId));

    const url = await t
      .withIdentity({ subject: manager })
      .query(api.receipts.getReceiptUrl, { expenseId });
    expect(url).toBeTruthy();
  });

  test("gives another employee nothing — receipts carry personal data", async () => {
    const { t, owner, other, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, validArgs(category, storageId));

    const url = await t
      .withIdentity({ subject: other })
      .query(api.receipts.getReceiptUrl, { expenseId });
    expect(url).toBeNull();
  });
});

describe("findPossibleDuplicate", () => {
  test("flags the same amount on the same date for the same person", async () => {
    const { t, owner, category, storageId } = await setup();
    const asOwner = t.withIdentity({ subject: owner });
    await asOwner.mutation(api.expenses.create, validArgs(category, storageId));

    const match = await asOwner.query(api.expenses.findPossibleDuplicate, {
      amountMinor: 4200,
      expenseDate: "2026-08-01",
    });

    expect(match?.description).toBe("Taxi to airport");
  });

  test("does not flag another person's identical expense", async () => {
    const { t, owner, other, category, storageId } = await setup();
    await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, validArgs(category, storageId));

    const match = await t.withIdentity({ subject: other }).query(api.expenses.findPossibleDuplicate, {
      amountMinor: 4200,
      expenseDate: "2026-08-01",
    });

    expect(match).toBeNull();
  });
});
