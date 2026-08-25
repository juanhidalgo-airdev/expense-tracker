import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          That address does not lead anywhere in this app.
        </p>
        <Link
          href="/expenses"
          className="mt-6 inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Back to my expenses
        </Link>
      </div>
    </main>
  );
}
