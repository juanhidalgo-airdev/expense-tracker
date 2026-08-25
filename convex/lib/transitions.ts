import { ConvexError } from "convex/values";
import { Doc } from "../_generated/dataModel";

export type Status = Doc<"expenses">["status"];

/**
 * The whole lifecycle in one place.
 *
 * Approved is terminal and decisions are final — the client ruled out both a
 * `paid` state and reversal — so `approved` has no outgoing transitions at
 * all. `rejected` has exactly one: the owner corrects and resubmits the same
 * record, which is what keeps the rejection, its note, and the subsequent
 * edits on one continuous history.
 */
const ALLOWED: Record<Status, Status[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected", "draft"],
  approved: [],
  rejected: ["submitted"],
};

export function canTransition(from: Status, to: Status): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * Guard for use inside a mutation, after re-reading the expense.
 *
 * Convex mutations are serializable transactions with automatic retry on
 * conflict, so re-reading status and throwing here is sufficient to make two
 * simultaneous decisions safe: one commits, the other sees the new status and
 * fails cleanly. No compare-and-swap column, no advisory lock.
 */
export function assertTransition(from: Status, to: Status): void {
  if (!canTransition(from, to)) {
    if (from === "approved" || from === "rejected") {
      throw new ConvexError("This expense has already been decided.");
    }
    throw new ConvexError(`An expense cannot go from ${from} to ${to}.`);
  }
}
