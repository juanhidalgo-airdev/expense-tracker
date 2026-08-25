import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";
import { diffFields, recordEvent } from "./lib/events";
import { canDecide, canEdit, canView, canWithdraw, capabilitiesFor } from "./lib/permissions";
import { assertTransition } from "./lib/transitions";
import { statusValidator } from "./schema";
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
 * Categories, fetched once per query and reused for every row.
 *
 * Previously each row did its own `db.get` for its category — invisible at six
 * rows, ~2N point reads at scale, on a subscription that re-runs on every
 * write. There are a handful of categories, so one read of the table beats one
 * read per expense.
 */
async function categoryLabels(ctx: QueryCtx): Promise<Map<string, string>> {
  const categories = await ctx.db.query("categories").collect();
  return new Map(categories.map((category) => [category._id, category.label]));
}

/**
 * The signed-in user's own expenses, newest first.
 *
 * Scoped by index rather than fetched-then-filtered: an index-scoped read
 * cannot accidentally return another user's row, which makes the scoping a
 * property of the query rather than of a line of JavaScript that could be
 * edited out later.
 *
 * Paginated, and the status filter is applied by the server on an index rather
 * than by the client over a full download.
 *
 * No `returns` validator here: a paginated query returns Convex's own page
 * envelope, and hand-writing that shape invites it to drift from the real one.
 */
export const listMine = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const query =
      args.status === undefined
        ? ctx.db.query("expenses").withIndex("by_user", (q) => q.eq("userId", user._id))
        : ctx.db
            .query("expenses")
            .withIndex("by_user_and_status", (q) =>
              q.eq("userId", user._id).eq("status", args.status!),
            );

    const result = await query.order("desc").paginate(args.paginationOpts);
    const labels = await categoryLabels(ctx);
    const submitterName = user.name ?? user.email ?? "Unknown";

    return {
      ...result,
      page: result.page.map((expense) => ({
        _id: expense._id,
        description: expense.description,
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        categoryLabel: labels.get(expense.categoryId) ?? "Uncategorised",
        expenseDate: expense.expenseDate,
        status: expense.status,
        submittedAt: expense.submittedAt,
        submitterName,
        isMine: true,
      })),
    };
  },
});

/**
 * The manager review queue.
 *
 * "Pending" is every submitted expense in the company, oldest first — whatever
 * has been waiting longest is the most urgent. There is no reporting line to
 * consult: the client's answer was that any manager can decide any expense.
 *
 * A manager's OWN pending expense appears here. That is deliberate: it is
 * genuinely awaiting review, and hiding it would misrepresent the queue. It is
 * flagged `isMine` so the UI can show that someone else has to act on it, and
 * the decision mutation refuses it regardless.
 */
export const listForReview = query({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: v.union(v.literal("pending"), v.literal("decided")),
  },
  handler: async (ctx, args) => {
    const manager = await requireManager(ctx);

    const result =
      args.scope === "pending"
        ? await ctx.db
            .query("expenses")
            .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "submitted"))
            // Ascending: longest-waiting first.
            .order("asc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("expenses")
            // "Decided" spans approved and rejected, which a paginated query
            // cannot union across two index scans. Ordering by `decidedAt`
            // covers both, and the range above zero drops everything undecided,
            // since those documents have no `decidedAt` at all.
            .withIndex("by_decidedAt", (q) => q.gt("decidedAt", 0))
            .order("desc")
            .paginate(args.paginationOpts);

    const labels = await categoryLabels(ctx);

    // Submitters still need a read each: unlike categories they are unbounded,
    // and this batches the distinct ones rather than repeating per row.
    const submitterIds = [...new Set(result.page.map((expense) => expense.userId))];
    const submitters = new Map(
      (await Promise.all(submitterIds.map((id) => ctx.db.get(id)))).map((user, index) => [
        submitterIds[index],
        user?.name ?? user?.email ?? "Unknown",
      ]),
    );

    return {
      ...result,
      page: result.page.map((expense) => ({
        _id: expense._id,
        description: expense.description,
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        categoryLabel: labels.get(expense.categoryId) ?? "Uncategorised",
        expenseDate: expense.expenseDate,
        status: expense.status,
        submittedAt: expense.submittedAt,
        submitterName: submitters.get(expense.userId) ?? "Unknown",
        isMine: expense.userId === manager._id,
      })),
    };
  },
});

/**
 * A single expense, with the capability flags the UI renders from.
 *
 * Returns null rather than throwing when the caller may not see it, and
 * returns the same null when it does not exist — so a caller cannot probe for
 * which expense ids are real.
 */
export const get = query({
  args: { expenseId: v.id("expenses") },
  returns: v.union(
    v.object({
      _id: v.id("expenses"),
      description: v.string(),
      amountMinor: v.number(),
      currency: v.string(),
      categoryId: v.id("categories"),
      categoryLabel: v.string(),
      expenseDate: v.string(),
      noteToApprover: v.optional(v.string()),
      hasReceipt: v.boolean(),
      status: v.union(
        v.literal("draft"),
        v.literal("submitted"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
      submittedAt: v.optional(v.number()),
      decidedAt: v.optional(v.number()),
      decidedByName: v.optional(v.string()),
      decisionNote: v.optional(v.string()),
      submitterName: v.string(),
      isMine: v.boolean(),
      canEdit: v.boolean(),
      canWithdraw: v.boolean(),
      canDecide: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const expense = await ctx.db.get(args.expenseId);
    if (expense === null || !canView(user, expense)) {
      return null;
    }

    const [category, submitter, decider] = await Promise.all([
      ctx.db.get(expense.categoryId),
      ctx.db.get(expense.userId),
      expense.decidedBy ? ctx.db.get(expense.decidedBy) : Promise.resolve(null),
    ]);

    return {
      _id: expense._id,
      description: expense.description,
      amountMinor: expense.amountMinor,
      currency: expense.currency,
      categoryId: expense.categoryId,
      categoryLabel: category?.label ?? "Uncategorised",
      expenseDate: expense.expenseDate,
      noteToApprover: expense.noteToApprover,
      hasReceipt: expense.receiptStorageId !== undefined,
      status: expense.status,
      submittedAt: expense.submittedAt,
      decidedAt: expense.decidedAt,
      decidedByName: decider?.name ?? decider?.email ?? undefined,
      decisionNote: expense.decisionNote,
      submitterName: submitter?.name ?? submitter?.email ?? "Unknown",
      isMine: expense.userId === user._id,
      ...capabilitiesFor(user, expense),
    };
  },
});

/**
 * The append-only history for one expense.
 *
 * Both the owner and any manager see the same rows — there is no manager-only
 * view of what happened. Category ids are resolved to labels here because the
 * client has no map to do it with; amounts and dates stay raw so the client
 * can format them in the viewer's own locale.
 */
export const history = query({
  args: { expenseId: v.id("expenses") },
  returns: v.array(
    v.object({
      _id: v.id("expenseEvents"),
      at: v.number(),
      actorName: v.string(),
      type: v.string(),
      note: v.optional(v.string()),
      changes: v.optional(
        v.array(
          v.object({
            field: v.string(),
            from: v.union(v.string(), v.null()),
            to: v.union(v.string(), v.null()),
          }),
        ),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const expense = await ctx.db.get(args.expenseId);
    if (expense === null || !canView(user, expense)) {
      return [];
    }

    const events = await ctx.db
      .query("expenseEvents")
      .withIndex("by_expense", (q) => q.eq("expenseId", args.expenseId))
      .collect();

    return await Promise.all(
      events.map(async (event) => {
        const actor = await ctx.db.get(event.actorId);

        const changes = event.changes
          ? await Promise.all(
              event.changes.map(async (change) => {
                if (change.field !== "categoryId") {
                  return change;
                }
                // Raw ids are meaningless in a timeline.
                const [from, to] = await Promise.all([
                  change.from ? ctx.db.get(change.from as Id<"categories">) : null,
                  change.to ? ctx.db.get(change.to as Id<"categories">) : null,
                ]);
                return {
                  field: change.field,
                  from: from?.label ?? change.from,
                  to: to?.label ?? change.to,
                };
              }),
            )
          : undefined;

        return {
          _id: event._id,
          at: event._creationTime,
          actorName: actor?.name ?? actor?.email ?? "Unknown",
          type: event.type,
          note: event.note,
          changes,
        };
      }),
    );
  },
});

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
    /**
     * Omit to keep the existing receipt. Deliberately not required: the client
     * is never told the current storage id — a manager reading an expense has
     * no business holding a direct handle to the file, and the gated
     * `getReceiptUrl` query is the only way to reach it.
     */
    receiptStorageId: v.optional(v.id("_storage")),
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

    const receiptChanged =
      args.receiptStorageId !== undefined && args.receiptStorageId !== expense.receiptStorageId;

    if (receiptChanged) {
      await assertReceiptAcceptable(ctx, args.receiptStorageId!);
    }

    const patch = {
      description,
      amountMinor: args.amountMinor,
      categoryId: args.categoryId,
      expenseDate: args.expenseDate,
      noteToApprover,
      receiptStorageId: args.receiptStorageId ?? expense.receiptStorageId,
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

/**
 * Approve an expense. Decisions are final — the client ruled out reversal —
 * so this is deliberately a one-way door.
 */
export const approve = mutation({
  args: { expenseId: v.id("expenses"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await decide(ctx, args.expenseId, "approved", assertValidNote(args.note, "Note"));
    return null;
  },
});

/** Reject an expense. The note is required and must say something. */
export const reject = mutation({
  args: { expenseId: v.id("expenses"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = assertValidNote(args.note, "Reason");
    if (note === undefined) {
      // assertValidNote returns undefined for whitespace-only input, which is
      // fine for an optional approval note and not fine here.
      throw new ConvexError("Give a reason so the employee knows what to fix.");
    }

    await decide(ctx, args.expenseId, "rejected", note);
    return null;
  },
});

/**
 * The one place a decision is recorded.
 *
 * Both the authorization check and the status check happen after re-reading
 * the expense inside the transaction. Convex mutations are serializable with
 * automatic retry on conflict, so that is genuinely sufficient for two
 * managers clicking at the same moment: one commits, the other re-reads the
 * new status and fails cleanly with "already been decided". No compare-and-set
 * column, no advisory lock.
 */
async function decide(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  outcome: "approved" | "rejected",
  note: string | undefined,
) {
  const user = await requireManager(ctx);

  const expense = await ctx.db.get(expenseId);
  if (expense === null) {
    throw new ConvexError("Expense not found.");
  }

  // Checked before the status guard so the message is the useful one: a manager
  // looking at their own expense should be told why, not that it is pending.
  if (expense.userId === user._id) {
    throw new ConvexError(
      "You cannot decide your own expense. Another manager needs to review it.",
    );
  }

  if (!canDecide(user, expense)) {
    assertTransition(expense.status, outcome);
    throw new ConvexError("This expense is not awaiting a decision.");
  }

  await ctx.db.patch(expenseId, {
    status: outcome,
    decidedAt: Date.now(),
    decidedBy: user._id,
    decisionNote: note,
  });

  await recordEvent(ctx, {
    expenseId,
    actorId: user._id,
    type: outcome,
    note,
    fromStatus: "submitted",
    toStatus: outcome,
  });
}

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
