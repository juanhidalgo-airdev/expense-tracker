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

  const isManager = user?.role === "manager";

  // Review comes first for managers: reviewing is what they open this app to
  // do, and work waiting on them outranks their own expenses.
  const links = [
    ...(isManager ? [{ href: "/review", label: "Review" }] : []),
    { href: "/expenses", label: "My expenses" },
    // The one call to action in the header, styled as a solid button.
    { href: "/expenses/new", label: "New expense", accent: true },
  ];

  /** The wordmark goes wherever "home" means for this role. */
  const homeHref = isManager ? "/review" : "/expenses";

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 dark:border-white/15">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href={homeHref} className="text-sm font-semibold tracking-tight">
            Expense Tracker
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            {links.map((link) => {
              const active = pathname === link.href;

              // #FFB238 is the app's single accent colour and appears nowhere
              // else. Its job is to make one action obvious, which only works
              // while nothing competes with it.
              //
              // Text is near-black rather than white deliberately: #171717 on
              // #FFB238 is about 10:1, while white on it is about 1.8:1 and
              // would fail WCAG outright. Hover dims rather than shifting hue,
              // so no second shade creeps in.
              const className = link.accent
                ? `rounded-md bg-[#FFB238] px-3 py-1.5 text-sm font-medium text-[#171717] transition-opacity hover:opacity-90 ${
                    active ? "ring-2 ring-[#FFB238]/40 ring-offset-2 ring-offset-background" : ""
                  }`
                : `rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-black/5 font-medium dark:bg-white/10"
                      : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
                  }`;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={className}
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
