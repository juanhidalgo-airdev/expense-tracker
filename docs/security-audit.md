# Security Audit — Phase 7

**Branch:** `main` · **Date:** 2026-08-24 · **Scope:** everything written in Phases 1–6 (`convex/`, `src/`, `scripts/`).

## Summary

| Severity | Count |
| --- | --- |
| Critical | 1 (fixed) |
| High | 2 (1 fixed, 1 accepted) |
| Medium | 2 |
| Low | 3 |

---

## Critical

### C1 — `vitest` arbitrary file read/execute (GHSA, `vitest <3.2.6`)
- **File:** `package.json` — pinned `vitest@3.2.4`
- **Issue:** when the Vitest **UI server** is listening, an arbitrary file can be read and executed.
- **Risk:** developer-machine compromise. This is a `devDependency`; it is not part of the deployed application and cannot be reached by an end user.
- **Mitigating factor:** we never run `vitest --ui`. The suite runs headless via `vitest run`.
- **Fix:** bump to `3.2.7` — a patch release, no API change.
- **Status:** ✅ **Fixed.** Pinned `vitest@3.2.7`; all 116 tests still pass. `npm audit` now reports 0 critical.

---

## High

### H1 — No clickjacking protection on a state-changing approval UI
- **File:** `next.config.ts` — no `headers()` configured
- **Issue:** no `X-Frame-Options` and no CSP `frame-ancestors`, so any site can embed this app in an iframe.
- **Risk:** this matters more here than in a typical CRUD app. A signed-in manager could be lured to an attacker page that frames the real app, overlays it, and harvests a click onto **Approve** — committing a financial decision that, by design, **cannot be reversed**.
- **Fix:** send `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'`, along with `X-Content-Type-Options: nosniff` and a `Referrer-Policy`.
- **Status:** ✅ **Fixed** in `next.config.ts`. Verified on a live response: all five headers present, app unaffected.

### H2 — `next` → `postcss` / `sharp` advisories, no non-major fix
- **File:** `package.json` — `next@15.5.23`
- **Issue:** three high advisories reached transitively: PostCSS XSS-in-stringify and `sourceMappingURL` arbitrary `.map` file read; `sharp`/libvips CVEs. `npm audit` resolves them only by upgrading to Next 16.
- **Risk assessment — low in this application.** PostCSS runs at **build time** over CSS we author, never over user input. `sharp` backs `next/image`, and **no user-supplied image passes through it**: receipts are rendered with a plain `<img>` pointed at Convex storage, deliberately bypassing the image optimiser.
- **Why not upgrade:** Next 16 is ruled out — `@convex-dev/auth` is `0.0.x`, declares no `next` peer constraint, and its middleware is untested against 16. Trading a theoretical build-time issue for a broken auth layer is a bad trade.
- **Fix:** accept and document; revisit when Convex Auth states Next 16 support.
- **Status:** ✅ Accepted with reasoning

---

## Medium

### M1 — Auth tokens are stored in `localStorage`
- **File:** library behaviour — `@convex-dev/auth` React client
- **Issue:** verified in the running app: `__convexAuthJWT_*` and `__convexAuthRefreshToken_*` live in `localStorage`, readable by any script on the origin.
- **Risk:** if an XSS vulnerability ever existed, session tokens could be exfiltrated. httpOnly cookies would not be readable this way.
- **Assessment:** this is the library's design for its client-side flow, not something we introduced, and changing it means abandoning the reactive client. The XSS surface is currently **zero** — React escapes all output, there is no `dangerouslySetInnerHTML`, no user-supplied HTML is rendered, and no third-party scripts are loaded.
- **Fix:** keep the XSS surface at zero and add the CSP in H1/M2 as defence in depth. Record as a known property of the stack.
- **Status:** ✅ Accepted with reasoning

### M2 — No Content-Security-Policy for scripts and styles
- **File:** `next.config.ts`
- **Issue:** only `frame-ancestors` is proposed in H1. There is no `script-src`/`style-src` policy.
- **Risk:** a full CSP is the main thing that would blunt M1 if an XSS ever appeared.
- **Why deferred:** Next.js inlines bootstrap scripts, so a strict `script-src` needs per-request nonces via middleware. That is real work with real breakage risk, and the middleware here is already the least-battle-tested part of the stack (beta Convex Auth).
- **Fix:** documented as the next hardening step, with `frame-ancestors` and `nosniff` shipped now.
- **Status:** ✅ Deferred with reasoning

---

## Low

### L1 — Client-side error logging
- **File:** `src/app/error.tsx`
- **Issue:** `console.error(error)` logs the full error object in the browser.
- **Assessment:** our errors are `ConvexError`s carrying messages we authored; none contain PII. Internal errors are never surfaced to the user — the UI shows a generic message and only `ConvexError.data` is ever displayed.
- **Status:** ✅ Accepted

### L2 — Seeded credentials are publicly known
- **File:** `convex/seed.ts`, `docs/progress-tracker.md`, `README`
- **Issue:** four accounts share the password `Expense2026!demo`, published with the submission.
- **Assessment:** **required by the brief** — reviewers must be able to log straight in. The compensating control is that all seeded data is fictional: invented names, generated placeholder receipts, no real personal data anywhere in the deployment.
- **Status:** ✅ Accepted by design

### L3 — Receipt URLs are bearer capabilities
- **File:** `convex/receipts.ts`
- **Issue:** `ctx.storage.getUrl()` returns a long, unguessable, **unauthenticated** URL. Anyone holding it can fetch the file.
- **Assessment:** the control is the query that issues it — `getReceiptUrl` refuses callers who cannot view the expense, verified by test. Once issued, the URL is a capability. It is never logged, never placed in a query string of ours, and never emailed.
- **Hardening path:** proxy every fetch through an authenticated HTTP action with a short-lived signed token (`infrastructure.md` §7, option B). Costs the CDN and needs a token in the URL because `<img>` cannot send an `Authorization` header.
- **Status:** ✅ Accepted with reasoning

---

## Verified clean

Checked, with evidence, and found sound:

| Area | Evidence |
| --- | --- |
| **Authentication on every endpoint** | All 16 public functions call `requireUser`/`requireManager` before touching data. `approve`/`reject` go through `decide()`, which calls `requireManager` first. `getCurrentUser` returns `null` rather than throwing, by design |
| **Authorization is server-side** | `canView`/`canEdit`/`canWithdraw`/`canDecide` are the single authority; the UI renders from flags the server computed and never re-derives a rule |
| **No IDOR** | Object-level checks on every by-ID read. "Not yours" and "does not exist" return the **same** response, so ids cannot be probed. Verified in the browser as a second employee |
| **Cross-user data isolation** | `listMine` is index-scoped to the owner, not fetch-then-filter. Proven by test and in the running app |
| **Privilege escalation** | Roles live in the database, never in a token claim or client state. No endpoint accepts a role or actor id as an argument |
| **Self-approval** | Blocked in `decide()` before the status check; verified by test and in the UI |
| **Self-service sign-up** | Blocked server-side in `convex/auth.ts`; verified adversarially by calling `auth:signIn` with `flow: "signUp"` — refused, no user created |
| **Input validation** | All 16 public functions declare `args` validators. Server re-validates description, amount, date, category and receipt regardless of client checks |
| **File upload validation** | Type and size re-checked server-side against `_storage` metadata. `image/svg+xml` deliberately excluded — an SVG can carry script and receipts are opened directly |
| **Injection** | Convex has no query string concatenation. React escapes all output; no `dangerouslySetInnerHTML`, no `innerHTML` |
| **Open redirect** | Every `router.push` target is a literal or a server-issued id |
| **Password storage** | Handled entirely by the auth provider — salted scrypt hashes in `authAccounts`, confirmed by inspecting the table. Application code never sees, stores or logs a password |
| **User-existence leakage** | Wrong password and unknown email return the identical message |
| **Rate limiting** | Convex Auth throttles failed sign-ins at 10/hour per identifier via `authRateLimits` |
| **Secrets** | Only `.env.example` is committed, and it contains key names with no values. No hardcoded secrets in source |
| **Error leakage** | Only `ConvexError.data` — messages we wrote — reaches the user. Unexpected errors show a generic message |
| **Form hygiene** | `autoComplete="email"` / `"current-password"` on the sign-in form |
| **CSRF** | Convex mutations authenticate with a bearer token over the Convex client, not ambient cookies, so classic cross-site form CSRF does not apply |
