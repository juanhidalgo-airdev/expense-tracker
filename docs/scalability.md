# Scalability

How this app absorbs the roadmap the client described, and where it stops coping with data volume.

Two separate questions hide behind "does it scale", and they have different answers:

1. **Feature scale** — can the deferred v1 items be added without a rewrite? *Designed for deliberately. Detailed below with the specific seam each one attaches to.*
2. **Data scale** — does it stay fast as expenses accumulate? *Handled for the realistic horizon, with limits stated plainly rather than implied.*

---

## Part 1 — Feature scale

The client named two future directions and we deferred eleven more items. None are built. What follows is the seam each one attaches to, so "we designed for it" is a checkable claim rather than a reassurance.

### The two roadmap items

#### Multi-country teams

| Already true | Where |
| --- | --- |
| Every expense stores its own **ISO-4217 currency code** | `schema.ts` — `expenses.currency` |
| Amounts are **integer minor units**, never floats | `expenses.amountMinor`, `lib/money.ts` |
| Formatting goes through `Intl` with the expense's own currency, and handles **zero-decimal currencies** (JPY) | `lib/money.ts` — `minorUnitExponent` |
| No hardcoded `$` or `en-US` anywhere | verified by grep |
| `expenseDate` is a **calendar date string**, so it cannot shift a day across timezones | `lib/dates.ts` |
| Timestamps are epoch-ms UTC, formatted in the viewer's locale | `lib/dates.ts` |
| `country` exists on the user record, nullable and unused | `schema.ts` — `users.country` |

**What v2 adds:** a currency picker, a `teams`/`offices` table, per-country policy limits, and FX rates against a reporting currency.

**Why this is the cheap half:** currency-per-expense and integer minor units are the parts that are **expensive to retrofit into stored data**. Adding a picker later is a UI change over data that is already shaped correctly. Retrofitting currency onto amounts stored as floats in an implied single currency is a migration with no safe answer for historical rows.

#### Multi-level approvals

| Already true | Where |
| --- | --- |
| **All approval authority is one function** | `lib/permissions.ts` — `canDecide()` |
| Decisions are recorded through **one** helper, not scattered | `expenses.ts` — `decide()` |
| History is an **append-only event log** that can already represent a chain of decisions | `expenseEvents` |
| `status` is a **denormalised rollup**, not the source of truth about who approved what | `schema.ts` |
| The UI renders **capability flags the server computed** and never re-derives a rule | `expenses.get` returns `canEdit`/`canWithdraw`/`canDecide` |

**What v2 adds:** an `approvalSteps` table (one row per required approval), a rule for what triggers a second approver (amount, category, country), sequential-vs-parallel semantics, and rollup logic that sets `status` when the chain completes.

**Why the UI does not move:** components ask "may I decide this?" and get a boolean. Whether that boolean comes from one rule or a five-step chain is invisible to them. That is the whole reason `canDecide` exists as a function rather than as `status === "submitted"` scattered through components.

### The deferred v1 items

| Item | Seam it attaches to | Rough cost |
| --- | --- | --- |
| `paid` / reimbursed state | `lib/transitions.ts` — one `ALLOWED` map, one status validator | Add the status and its edges in one file |
| "Request more info" outcome | Same map | Same |
| Reversal of a decision | Same map, plus `decide()` | Add the transition; the append-only history already makes it auditable |
| Approval thresholds | `canDecide()` — already the single authority | A rule inside one function |
| Configurable categories | **Already a table**, with `isActive` to retire one without orphaning expenses | An admin screen. The data model is done |
| Admin role | `role` is a union validator read from the DB, never a token claim | Add the literal, add `requireAdmin`, build the screen |
| Email notifications | Mutations are pure DB work by design; nothing touches the outside world inside a transaction | A scheduled `action` + Resend |
| CSV export | Queries already return display-ready rows | An action that streams |
| Bulk approve | `decide()` in a loop, with per-item results | Mostly UI |
| KPIs / totals | Indexed reads exist | An aggregate query, or a counter table if it must be O(1) |
| Password reset, MFA | Convex Auth password provider | Email provider + provider config |

---

## Part 2 — Data scale

### What was fixed

An earlier version of `infrastructure.md` claimed pagination as a convention. It was not implemented — every list query called `.collect()`, reading the whole result set. That has been corrected in the code rather than the prose:

| Query | Before | Now |
| --- | --- | --- |
| `listMine` | `.collect()` — all of a user's expenses | `.paginate()`, 25 per page, **status filter applied server-side on an index** |
| `listForReview` | `.collect()` — **every pending expense company-wide** | `.paginate()`, 25 per page, both tabs |
| Category lookups | One `db.get` **per row** | One read of the table per query, reused across rows |
| Submitter lookups | One `db.get` **per row** | Batched to the distinct users on the page |

The "Decided" tab needed a new index. It spans *approved and rejected*, and a paginated query cannot union two index scans, so `by_decidedAt` orders both together; undecided expenses have no `decidedAt` at all, and a range above zero excludes them.

### Index coverage

Every read path is index-backed. No query filters over a full table scan:

| Index | Serves |
| --- | --- |
| `expenses.by_user` | My expenses, unfiltered |
| `expenses.by_user_and_status` | My expenses, filtered by status |
| `expenses.by_status_and_submittedAt` | The pending queue, oldest first |
| `expenses.by_decidedAt` | The decided tab, newest first |
| `expenses.by_user_and_expenseDate` | The duplicate warning |
| `expenses.by_receiptStorageId` | Is this uploaded file referenced? — receipt replacement, and the orphan sweep |
| `expenseEvents.by_expense` | One expense's history |
| `categories.by_active_and_sortOrder` | The category picker |
| `users.email` | Sign-in and seeding |

Index-scoped reads are also a **correctness** property, not just a performance one: a read scoped to `by_user` cannot accidentally return another user's row, so the scoping is a property of the query rather than of a line of JavaScript someone could delete.

### Known limits, stated plainly

**Search is client-side over loaded rows.** Typing in the search box filters what has been fetched, not the whole table. With pagination that means it searches the first 25 rows until more are loaded. The empty state says so — *"Search covers the expenses loaded so far"* — rather than implying an exhaustive search came back empty. Proper search needs a Convex **search index**, which is a feature to add, not a tweak. Deliberate, and the honest phrasing matters more than the limitation.

**`history` is not paginated.** It is bounded by events on a single expense — realistically under twenty. It would need attention only if an expense could be edited hundreds of times.

**The seed and reset mutations `.collect()` the tables.** They are internal, run deliberately, and operate on demo data.

**The orphan sweep is bounded per run.** It takes 200 storage entries at a time rather than every file, so it cannot grow into an unbounded transaction. A backlog drains over successive nights instead of failing in one.

**Live queries re-run on write.** This is what makes an approval appear on the employee's screen without a refresh, and it is a real cost: every subscriber to the pending queue re-runs when anyone submits. Pagination bounds that cost per subscriber. At hundreds of concurrent managers it would be worth measuring.

### Where it would actually break

| Scale | Status |
| --- | --- |
| One company, hundreds of expenses/month | Comfortable. Paginated reads, indexed lookups, small pages |
| Thousands of expenses | Fine. The queue pages; search becomes the weak point first |
| Tens of thousands | Search needs a real search index. Aggregates (if added) need a counter table rather than summing rows |
| Multiple companies | **Not designed for, deliberately.** There is no `orgId` and no tenancy anywhere — the client said one company, and the roadmap is multi-*country*, not multi-*customer*. Adding tenancy speculatively would have been the wrong shape and would have cost clarity in every query |

That last row is the one worth being explicit about. Resisting speculative multi-tenancy was a decision, not an oversight, and it is recorded in `questions.md` (Q27) with the client's answer behind it.
