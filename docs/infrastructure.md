# Infrastructure, Stack, and Technical Decisions

**Sources:** kickoff briefing video (verbal transcript) plus the written exercise brief (*Dev Exercise* PDF), both captured 2026-08-23.
**Companion docs:** [feature-summary.md](feature-summary.md) (what we are building) · [questions.md](questions.md) (open items).

Legend: **[Brief]** = mandated or stated in the briefing · **[Client]** = answered in the Q&A of 2026-08-24 · **[Decided]** / **[Chosen]** = our call, with the reasoning given. Nothing here is open.

---

## 1. Stack at a glance

| Layer | Choice | Status | Why |
| --- | --- | --- | --- |
| Backend platform | **Convex** — database, server functions, file storage | **[Brief]** — explicitly required | Mandated. Also removes the need for a separate API layer, object store, and websocket/realtime tier. |
| Auth | **Convex Auth** (`@convex-dev/auth`), password provider | **[Brief]** — client confirmed Convex Auth; Clerk ruled out | Email + password only, single company, no social login. See §4 for what that commits us to. |
| Frontend framework | **Next.js 15.5.23** (App Router) + React 19 + TypeScript | **[Chosen]**; brief says any React setup, Next.js explicitly fine **[Brief]** | Routing, layouts, and middleware-based route protection out of the box. **Pinned to 15, not 16**: `@convex-dev/auth` is 0.0.x and declares no `next` peer constraint at all, so Next 16 is untested against its middleware. Not the day to find out. |
| Styling / UI | **Tailwind CSS + shadcn/ui** (Radix primitives) | **[Chosen]** | The brief asks for functional and clean, not elaborate. Accessible primitives for dialogs, selects, and tables without hand-rolling them. Responsive to phone width, keyboard-navigable, no formal WCAG audit. **[Decided, Q31]** |
| Forms / validation | **react-hook-form + Zod**, with the same rules mirrored in Convex validators | **[Chosen]** | Client validation for UX; server validation as the actual control. |
| Hosting (web) | **Vercel** | **[Brief]** — written brief: "deploy to Vercel or similar" | Native fit for Next.js, and a working live URL is a submission requirement. |
| Hosting (backend) | Convex Cloud (`dev` + `prod` deployments) | **[Brief]** implied | Managed by Convex. |
| Tests | **Vitest + `convex-test`** for backend functions, plus one Playwright happy path | **[Decided, Q31]** | Authorization and lifecycle rules are exactly the things worth testing here. |
| Money | Integer minor units + ISO-4217 currency code | **[Chosen]** | See §8. |

**Deliberately not added:** no Redux/Zustand (Convex `useQuery` is already the reactive store), no REST or tRPC layer (Convex functions *are* the API), no separate S3/Cloudinary (Convex file storage is mandated and sufficient), no ORM, no separate realtime service.

---

## 2. Frontend architecture

```
app/
  layout.tsx                 # ConvexAuthNextjsServerProvider + ConvexProvider, theme, nav shell
  (auth)/signin/page.tsx         # no signup route — accounts are seeded [Client, Q4]
  (app)/expenses/page.tsx        # my expenses
  (app)/expenses/new/page.tsx    # submission form
  (app)/expenses/[id]/page.tsx   # detail: fields, receipt, status, history
  (app)/review/page.tsx          # manager queue
components/
  expenses/{ExpenseForm,ExpenseList,ExpenseRow,StatusBadge,ReceiptViewer,HistoryTimeline,DecisionPanel}.tsx
  ui/                        # shadcn primitives
lib/
  money.ts                   # parse/format minor units, Intl-based
  dates.ts                   # calendar-date vs timestamp helpers
  status.ts                  # status labels/colors (single source for UI copy)
convex/                      # see §3
docs/                        # these planning docs + decision log, committed [Decided, Q30a]
```

Notes on the shape:

- **Client components with `useQuery` are the default.** Convex subscriptions are what make an approval appear on the employee's screen without a refresh; that requires the reactive client. Server components are used for the static shell only. This is a real trade-off (less SSR) and it is the right one for an internal tool where liveness beats first-paint.
- **Route protection at the middleware layer** (`convexAuthNextjsMiddleware`) to bounce anonymous users, **plus** authorization inside every Convex function. The middleware is UX; the function-level check is the security boundary. Exact API names get confirmed against current Convex docs before the auth layer is written — this package has moved quickly across versions.
- **Role-driven rendering comes from server data**, one `getCurrentUser` query returning `{ id, name, email, role }`. No role in localStorage, no role in a cookie the client can edit.
- **No status logic in components.** Components read `expense.canApprove` / `expense.canEdit` style capability flags computed on the server, so the multi-level-approval change later touches one file instead of six.

---

## 3. Convex backend layout

```
convex/
  schema.ts            # tables + indexes (§5)
  auth.ts              # Convex Auth config (password provider)
  auth.config.ts
  http.ts              # HTTP router (only if we serve receipts through an action — §7)
  users.ts             # getCurrentUser
  expenses.ts          # queries + mutations, public surface
  categories.ts        # list active categories (seeded table, not hard-coded) [Decided, Q12]
  receipts.ts          # generateUploadUrl, getReceiptUrl
  events.ts            # append-only history writes (internal)
  lib/
    auth.ts            # requireUser, requireManager, requireOwnerOrReviewer
    permissions.ts     # canView / canEdit / canDecide  <- the single authority
    transitions.ts     # allowed status-transition map
    validators.ts      # shared v.* arg shapes
  seed.ts              # internalAction (not mutation): createAccount needs an
                       #   ActionCtx — password hashing cannot run in a transaction
```

Conventions:

- Every public function declares `args` **and** `returns` validators. Argument validation is a security control on a public endpoint, not a nicety.
- Anything that must not be callable from a browser is an `internalMutation` / `internalQuery`.
- Queries never `filter()` over a whole table; they `withIndex()` (see §5). This is both a performance and a correctness habit — an index-scoped read cannot accidentally return another user's row.
- Mutations are pure database work. Nothing in v1 touches the outside world — there is no email (**Q24**, ruled out) — so no `action` is needed at all beyond the file-upload path. Should notification ever land, it goes in an `action` scheduled from the mutation rather than inside it, so the transaction stays clean.
- Pagination via `paginationOptsValidator` and `.paginate()` on both lists. An internal tool still accumulates thousands of rows in a year, and retrofitting pagination is worse than having it.

---

## 4. Auth: Convex Auth **[Decided]**

**Decision: Convex Auth (`@convex-dev/auth`) with the password provider. Clerk is not in play** — confirmed by the client. The account lifecycle around it is settled too: sign-up and sign-in only, nothing else (**Q26**).

What the decision buys:

- **One system.** Users live in the same database as their expenses, so a role check is a document read. No cross-service sync, no webhook mirror, no second user record that can drift out of step with the first.
- **An exact fit for the requirement.** Email and password only, one company, no social login — nothing paid for and left unused.
- **Nothing lost on the roadmap.** Countries and teams are our own data either way. A hosted provider's organizations feature would only have mattered if this became multi-*tenant*, and the roadmap is multi-*country* inside a single company.

What we now own ourselves, precisely because we are not buying a hosted identity provider:

| Capability | Consequence | Handling |
| --- | --- | --- |
| **Password reset** | Needs an email provider (Resend) plus a verified sending domain, wired through the password provider. | **Out of v1. [Decided, Q26]** Seeded accounts make it unnecessary for review — and with no signup either (**Q4**), an account that loses its password is re-seeded rather than recovered. |
| **Email verification** | Same dependency. | Out of v1. Anyone can sign up with any address, which is tolerable for an internal tool with a known user list, but it is a real property of the app and is stated rather than glossed. |
| **MFA** | Not available out of the box. | Out of scope. This is the one place a hosted provider would have won, and it is worth naming as the trade accepted. |
| **Brute-force protection / lockout** | Convex Auth does not throttle sign-in attempts for us. | A named gap (§12). The fix is a rate limiter on the sign-in path — our code, not a provider's. |
| **Beta API surface** | `@convex-dev/auth` is still beta and its Next.js integration has changed across versions — and with Clerk ruled out there is now **no fallback provider**. | Risk #1 in §11. Verify against current docs and pin exact versions on **day one** of the build, before anything is layered on top. |

**Where roles live:** the Convex `users` table, never a JWT claim the client can influence. A token proves *who you are*; the database decides *what you may do*.

---

## 5. Data model

Convex adds `_id` and `_creationTime` to every document, so no manual PK or `createdAt`.

### `users`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` | Display name. |
| `email` | `string` | Unique, lowercased at write time. |
| `role` | `"employee" \| "manager"` | Union validator, not a free string. **No `admin` value** — no admin role exists. **[Client, Q3]** `manager` is additive: a manager is also an employee and submits like anyone else. **[Client, Q1]** |
| `country` | `optional(string)` | ISO-3166 alpha-2. Nullable placeholder for the multi-country roadmap — costs one column and no query complexity. |
| `isActive` | `boolean` | Soft deactivation; we never hard-delete a user who has expense history. |

Indexes: `by_email`.

**`managerId` was removed.** An earlier draft carried a nullable reporting line "so the routing question is answerable without a migration". **Q2** answered it definitively — any manager, no org chart — and Convex takes new optional fields without a migration anyway, so the column bought nothing. Dropping it is the same argument we used to reject a speculative `orgId`, applied consistently. **[Client, Q2]**

**Correction from Phase 1 verification.** An earlier draft said the auth tables were "separate from this application-level `users` table". They are not: `authTables` *defines* `users`, and `createAccount`'s `profile` argument writes straight into it. So there is one `users` table — the library's, with our `role`, `isActive`, and `country` added to it, and both of the library's indexes (`email`, `phone`) reproduced exactly, because the library queries them by name. `authAccounts` holds the credential record separately and links back by `userId`.

Since there is no signup screen, **rows in both are created exclusively by the seed script** — see §11 risk 1.

### `expenses`

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | `id("users")` | Owner/submitter. |
| `description` | `string` | Required, length-capped. **[Brief]** |
| `amountMinor` | `number` (integer) | Minor units — cents. Never a float. Greater than zero, at most two decimal places, **no upper bound**. **[Decided, Q17]** See §8. **[Brief]** |
| `currency` | `string` | ISO-4217, e.g. `USD`. Fixed to a single currency in the v1 UI, stored per expense from day one for the roadmap. **[Decided, Q13]** |
| `categoryId` | `id("categories")` | Reference into the seeded `categories` table rather than a union of literals — the client may want them configurable later and left sourcing to us. **[Client + Decided, Q12]** **[Brief]** |
| `expenseDate` | `string` (`YYYY-MM-DD`) | Calendar date the cost was incurred. Stored as a date string, not a timestamp, precisely so it cannot shift across timezones. **[Client, Q14]** |
| `receiptStorageId` | `optional(id("_storage"))` | Convex storage handle. Exactly one receipt, required by the mutation **[Decided, Q15]**, but optional in the schema so relaxing it later is a validator change rather than a migration. **[Brief]** |
| `status` | `"draft" \| "submitted" \| "approved" \| "rejected"` | **[Brief]** for status existing; values per `feature-summary.md` §4. |
| `submittedAt` | `optional(number)` | Epoch ms. Drives queue ordering. |
| `decidedAt` | `optional(number)` | Epoch ms. |
| `decidedBy` | `optional(id("users"))` | The approver/rejecter. |
| `decisionNote` | `optional(string)` | Required on rejection, enforced in the mutation. **[Brief]** |

Indexes: `by_user_and_status`, `by_status_and_submittedAt` (the manager queue), `by_user` (my-expenses list), and **`by_user_and_expenseDate`** — which exists solely for the duplicate warning (**Q18**): before submitting, a query looks for another expense by the same user on the same `expenseDate` with the same `amountMinor`. An index makes that a keyed lookup rather than a table scan on every keystroke-free submit. The check is advisory only: it warns, never blocks, and nothing about the warning is stored on the expense.

Why `status` stays denormalized on the expense even though multi-level approvals are coming: the queue and the employee list both read it constantly, and when a step engine arrives it becomes a rollup written by that engine. Keeping it is the cheap option in both worlds.

### `categories` **[Client, Q12]**

| Field | Type | Notes |
| --- | --- | --- |
| `key` | `string` | Stable identifier — `travel`, `meals`, `software`, `office_supplies`, plus `other`. The client named the first four (**Q12**); `other` is ours, so a taxi or a conference ticket has somewhere to go instead of being forced into a wrong bucket. **[Decided]** Worth one line to Vlad, since he named a specific list. |
| `label` | `string` | Display name. Editable later without touching expense records, which is the point of the table. |
| `sortOrder` | `number` | Presentation order in the form. |
| `isActive` | `boolean` | Retire a category without orphaning the expenses that reference it — deleting rows would break historical records. |

Index: `by_active_and_sortOrder`.

The trade against a union of literals is real: we lose compile-time exhaustiveness on category and gain a lookup for display. It is the right trade here because the client flagged configurability as a likely follow-up and left sourcing to us, and because retiring a category has an obvious answer (`isActive: false`) instead of a schema change plus a data migration.

### `expenseEvents` (append-only history) **[Brief]**

| Field | Type | Notes |
| --- | --- | --- |
| `expenseId` | `id("expenses")` | |
| `actorId` | `id("users")` | Who did it. |
| `type` | union of literals | `created`, `submitted`, `edited`, `receipt_replaced`, `approved`, `rejected`, `resubmitted`, `withdrawn`. **[Decided, Q23]** |
| `note` | `optional(string)` | Rejection reason or comment. |
| `fromStatus` / `toStatus` | `optional(...)` | For transition events. |
| `changes` | `optional(array(object))` | Field-level before-and-after values on `edited`. **Required behaviour, not optional** — an edit that leaves no trace of what moved is the gap this closes. **[Decided, Q23]** |

Index: `by_expense`. Written only through an internal helper, never updated or deleted — that is what makes it an audit trail rather than a log. The employee and the manager read the same rows; there is no manager-only view of history. **[Decided, Q23]**

### Not in v1 (documented so the shape is agreed)

- `approvalSteps` — for multi-level approvals (**Q28**).
- `teams` / `offices` — for multi-country (**Q27**).
- No `orgId` anywhere: one company, and the roadmap is multi-country, not multi-tenant.
- No reporting-line table, and no `managerId`: the client does not want org-chart relationships yet (**Q2**).

---

## 6. Authorization model

The rule: **the client is an untrusted renderer.** Hiding a button is UX. The check that matters happens in the function.

Three helpers, used by every public function:

```ts
requireUser(ctx)              // identity -> users doc, or throw
requireManager(ctx)           // as above + role === "manager"
requireVisible(ctx, expense)  // owner, or a manager entitled to see it (Q2/Q5)
```

One authority for capability, in `convex/lib/permissions.ts`:

```ts
canView(user, expense)     // owner || any manager                        (Q2, Q5)
canEdit(user, expense)     // owner && status in {draft, rejected}        (Q7, Q8)
canWithdraw(user, expense) // owner && status === "submitted"             (Q7)
canDecide(user, expense)   // manager && status === "submitted"
                           //   && expense.userId !== user._id            (Q1)
```

`canDecide` is where the client's two role answers land: **any** manager qualifies (**Q2** — no org chart to consult), and the `userId` comparison is what stops a manager approving their own expense (**Q1**). Both live in one function rather than being re-derived in the queue query and again in the decision mutation, which is also the seam multi-level approvals would attach to later (**Q28**).

Queries return these as flags alongside the data, so the UI never re-derives the rules and cannot disagree with the server.

**Concurrency.** Convex mutations run as serializable transactions with automatic retry on conflict, so the naive-looking guard is genuinely sufficient:

```ts
const expense = await ctx.db.get(args.id);
if (expense.status !== "submitted") throw new ConvexError("Already decided");
await ctx.db.patch(args.id, { status: "approved", /* … */ });
```

Two managers clicking approve within the same millisecond produce one success and one clean "Already decided" — no compare-and-swap column, no advisory lock. This is worth stating explicitly because it is exactly the edge case the brief is probing, and the platform choice is what makes it a two-line answer.

**The authorization matrix to test** (**Q31**): for each of {owner, other employee, manager, manager who owns the expense} × each of {view, edit, submit, withdraw, approve, reject, read receipt} × each status. That grid is the test suite. The manager-who-owns-the-expense column is the one the client's answer to **Q1** creates, and it is the row most likely to be got wrong — a manager sees their own expense in the queue, and must not be able to act on it.

---

## 7. Receipt storage and the one real security trap

**Upload flow** (three steps, standard Convex):

1. Client calls `generateUploadUrl` — an authenticated mutation. Anonymous callers get nothing.
2. Client `POST`s the file directly to that URL; Convex returns a `storageId`.
3. Client calls `createExpense` with the `storageId`; the server records it on the expense.

**Validation.** Content type and size are checked in the browser for feedback and re-checked on the server against `ctx.db.system.get(storageId)` (the `_storage` table exposes `size`, `contentType`, and `sha256`). Limits: **exactly one receipt, required**, from JPEG, PNG, HEIC, WebP, or PDF, up to 10 MB. **[Decided, Q15]**

**Orphaned files.** If step 2 succeeds and step 3 never happens, the file exists with nothing pointing at it. Handling: the upload URL is only issued to an authenticated user, and a scheduled internal mutation sweeps `_storage` entries older than 24 hours with no referencing expense. Small, real, and the kind of thing that quietly accumulates cost if ignored.

**The trap.** `ctx.storage.getUrl(storageId)` returns a URL that is **not itself access-controlled** — it is long and unguessable, but anyone holding it can fetch the file. Receipts contain names, addresses, and card fragments, so this matters.

| Option | Behavior | Verdict |
| --- | --- | --- |
| **A. Gate the query that returns the URL** | `getReceiptUrl(expenseId)` runs `requireVisible` and only then returns a URL. Unauthorized callers get nothing; the URL functions as a capability for whoever legitimately received it. | **Decided. [Q15]** Correct for an internal tool of this size, and honest about what it is: a bearer capability, not a per-request authorization. |
| **B. Proxy through an HTTP action** | An HTTP action checks auth and streams the file. Stronger, but `<img src>` cannot send an auth header, so it needs a short-lived signed token in the URL or a fetch-to-blob path — more moving parts, no CDN. | Rejected for v1, documented as the hardening path. This is the switch to make if per-request authorization on receipt files is ever wanted. |
| C. Public URLs on the expense document | Anything that leaks the document leaks every receipt. | Rejected. |

Whichever we pick, the URL is never logged, never put in a query string we control, and never embedded in an email.

---

## 8. Money, dates, and locale

**Money.** `amountMinor: number` (integer cents) plus `currency: string`. Floats are excluded because `0.1 + 0.2` is a real bug in a system that sums expense totals, and because JavaScript has no decimal type. One `lib/money.ts` owns parsing (tolerating `1,234.56`, `1.234,56`, and a leading symbol) and formatting via `Intl.NumberFormat` with the expense's own currency and its correct minor-unit exponent — which is not always 2 (JPY has 0), and that detail is exactly what the multi-country roadmap will trip over if it is not handled at the boundary now.

**Dates.** Two distinct concepts, deliberately stored differently:
- *When it happened* — `expenseDate` as a `YYYY-MM-DD` string. A calendar date has no timezone; storing it as a timestamp makes a Tokyo employee's Tuesday dinner show up on Monday for a London manager.
- *When something was recorded* — epoch milliseconds, UTC, formatted in the viewer's locale.

**Locale.** No hardcoded `$`, no hardcoded `en-US`, no hand-built date strings. The roadmap says other countries are coming; the cheap moment to get this right is before there is any data.

---

## 9. Environments and deployment

| Environment | Convex | Frontend | Purpose |
| --- | --- | --- | --- |
| Local dev | `npx convex dev` (personal dev deployment) | `next dev` | Day-to-day work. |
| Production | Convex `prod` deployment (`npx convex deploy`) | Vercel production | The submitted URL. **Mandatory and fully functional** — the written brief says it gets tested before anything else. **[Brief]** |

A staging tier is deliberately skipped for an exercise of this size; it would be the first thing added for a real client engagement.

Two repository artifacts are explicitly required at submission **[Brief]**: a `README.md` with setup instructions, and a `.env.example` carrying placeholder values for **every** required variable — which is why the table below is exhaustive rather than illustrative.

**Environment variables**

| Variable | Where | Notes |
| --- | --- | --- |
| `CONVEX_DEPLOYMENT` | local `.env.local` | Written by the Convex CLI. Not committed. |
| `NEXT_PUBLIC_CONVEX_URL` | local + Vercel | Public by design. |
| `SITE_URL` | Convex dashboard | Needed by Convex Auth for redirects/links. |
| `JWT_PRIVATE_KEY`, `JWKS` | Convex dashboard | Generated by the Convex Auth setup step. Never in git. |
| ~~`AUTH_RESEND_KEY`~~ | — | **Not used.** Password reset and verification are out (**Q26**), so no email provider is configured and this key stays out of `.env.example` — which lists what is *required*, not what might one day be. |
| `CONVEX_DEPLOY_KEY` | Vercel (production) | Lets the Vercel build push Convex functions, via the build command `npx convex deploy --cmd "next build"`. |

`.env*` is gitignored; `.env.example` is committed with every key name and a placeholder value, as the brief requires. Deploy order matters: Convex functions must go out before the frontend that calls them, so a new query never 404s against an old deployment — which is precisely what the `convex deploy --cmd` build command enforces.

---

## 10. Testing strategy

Scoped to what actually breaks in this app rather than to a coverage number. **[Decided, Q31]**

1. **Backend function tests — `convex-test` + Vitest.** The authorization matrix from §6, the status-transition map, the rejection-note requirement, self-approval refusal, and the double-decision race. These are cheap, fast, and they are the requirements.
2. **Unit tests — `lib/money.ts`, `lib/dates.ts`.** Parsing and formatting across separators, zero-decimal currencies, and a timezone boundary.
3. **One Playwright happy path.** Sign in as an employee, submit with a receipt, sign in as a manager, approve, verify the employee sees it. **[Decided, Q31]**
4. **A written manual QA script** covering the empty states, the upload failure modes, and the deep-link authorization checks — committed, so the reviewer can walk it.

A `convex/seed.ts` internal mutation is **the only way an account can exist** (**Q4**), so it is infrastructure rather than convenience. It creates the two mandated test accounts — one employee, one manager **[Brief]** — plus **a second manager and a second employee** **[Decided, Q30b]**, the four seeded categories (**Q12**), and a spread of expenses across all four statuses. The second manager is not padding: with self-approval blocked (**Q1**) and no signup, one manager makes a manager's own expense impossible to approve, so a reviewer could never exercise the rule. Cross-user isolation is likewise better shown than asserted.

The build window is three days once answers arrive **[Brief]**, which is why this strategy goes deep on authorization and lifecycle rather than broad on coverage.

---

## 11. Known risks and open technical decisions

| # | Item | Impact | Handling |
| --- | --- | --- | --- |
| **1** | **With no signup screen (Q4), the seed script is the only way any user can exist** — and a Convex Auth password account is not a plain `db.insert` | **Catastrophic and non-obvious: if this does not work, the application has no users and no way to create one** | **Partly retired in Phase 1.** `createAccount` is confirmed exported from `@convex-dev/auth/server` at v0.0.95, and takes `{ provider, account: { id, secret }, profile }` — with an **ActionCtx**, so the seed is an `internalAction`. Still unproven: an end-to-end sign-in with a seeded credential on a real deployment. That is the Phase 1 exit criterion |
| 2 | `@convex-dev/auth` is beta and its Next.js integration API has changed across versions. Clerk is ruled out, so there is **no fallback provider** | Mid-build rework with nowhere to retreat to — and auth sits underneath everything else | Pin exact versions and commit the lockfile on day one, alongside risk 1 — the two get proven in the same sitting |
| 3 | Convex storage URLs are unauthenticated capabilities | Receipt exposure if a URL leaks | §7 option A now, option B documented as the hardening path |
| **3a** | **Three `high` npm advisories with no fix available on Next 15** — `postcss` (XSS in stringify output; arbitrary `.map` file read via attacker-controlled `sourceMappingURL`) and `sharp`/libvips CVEs, both reached transitively through `next`. `npm audit` only resolves them by upgrading to Next 16, which risk 2 rules out | Build-time and image-pipeline exposure rather than request-path exposure | **Accepted and documented, not silently carried.** PostCSS runs at build over CSS we author, not attacker input. `sharp` backs `next/image`, and no user-supplied image passes through it — receipts render from Convex storage URLs directly, never `next/image`. The one `critical` advisory (`@auth/core`, homoglyph email-normaliser bypass) **was** fixable and is patched to 0.41.3. Re-checked in the Phase 7 audit |
| 4 | **Every manager can see every expense and receipt in the company** (**Q2**, **Q5**) | A broad privacy surface, and it leaves the employee boundary as the *only* real scoping rule in the app | Follows directly from the client's answers and is right at this size. It raises rather than lowers the weight of the authorization tests: owner-vs-other-employee is now the row that carries everything |
| 5 | **Decisions are irreversible** (**Q9**) | A mis-click is permanent, and the only remedy is the employee resubmitting | Confirmation step shows amount and submitter at the point of deciding, rather than a bare button on a list row |
| 6 | **No amount ceiling, no thresholds, and a duplicate check that can only compare amount and date** (**Q17**, **Q22**, **Q18** with **Q16**) | An order-of-magnitude typo reaches the queue looking normal; only the approver catches it | Accepted deliberately — a human reviews every expense. Recorded in `feature-summary.md` F2 and `questions.md` Part 4 so it reads as a choice, not a miss |
| 7 | Reactive-client-first means little SSR | Slower first paint | Acceptable for an authenticated internal tool; static shell is server-rendered |
| 8 | No email at all (**Q24**) | A manager only discovers new submissions by opening the app | Accepted for v1. Live queries mean anyone with the page open sees changes instantly; a Convex `action` plus Resend is the contained addition later |
| 9 | Convex Auth owns no account lifecycle (**Q26**) | No password reset, no verification, no MFA, no sign-in throttling | Accepted and documented, not silently absent. §4 lists each gap and its fix |

---

## 12. Security and privacy notes

- Receipts are personal data: names, addresses, partial card numbers, sometimes home addresses. Access is authorized server-side (§7), URLs are not logged, and nothing is emailed.
- Passwords are handled entirely by the auth provider — never stored, hashed, or logged by application code.
- **Self-service sign-up is blocked explicitly in `convex/auth.ts`**, not merely absent from the UI. The Password provider exposes a `signUp` flow on a public endpoint whether or not a page links to it, so `profile()` throws when `params.flow === "signUp"`. Without that, anyone could POST a sign-up and provision themselves an account — with no admin role in the system to notice.
- Auth errors are deliberately non-specific about whether an email exists.
- All public function arguments are validated by Convex validators; nothing reaches the database unvalidated.
- Roles live server-side only. No capability is derived from client state.
- Server errors surface as generic messages to the client; details stay in the Convex logs.
- Rate limiting on sign-in attempts is out of scope for v1 but worth naming (**Q26**): Convex Auth does not throttle for us, and email + password with no throttle is credential-stuffing bait in a real deployment. The fix is a rate limiter on the sign-in path, and with no hosted provider in the stack it is our job rather than someone else's.
- The submitted test credentials are, by design, publicly known. Seeded demo data must therefore contain no real personal information and no real receipts.

---

## 13. Submission checklist **[Brief]**

The written brief specifies exactly what gets sent, in a single message:

- [ ] **Public** GitHub repository link.
- [ ] `README.md` — what the app is, setup steps, how to run locally, how to seed, and the decisions worth knowing about.
- [ ] `.env.example` — placeholders for every variable in §9, verified by cloning fresh and following the README.
- [ ] Live deployment URL, fully functional: sign-in, receipt upload, approve/reject, and history all working against the production Convex deployment.
- [ ] Employee test credentials (email + password), verified on the live URL.
- [ ] Manager test credentials (email + password), verified on the live URL.

**Pre-submission smoke test, run against the deployed URL rather than localhost** — because that is what gets tested first: sign in as the employee, submit an expense with a real photo, sign out, sign in as the manager, open it, view the receipt, reject with a note, sign back in as the employee, confirm the note and history are there, correct and resubmit, then approve. Then the two rules the client's answers created: submit an expense **as the manager** and confirm they cannot approve it, and confirm the second manager can. Anything that only works locally — a missing Vercel environment variable, a Convex deployment still on dev, an upload URL blocked by a production CORS or auth difference — surfaces here rather than in front of the reviewer.
