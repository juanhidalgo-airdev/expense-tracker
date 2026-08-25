import { expect, Page, test } from "@playwright/test";

/**
 * The whole loop, in a real browser: an employee submits an expense with a
 * receipt, a manager approves it, and the employee sees the outcome.
 *
 * Deliberately one test rather than many. The rules are covered exhaustively
 * by the unit and convex-test suites; what those cannot prove is that the
 * pieces are wired together — real auth cookies, a real file upload to Convex
 * storage, and a decision by one user showing up for another.
 */

const PASSWORD = "Expense2026!demo";
const EMPLOYEE = "employee@expensetracker.test";
const MANAGER = "manager@expensetracker.test";

/** A 1x1 PNG, so the upload is a genuine image rather than arbitrary bytes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My expenses" })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

test("an employee submits an expense and a manager approves it", async ({ page }) => {
  // Unique so the test can find its own row no matter what else is in the
  // dev database, and so repeated runs never collide.
  const description = `E2E lunch ${Date.now()}`;

  await signIn(page, EMPLOYEE);

  await page.getByRole("link", { name: "New expense" }).first().click();
  await page.getByLabel("Description").fill(description);
  await page.getByLabel("Amount (USD)").fill("23.45");
  await page.getByLabel("Date incurred").fill("2026-08-20");
  await page.getByLabel("Category").selectOption({ label: "Meals" });

  // The real upload: straight to Convex storage, before submit.
  await page.getByLabel(/Receipt/).setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByText(/Attached/)).toBeVisible();

  await page.getByRole("button", { name: "Submit for approval" }).click();

  // Lands on the detail page, pending.
  await expect(page.getByRole("heading", { name: description })).toBeVisible();
  await expect(page.getByText("Pending")).toBeVisible();
  await expect(page.getByText("$23.45")).toBeVisible();

  await signOut(page);

  // --- Manager ---
  await signIn(page, MANAGER);
  await page.getByRole("link", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();

  await page.getByRole("link").filter({ hasText: description }).click();
  await expect(page.getByRole("heading", { name: description })).toBeVisible();

  // The receipt the employee uploaded is readable by the manager.
  await expect(page.getByRole("link", { name: /Open receipt/ })).toBeVisible();

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/Approve .* submitted by/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm approval" }).click();

  await expect(page.getByText(/Approved by Maya Manager/)).toBeVisible();

  await signOut(page);

  // --- Back to the employee: the decision is visible to them too ---
  await signIn(page, EMPLOYEE);
  await page.getByRole("link").filter({ hasText: description }).click();
  await expect(page.getByText(/Approved by Maya Manager/)).toBeVisible();

  // And the history tells the whole story, to the employee as well.
  await expect(page.getByText("created this expense")).toBeVisible();
  await expect(page.getByText("submitted it for approval")).toBeVisible();
  await expect(page.getByText("approved it")).toBeVisible();
});
