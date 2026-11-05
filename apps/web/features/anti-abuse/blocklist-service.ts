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

/**
 * Normaliza un teléfono humano a forma canónica de identidad anti-abuso ([SEC-03]):
 *   - Móviles colombianos de 10 dígitos (`3XXXXXXXXX`), vengan como `+57 300 123 4567`,
 *     `0057-300-123-4567`, `573001234567` o `300 123 4567` → `+573001234567`.
 *   - Otros números telefónicos de 7..15 dígitos → `+<dígitos>`.
 *   - Cadenas sintéticas con letras (p.ej. fixtures de tests `codrisk...-blk`) → trim sin destruir letras.
 */
export function normalizePhoneIdentity(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/[a-zA-Z]/.test(trimmed)) return trimmed;

  const compact = trimmed.replace(/[\s().\-\u00A0]/g, "");
  const coWithPrefix = /^(?:\+?57|0057)(3\d{9})$/.exec(compact);
  if (coWithPrefix) return `+57${coWithPrefix[1]}`;

  const coLocalMobile = /^(3\d{9})$/.exec(compact);
  if (coLocalMobile) return `+57${coLocalMobile[1]}`;

  const intlDigits = /^\+?(\d{7,15})$/.exec(compact);
  if (intlDigits) return `+${intlDigits[1]}`;

  return compact;
}

/**
 * Devuelve todas las variantes equivalentes de búsqueda para cubrir tanto filas nuevas
 * canónicas (`+573001234567`) como filas históricas previas (`3001234567`, `573001234567`
 * o con formato crudo) sin requerir migración destructiva.
 */
export function phoneIdentityVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const canonical = normalizePhoneIdentity(trimmed);
  const out = new Set<string>([canonical, trimmed]);
  const coMatch = /^\+57(3\d{9})$/.exec(canonical);
  if (coMatch) {
    out.add(coMatch[1]!);
    out.add(`57${coMatch[1]!}`);
  }
  return [...out];
}

/** Normaliza el valor según el kind (coherente con `assessCodRisk`): email en minúsculas;
 *  phone canónico (`+57...`); address (clave ya normalizada) con trim. */
export function normalizeBlockValue(kind: BlockedIdentityKind, raw: string): string {
  const v = raw.trim();
  if (kind === "EMAIL") return v.toLowerCase();
  if (kind === "PHONE") return normalizePhoneIdentity(v);
  return v;
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
