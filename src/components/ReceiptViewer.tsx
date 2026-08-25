"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Displays an expense's receipt.
 *
 * The URL comes from an authorization-gated query — an employee who is not the
 * owner gets null, not a URL. Note the property this does NOT have: the URL,
 * once issued, works for anyone holding it. That is why it is never logged or
 * put in a link we generate elsewhere.
 */
export function ReceiptViewer({ expenseId }: { expenseId: Id<"expenses"> }) {
  const url = useQuery(api.receipts.getReceiptUrl, { expenseId });
  const [failed, setFailed] = useState(false);

  if (url === undefined) {
    return <p className="text-sm text-black/60 dark:text-white/60">Loading receipt…</p>;
  }

  if (url === null) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">No receipt is attached.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          This receipt cannot be previewed here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10 bg-black/[0.02] dark:border-white/15 dark:bg-white/[0.03]">
          {/* Deliberately a plain <img>, not next/image: the receipt is served
              from Convex storage, and routing user-supplied files through the
              image optimiser buys nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Receipt"
            onError={() => setFailed(true)}
            className="mx-auto max-h-[28rem] w-auto object-contain"
          />
        </div>
      )}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-sm underline underline-offset-4 hover:no-underline"
      >
        Open receipt in a new tab
      </a>
    </div>
  );
}
