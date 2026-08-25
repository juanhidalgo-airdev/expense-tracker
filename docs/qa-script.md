# Manual QA Script

A walkthrough of everything worth checking by hand.

This carries more weight than it normally would: there is **no automated end-to-end suite**. A Playwright happy path was written and then removed — the browser download failed repeatedly in this environment, and a committed test nobody has watched pass is worse than none. The 116 unit and integration tests cover the rules; this script covers the wiring, and every step below has been walked by hand in the running app.

**Accounts** — password `Expense2026!demo` for all four:

| Email | Name | Role |
| --- | --- | --- |
| `employee@expensetracker.test` | Erin Employee | employee |
| `manager@expensetracker.test` | Maya Manager | manager |
| `elliot@expensetracker.test` | Elliot Employee | employee |
| `marcus@expensetracker.test` | Marcus Manager | manager |

Run against the deployed URL, not localhost — that is what gets reviewed, and it is where environment differences show up.

---

## 1. Authentication

| # | Step | Expected |
| --- | --- | --- |
| 1.1 | Open the app signed out | Redirected to `/signin` |
| 1.2 | Open `/expenses` directly signed out | Redirected to `/signin`, no flash of content |
| 1.3 | Sign in with a wrong password | "Email or password is incorrect." Not "no such user" — the message must not reveal whether the address exists |
| 1.4 | Sign in with an unknown address | The **same** message as 1.3 |
| 1.5 | Sign in as Erin | Lands on My expenses |
| 1.6 | Reload the page | Still signed in |
| 1.7 | Sign out | Back to `/signin`; pressing Back does not restore the app |
| 1.8 | Look for a sign-up link | There is none — accounts are provisioned by seed, by design |

## 2. Submitting an expense (as Erin)

| # | Step | Expected |
| --- | --- | --- |
| 2.1 | New expense → Submit with everything blank | Browser blocks on the required fields |
| 2.2 | Enter amount `0` | Rejected: must be greater than zero |
| 2.3 | Enter amount `abc` | Rejected, clearly |
| 2.4 | Enter amount `1.234` | Rejected: at most 2 decimal places |
| 2.5 | Enter `1,234.56` then `1.234,56` | Both read as $1,234.56 — the live preview under the field confirms it |
| 2.6 | Try to pick a future date | Blocked by the date picker (`max` is today) |
| 2.7 | Submit without a receipt | "Attach a receipt before continuing." |
| 2.8 | Attach a `.txt` file | Rejected: JPEG, PNG, HEIC, WebP or PDF |
| 2.9 | Attach a real photo from a phone | Uploads, shows "Attached: <filename>" |
| 2.10 | Attach a second file | Replaces the first; the old upload is discarded |
| 2.11 | Enter an amount and date matching an existing expense of yours | Amber duplicate warning naming the other expense — **and it must still let you submit** |
| 2.12 | Save as draft | Lands on the detail page with status Draft, "Submitted: Not yet" |
| 2.13 | Submit for approval | Status Pending, submitted timestamp set |

## 3. The employee lifecycle (as Erin)

| # | Step | Expected |
| --- | --- | --- |
| 3.1 | Open a Pending expense | **Edit is not offered**; Withdraw is, with an explanation why |
| 3.2 | Withdraw it | Status → Draft, submitted time clears, Edit and Submit appear, history gains "withdrew it back to draft" |
| 3.3 | Edit it, change the amount, save | History shows `Amount: $X → $Y` — formatted money, not raw integers |
| 3.4 | Resubmit | Status → Pending, whole trail intact |
| 3.5 | Filter by Draft / Pending / Approved / Rejected | List narrows correctly |
| 3.6 | Search a description fragment | Matching rows only |
| 3.7 | Open a Rejected expense | Red banner with the manager's reason, Edit offered, Resubmit offered |

## 4. Manager review (as Maya)

| # | Step | Expected |
| --- | --- | --- |
| 4.1 | Sign in as Maya | A **Review** link appears in the nav that Erin does not get |
| 4.2 | Open Review | Every pending expense company-wide, **oldest first** |
| 4.3 | Find Maya's own pending expense | Present, badged "Your own — another manager must decide" |
| 4.4 | Open her own expense | **No approve/reject panel.** An explanation instead. Withdraw is still offered (she owns it) |
| 4.5 | Open one of Erin's | Approve and Reject offered |
| 4.6 | Click Reject, leave the reason blank, confirm | "Give a reason so the employee knows what to fix." Nothing changes |
| 4.7 | Reject with a reason | Status → Rejected; reason on the expense and in the history |
| 4.8 | Approve another | Confirmation restates **amount and submitter** before committing |
| 4.9 | Decided tab | Both decisions there, most recent first |
| 4.10 | Re-open a decided expense | No decision panel — decisions are final |

## 5. Authorization — the part that matters

| # | Step | Expected |
| --- | --- | --- |
| 5.1 | As Erin, note the URL of one of her expenses. Sign in as **Elliot** and open that URL | "Expense not found" — *not* "access denied". Elliot must not learn it exists |
| 5.2 | As Elliot, open `/review` | "Not available. Only managers review expenses." — a clean page, **not a crash** |
| 5.3 | As Erin, check My expenses | Only her own rows. Elliot's and Maya's are absent |
| 5.4 | As Maya, open Elliot's expense | Visible — any manager may review anything |
| 5.5 | As Maya, try to edit Elliot's expense by going to `/expenses/<id>/edit` | Refused |
| 5.6 | Copy a receipt URL, open it in a private window | It loads. **This is expected and documented** — Convex storage URLs are bearer capabilities. The control is that only an authorised user can obtain one (see `infrastructure.md` §7) |

## 6. Concurrency

| # | Step | Expected |
| --- | --- | --- |
| 6.1 | Open the same pending expense as **Maya** in one browser and **Marcus** in another (use a private window) | Both see approve/reject |
| 6.2 | Approve as Maya | Marcus's page updates live to Approved without a refresh |
| 6.3 | Now click Reject as Marcus | "This expense has already been decided." The first decision stands and is not overwritten |

## 7. Money, dates, locale

| # | Step | Expected |
| --- | --- | --- |
| 7.1 | Check every amount on screen | Always `$1,234.56` style — never raw cents, never `1234.5` |
| 7.2 | An expense dated `2026-08-18` | Renders as Aug 18 **everywhere**, regardless of your timezone. A date must never shift a day |
| 7.3 | Change your machine timezone to UTC+13 and reload | Dates unchanged; submitting "today" is still accepted |

## 8. Empty, loading and error states

| # | Step | Expected |
| --- | --- | --- |
| 8.1 | Sign in as Marcus (no expenses) | "No expenses yet" empty state, not a blank page |
| 8.2 | Filter to a status with no matches | "Nothing matches those filters" — different from the no-data message |
| 8.3 | Marcus's Review → Decided before deciding anything | "Nothing decided yet" |
| 8.4 | Open `/expenses/does-not-exist` | Not-found page, no crash |
| 8.5 | Open `/no-such-page` | 404 page with a way back |
| 8.6 | Throttle the network and reload | "Loading…" appears; no flash of an empty list first |

## 9. Responsive and keyboard

| # | Step | Expected |
| --- | --- | --- |
| 9.1 | Resize to 375px wide across every page | No horizontal scrolling anywhere |
| 9.2 | Submit an expense entirely on a phone-width viewport | Fully usable, including the file picker |
| 9.3 | Tab through the submission form | Every control reachable in a sensible order, focus always visible |
| 9.4 | Submit the form with Enter | Works |

## 10. Deployment

| # | Step | Expected |
| --- | --- | --- |
| 10.1 | All of the above against the **deployed URL** | Identical behaviour to local |
| 10.2 | Upload a receipt in production specifically | Succeeds — the upload path is the most environment-sensitive part |
| 10.3 | Clone the repo fresh, follow the README, run it | Works from `.env.example` alone, with no undocumented steps |
