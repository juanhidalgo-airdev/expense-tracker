# Expense Tracker

An internal expense tracker with an approval flow. Employees log expenses they have incurred, attach a receipt, and submit them; managers review the queue and approve or reject with a note. Every expense carries a status and an append-only history of what happened to it.

Built for the Airdev technical exercise.

---

## Try it

**Live app:** https://expense-tracker-opal-pi-28.vercel.app

Password for all accounts: `Expense2026!demo`

| Email | Who | Role |
| --- | --- | --- |
| `employee@expensetracker.test` | Erin Employee | employee |
| `manager@expensetracker.test` | Maya Manager | manager |

Two extra accounts are seeded, and they exist for a reason rather than as padding:

| Email | Who | Why it exists |
| --- | --- | --- |
| `marcus@expensetracker.test` | Marcus Manager | Managers cannot approve their own expenses. With only one manager, Maya's own pending expense could never be approved by anyone, so the rule would have to be taken on trust. Sign in as Marcus to watch him approve it |
| `elliot@expensetracker.test` | Elliot Employee | Makes cross-user isolation visible: Erin and Elliot cannot see each other's expenses, including by pasting a URL |

**A five-minute tour:** sign in as Erin → submit an expense with a photo → sign in as Maya → find it in Review → reject it with a reason → back as Erin, read the reason, correct it, resubmit → as Maya, approve. Then look at the History on that expense: the whole story is there, including what changed on the edit.

There is **no sign-up page**. Accounts are provisioned by the seed script, which is what the client asked for. Self-service sign-up is also blocked on the server, not merely absent from the UI.

---

## Running it locally

Requires Node 20+ and a [Convex](https://convex.dev) account.

```bash
npm install
npx convex dev          # creates your own Convex dev deployment, writes .env.local
npm run setup:auth      # generates the auth keys and sets SITE_URL on that deployment
npm run seed            # creates the four accounts, five categories, six expenses
npm run dev             # http://localhost:3000
```

`npx convex dev` writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local` for you. See [`.env.example`](.env.example) for every variable and where each one lives.

`npm run setup:auth` replaces the usual `npx @convex-dev/auth` step. That CLI rewrites `convex/auth.ts` and `convex/http.ts`, which would silently delete the sign-up block; the script generates the same RS256 key pair and sets the same three variables without touching source.

### Other commands

```bash
npm test              # 134 tests: unit, integration, and invariants
npm run test:timezones # the suite at UTC+13, UTC-11 and UTC, where dates break
npm run build         # production build
```

---

## How it is built

| Layer | Choice |
| --- | --- |
| Backend | **Convex** — database, server functions, file storage |
| Auth | **Convex Auth**, password provider |
| Frontend | **Next.js 15** (App Router), React 19, TypeScript, Tailwind |
| Tests | Vitest + `convex-test` (134), invariant tests over the docs, plus a manual QA script |
| Hosting | Vercel + Convex Cloud |

```
convex/
  schema.ts          tables and indexes
  auth.ts            password provider; sign-up blocked here
  expenses.ts        queries and mutations - the public surface
  receipts.ts        upload URLs and authorization-gated receipt access
  categories.ts      seeded category list
  seed.ts            account provisioning (an action - see below)
  seedData.ts        demo data + reset
  lib/
    auth.ts          requireUser / requireManager
    permissions.ts   canView / canEdit / canWithdraw / canDecide  <- the authority
    transitions.ts   the allowed status transitions
    validation.ts    server-side input rules
    events.ts        append-only history writer
src/
  app/               routes; middleware.ts guards them
  components/        UI
  lib/               money and date handling
docs/                planning, decisions, QA script, security audit
```

### The parts worth knowing about

**Authorization is one module.** `lib/permissions.ts` decides who may do what; queries return the results as capability flags, and the UI renders from those. Nothing re-derives a rule client-side, so the two cannot disagree. Hiding a button is presentation — every mutation re-checks independently.

**"Not yours" and "does not exist" are the same answer.** Probing expense IDs tells you nothing.

**Money is integer minor units plus an ISO-4217 code.** Never floats: `0.1 + 0.2` is a real bug in anything that sums expenses. One module parses and formats, and it handles zero-decimal currencies (JPY) because the client flagged multi-country as a future direction.

**`expenseDate` is a calendar date string, not a timestamp.** A date has no timezone. Stored as an instant, a Tokyo dinner shows up on the previous day for a London approver.

**Decisions are final and concurrency-safe.** Two managers clicking approve at the same moment produce one success and one clean "already been decided" — the mutation re-reads status inside the transaction, and Convex mutations are serializable. No compare-and-set column, no lock.

**The seed is an action, not a mutation.** `createAccount` needs an `ActionCtx` because password hashing cannot run inside a transaction. It writes both the user row and the credential record; a plain insert into `users` produces an account that can never sign in.

---

## Decisions and deviations

The reasoning behind the build is in [`docs/`](docs/): [what was built](docs/feature-summary.md), [how and why](docs/infrastructure.md), [the questions and answers that shaped it](docs/questions.md), [the plan](docs/development-plan.md), [manual QA](docs/qa-script.md), the [security audit](docs/security-audit.md), and [how it scales](docs/scalability.md).

Three things differ from the brief, deliberately:

1. **A fifth category, `Other`.** The four named — travel, meals, software, office supplies — leave a taxi, a conference ticket, or a laptop with nowhere to go, and forced miscategorisation is how category data goes bad. Categories are seeded rows rather than hard-coded, so removing it is a data change. Happy to drop it.
2. **Four seeded accounts, not two.** Explained above: with one manager, the no-self-approval rule cannot be demonstrated at all.
3. **A draft state, and pending expenses are locked.** Both were left to our judgement. An editable pending expense means a manager can approve something other than what they read — so the employee withdraws it to draft, edits, and resubmits, and the history records all of it.

### Known limitations

Called out rather than left to be discovered:

- **No email.** A manager finds new submissions by opening the app. Live queries mean anyone with the page open sees changes instantly, but nobody gets pulled in.
- **No amount ceiling and no approval thresholds**, per the client's answers. Combined with a duplicate check that can only compare amount and date (there is no merchant field), nothing catches an order-of-magnitude typo except the approver's eye.
- **Receipt URLs are bearer capabilities.** The query that issues one refuses unauthorised callers, but the URL itself works for anyone holding it. The stronger alternative and its costs are in `infrastructure.md` §7.
- **No password reset, email verification, or MFA.** Sign-in throttling *is* present — Convex Auth rate-limits failed attempts.
- **Single currency in the UI**, though every expense stores its own currency code so adding a picker needs no migration.
