"use client";

import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { ExpenseList } from "@/components/ExpenseList";

type Status = "draft" | "submitted" | "approved" | "rejected";

const PAGE_SIZE = 25;

export default function MyExpensesPage() {
  const [status, setStatus] = useState<Status | "all">("all");

  // The status filter is part of the query, not a client-side pass over a
  // page: filtering 25 loaded rows would silently show fewer than 25 and call
  // it filtered. Changing it starts a fresh pagination.
  const { results, status: loadStatus, loadMore } = usePaginatedQuery(
    api.expenses.listMine,
    { status: status === "all" ? undefined : status },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <AppShell>
      <h1 className="text-xl font-semibold tracking-tight">My expenses</h1>

      <ExpenseList
        rows={loadStatus === "LoadingFirstPage" ? undefined : results}
        isLoading={loadStatus === "LoadingMore"}
        canLoadMore={loadStatus === "CanLoadMore"}
        onLoadMore={() => loadMore(PAGE_SIZE)}
        status={status}
        onStatusChange={setStatus}
        emptyTitle="No expenses yet"
        emptyBody="Submit your first one and it will appear here with its status."
      />
    </AppShell>
  );
}
