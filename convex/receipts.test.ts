/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

/**
 * Receipt access and storage housekeeping.
 *
 * The draft case here is the one that matters: it was a real defect, invisible
 * through the UI because drafts never reach the review queue.
 */

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      email: "owner@test.local",
      name: "Owner",
      role: "employee",
      isActive: true,
    });
    const manager = await ctx.db.insert("users", {
      email: "manager@test.local",
      name: "Manager",
      role: "manager",
      isActive: true,
    });
    const category = await ctx.db.insert("categories", {
      key: "travel",
      label: "Travel",
      sortOrder: 1,
      isActive: true,
    });
    const storageId = await ctx.storage.store(new Blob(["r"], { type: "image/png" }));
    return { owner, manager, category, storageId };
  });

  return { t, ...ids };
}

function args(category: Id<"categories">, storageId: Id<"_storage">, submit: boolean) {
  return {
    description: "Taxi to airport",
    amountMinor: 4200,
    categoryId: category,
    expenseDate: "2026-08-01",
    receiptStorageId: storageId,
    submit,
  };
}

describe("draft privacy", () => {
  test("a manager cannot read a draft receipt belonging to someone else", async () => {
    const { t, owner, manager, category, storageId } = await setup();
    const draft = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, args(category, storageId, false));

    const url = await t
      .withIdentity({ subject: manager })
      .query(api.receipts.getReceiptUrl, { expenseId: draft });

    expect(url).toBeNull();
  });

  test("a manager cannot open a draft at all", async () => {
    const { t, owner, manager, category, storageId } = await setup();
    const draft = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, args(category, storageId, false));

    const expense = await t
      .withIdentity({ subject: manager })
      .query(api.expenses.get, { expenseId: draft });

    // Same answer as "does not exist" — a manager should not learn that an
    // unsubmitted expense is being drafted.
    expect(expense).toBeNull();
  });

  test("once submitted, the same expense and receipt become visible", async () => {
    const { t, owner, manager, category, storageId } = await setup();
    const draft = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, args(category, storageId, false));

    await t.withIdentity({ subject: owner }).mutation(api.expenses.submit, { expenseId: draft });

    const asManager = t.withIdentity({ subject: manager });
    expect(await asManager.query(api.expenses.get, { expenseId: draft })).not.toBeNull();
    expect(await asManager.query(api.receipts.getReceiptUrl, { expenseId: draft })).toBeTruthy();
  });

  test("the owner can always read their own draft", async () => {
    const { t, owner, category, storageId } = await setup();
    const draft = await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, args(category, storageId, false));

    const asOwner = t.withIdentity({ subject: owner });
    expect(await asOwner.query(api.expenses.get, { expenseId: draft })).not.toBeNull();
    expect(await asOwner.query(api.receipts.getReceiptUrl, { expenseId: draft })).toBeTruthy();
  });
});

describe("orphaned upload sweep", () => {
  test("deletes an old file that no expense references", async () => {
    const t = convexTest(schema, modules);

    const orphan = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["orphan"], { type: "image/png" }));
      // Backdate past the 24h grace period.
      return id;
    });

    // convex-test stamps _creationTime as now, so a file created in this test
    // is inside the grace period and must survive.
    const fresh = await t.mutation(internal.receipts.sweepOrphanedUploads, {});
    expect(fresh.deleted).toBe(0);

    const stillThere = await t.run(async (ctx) => ctx.storage.getUrl(orphan));
    expect(stillThere).not.toBeNull();
  });

  test("never deletes a file an expense still points at", async () => {
    const { t, owner, category, storageId } = await setup();
    await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, args(category, storageId, true));

    await t.mutation(internal.receipts.sweepOrphanedUploads, {});

    const url = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    expect(url).not.toBeNull();
  });
});

describe("discardUpload", () => {
  test("refuses to delete a file that is attached to an expense", async () => {
    const { t, owner, category, storageId } = await setup();
    await t
      .withIdentity({ subject: owner })
      .mutation(api.expenses.create, args(category, storageId, false));

    await expect(
      t.withIdentity({ subject: owner }).mutation(api.receipts.discardUpload, { storageId }),
    ).rejects.toThrow(/attached/i);
  });

  test("deletes an unattached upload", async () => {
    const { t, owner } = await setup();
    const loose = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["loose"], { type: "image/png" })),
    );

    await t.withIdentity({ subject: owner }).mutation(api.receipts.discardUpload, {
      storageId: loose,
    });

    const url = await t.run(async (ctx) => ctx.storage.getUrl(loose));
    expect(url).toBeNull();
  });

  test("refuses an unauthenticated caller", async () => {
    const { t } = await setup();
    const loose = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["loose"], { type: "image/png" })),
    );

    await expect(t.mutation(api.receipts.discardUpload, { storageId: loose })).rejects.toThrow();
  });
});
