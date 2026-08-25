/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as categories from "../categories.js";
import type * as crons from "../crons.js";
import type * as expenses from "../expenses.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_transitions from "../lib/transitions.js";
import type * as lib_validation from "../lib/validation.js";
import type * as receipts from "../receipts.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  categories: typeof categories;
  crons: typeof crons;
  expenses: typeof expenses;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/events": typeof lib_events;
  "lib/permissions": typeof lib_permissions;
  "lib/transitions": typeof lib_transitions;
  "lib/validation": typeof lib_validation;
  receipts: typeof receipts;
  seed: typeof seed;
  seedData: typeof seedData;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
