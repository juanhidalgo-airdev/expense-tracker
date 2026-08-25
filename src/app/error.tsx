"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Earlier in the build, an employee opening /review took the whole render down:
 * a Convex query that throws for an unauthorised caller propagates as a render
 * error. That specific case is fixed at the source by skipping the query, but
 * the class of problem is not — any query can throw. This turns a white screen
 * into something a user can act on, and keeps the details out of their face.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Goes to the browser console and Vercel's logs, not to the user.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          The page could not be loaded. This has been logged.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/expenses"
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Back to my expenses
          </Link>
        </div>
      </div>
    </main>
  );
}
