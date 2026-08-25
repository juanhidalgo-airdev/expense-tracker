"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ReceiptField } from "@/components/ReceiptField";
import { todayCalendarDate } from "@/lib/dates";
import { formatMinor, MoneyParseError, minorToInput, parseAmountToMinor } from "@/lib/money";

export type ExpenseFormInitial = {
  _id: Id<"expenses">;
  description: string;
  amountMinor: number;
  categoryId: Id<"categories">;
  expenseDate: string;
  noteToApprover?: string;
  status: "draft" | "submitted" | "approved" | "rejected";
};

/**
 * Shared by "new expense" and "edit expense".
 *
 * One component rather than two near-identical forms: the validation rules and
 * the receipt handling are the part most likely to drift apart, and they are
 * exactly the part that must not.
 */
export function ExpenseForm({ initial }: { initial?: ExpenseFormInitial }) {
  const router = useRouter();
  const categories = useQuery(api.categories.list);
  const createExpense = useMutation(api.expenses.create);
  const updateExpense = useMutation(api.expenses.update);
  const submitExpense = useMutation(api.expenses.submit);

  const isEdit = initial !== undefined;

  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial ? minorToInput(initial.amountMinor) : "");
  const [categoryId, setCategoryId] = useState<string>(initial?.categoryId ?? "");
  const [expenseDate, setExpenseDate] = useState(initial?.expenseDate ?? todayCalendarDate());
  const [noteToApprover, setNoteToApprover] = useState(initial?.noteToApprover ?? "");
  const [storageId, setStorageId] = useState<Id<"_storage"> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Parsed leniently so the duplicate check can run as the user types, without
  // surfacing a parse error before they have finished typing.
  let amountMinor: number | null = null;
  try {
    amountMinor = amount.trim() === "" ? null : parseAmountToMinor(amount);
  } catch {
    amountMinor = null;
  }

  const duplicate = useQuery(
    api.expenses.findPossibleDuplicate,
    amountMinor !== null && expenseDate !== ""
      ? { amountMinor, expenseDate, excludeId: initial?._id }
      : "skip",
  );

  async function save(submit: boolean) {
    setError(null);

    if (!isEdit && storageId === null) {
      setError("Attach a receipt before continuing.");
      return;
    }
    if (categoryId === "") {
      setError("Choose a category.");
      return;
    }

    let parsed: number;
    try {
      parsed = parseAmountToMinor(amount);
    } catch (parseError) {
      setError(parseError instanceof MoneyParseError ? parseError.message : "Enter a valid amount.");
      return;
    }

    const shared = {
      description,
      amountMinor: parsed,
      categoryId: categoryId as Id<"categories">,
      expenseDate,
      noteToApprover: noteToApprover.trim() === "" ? undefined : noteToApprover,
    };

    setBusy(true);
    try {
      if (isEdit) {
        await updateExpense({
          expenseId: initial._id,
          ...shared,
          // Omitted when untouched, so the existing receipt is kept.
          receiptStorageId: storageId ?? undefined,
        });
        if (submit) {
          await submitExpense({ expenseId: initial._id });
        }
        router.push(`/expenses/${initial._id}`);
      } else {
        const id = await createExpense({
          ...shared,
          receiptStorageId: storageId!,
          submit,
        });
        router.push(`/expenses/${id}`);
      }
    } catch (saveError) {
      // ConvexError carries a message we wrote; anything else is unexpected and
      // its internals are not the user's problem.
      setError(
        saveError instanceof ConvexError
          ? String(saveError.data)
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(true);
  }

  const inputClass =
    "rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/50 focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <input
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
          maxLength={200}
          placeholder="Flights to client kickoff in Berlin"
          className={inputClass}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="amount" className="text-sm font-medium">
            Amount (USD)
          </label>
          <input
            id="amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            inputMode="decimal"
            placeholder="482.50"
            className={inputClass}
          />
          {/* No reserved height: an empty slot here stacked on top of the
              field gap and left an odd space above Category. It appears only
              once there is an amount to echo back. */}
          {amountMinor !== null && (
            <span className="text-xs text-black/60 dark:text-white/60">
              {formatMinor(amountMinor)}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="expenseDate" className="text-sm font-medium">
            Date incurred
          </label>
          <input
            id="expenseDate"
            type="date"
            value={expenseDate}
            max={todayCalendarDate()}
            onChange={(event) => setExpenseDate(event.target.value)}
            required
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-medium">
          Category
        </label>
        <select
          id="category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          required
          // No bg-transparent here: it defeated the select/option colours in
          // globals.css and left the open dropdown white-on-white in dark mode.
          className={inputClass}
        >
          <option value="">Select a category…</option>
          {categories?.map((category) => (
            <option key={category._id} value={category._id}>
              {category.label}
            </option>
          ))}
        </select>
      </div>

      <ReceiptField
        storageId={storageId}
        onChange={(id) => setStorageId(id)}
        disabled={busy}
        label={isEdit ? "Replace receipt (optional)" : undefined}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-sm font-medium">
          Note to approver <span className="text-black/60 dark:text-white/60">(optional)</span>
        </label>
        <textarea
          id="note"
          value={noteToApprover}
          onChange={(event) => setNoteToApprover(event.target.value)}
          rows={3}
          maxLength={1000}
          className={inputClass}
        />
      </div>

      {/* Advisory only: warns, never blocks. */}
      {duplicate && (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          You already have an expense for this amount on this date:{" "}
          <strong>{duplicate.description}</strong>. Continue anyway if it is genuinely separate.
        </div>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Working…" : isEdit ? "Save and resubmit" : "Submit for approval"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(false)}
          className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {isEdit ? "Save without submitting" : "Save as draft"}
        </button>
      </div>
    </form>
  );
}
