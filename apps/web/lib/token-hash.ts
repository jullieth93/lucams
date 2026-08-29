import "server-only";
import { createHash } from "node:crypto";

/**
 * F-11 (security audit 2026-08-24): public bearer tokens — Order/Quote
 * publicAccessToken, Design.shareToken, AbandonedCart.recoverToken — are
 * stored at rest ONLY as their SHA-256 hex digest (`<field>Hash` columns).
 *
 * The plain token is generated with crypto.randomBytes as before and returned
 * once to the caller (to build the email/link); it is NEVER persisted.
 * Lookups hash the presented token and query by the hash column. A DB leak
 * (backup, query log) no longer exposes usable /pedido/<token> etc. links.
 * Unsalted SHA-256 is enough here: the tokens carry 128-192 bits of CSPRNG
 * entropy, so precomputation is infeasible — same pattern as AdminRecoveryCode
 * (features/admin-mfa/recovery-codes.ts).
 */
export function hashBearerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
