"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { ExpenseList } from "@/components/ExpenseList";

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

      <ExpenseList
        rows={expenses}
        emptyTitle="No expenses yet"
        emptyBody="Submit your first one and it will appear here with its status."
      />
    </AppShell>
  );
}
