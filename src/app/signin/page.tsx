"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    formData.set("flow", "signIn");

    try {
      await signIn("password", formData);
      router.push("/");
    } catch {
      // Deliberately non-specific: never reveal whether the email exists.
      setError("Email or password is incorrect.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Expense Tracker</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Sign in to submit and review expenses.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/50 focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/50 focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>

          {error !== null && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-xs text-black/60 dark:text-white/60">
          Accounts are provisioned by an administrator. There is no self-service sign-up.
        </p>
      </div>
    </main>
  );
}
