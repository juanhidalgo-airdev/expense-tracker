"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCalendarDate } from "@/lib/dates";
import { formatMinor } from "@/lib/money";

type Row = {
  _id: string;
  description: string;
  amountMinor: number;
  currency: string;
  categoryLabel: string;
  expenseDate: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  submitterName: string;
  isMine: boolean;
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

/**
 * Shared list rendering for the employee view and the manager queue.
 *
 * Filtering and search are done client-side over an already-scoped result set:
 * the server has already decided which rows this user may see, so narrowing
 * them further here cannot widen access. It also keeps typing responsive.
 */
export function ExpenseList({
  rows,
  showSubmitter = false,
  showStatusFilter = true,
  markMine = false,
  emptyTitle,
  emptyBody,
}: {
  rows: Row[] | undefined;
  showSubmitter?: boolean;
  showStatusFilter?: boolean;
  /** In the review queue, flag the manager own rows as not theirs to decide. */
  markMine?: boolean;
  emptyTitle: string;
  emptyBody: string;
}) {
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (rows === undefined) return undefined;
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (term === "") return true;
      return (
        row.description.toLowerCase().includes(term) ||
        row.submitterName.toLowerCase().includes(term) ||
        row.categoryLabel.toLowerCase().includes(term)
      );
    });
  }, [rows, status, search]);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {showStatusFilter && (
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              aria-pressed={status === filter.value}
              className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                status === filter.value
                  ? "bg-black/5 font-medium dark:bg-white/10"
                  : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        )}

        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="sr-only">Search expenses</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={showSubmitter ? "Search description or person…" : "Search…"}
            className="w-56 rounded-md border border-black/15 px-3 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
        </label>
      </div>

      {filtered === undefined && (
        <p className="mt-8 text-sm text-black/60 dark:text-white/60">Loading…</p>
      )}

      {filtered?.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/20">
          <p className="text-sm font-medium">
            {rows?.length === 0 ? emptyTitle : "Nothing matches those filters"}
          </p>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {rows?.length === 0 ? emptyBody : "Try a different status or search term."}
          </p>
        </div>
      )}

      {filtered !== undefined && filtered.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {filtered.map((row) => (
            <li key={row._id}>
              <Link
                href={`/expenses/${row._id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-black/10 px-4 py-3 transition-colors hover:bg-black/[0.02] dark:border-white/15 dark:hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.description}</p>
                  <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
                    {showSubmitter && <>{row.submitterName} · </>}
                    {formatCalendarDate(row.expenseDate)} · {row.categoryLabel}
                    {markMine && row.isMine && (
                      <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium dark:bg-white/10">
                        Your own — another manager must decide
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {formatMinor(row.amountMinor, row.currency)}
                </span>
                <StatusBadge status={row.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
