import { Doc } from "../_generated/dataModel";

/**
 * The single authority on who may do what to an expense.
 *
 * Every query and mutation goes through these, and queries return the results
 * as flags alongside the data so the UI never re-derives a rule and cannot
 * disagree with the server. Keeping the logic here — rather than as scattered
 * `status === "submitted"` checks in components — is also what makes the
 * multi-level approval feature a change to this file plus one mutation,
 * instead of a change to every screen.
 */

type User = Doc<"users">;
type Expense = Doc<"expenses">;

/**
 * The owner always. Any manager, but never someone else's draft.
 *
 * Managers see everything company-wide, which follows from the client's answer
 * that any manager can approve any expense — but a draft has not been shared
 * with anyone yet. The spec is explicit that a draft is "not yet visible to any
 * manager", and an earlier version of this function contradicted that: it
 * returned true for any manager regardless of status, so a manager holding a
 * URL could read an employee's half-finished expense.
 *
 * Drafts never appeared in the queue, which is why it went unnoticed.
 */
export function canView(user: User, expense: Expense): boolean {
  if (expense.userId === user._id) {
    return true;
  }
  return user.role === "manager" && expense.status !== "draft";
}

/**
 * Only the owner, and only while the expense is theirs to change.
 *
 * A pending expense is deliberately locked: if it could be edited while
 * awaiting review, a manager could approve something other than what they
 * read. The owner withdraws it to draft first.
 */
export function canEdit(user: User, expense: Expense): boolean {
  if (expense.userId !== user._id) {
    return false;
  }
  return expense.status === "draft" || expense.status === "rejected";
}

/** Owner pulls a pending expense back to draft to correct it. */
export function canWithdraw(user: User, expense: Expense): boolean {
  return expense.userId === user._id && expense.status === "submitted";
}

/**
 * Any manager, on any pending expense, except their own.
 *
 * The `userId` comparison is the self-approval block. It is enforced here on
 * the server, not merely by hiding the button — a manager's own expense is
 * visible in the queue and must simply not be actionable by them.
 */
export function canDecide(user: User, expense: Expense): boolean {
  return (
    user.role === "manager" &&
    expense.status === "submitted" &&
    expense.userId !== user._id
  );
}

/** Capability flags shipped to the client alongside an expense. */
export function capabilitiesFor(user: User, expense: Expense) {
  return {
    canEdit: canEdit(user, expense),
    canWithdraw: canWithdraw(user, expense),
    canDecide: canDecide(user, expense),
  };
}
