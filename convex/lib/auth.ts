import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Identity resolution. Every public function starts here.
 *
 * The client is an untrusted renderer: it never supplies the acting user, and
 * the role is read from the database rather than from a token claim, so a
 * tampered client cannot escalate. A token proves who you are; the database
 * decides what you may do.
 */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError("Not signed in.");
  }

  const user = await ctx.db.get(userId);
  if (user === null) {
    // A live session pointing at a deleted user. Fail closed.
    throw new ConvexError("Not signed in.");
  }

  if (!user.isActive) {
    throw new ConvexError("This account is no longer active.");
  }

  return user;
}

/** As above, and the caller must be a manager. */
export async function requireManager(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "manager") {
    throw new ConvexError("Only managers can do that.");
  }
  return user;
}
