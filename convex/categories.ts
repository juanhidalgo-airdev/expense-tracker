import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * Categories offered on the submission form.
 *
 * Sourced from a seeded table rather than hard-coded, so making them
 * configurable later is a data change. Retired categories (`isActive: false`)
 * disappear from the form while existing expenses keep referencing them.
 */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("categories"),
      key: v.string(),
      label: v.string(),
    }),
  ),
  handler: async (ctx) => {
    // Signed-in users only: the category list is not public information.
    await requireUser(ctx);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_active_and_sortOrder", (q) => q.eq("isActive", true))
      .collect();

    return categories.map((category) => ({
      _id: category._id,
      key: category.key,
      label: category.label,
    }));
  },
});
