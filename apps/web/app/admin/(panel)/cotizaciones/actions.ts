"use server";

/*
 * Server actions locales del módulo /admin/cotizaciones (Etapa 1).
 *
 * Wrappers delgados sobre features/quotes/admin-service (updateQuoteStatus /
 * addQuoteInternalNote), que YA traen requireAdminAction (SUPERADMIN/MANAGER)
 * + AdminActionLog. Acá solo validamos input, traducimos errores y revalidamos.
 *
 * OJO: el guard del service hace redirect() ante sesión inválida → la acción
 * NO debe tragarse la excepción NEXT_REDIRECT dentro del try (patrón del repo:
 * re-lanzarla en el catch).
 */

import { revalidatePath } from "next/cache";
import type { QuoteStatus } from "@lucams/db";
import { logger } from "@/lib/logger";
import {
  QuoteNotFoundError,
  addQuoteInternalNote,
  updateQuoteStatus,
} from "@/features/quotes/admin-service";

type St = { error?: string; success?: string } | null;

const QUOTE_STATUSES: readonly QuoteStatus[] = [
  "PENDING",
  "CONTACTED",
  "CLOSED",
  "DISCARDED",
];

const STATUS_SUCCESS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "pendiente",
  CONTACTED: "contactada",
  CLOSED: "cerrada",
  DISCARDED: "descartada",
};

export async function setQuoteStatusAction(_p: St, fd: FormData): Promise<St> {
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "") as QuoteStatus;
  if (!id) return { error: "Falta id" };
  if (!QUOTE_STATUSES.includes(status)) return { error: "Estado inválido" };
  try {
    await updateQuoteStatus(id, status);
  } catch (err) {
    // requireAdminAction (dentro del service) lanza NEXT_REDIRECT ante sesión
    // inválida — no convertirla en mensaje de error.
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (err instanceof QuoteNotFoundError) return { error: "La cotización no existe." };
    logger.warn({
      event: "admin.quote.status_fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo actualizar el estado." };
  }
  revalidatePath("/admin/cotizaciones");
  revalidatePath(`/admin/cotizaciones/${id}`);
  return { success: `Cotización marcada como ${STATUS_SUCCESS_LABEL[status]}.` };
}

export async function addQuoteNoteAction(_p: St, fd: FormData): Promise<St> {
  const id = String(fd.get("id") ?? "");
  const note = String(fd.get("note") ?? "");
  if (!id) return { error: "Falta id" };
  try {
    await addQuoteInternalNote(id, note);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (err instanceof QuoteNotFoundError) return { error: "La cotización no existe." };
    // Errores de VALIDACIÓN del service (nota vacía / >2000 chars): el mensaje
    // es seguro y útil para el admin — se muestra tal cual.
    if (err instanceof Error && /nota/i.test(err.message)) return { error: err.message };
    logger.warn({
      event: "admin.quote.note_fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo guardar la nota." };
  }
  revalidatePath(`/admin/cotizaciones/${id}`);
  return { success: "Nota agregada." };
}
