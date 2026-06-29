import "server-only";

/*
 * Códigos de respaldo de MFA admin (Lucy 2026-06-27).
 *
 * Supabase no provee recovery codes nativos para TOTP. Los gestionamos acá:
 * guardamos solo el HASH (sha256); el código en claro se muestra UNA vez.
 * Al usarse en el login, se marca usedAt y se desactiva el factor TOTP (acceso
 * de emergencia) — patrón estándar: tras usar uno, se vuelve a configurar MFA.
 */

import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I/L ambiguos
const CODE_COUNT = 10;
const CODE_LEN = 10; // 2 grupos de 5

function normalize(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashCode(code: string): string {
  return createHash("sha256").update(normalize(code)).digest("hex");
}

function randomCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LEN; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
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
 */
export async function consumeRecoveryCode(adminUserId: string, code: string): Promise<boolean> {
  const hash = hashCode(code);
  const match = await prisma.adminRecoveryCode.findFirst({
    where: { adminUserId, codeHash: hash, usedAt: null },
    select: { id: true },
  });
  if (!match) return false;
  await prisma.adminRecoveryCode.update({
    where: { id: match.id },
    data: { usedAt: new Date() },
  });
  return true;
}
