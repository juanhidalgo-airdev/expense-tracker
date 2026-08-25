import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Nightly cleanup of uploaded receipts that never got attached to an expense.
 * Off-peak because it is housekeeping, not something anyone waits on.
 */
crons.daily(
  "sweep orphaned receipt uploads",
  { hourUTC: 3, minuteUTC: 0 },
  internal.receipts.sweepOrphanedUploads,
);

export default crons;
