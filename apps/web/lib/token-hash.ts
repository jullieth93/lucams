import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

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

/**
 * Comparación en tiempo constante de dos hashes hex SHA-256 (64 chars).
 */
export function verifyTokenHashTimingSafe(
  candidateToken: string,
  expectedHashHex: string | null | undefined,
): boolean {
  if (!expectedHashHex || !/^[a-f0-9]{64}$/i.test(expectedHashHex)) return false;
  const candidateBuf = createHash("sha256").update(candidateToken).digest();
  const expectedBuf = Buffer.from(expectedHashHex.toLowerCase(), "hex");
  if (candidateBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(candidateBuf, expectedBuf);
}

/**
 * Comparación en tiempo constante de correo electrónico normalizado (`trim().toLowerCase()`),
 * usando digest SHA-256 de longitud fija para no filtrar ni longitud ni prefijos del comprador
 * cuando un tercero (p.ej. destinatario de regalo con acceso a `/pedido/[token]`) intenta adivinarlo.
 */
export function verifyEmailMatchesTimingSafe(
  candidateEmail: string,
  expectedEmail: string | null | undefined,
): boolean {
  const normCandidate = candidateEmail.trim().toLowerCase();
  const normExpected = (expectedEmail ?? "").trim().toLowerCase();
  if (!normCandidate || !normExpected) return false;
  const digestA = createHash("sha256").update(normCandidate).digest();
  const digestB = createHash("sha256").update(normExpected).digest();
  return timingSafeEqual(digestA, digestB);
}
