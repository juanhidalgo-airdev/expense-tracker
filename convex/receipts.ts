import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canView } from "./lib/permissions";

/**
 * Receipt upload and access.
 *
 * Upload is the standard three-step Convex flow: the client asks for an upload
 * URL, POSTs the file straight to it, and hands us back the resulting
 * storageId, which we validate before recording on an expense.
 */

/**
 * Step 1. Authenticated: an anonymous caller gets no upload URL at all, so the
 * bucket cannot be used as free storage by anyone who finds the endpoint.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Hands back a URL for a receipt, and only to someone entitled to see it.
 *
 * Worth being precise about what this does and does not guarantee. Convex
 * storage URLs are not themselves access-controlled: they are long and
 * unguessable, but anyone holding one can fetch the file. So this query is the
 * control — it refuses callers who cannot view the expense — while the URL it
 * returns is a bearer capability for whoever legitimately received it.
 *
 * That is the right trade for an internal tool of this size, and it is a
 * deliberate one. The stronger alternative is proxying every fetch through an
 * authenticated HTTP action, which costs the CDN and needs a signed token in
 * the URL because an <img> tag cannot send an Authorization header.
 *
 * Consequently the URL is never logged, never put in a query string of ours,
 * and never emailed.
 */
export const getReceiptUrl = query({
  args: { expenseId: v.id("expenses") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const expense = await ctx.db.get(args.expenseId);
    if (expense === null) {
      return null;
    }

    if (!canView(user, expense)) {
      // Same response as "does not exist": a caller who cannot see an expense
      // should not learn whether it exists.
      return null;
    }

    if (expense.receiptStorageId === undefined) {
      return null;
    }

    return await ctx.storage.getUrl(expense.receiptStorageId);
  },
});

/**
 * Discards an upload that was never attached to an expense.
 *
 * Called by the client when a user replaces a receipt before submitting, or
 * abandons the form. Without it, every abandoned draft leaves a file behind
 * with nothing referencing it.
 */
export const discardUpload = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx);

    // Refuse to delete a file some expense still points at — the caller may
    // have sent the wrong id, and a receipt is not recoverable.
    //
    // Index-backed rather than `.filter()`: this previously scanned the whole
    // expenses table on every receipt replacement.
    const attached = await ctx.db
      .query("expenses")
      .withIndex("by_receiptStorageId", (q) => q.eq("receiptStorageId", args.storageId))
      .first();

    if (attached !== null) {
      throw new ConvexError("That receipt is attached to an expense.");
    }

    await ctx.storage.delete(args.storageId);
    return null;
  },
});

/**
 * Deletes uploaded files that no expense references.
 *
 * The gap this closes: the upload happens as soon as a file is chosen, but the
 * expense is only created on submit. Abandon the form, or replace a receipt
 * while offline, and the file stays in storage with nothing pointing at it.
 * Storage is billed whether or not anything references it.
 *
 * `infrastructure.md` described this sweep as existing for some time before it
 * actually did. It does now, on a daily cron (`crons.ts`).
 *
 * Only files older than the grace period are considered, because a file
 * uploaded seconds ago is probably attached to a form someone is still filling
 * in. Each run is bounded so it cannot turn into an unbounded transaction.
 */
export const sweepOrphanedUploads = internalMutation({
  args: {},
  returns: v.object({ considered: v.number(), deleted: v.number() }),
  handler: async (ctx) => {
    const GRACE_MS = 24 * 60 * 60 * 1000;
    const BATCH = 200;
    const cutoff = Date.now() - GRACE_MS;

    const files = await ctx.db.system.query("_storage").take(BATCH);

    let considered = 0;
    let deleted = 0;

    for (const file of files) {
      if (file._creationTime > cutoff) {
        continue;
      }
      considered++;

      const attached = await ctx.db
        .query("expenses")
        .withIndex("by_receiptStorageId", (q) => q.eq("receiptStorageId", file._id))
        .first();

      if (attached === null) {
        await ctx.storage.delete(file._id);
        deleted++;
      }
    }

    return { considered, deleted };
  },
});
