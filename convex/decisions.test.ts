/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

/**
 * Approve and reject.
 *
 * These are the rules the client cared most about — any manager may decide,
 * nobody may decide their own, a rejection must say why, and a decision is
 * final — so they are tested against the real mutations rather than the
 * helpers underneath them.
 */

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const employee = await ctx.db.insert("users", {
      email: "employee@test.local",
      name: "Employee",
      role: "employee",
      isActive: true,
    });
    const otherEmployee = await ctx.db.insert("users", {
      email: "other@test.local",
      name: "Other Employee",
      role: "employee",
      isActive: true,
    });
    const manager = await ctx.db.insert("users", {
      email: "manager@test.local",
      name: "Manager",
      role: "manager",
      isActive: true,
    });
    const secondManager = await ctx.db.insert("users", {
      email: "manager2@test.local",
      name: "Second Manager",
      role: "manager",
      isActive: true,
    });
    const category = await ctx.db.insert("categories", {
      key: "travel",
      label: "Travel",
      sortOrder: 1,
      isActive: true,
    });
    const storageId = await ctx.storage.store(new Blob(["r"], { type: "image/png" }));

    return { employee, otherEmployee, manager, secondManager, category, storageId };
  });

  return { t, ...ids };
}

const PAGE = { numItems: 50, cursor: null };

function args(category: Id<"categories">, storageId: Id<"_storage">, submit = true) {
  return {
    description: "Taxi to airport",
    amountMinor: 4200,
    categoryId: category,
    expenseDate: "2026-08-01",
    receiptStorageId: storageId,
    submit,
  };
}

describe("approve", () => {
  test("any manager can approve any pending expense", async () => {
    const { t, employee, manager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));

    await t.withIdentity({ subject: manager }).mutation(api.expenses.approve, { expenseId });

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense?.status).toBe("approved");
    expect(expense?.decidedBy).toBe(manager);
    expect(expense?.decidedAt).toBeTypeOf("number");
  });

  test("an employee cannot approve, even someone else's expense", async () => {
    const { t, employee, otherEmployee, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));

    await expect(
      t.withIdentity({ subject: otherEmployee }).mutation(api.expenses.approve, { expenseId }),
    ).rejects.toThrow(/only managers/i);
  });

  test("a manager cannot approve their OWN expense", async () => {
    const { t, manager, category, storageId } = await setup();
    const own = await t
      .withIdentity({ subject: manager })
      .mutation(api.expenses.create, args(category, storageId));

    await expect(
      t.withIdentity({ subject: manager }).mutation(api.expenses.approve, { expenseId: own }),
    ).rejects.toThrow(/cannot decide your own/i);

    const expense = await t.run(async (ctx) => ctx.db.get(own));
    expect(expense?.status).toBe("submitted");
  });

  test("but a second manager can decide it", async () => {
    const { t, manager, secondManager, category, storageId } = await setup();
    const own = await t
      .withIdentity({ subject: manager })
      .mutation(api.expenses.create, args(category, storageId));

    await t
      .withIdentity({ subject: secondManager })
      .mutation(api.expenses.approve, { expenseId: own });

    const expense = await t.run(async (ctx) => ctx.db.get(own));
    expect(expense?.status).toBe("approved");
    expect(expense?.decidedBy).toBe(secondManager);
  });

  test("a draft cannot be decided", async () => {
    const { t, employee, manager, category, storageId } = await setup();
    const draft = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId, false));

    await expect(
      t.withIdentity({ subject: manager }).mutation(api.expenses.approve, { expenseId: draft }),
    ).rejects.toThrow();
  });
});

describe("reject", () => {
  test("requires a reason, and leaves the expense pending without one", async () => {
    const { t, employee, manager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));

    await expect(
      t.withIdentity({ subject: manager }).mutation(api.expenses.reject, {
        expenseId,
        note: "   ",
      }),
    ).rejects.toThrow(/reason/i);

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense?.status).toBe("submitted");
  });

  test("records the reason on the expense and in the history", async () => {
    const { t, employee, manager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));

    await t.withIdentity({ subject: manager }).mutation(api.expenses.reject, {
      expenseId,
      note: "Needs the itemised receipt.",
    });

    const { status, note, events } = await t.run(async (ctx) => {
      const expense = await ctx.db.get(expenseId);
      const history = await ctx.db
        .query("expenseEvents")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect();
      return {
        status: expense?.status,
        note: expense?.decisionNote,
        events: history.map((event) => ({ type: event.type, note: event.note })),
      };
    });

    expect(status).toBe("rejected");
    expect(note).toBe("Needs the itemised receipt.");
    expect(events).toContainEqual({ type: "rejected", note: "Needs the itemised receipt." });
  });
});

describe("decisions are final", () => {
  test("a second manager deciding a moment later is refused, not silently ignored", async () => {
    const { t, employee, manager, secondManager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));

    await t.withIdentity({ subject: manager }).mutation(api.expenses.approve, { expenseId });

    // The second manager had the queue open and clicked after the first
    // committed. The mutation re-reads status inside the transaction.
    await expect(
      t.withIdentity({ subject: secondManager }).mutation(api.expenses.reject, {
        expenseId,
        note: "Too late",
      }),
    ).rejects.toThrow(/already been decided/i);

    const expense = await t.run(async (ctx) => ctx.db.get(expenseId));
    expect(expense?.status).toBe("approved");
    expect(expense?.decidedBy).toBe(manager);
  });

  test("an approved expense cannot be re-approved", async () => {
    const { t, employee, manager, secondManager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));

    await t.withIdentity({ subject: manager }).mutation(api.expenses.approve, { expenseId });

    await expect(
      t.withIdentity({ subject: secondManager }).mutation(api.expenses.approve, { expenseId }),
    ).rejects.toThrow(/already been decided/i);
  });

  test("resubmitting after rejection clears the stale decision but keeps the history", async () => {
    const { t, employee, manager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));

    await t
      .withIdentity({ subject: manager })
      .mutation(api.expenses.reject, { expenseId, note: "Missing receipt detail." });
    await t.withIdentity({ subject: employee }).mutation(api.expenses.submit, { expenseId });

    const { expense, events } = await t.run(async (ctx) => {
      const doc = await ctx.db.get(expenseId);
      const history = await ctx.db
        .query("expenseEvents")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect();
      return { expense: doc, events: history.map((event) => event.type) };
    });

    expect(expense?.status).toBe("submitted");
    // Cleared, so it reads as genuinely pending rather than showing a stale approver...
    expect(expense?.decidedBy).toBeUndefined();
    expect(expense?.decisionNote).toBeUndefined();
    // ...but the rejection stays on the record.
    expect(events).toEqual(["created", "submitted", "rejected", "resubmitted"]);
  });
});

describe("the review queue", () => {
  test("refuses an employee outright", async () => {
    const { t, employee } = await setup();
    await expect(
      t.withIdentity({ subject: employee }).query(api.expenses.listForReview, { scope: "pending", paginationOpts: PAGE }),
    ).rejects.toThrow(/only managers/i);
  });

  test("shows every pending expense company-wide, longest wait first", async () => {
    const { t, employee, otherEmployee, manager, category, storageId } = await setup();

    await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));
    await t.withIdentity({ subject: otherEmployee }).mutation(api.expenses.create, {
      ...args(category, storageId),
      description: "Second submission",
    });

    const queue = (
      await t
        .withIdentity({ subject: manager })
        .query(api.expenses.listForReview, { scope: "pending", paginationOpts: PAGE })
    ).page;

    expect(queue).toHaveLength(2);
    expect(queue.map((row) => row.submitterName)).toEqual(["Employee", "Other Employee"]);
  });

  test("flags a manager's own expense so the UI can say who must act", async () => {
    const { t, manager, category, storageId } = await setup();
    await t.withIdentity({ subject: manager }).mutation(api.expenses.create, args(category, storageId));

    const queue = (
      await t
        .withIdentity({ subject: manager })
        .query(api.expenses.listForReview, { scope: "pending", paginationOpts: PAGE })
    ).page;

    expect(queue[0].isMine).toBe(true);
  });

  test("drafts never reach the queue", async () => {
    const { t, employee, manager, category, storageId } = await setup();
    await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId, false));

    const queue = (
      await t
        .withIdentity({ subject: manager })
        .query(api.expenses.listForReview, { scope: "pending", paginationOpts: PAGE })
    ).page;

    expect(queue).toHaveLength(0);
  });

  test("decided moves out of pending and into decided", async () => {
    const { t, employee, manager, category, storageId } = await setup();
    const expenseId = await t
      .withIdentity({ subject: employee })
      .mutation(api.expenses.create, args(category, storageId));

    await t.withIdentity({ subject: manager }).mutation(api.expenses.approve, { expenseId });
    const asManager = t.withIdentity({ subject: manager });

    expect((await asManager.query(api.expenses.listForReview, { scope: "pending", paginationOpts: PAGE })).page).toHaveLength(0);
    expect((await asManager.query(api.expenses.listForReview, { scope: "decided", paginationOpts: PAGE })).page).toHaveLength(1);
  });
});
