/*
 * Helpers para construir keys de rate-limit consistentes.
 *
 * Los datos sensibles (emails) se hashean antes de usarse como key del
 * bucket para no aparezcan en claro en logs o en la tabla
 * rate_limit_buckets. SHA-256 truncado a 16 chars es suficiente para
 * disambiguar 2^64 emails sin colisiones prácticas.
 *
 * Patrón de keys:
 *   - signup:ip:1.2.3.4
 *   - signup:email:abc123def456...
 *   - login:ip:5.6.7.8
 *   - login:email:hashhashhash...
 *   - reset-password:ip:...
 *   - reset-password:email:...
 *
 * Combinar IP + email layers cubre dos vectores de ataque:
 *   - Un atacante con muchas IPs (botnet) → bloqueado por bucket de email
 *   - Un atacante atacando muchos emails desde una IP → bloqueado por IP
 */

import { createHash } from "node:crypto";

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex").slice(0, 16);
}

export function ipKey(scope: string, ip: string): string {
  return `${scope}:ip:${ip}`;
}

export function emailKey(scope: string, email: string): string {
  return `${scope}:email:${hashEmail(email)}`;
}

/** Key por dueño (customerId o sessionId anónima) — para abuso por sesión. */
export function ownerKey(scope: string, ownerId: string): string {
  return `${scope}:owner:${ownerId}`;
}
