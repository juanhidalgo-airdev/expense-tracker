import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

/**
 * Account provisioning.
 *
 * With no sign-up screen, this is the ONLY way a user can come into existence.
 * That makes it infrastructure rather than a convenience.
 *
 * Note this must be an `internalAction`, not a mutation: `createAccount` takes
 * an ActionCtx because password hashing cannot run inside a transaction. It
 * writes both the `users` row and the `authAccounts` credential record, which
 * is why a plain `db.insert` into `users` would produce an account that can
 * never sign in.
 *
 * Run with:  npx convex run seed:run
 */

type SeedUser = {
  email: string;
  password: string;
  name: string;
  role: "employee" | "manager";
};

/**
 * Phase 1 provisions a single account to prove the path end to end.
 * Phase 2 extends this list to two managers and two employees.
 */
const SEED_USERS: SeedUser[] = [
  {
    email: "employee@expensetracker.test",
    password: "Expense2026!demo",
    name: "Erin Employee",
    role: "employee",
  },
];

export const run = internalAction({
  args: {},
  returns: v.object({ created: v.array(v.string()), skipped: v.array(v.string()) }),
  handler: async (ctx) => {
    const created: string[] = [];
    const skipped: string[] = [];

    for (const user of SEED_USERS) {
      const email = user.email.toLowerCase();

      // Idempotent: re-running the seed must not fail or duplicate accounts.
      const existing = await ctx.runQuery(internal.users.getByEmail, { email });
      if (existing !== null) {
        skipped.push(email);
        continue;
      }

      await createAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: email, secret: user.password },
        profile: {
          email,
          name: user.name,
          role: user.role,
          isActive: true,
        },
      });

      created.push(email);
    }

    return { created, skipped };
  },
});
