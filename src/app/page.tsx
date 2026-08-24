"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";

/**
 * Phase 1 placeholder. Its only job is to prove the walking skeleton:
 * a seeded account signs in, and the server tells us who they are.
 * Replaced by the expense list in Phase 4.
 */
export default function HomePage() {
  const user = useQuery(api.users.getCurrentUser);
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Expense Tracker</h1>

        {user === undefined && (
          <p className="mt-4 text-sm text-black/60 dark:text-white/60">Loading…</p>
        )}

        {user === null && (
          <p className="mt-4 text-sm text-black/60 dark:text-white/60">Not signed in.</p>
        )}

        {user && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
              <p className="font-medium">{user.name ?? user.email}</p>
              <p className="text-black/60 dark:text-white/60">{user.email}</p>
              <p className="mt-2 inline-block rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-medium capitalize dark:bg-white/10">
                {user.role}
              </p>
            </div>

            <button
              onClick={async () => {
                await signOut();
                router.push("/signin");
              }}
              className="self-start rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
