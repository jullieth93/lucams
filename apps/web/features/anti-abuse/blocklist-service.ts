/*
 * Block-list persistente del anti-abuso COD (ADR-065).
 *
 * Lucy puede vetar a mano un teléfono, email o dirección (clave normalizada) que abusó
 * del contraentrega. `assessCodRisk` (features/checkout/cod-risk) consulta esta tabla
 * (fail-open) y bloquea el COD sin revelar la regla. Este módulo es la capa de servicio;
 * las Server Actions admin lo envuelven con `requireAdminAction`.
 */

import "server-only";
import { prisma, Prisma } from "@/lib/db";
import type { BlockedIdentityKind } from "@lucams/db";

export type BlockedIdentityRow = {
  id: string;
  kind: BlockedIdentityKind;
  value: string;
  reason: string;
  createdBy: string;
  createdAt: Date;
};

export class BlocklistError extends Error {
  constructor(
    public code: "ALREADY_BLOCKED" | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "BlocklistError";
  }
}

/** Normaliza el valor según el kind (debe coincidir con lo que evalúa cod-risk): email en
 *  minúsculas; phone/address (clave) tal cual, solo trim. */
export function normalizeBlockValue(kind: BlockedIdentityKind, raw: string): string {
  const v = raw.trim();
  return kind === "EMAIL" ? v.toLowerCase() : v;
}

export async function listBlockedIdentities(): Promise<BlockedIdentityRow[]> {
  return prisma.blockedIdentity.findMany({ orderBy: { createdAt: "desc" } });
}

export async function addBlockedIdentity(input: {
  kind: BlockedIdentityKind;
  value: string;
  reason: string;
  createdBy: string;
}): Promise<BlockedIdentityRow> {
  const value = normalizeBlockValue(input.kind, input.value);
  if (!value) throw new BlocklistError("INVALID", "El valor a bloquear no puede estar vacío.");
  const reason = input.reason.trim();
  if (!reason) throw new BlocklistError("INVALID", "Escribe un motivo del bloqueo.");
  try {
    return await prisma.blockedIdentity.create({
      data: { kind: input.kind, value, reason, createdBy: input.createdBy },
    });
  } catch (err) {
    // Índice único (kind, value): ya estaba bloqueada → idempotente hacia el admin.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BlocklistError("ALREADY_BLOCKED", "Esa identidad ya estaba bloqueada.");
    }
    throw err;
  }
}

export async function removeBlockedIdentity(id: string): Promise<void> {
  // deleteMany (no delete) → idempotente: quitar un id inexistente no lanza.
  await prisma.blockedIdentity.deleteMany({ where: { id } });
}
