# Development Plan — Internal Expense Tracker

**Branch:** `main`
**Window:** three days from receipt of the client's answers (received 2026-08-24).
**Scope reference:** [feature-summary.md](feature-summary.md) (what) · [infrastructure.md](infrastructure.md) (how) · [questions.md](questions.md) (why — the settled requirements record).

## Process notes

Built with the Airdev `create_build_phases` process, adapted for this exercise:

- **No prototypes exist**, so the standard *Promote Prototypes* and *Archive Prototypes* phases drop out. UI is built directly from the feature summary against shadcn/ui primitives.
- **One environment, not two.** The house default is a dev/prod split with two Vercel URLs and two Convex deployments. For a three-day exercise with a single submitted URL, that is overhead with no payoff: local dev plus one production deployment. Recorded in `infrastructure.md` §9 as a deliberate deviation.
- **Auth is Convex Auth, not the WorkOS default** — the client chose it explicitly.
- **The security audit phase is kept**, second to last, per house process and because the authorization model is the substance of this app.
- Phases are ordered risk-first rather than strictly infrastructure-first. The reasoning is in "Direction & assumptions" below.

---

## Direction & assumptions

Every architectural decision was settled before planning; the record is in `questions.md`. The ones that shape these phases:

| Area | Direction |
| --- | --- |
| Backend | Convex — database, server functions, file storage. No REST/tRPC layer, no separate object store. |
| Auth | Convex Auth (`@convex-dev/auth`), password provider. **No signup screen** — every account comes from the seed script. |
| Data model | `users`, `categories`, `expenses`, `expenseEvents`. No `managerId`, no `orgId`, no `approvalSteps`. |
| Authorization | Resolved server-side on every function. One authority: `canView` / `canEdit` / `canWithdraw` / `canDecide`. Any manager decides any expense except their own. |
| Testing | Convex function tests for the authorization matrix and the transition map, unit tests for money/date helpers, one Playwright happy path, a committed manual QA script. Written inside the phase that produces the code, not as a cleanup pass. |
| Frontend | Next.js App Router, client components with `useQuery` as the default, Tailwind + shadcn/ui, react-hook-form + Zod mirrored by Convex validators. |
| Money | Integer minor units + per-expense ISO-4217 currency, `Intl` formatting everywhere. |

**The build-order risk that dictates the sequence:** with no signup screen, the seed script is the only way any user can exist — and a Convex Auth password account cannot be created with a plain `db.insert`. If that provisioning path does not work, the application has no users and nothing else can be demonstrated. It is retired in Phase 1, on day one, against the deployed URL. Everything else is downstream of it.

---

## Phases

### Phase 1 — Foundation and deployed walking skeleton
**Day 1, first half. Depends on: nothing. This is the risk-retirement phase.**

Scaffold the project, wire Convex Auth, and get a seeded account signing in **on the live URL** before any feature work exists.

1. `create-next-app` with TypeScript, Tailwind, App Router at the repo root; initialise shadcn/ui. Move the four planning docs into `/docs`.
2. `npx convex dev`; minimal `schema.ts` with `users` only.
3. Install and configure `@convex-dev/auth` with the Password provider — **verify the current API against live docs before writing against it**; pin exact versions and commit the lockfile.
4. `convex/seed.ts` as an **`internalAction`** creating **one** account via `createAccount` from `@convex-dev/auth/server`. *(Verified: it exists at v0.0.95 and takes an ActionCtx — hence an action, not the mutation this plan originally assumed.)*
5. `/signin` page and `convexAuthNextjsMiddleware` route protection. No signup route.
6. Vercel project; `CONVEX_DEPLOY_KEY`; build command `npx convex deploy --cmd "next build"`; `NEXT_PUBLIC_CONVEX_URL`, `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` set.
7. Deploy. Run the seed against production.

**Exit criteria:** sign in as a seeded account **on the deployed Vercel URL**, not localhost, and land on an authenticated placeholder page. If step 4 fails, fall back to an unlinked signup route or a dashboard-invoked mutation — and decide that on day one, not day three.

### Phase 2 — Data model, authorization core, and full seed
**Day 1, second half. Depends on: Phase 1.**

The complete schema and the single authorization authority, with tests. No UI in this phase.

1. `schema.ts`: `users`, `categories`, `expenses`, `expenseEvents` with every index — including `by_status_and_submittedAt` (manager queue) and `by_user_and_expenseDate` (duplicate warning).
2. `convex/lib/auth.ts` — `requireUser`, `requireManager`; `permissions.ts` — `canView` / `canEdit` / `canWithdraw` / `canDecide`; `transitions.ts` — the allowed-transition map.
3. `lib/money.ts` and `lib/dates.ts`: minor-unit parsing/formatting via `Intl`, calendar-date vs. timestamp helpers.
4. `events.ts` — internal append-only history writer, including field-level before/after on edits.
5. Extend the seed: **two managers, two employees**, five categories (the client's four plus `Other`), expenses across all four statuses.
6. Tests: the authorization matrix (four actor types × seven actions × four statuses), the transition map, and unit tests for money and dates.

**Exit criteria:** authorization and transition tests green; seeded data visible in the Convex dashboard; `canDecide` refuses a manager their own expense.

### Phase 3 — Expense submission
**Day 2, first half. Depends on: Phase 2.**

The employee's create-and-submit path, including receipt upload — the riskiest remaining integration.

1. `receipts.ts`: `generateUploadUrl` (authenticated), server-side re-validation of type and size against `_storage`, `getReceiptUrl` gated by `requireVisible`.
2. `expenses.ts`: `createExpense`, `updateExpense`, `submitExpense` — each writing a history event.
3. Duplicate-warning query on `by_user_and_expenseDate` — advisory, never blocking.
4. `/expenses/new`: react-hook-form + Zod, category select sourced from the `categories` table, tolerant money input, expense-date picker, receipt upload with progress and replace-before-submit.
5. Draft save and submit as distinct actions.

**Exit criteria:** an employee creates a draft, uploads a receipt, sees a duplicate warning on a repeat amount+date, and submits. Orphaned-upload path understood and handled.

### Phase 4 — Employee expense views
**Day 2, second half. Depends on: Phase 3.**

1. `/expenses`: paginated list scoped server-side to the owner, status filter, description search, status badges.
2. `/expenses/[id]`: all fields, receipt viewer (inline images, PDF view, download), history timeline.
3. Withdraw → draft → edit → resubmit, each recorded in the history.
4. Empty, loading, and error states for both views.

**Exit criteria:** an employee sees only their own expenses; opening another user's expense by ID fails cleanly; withdraw-edit-resubmit round-trips with a correct, readable history.

### Phase 5 — Manager review and decisions
**Day 2 end into Day 3, first half. Depends on: Phase 4.**

1. `/review`: Pending (default, oldest first) and Decided tabs, status filter, search by description or submitter — every pending expense company-wide.
2. Detail-view decision panel: approve, or reject with a **required** non-blank note; confirmation showing amount and submitter, because decisions are irreversible.
3. Server guards: `canDecide`, status re-checked inside the mutation, self-approval refused, history event written.
4. Tests: two simultaneous decisions produce one success and one clean "already decided"; a manager cannot decide their own expense by direct API call.

**Exit criteria:** manager approves and rejects; the employee sees the outcome and the note without a refresh; a manager's own expense is visible in the queue but not actionable by them.

### Phase 6 — Polish, edge cases, and end-to-end
**Day 3, first half. Depends on: Phase 5.**

1. Sweep every list and action for empty, loading, error, and success states.
2. Responsive pass down to phone width; keyboard navigation; labelled controls.
3. Locale audit: no hardcoded `$`, no `en-US`, no hand-built date strings; zero-decimal currency handled.
4. One Playwright happy path: employee submits with a receipt → manager approves → employee sees it.
5. Write and commit the manual QA script.

**Exit criteria:** e2e green; the QA script walks cleanly on a phone-width viewport.

### Phase 7 — Security audit
**Day 3, second half. Depends on: Phase 6.** *(House process: always second to last.)*

Run the `security_audit` skill across everything built. Particular attention to the areas this app's answers created: every manager can see every receipt in the company, so the employee boundary is the only scoping rule; receipt URLs are capability URLs; there is no sign-in throttling; and the submitted test credentials are public by design, so seeded data must contain nothing real.

**Exit criteria:** findings triaged, anything exploitable fixed, accepted risks written down rather than left silent.

### Phase 8 — Deliverable preparation and submission
**Day 3, end. Depends on: Phase 7.**

1. `README.md`: what the app is, setup steps, how to run and seed locally, the decisions worth knowing, and the test credentials.
2. `.env.example` with every required variable — **verified by cloning fresh and following the README**, not by inspection.
3. Final deploy; confirm `/docs` and the decision log are committed; repo is public.
4. Smoke test **on the deployed URL**: employee submits with a real photo → manager rejects with a note → employee corrects and resubmits → approved. Then the two rules the client's answers created: a manager submits and *cannot* approve their own; the second manager can.
5. Send one message: repo link, live URL, and both sets of credentials.

**Exit criteria:** every box in `infrastructure.md` §13 ticked, each verified against the live URL rather than localhost.

---

## Sequencing at a glance

| Day | Phases | The point of the day |
| --- | --- | --- |
| **1** | 1, 2 | Kill the auth-seeding risk on a real deployment, then lay the schema and authorization core with tests. No visible features — deliberately. |
| **2** | 3, 4, 5 (start) | The whole employee path, then the manager path. By end of day the core loop works locally. |
| **3** | 5 (finish), 6, 7, 8 | Decisions hardened, polish, security audit, deliverable verified against the live URL. |

**If a day slips**, the order of sacrifice is: the Playwright e2e (Phase 6.4) before the manual QA script; polish before edge cases; nothing in Phases 1, 2, 5, or 8. The authorization tests and the deployed-URL verification are not negotiable — they are the two things the brief says are being evaluated.
