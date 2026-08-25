import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";

type EventType = Doc<"expenseEvents">["type"];
type Status = Doc<"expenses">["status"];
type FieldChange = { field: string; from: string | null; to: string | null };

/**
 * The only way history gets written.
 *
 * Rows are never updated or deleted — that is what makes this an audit trail
 * rather than a log. Both the owner and any manager read the same rows; there
 * is no manager-only view of what happened.
 */
export async function recordEvent(
  ctx: MutationCtx,
  args: {
    expenseId: Id<"expenses">;
    actorId: Id<"users">;
    type: EventType;
    note?: string;
    fromStatus?: Status;
    toStatus?: Status;
    changes?: FieldChange[];
  },
): Promise<void> {
  await ctx.db.insert("expenseEvents", {
    expenseId: args.expenseId,
    actorId: args.actorId,
    type: args.type,
    note: args.note,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    // Omit an empty array rather than storing one: "edited, nothing changed"
    // is noise in a timeline.
    changes: args.changes && args.changes.length > 0 ? args.changes : undefined,
  });
}

/**
 * Diffs an edit into field-level before/after values.
 *
 * Everything is stringified for storage so the timeline can render changes
 * uniformly without knowing each field's type. The UI formats amounts and
 * dates for display; this only needs to be faithful and comparable.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of fields) {
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (from !== to) {
      changes.push({ field, from, to });
    }
  }

  return changes;
}

function normalize(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return String(value);
}
