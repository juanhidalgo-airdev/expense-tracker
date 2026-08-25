"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Where signing in lands you, decided by role.
 *
 * A manager goes straight to the review queue — that is the job they open this
 * app to do, and anything waiting on them is more urgent than their own
 * expenses. Everyone else goes to their own list.
 *
 * This is a client component because the role comes from the database rather
 * than from the session token, so it cannot be known before the query resolves.
 * `replace` rather than `push` keeps this hop out of the back-button history.
 */
export default function HomePage() {
  const user = useQuery(api.users.getCurrentUser);
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) {
      return;
    }
    router.replace(user?.role === "manager" ? "/review" : "/expenses");
  }, [user, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
    </main>
  );
}
