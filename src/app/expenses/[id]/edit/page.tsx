"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { ExpenseForm } from "@/components/ExpenseForm";

export default function EditExpensePage() {
  const params = useParams<{ id: string }>();
  const expenseId = params.id as Id<"expenses">;
  const expense = useQuery(api.expenses.get, { expenseId });

  if (expense === undefined) {
    return (
      <AppShell>
        <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
      </AppShell>
    );
  }

  if (expense === null) {
    return (
      <AppShell>
        <h1 className="text-xl font-semibold tracking-tight">Expense not found</h1>
        <Link href="/expenses" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to my expenses
        </Link>
      </AppShell>
    );
  }

  // The server decides who may edit and when. This mirrors that answer rather
  // than re-deriving it, so the two cannot disagree.
  if (!expense.canEdit) {
    return (
      <AppShell>
        <h1 className="text-xl font-semibold tracking-tight">This expense cannot be edited</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          {expense.status === "submitted"
            ? "Withdraw it back to draft first — a pending expense is locked so a manager cannot approve something other than what they read."
            : "Approved expenses are final."}
        </p>
        <Link
          href={`/expenses/${expense._id}`}
          className="mt-4 inline-block text-sm underline underline-offset-4"
        >
          Back to the expense
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-xl font-semibold tracking-tight">Edit expense</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {expense.status === "rejected"
          ? "Correct what was flagged, then resubmit. The rejection and its note stay in the history."
          : "Save your changes, or submit when you are ready."}
      </p>

      <ExpenseForm
        initial={{
          _id: expense._id,
          description: expense.description,
          amountMinor: expense.amountMinor,
          categoryId: expense.categoryId,
          expenseDate: expense.expenseDate,
          noteToApprover: expense.noteToApprover,
          status: expense.status,
        }}
      />
    </AppShell>
  );
}
