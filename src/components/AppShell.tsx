"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Application shell.
 *
 * Navigation is driven by the role the server reports, never by client state:
 * the Review link appears because `getCurrentUser` said `manager`. Hiding it
 * from an employee is presentation only — the route and every function behind
 * it enforce the same rule server-side.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const user = useQuery(api.users.getCurrentUser);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const pathname = usePathname();

  const links = [
    { href: "/expenses", label: "My expenses" },
    { href: "/expenses/new", label: "New expense" },
    ...(user?.role === "manager" ? [{ href: "/review", label: "Review" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 dark:border-white/15">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/expenses" className="text-sm font-semibold tracking-tight">
            Expense Tracker
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-black/5 font-medium dark:bg-white/10"
                      : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-black/60 sm:inline dark:text-white/60">
                {user.name ?? user.email}
                {user.role === "manager" && (
                  <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium dark:bg-white/10">
                    Manager
                  </span>
                )}
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push("/signin");
              }}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
