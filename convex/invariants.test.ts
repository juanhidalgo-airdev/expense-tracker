// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Invariants that documentation asserts, expressed as tests.
 *
 * Four times during this build, a document described behaviour the code did not
 * have: pagination that was never implemented, an orphaned-file sweep that did
 * not exist, an "every read is index-backed" claim contradicted by a table
 * scan, and a draft-privacy rule the code did not enforce. Every one was caught
 * by a person asking a pointed question, never by a test.
 *
 * Tests verify code against code. Nothing verified prose against code — so
 * these do. They are deliberately crude: they read the source as text. A more
 * elegant approach would need a compiler pass, and crude checks that actually
 * run beat elegant ones that do not exist.
 */

const CONVEX_DIR = path.join(process.cwd(), "convex");
const DOCS_DIR = path.join(process.cwd(), "docs");

function convexSources(): Array<{ file: string; text: string }> {
  return readdirSync(CONVEX_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "schema.ts")
    .map((file) => ({ file, text: readFileSync(path.join(CONVEX_DIR, file), "utf8") }));
}

/** Splits a module into its exported function declarations. */
function exportedFunctions(text: string) {
  const parts = text.split(/\nexport const /).slice(1);
  return parts.map((part) => {
    const name = part.slice(0, part.indexOf(" "));
    const kind = /=\s*(internalQuery|internalMutation|internalAction|query|mutation|action)\(/.exec(
      part,
    )?.[1];
    return { name, kind, body: part };
  });
}

describe("every public function authenticates", () => {
  test("no public query, mutation or action reaches the database without an auth guard", () => {
    const offenders: string[] = [];

    for (const { file, text } of convexSources()) {
      for (const fn of exportedFunctions(text)) {
        if (!fn.kind || fn.kind.startsWith("internal")) {
          continue;
        }
        // `auth.ts` re-exports the library's own generated handlers.
        if (file === "auth.ts") {
          continue;
        }
        const guarded =
          /require(User|Manager)\(/.test(fn.body) ||
          // getCurrentUser resolves identity directly and returns null rather
          // than throwing, which is its documented behaviour.
          /getAuthUserId\(/.test(fn.body) ||
          // Decisions delegate to a helper that guards on the caller's behalf.
          /\bdecide\(/.test(fn.body);

        if (!guarded) {
          offenders.push(`${file}:${fn.name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("every public function declares an args validator", () => {
    const offenders: string[] = [];

    for (const { file, text } of convexSources()) {
      if (file === "auth.ts") continue;
      for (const fn of exportedFunctions(text)) {
        if (!fn.kind) continue;
        if (!/\bargs:\s*\{/.test(fn.body)) {
          offenders.push(`${file}:${fn.name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("reads are index-backed", () => {
  const schema = readFileSync(path.join(CONVEX_DIR, "schema.ts"), "utf8");

  test("every index named in scalability.md actually exists in the schema", () => {
    const doc = readFileSync(path.join(DOCS_DIR, "scalability.md"), "utf8");

    // Table rows of the form `expenses.by_user` in the index-coverage section.
    const claimed = [...doc.matchAll(/`(\w+)\.(by_\w+|email)`/g)].map((m) => m[2]);
    const unique = [...new Set(claimed)];
    expect(unique.length).toBeGreaterThan(4);

    const missing = unique.filter((index) => !schema.includes(`"${index}"`));
    expect(missing).toEqual([]);
  });

  test("no query filters on a field without going through an index", () => {
    // `.filter()` after `.query()` scans the table. It is legitimate only when
    // narrowing an already index-scoped read, so require withIndex nearby.
    const offenders: string[] = [];

    for (const { file, text } of convexSources()) {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!/\.filter\(\(q\)/.test(line)) return;
        const window = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
        if (!/withIndex\(/.test(window)) {
          offenders.push(`${file}:${i + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

describe("documented behaviour exists", () => {
  test("the orphaned-upload sweep infrastructure.md describes is real and scheduled", () => {
    const infra = readFileSync(path.join(DOCS_DIR, "infrastructure.md"), "utf8");
    expect(infra).toMatch(/sweepOrphanedUploads/);

    const receipts = readFileSync(path.join(CONVEX_DIR, "receipts.ts"), "utf8");
    expect(receipts).toMatch(/export const sweepOrphanedUploads = internalMutation/);

    // Documented as running nightly, so something must actually schedule it.
    const crons = readFileSync(path.join(CONVEX_DIR, "crons.ts"), "utf8");
    expect(crons).toMatch(/sweepOrphanedUploads/);
  });

  test("pagination claimed in infrastructure.md is implemented in both list queries", () => {
    const infra = readFileSync(path.join(DOCS_DIR, "infrastructure.md"), "utf8");
    expect(infra).toMatch(/paginationOptsValidator/);

    const expenses = readFileSync(path.join(CONVEX_DIR, "expenses.ts"), "utf8");
    const paginated = [...expenses.matchAll(/\.paginate\(/g)];
    expect(paginated.length).toBeGreaterThanOrEqual(2);
    expect(expenses).toMatch(/paginationOpts: paginationOptsValidator/);
  });

  test("the receipt allowlist excludes SVG, as the security audit states", () => {
    const validation = readFileSync(path.join(CONVEX_DIR, "lib", "validation.ts"), "utf8");
    const list = /ACCEPTED_RECEIPT_TYPES = \[([\s\S]*?)\]/.exec(validation)?.[1] ?? "";
    expect(list).not.toMatch(/svg/i);
    expect(list).toMatch(/image\/png/);
  });
});

describe("the client never issues a query it is not allowed to make", () => {
  test("every authenticated useQuery in src is gated on auth or an explicit skip", () => {
    const srcDir = path.join(process.cwd(), "src");
    const files: string[] = [];

    (function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) files.push(full);
      }
    })(srcDir);

    const offenders: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      // Every useQuery/usePaginatedQuery call must either pass "skip" somewhere
      // in its arguments or be the deliberately null-returning getCurrentUser.
      const calls = [...text.matchAll(/use(?:Paginated)?Query\(\s*api\.([\w.]+)([\s\S]{0,200}?)\)/g)];
      for (const call of calls) {
        const [, fnName, rest] = call;
        if (fnName === "users.getCurrentUser" && !/isAuthed/.test(rest)) {
          // Returns null rather than throwing for an anonymous caller.
          continue;
        }
        if (!/["']skip["']/.test(rest)) {
          offenders.push(`${path.relative(process.cwd(), file)} -> ${fnName}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
