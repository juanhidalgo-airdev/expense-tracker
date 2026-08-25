import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Server-side validation.
 *
 * The client validates the same rules for immediate feedback, but that is a
 * UX affordance — these are the controls. Anything reaching the database has
 * passed through here.
 */

export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_NOTE_LENGTH = 1000;
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
  // Only produced by our own seed, never by an upload.
  "image/svg+xml",
];

export function assertValidDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    throw new ConvexError("Description is required.");
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new ConvexError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

export function assertValidNote(note: string | undefined, label = "Note"): string | undefined {
  if (note === undefined) {
    return undefined;
  }
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new ConvexError(`${label} must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

/**
 * Amounts are integer minor units. There is deliberately no upper bound — the
 * client chose not to cap them — but the value must still be a safe integer,
 * because anything beyond that silently loses precision.
 */
export function assertValidAmount(amountMinor: number): void {
  if (!Number.isInteger(amountMinor)) {
    throw new ConvexError("Amount must be a whole number of minor units.");
  }
  if (amountMinor <= 0) {
    throw new ConvexError("Amount must be greater than zero.");
  }
  if (!Number.isSafeInteger(amountMinor)) {
    throw new ConvexError("That amount is too large.");
  }
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertValidExpenseDate(expenseDate: string, now: number = Date.now()): void {
  if (!CALENDAR_DATE.test(expenseDate)) {
    throw new ConvexError("Expense date must be a real date.");
  }

  const [year, month, day] = expenseDate.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!isRealDate) {
    throw new ConvexError("Expense date must be a real date.");
  }

  // One day of slack, deliberately. The server compares against UTC, but the
  // submitter's "today" can legitimately be UTC-tomorrow: someone in UTC+13
  // filing an expense on their Tuesday morning is still on Monday in UTC, and
  // rejecting that would be a bug they could never work around.
  const tomorrow = new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (expenseDate > tomorrow) {
    throw new ConvexError("An expense cannot be dated in the future.");
  }
}

/**
 * Re-checks an uploaded file on the server.
 *
 * The browser already checked type and size before uploading, but the upload
 * URL is reachable directly, so the only check that counts is this one against
 * the `_storage` metadata Convex recorded.
 */
export async function assertReceiptAcceptable(
  ctx: QueryCtx | MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const metadata = await ctx.db.system.get(storageId);

  if (metadata === null) {
    throw new ConvexError("That receipt upload could not be found. Please try again.");
  }
  if (metadata.size > MAX_RECEIPT_BYTES) {
    throw new ConvexError("Receipts must be 10 MB or smaller.");
  }
  if (metadata.contentType === undefined || !ACCEPTED_RECEIPT_TYPES.includes(metadata.contentType)) {
    throw new ConvexError("Receipts must be a JPEG, PNG, HEIC, WebP or PDF.");
  }
}

/** The category must exist and still be offered. */
export async function assertCategoryUsable(
  ctx: QueryCtx | MutationCtx,
  categoryId: Id<"categories">,
): Promise<void> {
  const category = await ctx.db.get(categoryId);
  if (category === null || !category.isActive) {
    throw new ConvexError("Choose a category.");
  }
}
