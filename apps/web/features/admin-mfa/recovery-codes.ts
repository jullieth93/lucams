import "server-only";

/*
 * Códigos de respaldo de MFA admin (Lucy 2026-06-27).
 *
 * Supabase no provee recovery codes nativos para TOTP. Los gestionamos acá:
 * guardamos solo el HASH (HMAC-SHA256 con pepper de servidor desde 2026-08-29,
 * auditoría B-5); el código en claro se muestra UNA vez. Al usarse en el login,
 * se marca usedAt y se desactiva el factor TOTP (acceso de emergencia) —
 * patrón estándar: tras usar uno, se vuelve a configurar MFA.
 */

import { createHash, createHmac, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I/L ambiguos
const CODE_COUNT = 10;
// Auditoría 2026-08-24 · B-5: 10 chars eran ~49,5 bits de entropía — con la tabla
// exfiltrada, un GPU cluster crackeaba un código en horas. 16 chars ≈ 79 bits.
// Se muestran en 4 grupos de 4 (fáciles de transcribir bajo estrés).
const CODE_LEN = 16;

function normalize(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Hash del código con pepper de servidor (B-5, "mínimo alternativo" de la
 * auditoría): HMAC-SHA256 keyed con CSRF_SECRET — var CORE fail-fast en
 * lib/env.ts, así que no se introduce una env nueva. Sin la env, un volcado de
 * la tabla ya no alcanza para crackear los códigos offline.
 */
function hashCode(code: string): string {
  return createHmac("sha256", process.env.CSRF_SECRET ?? "")
    .update(normalize(code))
    .digest("hex");
}

// TODO(security): remove legacy fallback once all codes issued before the
// 2026-08-29 HMAC migration have been used or rotated (regenerar = rehash).
// Hash pre-B-5: sha256 plano del código normalizado (sin pepper).
function legacyHashCode(code: string): string {
  return createHash("sha256").update(normalize(code)).digest("hex");
}

function randomCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LEN; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
}

/**
 * Genera (o regenera) los códigos de respaldo del admin: borra los anteriores,
 * crea CODE_COUNT nuevos, guarda los hashes y devuelve los códigos en CLARO
 * (para mostrarlos una sola vez).
 */
export async function generateRecoveryCodes(adminUserId: string): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, randomCode);
  await prisma.$transaction([
    prisma.adminRecoveryCode.deleteMany({ where: { adminUserId } }),
    prisma.adminRecoveryCode.createMany({
      data: codes.map((c) => ({ adminUserId, codeHash: hashCode(c) })),
    }),
  ]);
  return codes;
}

/** Cuántos códigos sin usar le quedan al admin. */
export async function countUnusedRecoveryCodes(adminUserId: string): Promise<number> {
  return prisma.adminRecoveryCode.count({ where: { adminUserId, usedAt: null } });
}

/**
 * Verifica un código de respaldo. Si es válido y no usado, lo marca como usado
 * y devuelve true. Constante en el sentido de que el lookup es por hash.
 *
 * Consumo ATÓMICO (B-5): un único updateMany con `usedAt: null` en el WHERE —
 * éxito si y solo si count === 1. El findFirst+update anterior permitía que
 * dos requests concurrentes consumieran el mismo código (TOCTOU).
 */
export async function consumeRecoveryCode(adminUserId: string, code: string): Promise<boolean> {
  // Primero el hash actual (HMAC con pepper); si no pega, el legacy sha256
  // plano para que los códigos emitidos antes de la migración sigan sirviendo.
  // Ambos caminos consumen con el mismo updateMany atómico.
  for (const codeHash of [hashCode(code), legacyHashCode(code)]) {
    const { count } = await prisma.adminRecoveryCode.updateMany({
      where: { adminUserId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 1) return true;
  }
  return false;
}
