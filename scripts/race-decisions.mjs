#!/usr/bin/env node
/**
 * Proves two managers cannot both decide the same expense.
 *
 * The manual QA script (section 6) asks for two simultaneous browser sessions,
 * which one browser profile cannot provide. This is stricter anyway: two real
 * session tokens firing at the same expense in the same tick, so the calls
 * genuinely overlap rather than merely arriving close together.
 *
 * Expectation: exactly one decision commits. The loser is refused with a
 * message saying so — not silently ignored, and never overwriting the winner.
 *
 * Getting the tokens: sign in as each manager, then in the browser console read
 * `localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('__convexAuthJWT_')))`.
 * They expire in an hour, so grab them just before running.
 *
 *   node scripts/race-decisions.mjs <convexUrl> <expenseId> <tokenA> <tokenB>
 */

import { ConvexHttpClient } from "convex/browser";

const [url, expenseId, tokenA, tokenB] = process.argv.slice(2);

if (!url || !expenseId || !tokenA || !tokenB) {
  console.error("Usage: node scripts/race-decisions.mjs <convexUrl> <expenseId> <tokenA> <tokenB>");
  process.exit(2);
}

function client(token) {
  const c = new ConvexHttpClient(url);
  c.setAuth(token);
  return c;
}

// Both dispatched before either is awaited.
const results = await Promise.allSettled([
  client(tokenA).mutation("expenses:approve", { expenseId }),
  client(tokenB).mutation("expenses:reject", { expenseId, note: "Race test — rejecting." }),
]);

const summary = results.map((r, i) => ({
  who: i === 0 ? "manager A (approve)" : "manager B (reject)",
  outcome: r.status,
  error: r.status === "rejected" ? String(r.reason?.message ?? r.reason).slice(0, 200) : null,
}));

const winners = results.filter((r) => r.status === "fulfilled").length;
console.log(JSON.stringify({ summary, winners }, null, 1));

if (winners !== 1) {
  console.log(`\nFAIL: expected exactly one winner, got ${winners}.`);
  process.exit(1);
}
console.log("\nPASS: one decision committed, the other refused.");
