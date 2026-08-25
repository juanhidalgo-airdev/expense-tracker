import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { DataModel, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

/**
 * Account provisioning and demo data.
 *
 * With no sign-up screen, this is the ONLY way a user can come into existence,
 * which makes it infrastructure rather than a convenience.
 *
 * `run` must be an action, not a mutation: `createAccount` takes an ActionCtx
 * because password hashing cannot run inside a transaction. It writes both the
 * `users` row and the `authAccounts` credential record — a plain `db.insert`
 * into `users` would produce an account that can never sign in.
 *
 * Everything here is idempotent, so re-running is safe.
 *
 *   npm run seed
 */

const PASSWORD = "Expense2026!demo";

type SeedUser = {
  key: string;
  email: string;
  name: string;
  role: "employee" | "manager";
};

/**
 * Four accounts, not the two the brief asks for.
 *
 * A single manager cannot demonstrate the rule that matters most: managers
 * submit expenses like anyone else and cannot approve their own. With one
 * manager, their own expense could never be approved by anyone, so a reviewer
 * would have to take the rule on trust. The second employee makes cross-user
 * isolation visible for the same reason.
 */
const SEED_USERS: SeedUser[] = [
  { key: "employee", email: "employee@expensetracker.test", name: "Erin Employee", role: "employee" },
  { key: "manager", email: "manager@expensetracker.test", name: "Maya Manager", role: "manager" },
  { key: "employee2", email: "elliot@expensetracker.test", name: "Elliot Employee", role: "employee" },
  { key: "manager2", email: "marcus@expensetracker.test", name: "Marcus Manager", role: "manager" },
];

/** Stand-in receipt, so seeded expenses are not visibly incomplete. */
const PLACEHOLDER_RECEIPT = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480">
  <rect width="360" height="480" fill="#fdfdfb"/>
  <rect x="24" y="24" width="312" height="432" fill="#fff" stroke="#e5e5e0"/>
  <text x="180" y="96" font-family="monospace" font-size="20" text-anchor="middle" fill="#333">SAMPLE RECEIPT</text>
  <text x="180" y="128" font-family="monospace" font-size="12" text-anchor="middle" fill="#888">seeded demo data</text>
  <line x1="56" y1="160" x2="304" y2="160" stroke="#e5e5e0"/>
  <text x="56" y="196" font-family="monospace" font-size="13" fill="#555">Item .................... 1</text>
  <text x="56" y="224" font-family="monospace" font-size="13" fill="#555">Tax ..................... 0</text>
  <line x1="56" y1="248" x2="304" y2="248" stroke="#e5e5e0"/>
  <text x="56" y="280" font-family="monospace" font-size="13" fill="#333">TOTAL</text>
  <text x="180" y="400" font-family="monospace" font-size="11" text-anchor="middle" fill="#aaa">no real personal data</text>
</svg>`;

export const run = internalAction({
  args: {},
  returns: v.object({
    usersCreated: v.array(v.string()),
    usersSkipped: v.array(v.string()),
    categories: v.number(),
    expenses: v.number(),
  }),
  // The explicit return type is required, not stylistic: the handler
  // references `internal`, whose type covers every module including this one,
  // so inferring it would be circular. Annotating breaks the cycle at the root.
  handler: async (
    ctx,
  ): Promise<{
    usersCreated: string[];
    usersSkipped: string[];
    categories: number;
    expenses: number;
  }> => {
    const usersCreated: string[] = [];
    const usersSkipped: string[] = [];
    const userIds: Record<string, Id<"users">> = {};

    for (const user of SEED_USERS) {
      const email = user.email.toLowerCase();

      const existing = await ctx.runQuery(internal.users.getByEmail, { email });
      if (existing !== null) {
        userIds[user.key] = existing;
        usersSkipped.push(email);
        continue;
      }

      const created = await createAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: email, secret: PASSWORD },
        profile: { email, name: user.name, role: user.role, isActive: true },
      });

      userIds[user.key] = created.user._id as Id<"users">;
      usersCreated.push(email);
    }

    // Actions can write to file storage; mutations cannot.
    const receiptStorageId = await ctx.storage.store(
      new Blob([PLACEHOLDER_RECEIPT], { type: "image/svg+xml" }),
    );

    // seedData lives in its own module: an action calling a mutation defined
    // beside it makes the generated api type self-referential.
    const { categories, expenses } = await ctx.runMutation(internal.seedData.seedData, {
      userIds: {
        employee: userIds.employee,
        manager: userIds.manager,
        employee2: userIds.employee2,
        manager2: userIds.manager2,
      },
      receiptStorageId,
    });

    return { usersCreated, usersSkipped, categories, expenses };
  },
});
