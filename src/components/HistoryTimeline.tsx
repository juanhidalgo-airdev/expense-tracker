"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { formatCalendarDate, formatTimestamp } from "@/lib/dates";
import { useIsAuthed } from "@/lib/useIsAuthed";
import { formatMinor } from "@/lib/money";

/**
 * The append-only history of an expense.
 *
 * The employee and the manager see exactly these rows — there is no
 * manager-only view of what happened.
 */

const EVENT_LABELS: Record<string, string> = {
  created: "created this expense",
  submitted: "submitted it for approval",
  edited: "edited it",
  receipt_replaced: "replaced the receipt",
  withdrawn: "withdrew it back to draft",
  resubmitted: "corrected and resubmitted it",
  approved: "approved it",
  rejected: "rejected it",
};

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  amountMinor: "Amount",
  categoryId: "Category",
  expenseDate: "Date incurred",
  noteToApprover: "Note to approver",
  receiptStorageId: "Receipt",
};

/** Values are stored as strings; render each field the way a person reads it. */
function formatValue(field: string, value: string | null): string {
  if (value === null) return "empty";
  if (field === "amountMinor") return formatMinor(Number(value));
  if (field === "expenseDate") return formatCalendarDate(value);
  if (field === "receiptStorageId") return "a file";
  return value;
}

export function HistoryTimeline({ expenseId }: { expenseId: Id<"expenses"> }) {
  const isAuthed = useIsAuthed();
  const events = useQuery(api.expenses.history, isAuthed ? { expenseId } : "skip");

  if (events === undefined) {
    return <p className="text-sm text-black/60 dark:text-white/60">Loading history…</p>;
  }

  return (
    <ol className="flex flex-col gap-4">
      {events.map((event) => (
        <li key={event._id} className="flex gap-3">
          <div
            aria-hidden
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-black/25 dark:bg-white/30"
          />
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{event.actorName}</span>{" "}
              {EVENT_LABELS[event.type] ?? event.type}
            </p>
            <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
              {formatTimestamp(event.at)}
            </p>

            {event.note !== undefined && (
              <p className="mt-2 rounded-md border border-black/10 bg-black/[0.02] px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.03]">
                {event.note}
              </p>
            )}

            {event.changes !== undefined && event.changes.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {event.changes.map((change) => (
                  <li key={change.field} className="text-xs text-black/60 dark:text-white/60">
                    <span className="font-medium">
                      {FIELD_LABELS[change.field] ?? change.field}
                    </span>
                    : {formatValue(change.field, change.from)} →{" "}
                    <span className="text-black/80 dark:text-white/80">
                      {formatValue(change.field, change.to)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
