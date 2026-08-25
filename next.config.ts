import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The clickjacking pair is the one that earns its place here. This app commits
 * financial decisions that, by design, cannot be reversed — so a signed-in
 * manager lured to an attacker page that frames the real app and harvests a
 * single click onto "Approve" is a genuine attack, not a theoretical one.
 * `frame-ancestors` is the modern control; `X-Frame-Options` covers browsers
 * that predate it.
 *
 * Deliberately NOT set here: a `script-src`/`style-src` CSP. Next inlines its
 * bootstrap scripts, so a strict policy needs per-request nonces threaded
 * through middleware — and this middleware is already the least battle-tested
 * part of the stack (Convex Auth is 0.0.x). That is recorded as the next
 * hardening step in docs/security-audit.md (M2) rather than rushed in.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Stops a browser second-guessing a declared type — relevant because users
  // upload files that are later served back.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Receipt URLs must never leak to another origin through a Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
