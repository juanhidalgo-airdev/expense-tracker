import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { recordEvent } from "./lib/events";

/**
 * The database half of the seed, split out of seed.ts deliberately.
 *
 * An action calling a mutation defined in the SAME module makes the module's
 * generated api type self-referential, and tsc reports the handler as
 * implicitly any. Two modules, no cycle.
 */

/** The client named the first four; `other` is ours, so nothing is unfileable. */
const SEED_CATEGORIES = [
  { key: "travel", label: "Travel", sortOrder: 1 },
  { key: "meals", label: "Meals", sortOrder: 2 },
  { key: "software", label: "Software", sortOrder: 3 },
  { key: "office_supplies", label: "Office Supplies", sortOrder: 4 },
  { key: "other", label: "Other", sortOrder: 5 },
];

export const seedData = internalMutation({
  args: {
    userIds: v.object({
      employee: v.id("users"),
      manager: v.id("users"),
      employee2: v.id("users"),
      manager2: v.id("users"),
    }),
    receiptStorageId: v.id("_storage"),
  },
  returns: v.object({ categories: v.number(), expenses: v.number() }),
  handler: async (ctx, args) => {
    // --- Categories ---
    const categoryIds: Record<string, Id<"categories">> = {};
    let categoriesCreated = 0;

    for (const category of SEED_CATEGORIES) {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_active_and_sortOrder")
        .filter((q) => q.eq(q.field("key"), category.key))
        .first();

      if (existing !== null) {
        categoryIds[category.key] = existing._id;
        continue;
      }

      categoryIds[category.key] = await ctx.db.insert("categories", {
        ...category,
        isActive: true,
      });
      categoriesCreated++;
    }

    // --- Expenses ---
    // Only seed if there are none, so re-running never duplicates them.
    const anyExpense = await ctx.db.query("expenses").first();
    if (anyExpense !== null) {
      return { categories: categoriesCreated, expenses: 0 };
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const rows = [
      {
        userId: args.userIds.employee,
        description: "Flights to client kickoff in Berlin",
        amountMinor: 48250,
        categoryKey: "travel",
        expenseDate: "2026-08-18",
        status: "submitted" as const,
        submittedAt: now - 3 * day,
      },
      {
        userId: args.userIds.employee,
        description: "Team lunch with Northwind stakeholders",
        amountMinor: 12640,
        categoryKey: "meals",
        expenseDate: "2026-08-20",
        status: "submitted" as const,
        submittedAt: now - 2 * day,
      },
      {
        userId: args.userIds.employee2,
        description: "Figma annual subscription",
        amountMinor: 14400,
        categoryKey: "software",
        expenseDate: "2026-08-11",
        status: "approved" as const,
        submittedAt: now - 6 * day,
        decidedBy: args.userIds.manager,
        decidedAt: now - 5 * day,
      },
      {
        userId: args.userIds.employee2,
        description: "Standing desk for home office",
        amountMinor: 32900,
        categoryKey: "office_supplies",
        expenseDate: "2026-08-09",
        status: "rejected" as const,
        submittedAt: now - 7 * day,
        decidedBy: args.userIds.manager,
        decidedAt: now - 6 * day,
        decisionNote: "Furniture needs sign-off from Facilities first. Resubmit with their approval attached.",
      },
      {
        userId: args.userIds.employee,
        description: "Airport parking",
        amountMinor: 4200,
        categoryKey: "travel",
        expenseDate: "2026-08-22",
        status: "draft" as const,
      },
      {
        // A manager's own expense: this is what makes the self-approval rule
        // demonstrable. Maya sees it in her queue but cannot act on it; Marcus can.
        userId: args.userIds.manager,
        description: "Conference ticket - Convex Summit",
        amountMinor: 55000,
        categoryKey: "other",
        expenseDate: "2026-08-19",
        status: "submitted" as const,
        submittedAt: now - 1 * day,
      },
    ];

    let expensesCreated = 0;

    for (const row of rows) {
      const { categoryKey, ...rest } = row;

      const expenseId = await ctx.db.insert("expenses", {
        ...rest,
        currency: "USD",
        categoryId: categoryIds[categoryKey],
        receiptStorageId: args.receiptStorageId,
      });

      await recordEvent(ctx, {
        expenseId,
        actorId: row.userId,
        type: "created",
      });

      if (row.status !== "draft") {
        await recordEvent(ctx, {
          expenseId,
          actorId: row.userId,
          type: "submitted",
          fromStatus: "draft",
          toStatus: "submitted",
        });
      }

      if (row.status === "approved" || row.status === "rejected") {
        await recordEvent(ctx, {
          expenseId,
          actorId: row.decidedBy!,
          type: row.status,
          note: row.decisionNote,
          fromStatus: "submitted",
          toStatus: row.status,
        });
      }

      expensesCreated++;
    }

    return { categories: categoriesCreated, expenses: expensesCreated };
  },
});

/**
 * Wipes demo expense data so the seed can rebuild it from scratch.
 *
 * Deliberately scoped: it deletes expenses and their history, and NOTHING
 * else. Users and authAccounts are left alone so the published demo
 * credentials keep working, and categories are left alone because expenses
 * reference them.
 *
 * Internal only, so it is not callable from a browser. Run explicitly:
 *   npx convex run seedData:resetDemoData          (dev)
 *   npx convex run seedData:resetDemoData --prod   (production)
 */
export const resetDemoData = internalMutation({
  args: {},
  returns: v.object({ expensesDeleted: v.number(), eventsDeleted: v.number() }),
  handler: async (ctx) => {
    const events = await ctx.db.query("expenseEvents").collect();
    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    const expenses = await ctx.db.query("expenses").collect();
    for (const expense of expenses) {
      await ctx.db.delete(expense._id);
    }

    return { expensesDeleted: expenses.length, eventsDeleted: events.length };
  },
});
