#!/usr/bin/env node
/**
 * Runs the suite at both timezone extremes.
 *
 * Dates are the classic place this app could break: `expenseDate` is a calendar
 * date, and anything that round-trips it through a timestamp shifts a day for
 * users far from UTC. Running at UTC+13 and UTC-11 catches that without anyone
 * having to change their machine clock — and unlike a one-off manual check, it
 * is repeatable and belongs in CI.
 *
 *   npm run test:timezones
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const vitest = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");

const ZONES = [
  ["Pacific/Auckland", "UTC+13 — ahead of UTC, where 'today' is tomorrow in UTC"],
  ["Pacific/Midway", "UTC-11 — behind UTC, where 'today' is yesterday in UTC"],
  ["UTC", "the baseline"],
];

let failed = false;

for (const [tz, why] of ZONES) {
  process.stdout.write(`\n=== TZ=${tz} (${why}) ===\n`);
  try {
    execFileSync(process.execPath, [vitest, "run"], {
      stdio: "inherit",
      env: { ...process.env, TZ: tz },
    });
  } catch {
    failed = true;
    process.stdout.write(`FAILED under TZ=${tz}\n`);
  }
}

process.exit(failed ? 1 : 0);
