/*
 * GET /admin/marketing/suscriptores/export — descarga CSV de la audiencia del
 * newsletter (Fase 3A, feedback Lucy 2026-09-18).
 *
 * Server-side (la tabla Consent no sale por el cliente): mismo universo que la
 * página — ledger NEWSLETTER deduplicado por email, último estado gana — pero
 * SIN paginar. Ruta bajo /admin/* → protegida por el proxy; además valida
 * sesión + rol + MFA con requireRole (defensa en profundidad, mismo patrón que
 * la descarga del ZIP de producción en pedidos/[number]/produccion/route.ts).
 */

import { requireRole } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import {
  buildNewsletterCsv,
  listAllNewsletterSubscribers,
} from "@/features/newsletter/admin-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireRole(ADMIN_ROLE_SETS.MANAGER_UP);

  const items = await listAllNewsletterSubscribers();
  const csv = buildNewsletterCsv(items);
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  logger.info({ event: "newsletter.subscribers.export", total: items.length });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suscriptores-newsletter-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
