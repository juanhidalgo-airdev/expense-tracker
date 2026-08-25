"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { DecisionPanel } from "@/components/DecisionPanel";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { ReceiptViewer } from "@/components/ReceiptViewer";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCalendarDate, formatTimestamp } from "@/lib/dates";
import { formatMinor } from "@/lib/money";

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const expenseId = params.id as Id<"expenses">;
  const router = useRouter();

  const expense = useQuery(api.expenses.get, { expenseId });
  const viewer = useQuery(api.users.getCurrentUser);
  const withdraw = useMutation(api.expenses.withdraw);
  const submit = useMutation(api.expenses.submit);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof ConvexError
          ? String(actionError.data)
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (expense === undefined) {
    return (
      <AppShell>
        <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
      </AppShell>
    );
  }

  // Null covers both "does not exist" and "not yours" — the server does not
  // distinguish them, and neither does this page.
  if (expense === null) {
    return (
      <AppShell>
        <h1 className="text-xl font-semibold tracking-tight">Expense not found</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          It may have been removed, or it may not be yours to view.
        </p>
        <Link href="/expenses" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to my expenses
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{expense.description}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {expense.isMine ? "Submitted by you" : `Submitted by ${expense.submitterName}`}
          </p>
        </div>
        <StatusBadge status={expense.status} />
      </div>

      {expense.status === "rejected" && expense.decisionNote !== undefined && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-sm font-medium text-red-900 dark:text-red-200">
            Rejected{expense.decidedByName ? ` by ${expense.decidedByName}` : ""}
          </p>
          <p className="mt-1 text-sm text-red-900/90 dark:text-red-200/90">
            {expense.decisionNote}
          </p>
        </div>
      )}

      {expense.status === "approved" && (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200">
          Approved{expense.decidedByName ? ` by ${expense.decidedByName}` : ""}
          {expense.decidedAt !== undefined ? ` on ${formatTimestamp(expense.decidedAt)}` : ""}.
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-black/60 dark:text-white/60">Amount</dt>
          <dd className="mt-0.5 text-sm tabular-nums">
            {formatMinor(expense.amountMinor, expense.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-black/60 dark:text-white/60">Date incurred</dt>
          <dd className="mt-0.5 text-sm">{formatCalendarDate(expense.expenseDate)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-black/60 dark:text-white/60">Category</dt>
          <dd className="mt-0.5 text-sm">{expense.categoryLabel}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-black/60 dark:text-white/60">Submitted</dt>
          <dd className="mt-0.5 text-sm">
            {expense.submittedAt !== undefined ? formatTimestamp(expense.submittedAt) : "Not yet"}
          </dd>
        </div>
        {expense.noteToApprover !== undefined && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-black/60 dark:text-white/60">
              Note to approver
            </dt>
            <dd className="mt-0.5 text-sm">{expense.noteToApprover}</dd>
          </div>
        )}
      </dl>

      {error !== null && (
        <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Every button here is gated on a flag the server computed. Hiding them
          is presentation; the mutations re-check the same rules. */}
      {(expense.canEdit || expense.canWithdraw) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {expense.canEdit && (
            <Link
              href={`/expenses/${expense._id}/edit`}
              className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Edit
            </Link>
          )}
          {expense.canEdit && expense.status !== "submitted" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => submit({ expenseId: expense._id }))}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {expense.status === "rejected" ? "Resubmit" : "Submit for approval"}
            </button>
          )}
          {expense.canWithdraw && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => withdraw({ expenseId: expense._id }))}
              className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            >
              Withdraw to draft
            </button>
          )}
        </div>
      )}

      {expense.canWithdraw && (
        <p className="mt-2 text-xs text-black/60 dark:text-white/60">
          Pending expenses cannot be edited directly — withdraw it first, so a manager never
          approves something other than what they read.
        </p>
      )}

      {expense.canDecide && (
        <DecisionPanel
          expenseId={expense._id}
          amountMinor={expense.amountMinor}
          currency={expense.currency}
          submitterName={expense.submitterName}
        />
      )}

      {/* A manager looking at their own pending expense: visible in the queue,
          not theirs to act on. Saying so beats an absent button. Employees get
          no such message — for them there was never a button to explain. */}
      {viewer?.role === "manager" && expense.isMine && expense.status === "submitted" && (
        <p className="mt-8 rounded-lg border border-black/10 px-4 py-3 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          This is your own expense, so another manager has to decide it.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Receipt</h2>
        <div className="mt-3">
          {expense.hasReceipt ? (
            <ReceiptViewer expenseId={expense._id} />
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">No receipt is attached.</p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">History</h2>
        <div className="mt-4">
          <HistoryTimeline expenseId={expense._id} />
        </div>
      </section>

      <button
        type="button"
        onClick={() => router.push("/expenses")}
        className="mt-10 text-sm underline underline-offset-4 hover:no-underline"
      >
        Back to my expenses
      </button>
    </AppShell>
  );
}
