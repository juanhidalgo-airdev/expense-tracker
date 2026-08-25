type Status = "draft" | "submitted" | "approved" | "rejected";

/**
 * One source of truth for how a status is worded and coloured.
 *
 * "Pending" rather than "Submitted" in the UI: the employee cares that it is
 * waiting on someone, not about the internal state name.
 */
const STYLES: Record<Status, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70",
  },
  submitted: {
    label: "Pending",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  },
  approved: {
    label: "Approved",
    className:
      "bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-200",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200",
  },
};

export function StatusBadge({ status }: { status: Status }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style.className}`}
    >
      {style.label}
    </span>
  );
}
