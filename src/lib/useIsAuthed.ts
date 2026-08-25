"use client";

import { useConvexAuth } from "convex/react";

/**
 * Whether the Convex client currently holds a valid session.
 *
 * Every authenticated query must be gated on this, because our queries throw
 * for an unauthenticated caller and a throwing `useQuery` takes the whole
 * render down. The moment that matters is **sign-out**: `signOut()` resolves,
 * React re-renders while the user is still on a protected page, and any query
 * still mounted throws before the redirect lands — leaving the error boundary
 * instead of the sign-in form.
 *
 * The rule this encodes, learned twice now: never issue a query the viewer is
 * not allowed to make.
 */
export function useIsAuthed(): boolean {
  const { isAuthenticated } = useConvexAuth();
  return isAuthenticated;
}
