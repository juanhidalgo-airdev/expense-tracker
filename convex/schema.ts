import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * Roles. `manager` is additive: a manager is also an employee and submits
 * expenses like anyone else, they just cannot decide their own.
 * There is deliberately no `admin` role — accounts are provisioned by seed.
 */
export const roleValidator = v.union(v.literal("employee"), v.literal("manager"));

/**
 * draft -> submitted -> approved | rejected, plus withdraw (submitted -> draft)
 * and resubmit (rejected -> submitted). Decisions are final: there is no
 * transition out of `approved`, and none out of `rejected` except the owner
 * correcting and resubmitting.
 */
export const statusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const eventTypeValidator = v.union(
  v.literal("created"),
  v.literal("submitted"),
  v.literal("edited"),
  v.literal("receipt_replaced"),
  v.literal("withdrawn"),
  v.literal("resubmitted"),
  v.literal("approved"),
  v.literal("rejected"),
);

/** Field-level before/after, so an edit-then-resubmit shows what actually moved. */
export const fieldChangeValidator = v.object({
  field: v.string(),
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
});

export default defineSchema({
  ...authTables,

  /**
   * Overrides the `users` table from `authTables`.
   *
   * Convex Auth writes into this table itself, so the fields it owns are
   * reproduced here exactly as the library defines them (including both
   * indexes, which the library queries by name). Everything below the divider
   * is ours, and is what `createAccount`'s `profile` argument supplies.
   */
  users: defineTable({
    // --- Owned by Convex Auth ---
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // --- Application fields ---
    role: roleValidator,
    /** Soft deactivation. We never hard-delete a user who has expense history. */
    isActive: v.boolean(),
    /** ISO-3166 alpha-2. Unused in v1; present for the multi-country roadmap. */
    country: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  /**
   * Seeded rather than hard-coded as a union of literals: the client expects
   * to make these configurable later, so retiring or renaming one should be a
   * data change, not a schema migration. Rows are never deleted — `isActive`
   * retires a category without orphaning the expenses referencing it.
   */
  categories: defineTable({
    key: v.string(),
    label: v.string(),
    sortOrder: v.number(),
    isActive: v.boolean(),
  }).index("by_active_and_sortOrder", ["isActive", "sortOrder"]),

  expenses: defineTable({
    userId: v.id("users"),
    description: v.string(),
    /**
     * Integer minor units — cents. Never a float: summing floats is how expense
     * totals go subtly wrong. Formatting is the UI's job, via Intl.
     */
    amountMinor: v.number(),
    /** ISO-4217. Single-currency UI in v1, stored per expense for the roadmap. */
    currency: v.string(),
    categoryId: v.id("categories"),
    /**
     * Calendar date the cost was incurred, as YYYY-MM-DD. Deliberately not a
     * timestamp: a calendar date has no timezone, and storing one as an instant
     * makes a Tokyo dinner show up on the previous day for a London approver.
     */
    expenseDate: v.string(),
    /** Optional note from the submitter to whoever reviews it. */
    noteToApprover: v.optional(v.string()),
    /**
     * Exactly one receipt, required by the mutation. Optional in the schema so
     * relaxing that rule later is a validator change, not a data migration.
     */
    receiptStorageId: v.optional(v.id("_storage")),

    status: statusValidator,
    /** Epoch ms. Drives queue ordering — oldest waiting is most urgent. */
    submittedAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
    /** Required on rejection, enforced in the mutation. */
    decisionNote: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    // The manager queue: every pending expense, oldest first.
    .index("by_status_and_submittedAt", ["status", "submittedAt"])
    // Duplicate warning: same person, same day, same amount.
    .index("by_user_and_expenseDate", ["userId", "expenseDate"]),

  /**
   * Append-only history. Written only through the helper in `events.ts`,
   * never updated or deleted — that is what makes it an audit trail rather
   * than a log. Both the owner and any manager read the same rows.
   */
  expenseEvents: defineTable({
    expenseId: v.id("expenses"),
    actorId: v.id("users"),
    type: eventTypeValidator,
    note: v.optional(v.string()),
    fromStatus: v.optional(statusValidator),
    toStatus: v.optional(statusValidator),
    changes: v.optional(v.array(fieldChangeValidator)),
  }).index("by_expense", ["expenseId"]),
});
