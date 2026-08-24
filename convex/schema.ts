import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * Roles. `manager` is additive: a manager is also an employee and submits
 * expenses like anyone else, they just cannot decide their own.
 * There is deliberately no `admin` role — accounts are provisioned by seed.
 */
export const roleValidator = v.union(v.literal("employee"), v.literal("manager"));

export default defineSchema({
  ...authTables,

  /**
   * Overrides the `users` table from `authTables`.
   *
   * Convex Auth writes into this table itself, so the fields it owns are
   * reproduced here exactly as the library defines them (including both
   * indexes, which the library queries by name). Everything below the divider
   * is ours, and is what `createAccount`'s `profile` argument supplies.
   */
  users: defineTable({
    // --- Owned by Convex Auth ---
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // --- Application fields ---
    role: roleValidator,
    /** Soft deactivation. We never hard-delete a user who has expense history. */
    isActive: v.boolean(),
    /** ISO-3166 alpha-2. Unused in v1; present for the multi-country roadmap. */
    country: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
});
