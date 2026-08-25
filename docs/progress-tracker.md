# Progress Tracker — Internal Expense Tracker

**Branch:** `main` · **Started:** 2026-08-23 · **Build window:** three days from 2026-08-24.

## Status

| Stage | State |
| --- | --- |
| Brief captured (video + written PDF) | ✅ Done — 2026-08-23 |
| Scope documented | ✅ `feature-summary.md` |
| Technical direction documented | ✅ `infrastructure.md` |
| Clarifying questions sent | ✅ 2026-08-23 |
| Client answers received | ✅ 2026-08-24 — recorded in `questions.md` |
| Development plan created | ✅ `development-plan.md` |
| Phase 1 — Foundation and deployed skeleton | ✅ **Complete.** Seeded credential signs in on the live production URL |
| Phase 2 — Data model, authorization, seed | ✅ Schema, permissions, transitions, events, money/dates, full seed, 78 tests green |
| Phase 3 — Expense submission | ✅ Backend + form UI, receipt upload, duplicate warning. Verified in browser end to end |
| Phase 4 — Employee expense views | ✅ Detail view, receipt viewer, history timeline, withdraw/edit/resubmit, status filter + search |
| Phase 5 — Manager review and decisions | ✅ Queue with Pending/Decided tabs, approve/reject with confirmation, self-approval blocked, 116 tests |
| Phase 6 — Polish, edge cases, QA | ✅ Error boundary, 404, keyboard focus rings, responsive verified at 375px, manual QA script. Playwright e2e removed — see below |
| Phase 7 — Security audit | ✅ 1 critical + 1 high fixed; rest accepted with recorded reasoning. docs/security-audit.md |
| Phase 8 — Deliverable and submission | 🟡 README done, prod reset + re-seeded, prod smoke test passed including receipt upload. **Remaining: flip repo public** |

## Direction decisions

Settled before planning. Full reasoning in `questions.md`; these are the ones every phase inherits.

| Area | Decision | Source |
| --- | --- | --- |
| Backend | Convex — database, server functions, file storage | Brief (mandated) |
| Auth provider | Convex Auth, password provider. **Not** WorkOS (house default) or Clerk | Client |
| Account creation | **No signup screen.** Seed script only; accounts set up manually | Client, Q4 |
| Roles | `employee`, `manager`. No admin role, no admin portal | Client, Q3 |
| Manager rights | Managers submit like employees; any manager decides any expense; nobody decides their own | Client, Q1 + Q2 |
| Org structure | None. No `managerId`, no reporting lines, no `orgId` | Client, Q2 |
| Statuses | `draft` → `submitted` → `approved` \| `rejected`. Decisions are final | Client Q9 + our Q6 |
| Editing | Pending expenses locked; withdraw → edit → resubmit. Rejected expenses corrected on the same record | Ours, Q7 + Q8 |
| Categories | Seeded table: travel, meals, software, office supplies (client) + `Other` (ours) | Client Q12 + ours |
| History | Append-only event log, actor + timestamp + note, field-level before/after on edits, same view for both roles | Ours, Q23 |
| Receipts | Exactly one, required, ≤10 MB; URL handed out by an authorization-gated query | Ours, Q15 |
| Money | Integer minor units + per-expense ISO-4217 code; `Intl` formatting; single-currency UI | Ours, Q13 |
| Out of scope | Email, export, KPIs, bulk actions, thresholds, reversal, `paid` state, password reset, MFA, multi-level approvals, multi-country features | Client + ours |
| Testing | Convex function tests for authz matrix and transitions, unit tests for money/dates, one Playwright path, committed QA script — written inside each phase | Ours, Q31 |
| Environments | Local dev + one production deployment. **Deviates from the house dev/prod split** — no payoff at this size | Ours |
| Deploy timing | Walking skeleton live on day one, before feature work | Ours |

## Open items

| Item | Status |
| --- | --- |
| Add `Other` to the client's four categories | Decided yes. **Send Vlad a one-line heads-up** — he named a specific list |
| Convex Auth account provisioning (`createAccount`) | ✅ **Fully retired.** Verified end to end on production, not just locally |
| Convex deployment | ✅ `dev:brainy-toucan-176` — team `juan-hidalgo-lozano`, project `expense-tracker`. `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` set |
| Self-service sign-up blocked | ✅ Verified by calling `auth:signIn` with `flow: "signUp"` directly — rejected, no user created |
| GitHub repo | ✅ `juanhidalgo-airdev/expense-tracker` — **private**, flip to public in Phase 8 |
| Convex prod | ✅ `clever-mosquito-451` — functions deployed, auth keys + SITE_URL set, seeded (4 users, 5 categories, 6 expenses) |
| Vercel | ✅ `https://expense-tracker-opal-pi-28.vercel.app` — scope `juanhidalgo-3245s-projects`, publicly reachable |

## Verification findings (Phase 1)

Checked against the installed package rather than the docs, and two documented assumptions turned out wrong:

| Assumed | Actual |
| --- | --- |
| Seed is an `internalMutation` | Must be an **`internalAction`** — `createAccount` takes an ActionCtx, because password hashing cannot run inside a transaction |
| Auth tables are separate from an application-level `users` table | `authTables` **defines** `users`; our `role` / `isActive` / `country` extend it, and both library indexes must be reproduced by name |
| Latest Next.js is fine | **Pinned to Next 15.5.23.** `@convex-dev/auth` is 0.0.x with no `next` peer constraint; Next 16 is untested against its middleware |
| No sign-up screen means no sign-up | The Password provider exposes `signUp` on a public endpoint regardless. **Now blocked explicitly** in `convex/auth.ts` via `profile()` |

## Deviations from house process

- No `scope.md` / prototypes / `documentation.md` — this is a greenfield exercise, not an existing Airdev app. The three planning docs stand in for scope and documentation.
- *Promote Prototypes* and *Archive Prototypes* phases dropped: no prototypes exist.
- Single environment rather than dev + prod (see above).
- Convex Auth instead of the WorkOS default, at the client's direction.

## Environments

| | |
| --- | --- |
| Production app | `https://expense-tracker-opal-pi-28.vercel.app` |
| Vercel scope | `juanhidalgo-3245s-projects`. **Git-connected to `juanhidalgo-airdev/expense-tracker`** — pushes to `main` deploy to production automatically, PRs get preview deployments |
| Convex prod | `clever-mosquito-451` |
| Convex dev | `brainy-toucan-176` |
| Repo | `juanhidalgo-airdev/expense-tracker` (private until Phase 8) |

**Vercel Deployment Protection** applies to deployment-specific URLs (`*-<hash>-*.vercel.app`), which redirect to Vercel SSO. The **canonical production alias above is public** — verified with a 200 on `/signin`. The alias is what gets submitted.

### Seeded credentials (production)

Password for all four: `Expense2026!demo`

| Email | Name | Role |
| --- | --- | --- |
| `employee@expensetracker.test` | Erin Employee | employee |
| `manager@expensetracker.test` | Maya Manager | manager |
| `elliot@expensetracker.test` | Elliot Employee | employee |
| `marcus@expensetracker.test` | Marcus Manager | manager |

The first two are the pair the brief asks for. Marcus exists so a reviewer can watch Maya's own expense be approved by someone else; Elliot exists so cross-user isolation is visible rather than asserted.
