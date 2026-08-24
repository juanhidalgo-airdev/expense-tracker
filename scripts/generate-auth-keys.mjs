#!/usr/bin/env node
/**
 * Generates the RS256 key pair Convex Auth signs its tokens with, and sets
 * JWT_PRIVATE_KEY, JWKS and SITE_URL on the Convex deployment.
 *
 *   npm run setup:auth              # dev deployment,  SITE_URL=http://localhost:3000
 *   npm run setup:auth -- --prod --site-url https://your-app.vercel.app
 *
 * This is what `npx @convex-dev/auth` does, minus the parts that rewrite
 * convex/auth.ts and convex/http.ts — those are hand-written in this repo
 * (sign-up is deliberately blocked in auth.ts, and the CLI would overwrite it).
 * The key format below matches the CLI exactly: a PKCS#8 PEM with newlines
 * replaced by spaces, and a JWKS containing the public key with `use: "sig"`.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const args = process.argv.slice(2);
const isProd = args.includes("--prod");

const siteUrlFlag = args.indexOf("--site-url");
const siteUrl =
  siteUrlFlag !== -1 ? args[siteUrlFlag + 1] : isProd ? null : "http://localhost:3000";

if (!siteUrl) {
  console.error("--site-url is required with --prod (the deployed origin, no trailing slash).");
  process.exit(1);
}

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);

const JWT_PRIVATE_KEY = privateKey.trimEnd().replace(/\n/g, " ");
const JWKS = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

// Resolve the Convex CLI's JS entrypoint and run it with the current Node
// binary. Invoking `npx`/`npx.cmd` via execFileSync fails on Windows under
// Node 20+, which refuses to execute .cmd shims without a shell — and using a
// shell is exactly what we are avoiding, since the PEM and JWKS would then be
// subject to shell quoting.
// `convex/bin/main.js` is not listed in the package's `exports` map, so
// require.resolve() on it throws — resolve the package root and join instead.
const require = createRequire(import.meta.url);
const convexRoot = path.dirname(require.resolve("convex/package.json"));
const convexBin = path.join(convexRoot, "bin", "main.js");

if (!existsSync(convexBin)) {
  console.error(`Could not find the Convex CLI at ${convexBin}. Run npm install first.`);
  process.exit(1);
}

function setEnv(name, value) {
  const flags = isProd ? ["--prod"] : [];
  // `--` stops option parsing: the PKCS#8 PEM begins with "-----BEGIN", which
  // the CLI's argument parser would otherwise read as an unknown flag.
  execFileSync(process.execPath, [convexBin, "env", ...flags, "set", "--", name, value], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  console.log(`  set ${name}`);
}

console.log(`Configuring Convex Auth on the ${isProd ? "production" : "dev"} deployment…`);
setEnv("JWT_PRIVATE_KEY", JWT_PRIVATE_KEY);
setEnv("JWKS", JWKS);
setEnv("SITE_URL", siteUrl);
console.log(`Done. SITE_URL=${siteUrl}`);
