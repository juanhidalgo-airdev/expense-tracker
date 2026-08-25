"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { formatMinor } from "@/lib/money";

/**
 * Approve or reject.
 *
 * Decisions are final — the client ruled out reversal — so neither outcome is
 * a bare button. Each opens a confirmation that restates the amount and who
 * submitted it, because the cost of a mis-click here is permanent and the only
 * remedy is asking the employee to submit a fresh expense.
 */
export function DecisionPanel({
  expenseId,
  amountMinor,
  currency,
  submitterName,
}: {
  expenseId: Id<"expenses">;
  amountMinor: number;
  currency: string;
  submitterName: string;
}) {
  const approve = useMutation(api.expenses.approve);
  const reject = useMutation(api.expenses.reject);

  const [mode, setMode] = useState<"idle" | "approving" | "rejecting">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setError(null);

    if (mode === "rejecting" && note.trim() === "") {
      setError("Give a reason so the employee knows what to fix.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "approving") {
        await approve({ expenseId, note: note.trim() === "" ? undefined : note });
      } else {
        await reject({ expenseId, note });
      }
      setMode("idle");
      setNote("");
    } catch (decisionError) {
      // Covers the race: if another manager decided this a moment ago, the
      // mutation re-read the status and refused. The message says so.
      setError(
        decisionError instanceof ConvexError
          ? String(decisionError.data)
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const amount = formatMinor(amountMinor, currency);

  return (
    <section className="mt-8 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold">Your decision</h2>

      {mode === "idle" && (
        <>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Decisions are final and cannot be reversed.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setMode("approving")}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setMode("rejecting")}
              className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Reject
            </button>
          </div>
        </>
      )}

      {mode !== "idle" && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm">
            {mode === "approving" ? "Approve" : "Reject"} <strong>{amount}</strong> submitted by{" "}
            <strong>{submitterName}</strong>?
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              {mode === "rejecting" ? (
                "Reason (required)"
              ) : (
                <>
                  Note <span className="text-black/60 dark:text-white/60">(optional)</span>
                </>
              )}
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={1000}
              autoFocus
              placeholder={
                mode === "rejecting"
                  ? "What needs to change before this can be approved?"
                  : ""
              }
              className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/50 focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>

          {error !== null && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Working…" : mode === "approving" ? "Confirm approval" : "Confirm rejection"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("idle");
                setNote("");
                setError(null);
              }}
              className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
