"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCalendarDate } from "@/lib/dates";
import { formatMinor } from "@/lib/money";

export default function MyExpensesPage() {
  const expenses = useQuery(api.expenses.listMine);

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">My expenses</h1>
        <Link
          href="/expenses/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          New expense
        </Link>
      </div>

      {expenses === undefined && (
        <p className="mt-8 text-sm text-black/60 dark:text-white/60">Loading…</p>
      )}

      {expenses?.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/20">
          <p className="text-sm font-medium">No expenses yet</p>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Submit your first one and it will appear here with its status.
          </p>
        </div>
      )}

      {expenses !== undefined && expenses.length > 0 && (
        <ul className="mt-6 flex flex-col gap-2">
          {expenses.map((expense) => (
            <li key={expense._id}>
              <Link
                href={`/expenses/${expense._id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-black/10 px-4 py-3 transition-colors hover:bg-black/[0.02] dark:border-white/15 dark:hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{expense.description}</p>
                  <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
                    {formatCalendarDate(expense.expenseDate)} · {expense.categoryLabel}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {formatMinor(expense.amountMinor, expense.currency)}
                </span>
                <StatusBadge status={expense.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
