import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";
import { DataModel } from "./_generated/dataModel";

/**
 * Email + password authentication.
 *
 * There is no self-service sign-up in this application: accounts are
 * provisioned by `convex/seed.ts`. The Password provider still exposes a
 * `signUp` flow on a public endpoint, so we close it explicitly here rather
 * than relying on the `users` schema rejecting an incomplete insert. Without
 * this, anyone could POST `flow: "signUp"` and create themselves an account.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        if (params.flow === "signUp") {
          throw new ConvexError(
            "Self-service sign-up is disabled. Accounts are provisioned by an administrator.",
          );
        }

        const email = params.email;
        if (typeof email !== "string" || email.length === 0) {
          throw new ConvexError("Email is required.");
        }

        // Only `email` is used by the sign-in flow, which looks the account up
        // by it. `role` and `isActive` are here to satisfy the profile type;
        // they are never persisted, because the only path that would write a
        // new user — signUp — throws above.
        return {
          email: email.toLowerCase().trim(),
          role: "employee" as const,
          isActive: true,
        };
      },
    }),
  ],
});
