"use client";

import { AppShell } from "@/components/AppShell";
import { ExpenseForm } from "@/components/ExpenseForm";

export default function NewExpensePage() {
  return (
    <AppShell>
      <h1 className="text-xl font-semibold tracking-tight">New expense</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Save a draft to finish later, or submit it straight for approval.
      </p>
      <ExpenseForm />
    </AppShell>
  );
}
