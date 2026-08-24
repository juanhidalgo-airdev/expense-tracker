# Clarifying Questions — Answered

**Questions sent:** 2026-08-23. **Answers received:** 2026-08-24, from Vlad.
**Companion docs:** [feature-summary.md](feature-summary.md) · [infrastructure.md](infrastructure.md).

**Every item is now settled.** Nothing is blocking the build. This document is the requirements record: what the client decided, what they delegated to us and what we chose, and the consequences worth having on the record before anyone writes code.

Three answers changed decisions we had already taken — flagged as **↺ changed** below.

---

## Part 1 — Answered by the client

| # | Question | Client's answer |
| --- | --- | --- |
| **Q3** | Admin portal / admin role? | **No.** Setting accounts up manually in the database is fine for now. |
| **Q1** | Can managers submit their own expenses? | **Yes** — managers can also be employees and should be able to submit. Any *other* manager can approve them; they just cannot approve their own. |
| **Q2** | Shared queue or assigned manager? | **Shared.** Any manager in the system can approve any expense. No org-chart relationships needed yet. |
| **Q4** | How do users get in? | **No self-serve signup** for this version. Seeded accounts are fine. ↺ **changed** |
| **Q5** | What else does a manager see? | The **pending queue** and a **clear history per expense** are what matter. Nothing else needed. |
| **Q21** | Aggregate figures / KPIs? | **Not required** for this version. ↺ **changed** |
| **Q9** | Can a decision be reversed? | **No.** Once a decision is made it is final. The four sub-questions (reopen vs. flip, who may reverse, reason required, time window) therefore do not apply. |
| **Q12** | Categories | **Fixed list is fine: travel, meals, software, office supplies.** May become configurable later. How the list is sourced is up to us. ↺ **changed** (from our eight-category proposal) |
| **Q14** | Expense date separate from submission date? | **Yes**, that assumption is fine. |
| **Q32** | Anything specific we should not miss? | **Nothing beyond what is in the video.** |

## Part 2 — Delegated to us, and what we chose

The client explicitly left these to our judgement. Each choice and its reasoning:

| # | Question | Our decision | Why |
| --- | --- | --- | --- |
| **Q6** | Draft state? *("Up to you. Not required, but fine to include.")* | **Include it.** | It is where a withdrawn expense lands (**Q7**), which makes the whole lifecycle coherent rather than special-cased. Also makes a failed receipt upload recoverable. One extra status, and it earns its place. |
| **Q7** | Edit while pending? *("Your call. Decide what makes sense and make the rules clear.")* | **No editing while pending.** The employee withdraws it back to draft, edits, and resubmits. The withdrawal is recorded in the history. | An editable pending expense means a manager can approve something other than what they read — a correctness problem, not a UX one. The alternative is version-stamping every decision so an approval refuses if the expense changed underneath it; that is more machinery for the same guarantee. The rule is simple to state, which is what the client asked for. |
| **Q8** | Resubmit or create new? *("Either is fine… just make sure the history is clear.")* | **Correct and resubmit the same expense.** | Keeps the rejection, its note, and the subsequent edits on one continuous record — which is precisely what "make sure the history is clear" asks for. A new expense would sever the correction from the reason for it. |
| **Q12** | How to source the category list | **A seeded `categories` table**, not a hard-coded union. | The client said the list may become configurable later and left sourcing to us. A table makes that a data change rather than a code change, at the cost of a reference lookup for display. |
| **Q30b** | Seeded accounts | **Two managers and two employees**, with the two required credentials submitted as asked. | With no signup (**Q4**) and no self-approval (**Q1**), a single manager makes a manager's own expense impossible to approve — the reviewer could not exercise the rule. Cross-user isolation is also better shown than asserted. |

## Part 3 — Settled earlier, unchanged by these answers

| # | Decision |
| --- | --- |
| **Q10** | No `paid`/`reimbursed` state. Approved is terminal. |
| **Q11** | No "request more info" outcome. Approve or reject, rejection carries a note. |
| **Q13** | Single-currency (USD) UI; every expense stores its own ISO-4217 code and integer minor units; `Intl` formatting; no FX. |
| **Q15** | Exactly one receipt, required — JPEG, PNG, HEIC, WebP, PDF, up to 10 MB. Access via an authorization-gated query returning the storage URL. |
| **Q16** | No fields beyond description, amount, category, receipt, expense date, and an optional note to the approver. |
| **Q17** | Amount greater than zero, at most two decimal places, no upper bound. Stored as integer cents. |
| **Q18** | Soft duplicate warning on same person + same amount + same expense date. Warns, never blocks. |
| **Q19** | Review queue: Pending (default, oldest first) and Decided tabs, status filter, search by description or submitter. |
| **Q20** | No bulk approve or reject. |
| **Q22** | No approval thresholds. Every submitted expense takes exactly one human decision. |
| **Q23** | Full append-only event log per expense, with actor, timestamp, note, and field-level before/after on edits. Employee and manager see the same history. |
| **Q24** | No email notifications. |
| **Q25** | No CSV export or reporting. |
| **Q26** | Convex Auth password provider and nothing else of the account lifecycle: no reset, no verification, no MFA. **Correction after Phase 1 verification:** sign-in throttling was listed here as a gap and is not one — the library rate-limits failed sign-ins at 10/hour per identifier out of the box. |
| **Q27** | Multi-country absorbed, not built. No teams table, no FX, no per-country policy, no `orgId`. |
| **Q28** | Multi-level approvals not built; authority behind a single `canDecide()`. |
| **Q29 / Q30 / Q30a** | Timeline and deliverables per the written brief; planning docs committed under `/docs`. |
| **Q31** | Convex function tests for the authorization matrix and transitions, unit tests for money and dates, one end-to-end happy path, committed QA script. Responsive, keyboard-navigable, no formal WCAG audit. |

---

## Part 4 — Consequences worth having on the record

### 1. With no signup, seeding is the only way a user can exist ⚠

This is the single highest-risk consequence of the answers, and it is not obvious. **Q4** removes the signup screen, so every account must be created by the seed script. Convex Auth password accounts are **not** a plain `db.insert` into `users` — a credential record with a hashed secret has to be created through the auth library's own provisioning path (`createAccount` from `@convex-dev/auth/server`, to be verified against current docs before it is relied on).

If that path does not work as expected, there is no signup screen to fall back on and **the application has no users at all**. It gets proven on day one, before any feature work, and it is now risk #1 in `infrastructure.md` §11.

### 2. We dropped the pending-amount total

We had previously decided to show one aggregate — total amount awaiting review — on the queue. The answer to **Q21** is that KPIs are not required and "nothing else is needed" beyond the queue and the per-expense history, so **it is out**. It is a single query and a single line of UI if that reading is too strict.

### 3. `managerId` comes out of the user record

We had carried a nullable `managerId` "so the routing question is answerable without a migration". **Q2** answers it definitively — any manager, no org chart — and Convex adds optional fields without a migration anyway, so the column bought nothing. Removing it is the same argument used to reject a speculative `orgId`, applied consistently.

### 4. The four categories have no catch-all

The client named exactly four: travel, meals, software, office supplies. A conference ticket, a laptop, or a taxi has nowhere obvious to go, and forced miscategorisation is how category data goes bad. **Recommendation: add "Other" as a fifth.** Not added unilaterally, because the client gave a specific list — worth one line back to Vlad.

### 5. Managers can see everything

"Any manager can approve any expense" plus a Decided history means a manager effectively sees all expenses company-wide, including receipts belonging to people they do not manage. That follows directly from the answers and is the right call for a company of this size, but it means **the employee boundary is the only real scoping rule in the app** — which raises, not lowers, how much the authorization tests matter.

### 6. The auth surface is now very small

No signup, no password reset, no email verification, no MFA, no admin screens. The entire authentication story is: seeded accounts sign in and sign out. That is a genuine saving in a three-day build, and it concentrates the remaining risk in the one place named in consequence 1.
