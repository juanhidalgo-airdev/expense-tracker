"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Light/dark toggle.
 *
 * The chosen theme is written to `data-theme` on <html> and remembered in
 * localStorage. An inline script in the layout applies it before first paint,
 * so switching or reloading never flashes the wrong theme.
 *
 * It renders nothing until mounted: the server cannot know which theme the
 * browser resolved, and rendering a guess would be a hydration mismatch. The
 * placeholder keeps the header from shifting when the real button appears.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing can refuse storage. The theme still applies for this
      // page load; it just will not be remembered.
    }
    setTheme(next);
  }

  if (theme === null) {
    return <div className="h-8 w-8" aria-hidden />;
  }

  const goingDark = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={goingDark ? "Switch to dark theme" : "Switch to light theme"}
      title={goingDark ? "Switch to dark theme" : "Switch to light theme"}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-black/15 transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-black/40 dark:border-white/20 dark:hover:bg-white/10 dark:focus-visible:ring-white/50"
    >
      {goingDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
