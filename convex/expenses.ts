import { ConvexError, v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { diffFields, recordEvent } from "./lib/events";
import { canEdit, canWithdraw } from "./lib/permissions";
import { assertTransition } from "./lib/transitions";
import {
  assertCategoryUsable,
  assertReceiptAcceptable,
  assertValidAmount,
  assertValidDescription,
  assertValidExpenseDate,
  assertValidNote,
} from "./lib/validation";

/** Fields an edit can touch, and therefore what the history diffs. */
const EDITABLE_FIELDS = [
  "description",
  "amountMinor",
  "categoryId",
  "expenseDate",
  "noteToApprover",
  "receiptStorageId",
];

/**
 * Warns when the same person already has an expense for the same amount on the
 * same day. Advisory only — it never blocks submission, and nothing about the
 * warning is stored.
 *
 * Note the limit of this check: with no merchant field, it can compare amount
 * and date and nothing else. It catches a double submission; it will not catch
 * the same receipt entered twice with the date mistyped, and two genuinely
 * different lunches on one day will warn.
 */
export const findPossibleDuplicate = query({
  args: { amountMinor: v.number(), expenseDate: v.string(), excludeId: v.optional(v.id("expenses")) },
  returns: v.union(v.object({ _id: v.id("expenses"), description: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const sameDay = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_expenseDate", (q) =>
        q.eq("userId", user._id).eq("expenseDate", args.expenseDate),
      )
      .collect();

    const match = sameDay.find(
      (expense) => expense.amountMinor === args.amountMinor && expense._id !== args.excludeId,
    );

    return match ? { _id: match._id, description: match.description } : null;
  },
});

/**
 * Creates an expense, optionally submitting it in the same transaction.
 *
 * One round trip rather than create-then-submit, so a failure cannot leave a
 * half-submitted expense behind.
 */
export const create = mutation({
  args: {
    description: v.string(),
    amountMinor: v.number(),
    categoryId: v.id("categories"),
    expenseDate: v.string(),
    noteToApprover: v.optional(v.string()),
    receiptStorageId: v.id("_storage"),
    submit: v.boolean(),
  },
  returns: v.id("expenses"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const description = assertValidDescription(args.description);
    const noteToApprover = assertValidNote(args.noteToApprover, "Note");
    assertValidAmount(args.amountMinor);
    assertValidExpenseDate(args.expenseDate);
    await assertCategoryUsable(ctx, args.categoryId);
    await assertReceiptAcceptable(ctx, args.receiptStorageId);

    const now = Date.now();

    const expenseId = await ctx.db.insert("expenses", {
      userId: user._id,
      description,
      amountMinor: args.amountMinor,
      currency: "USD",
      categoryId: args.categoryId,
      expenseDate: args.expenseDate,
      noteToApprover,
      receiptStorageId: args.receiptStorageId,
      status: args.submit ? "submitted" : "draft",
      submittedAt: args.submit ? now : undefined,
    });

    await recordEvent(ctx, { expenseId, actorId: user._id, type: "created" });

    if (args.submit) {
      await recordEvent(ctx, {
        expenseId,
        actorId: user._id,
        type: "submitted",
        fromStatus: "draft",
        toStatus: "submitted",
      });
    }

    return expenseId;
  },
});

/**
 * Edits an expense the caller owns, while it is theirs to change.
 *
 * Only permitted on a draft or a rejected expense: a pending expense is locked
 * precisely so a manager cannot approve something other than what they read.
 */
export const update = mutation({
  args: {
    expenseId: v.id("expenses"),
    description: v.string(),
    amountMinor: v.number(),
    categoryId: v.id("categories"),
    expenseDate: v.string(),
    noteToApprover: v.optional(v.string()),
    receiptStorageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const expense = await requireOwnEditable(ctx, user, args.expenseId);

    const description = assertValidDescription(args.description);
    const noteToApprover = assertValidNote(args.noteToApprover, "Note");
    assertValidAmount(args.amountMinor);
    assertValidExpenseDate(args.expenseDate);
    await assertCategoryUsable(ctx, args.categoryId);

    const receiptChanged = args.receiptStorageId !== expense.receiptStorageId;
    if (receiptChanged) {
      await assertReceiptAcceptable(ctx, args.receiptStorageId);
    }

    const patch = {
      description,
      amountMinor: args.amountMinor,
      categoryId: args.categoryId,
      expenseDate: args.expenseDate,
      noteToApprover,
      receiptStorageId: args.receiptStorageId,
    };

    const changes = diffFields(expense, patch, EDITABLE_FIELDS);
    await ctx.db.patch(args.expenseId, patch);

    // An edit that changed nothing is not worth a history entry.
    if (changes.length > 0) {
      await recordEvent(ctx, {
        expenseId: args.expenseId,
        actorId: user._id,
        type: receiptChanged && changes.length === 1 ? "receipt_replaced" : "edited",
        changes,
      });
    }

    return null;
  },
});

/** draft -> submitted, or rejected -> submitted after a correction. */
export const submit = mutation({
  args: { expenseId: v.id("expenses") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const expense = await requireOwnEditable(ctx, user, args.expenseId);

    assertTransition(expense.status, "submitted");

    if (expense.receiptStorageId === undefined) {
      throw new ConvexError("Attach a receipt before submitting.");
    }

    const wasRejected = expense.status === "rejected";

    await ctx.db.patch(args.expenseId, {
      status: "submitted",
      submittedAt: Date.now(),
      // Clear the previous decision so a resubmitted expense reads as pending
      // rather than carrying a stale approver. The history keeps the record.
      decidedAt: undefined,
      decidedBy: undefined,
      decisionNote: undefined,
    });

    await recordEvent(ctx, {
      expenseId: args.expenseId,
      actorId: user._id,
      type: wasRejected ? "resubmitted" : "submitted",
      fromStatus: expense.status,
      toStatus: "submitted",
    });

    return null;
  },
});

/** submitted -> draft, so the owner can correct something before it is read. */
export const withdraw = mutation({
  args: { expenseId: v.id("expenses") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const expense = await ctx.db.get(args.expenseId);
    if (expense === null) {
      throw new ConvexError("Expense not found.");
    }
    if (!canWithdraw(user, expense)) {
      throw new ConvexError("You cannot withdraw this expense.");
    }

    // Re-read inside the transaction: a manager may have decided it since the
    // page loaded. Convex mutations are serializable, so this is sufficient.
    assertTransition(expense.status, "draft");

    await ctx.db.patch(args.expenseId, { status: "draft", submittedAt: undefined });

    await recordEvent(ctx, {
      expenseId: args.expenseId,
      actorId: user._id,
      type: "withdrawn",
      fromStatus: "submitted",
      toStatus: "draft",
    });

    return null;
  },
});

async function requireOwnEditable(
  ctx: { db: { get: (id: Doc<"expenses">["_id"]) => Promise<Doc<"expenses"> | null> } },
  user: Doc<"users">,
  expenseId: Doc<"expenses">["_id"],
): Promise<Doc<"expenses">> {
  const expense = await ctx.db.get(expenseId);

  if (expense === null) {
    throw new ConvexError("Expense not found.");
  }

  if (expense.userId !== user._id) {
    // Do not distinguish "not yours" from "does not exist".
    throw new ConvexError("Expense not found.");
  }

  if (!canEdit(user, expense)) {
    throw new ConvexError(
      expense.status === "submitted"
        ? "Withdraw this expense before editing it."
        : "This expense can no longer be edited.",
    );
  }

  return expense;
}
