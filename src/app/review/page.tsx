"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { ExpenseList } from "@/components/ExpenseList";

const PAGE_SIZE = 25;

/**
 * The manager review queue.
 *
 * Pending is the default and is ordered oldest-first: whatever has been
 * waiting longest is the most urgent. Decided exists so a manager can answer
 * "what did I approve last week?" without a reporting feature.
 */
export default function ReviewPage() {
  const [scope, setScope] = useState<"pending" | "decided">("pending");
  const currentUser = useQuery(api.users.getCurrentUser);
  const isManager = currentUser?.role === "manager";

  // "skip" matters: listForReview throws for a non-manager, and a throwing
  // query takes the whole render down rather than falling through to the guard
  // below. Never issue a query the viewer is not allowed to make.
  const { results, status: loadStatus, loadMore } = usePaginatedQuery(
    api.expenses.listForReview,
    isManager ? { scope } : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  if (currentUser !== undefined && currentUser !== null && !isManager) {
    return (
      <AppShell>
        <h1 className="text-xl font-semibold tracking-tight">Not available</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          Only managers review expenses.
        </p>
      </AppShell>
    );
  }

  const tabs = [
    { value: "pending", label: "Pending" },
    { value: "decided", label: "Decided" },
  ] as const;

  return (
    <AppShell>
      <h1 className="text-xl font-semibold tracking-tight">Review</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {scope === "pending"
          ? "Everything awaiting a decision, longest wait first."
          : "Expenses that have already been decided, most recent first."}
      </p>

      <div
        role="tablist"
        aria-label="Review queue"
        className="mt-6 flex gap-1 border-b border-black/10 dark:border-white/15"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={scope === tab.value}
            onClick={() => setScope(tab.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              scope === tab.value
                ? "border-foreground font-medium"
                : "border-transparent text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ExpenseList
        rows={loadStatus === "LoadingFirstPage" ? undefined : results}
        isLoading={loadStatus === "LoadingMore"}
        canLoadMore={loadStatus === "CanLoadMore"}
        onLoadMore={() => loadMore(PAGE_SIZE)}
        showSubmitter
        markMine
        emptyTitle={scope === "pending" ? "Nothing to review" : "Nothing decided yet"}
        emptyBody={
          scope === "pending"
            ? "Submitted expenses will appear here as soon as anyone sends one."
            : "Approved and rejected expenses will collect here."
        }
      />
    </AppShell>
  );
}
