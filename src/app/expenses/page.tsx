"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { ExpenseList } from "@/components/ExpenseList";

export default function MyExpensesPage() {
  const expenses = useQuery(api.expenses.listMine);

  return (
    <AppShell>
      <h1 className="text-xl font-semibold tracking-tight">My expenses</h1>

      <ExpenseList
        rows={expenses}
        emptyTitle="No expenses yet"
        emptyBody="Submit your first one and it will appear here with its status."
      />
    </AppShell>
  );
}
