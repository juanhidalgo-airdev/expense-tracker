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
| Phase 1 — Foundation and deployed skeleton | 🟡 Verified locally end to end. Remaining: GitHub repo, Vercel project, Convex prod — all need account access |
| Phase 2 — Data model, authorization, seed | ✅ Schema, permissions, transitions, events, money/dates, full seed, 78 tests green |
| Phase 3 — Expense submission | ⬜ Not started |
| Phase 4 — Employee expense views | ⬜ Not started |
| Phase 5 — Manager review and decisions | ⬜ Not started |
| Phase 6 — Polish, edge cases, e2e | ⬜ Not started |
| Phase 7 — Security audit | ⬜ Not started |
| Phase 8 — Deliverable and submission | ⬜ Not started |

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
| Convex Auth account provisioning (`createAccount`) | ✅ **Retired locally.** Seeded account signs in; `users` + `authAccounts` both written; password stored as a salted scrypt hash; seed is idempotent. Still to prove on the deployed URL |
| Convex deployment | ✅ `dev:brainy-toucan-176` — team `juan-hidalgo-lozano`, project `expense-tracker`. `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` set |
| Self-service sign-up blocked | ✅ Verified by calling `auth:signIn` with `flow: "signUp"` directly — rejected, no user created |
| GitHub repo | ✅ `juanhidalgo-airdev/expense-tracker` — **private**, flip to public in Phase 8 |
| Convex prod | ✅ `clever-mosquito-451`. Auth keys **not yet set** — needs the Vercel origin for `SITE_URL` |
| Vercel | ⬜ Dashboard import — needs a production deploy key from the Convex dashboard |

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
