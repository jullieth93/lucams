/*
 * /api/vitals — endpoint para Web Vitals RUM reporting.
 *
 * Recibe payload de `components/web-vitals.tsx` (handlers del build de
 * atribución de web-vitals) y persiste en `WebVital` table.
 * /admin/performance lo agrega (Sub-bloque F) para mostrar p50/p75/p95
 * por route.
 *
 * No requiere auth — el RUM se envía desde cualquier visitante. Pero:
 *   - Validación Zod estricta (sanitiza route + name + rating) + techo de
 *     valor por métrica (fail-closed: fuera de rango no se persiste).
 *   - Rate-limit por sessionId/IP en sub-bloque F.
 *   - userAgent y sessionId quedan opcionales (no PII).
 *   - Sin email ni customerId en este payload (no necesitamos).
 */

import { NextResponse } from "next/server";
import { readBodyWithLimit, BodyTooLargeError } from "@/lib/read-body-with-limit";

// LUC-SEC-007 — techo de aplicación del body de ESTA ruta (plataforma = 2ª capa).
const VITALS_MAX_BODY_BYTES = 16 * 1024;
// Fase 4 (#15) — tope de métricas por lote (un pageview emite ≤7 métricas;
// 15 cubre ráfagas SPA manteniendo el request y el INSERT estrictamente acotados).
export const VITALS_MAX_BATCH_SIZE = 15;
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

// Endpoint dinámico (no pre-renderizable). En Next 16 con turbopack, los
// route handlers que importan transitivamente pino fallaban al "collect
// page data" durante `next build` con el error críptico:
//   Error: default level:info must be included in custom levels
// Forzar dynamic skipea ese análisis estático.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VitalSchema = z.object({
  // 2026-10-09 (Paquete C): LONGTASK (value=ms totales de long tasks,
  // delta=cantidad) y PAGEWEIGHT (value=bytes transferidos, delta=recursos),
  // agregadas por pageview en el reporter — 1 fila por página por métrica.
  name: z.enum(["LCP", "FID", "CLS", "INP", "TTFB", "FCP", "LONGTASK", "PAGEWEIGHT"]),
  // min(0): ninguna métrica de web-vitals ni los agregados propios pueden
  // ser negativos — un negativo es bug de reporte, no se persiste.
  value: z.number().finite().min(0),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  delta: z.number().finite().min(0),
  navType: z
    .enum(["navigate", "reload", "back-forward", "back-forward-cache", "prerender"])
    .optional(),
  // Route normalizada (ej. "/producto/[slug]") — el cliente la pasa.
  route: z
    .string()
    .max(200)
    .regex(/^\/[a-zA-Z0-9/_\-[\]]*$/),
  sessionId: z.string().max(100).optional(),
  // Selector CSS del elemento asociado (web-vitals attribution):
  // INP → interactionTarget, CLS → largestShiftTarget, LCP → element.
  target: z.string().max(200).optional(),
});

const VitalBatchSchema = z
  .object({
    metrics: z.array(VitalSchema).min(1).max(VITALS_MAX_BATCH_SIZE),
  })
  .strict();

const VitalsPayloadSchema = z.union([VitalSchema, VitalBatchSchema]);

type VitalInput = z.infer<typeof VitalSchema>;
type VitalName = VitalInput["name"];

/* Techo de valor por métrica (auditoría RUM 2026-10-20): 120 filas INP con
   value=28680ms exactos (2026-10-02, sin sessionId ni target) distorsionaban
   max/p95 del panel — artefacto de reporte, no latencia real. Los techos son
   generosos (un INP real p98 está muy por debajo de 10s; un LCP en conexión
   mala muy por debajo de 60s) y fail-closed: fuera de rango = NO se guarda.
   Unidades: ms para timings, score para CLS, bytes para PAGEWEIGHT. */
const MAX_VALUE_BY_METRIC: Record<VitalName, number> = {
  INP: 10_000,
  LCP: 60_000,
  FCP: 60_000,
  TTFB: 60_000,
  FID: 60_000,
  CLS: 100,
  LONGTASK: 300_000,
  PAGEWEIGHT: 500_000_000,
};

/* sessionId fallback server-side (Paquete C 2026-10-09): la cookie del carrito
   `cart_session` es HttpOnly (lib/cart-session.ts) — el reporter cliente NO
   puede leerla, pero el beacon/fetch same-origin la incluye en el header
   Cookie. La extraemos acá para correlacionar métricas de una misma visita.
   Misma defensa que peekCartSession: solo se acepta forma UUID. */
function cartSessionFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)cart_session=([^;]+)/);
  const value = match?.[1]?.trim();
  if (!value) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value;
}

export async function POST(request: Request) {
  try {
    // Rate-limit por IP (auditoría 2026-07-13): endpoint público que escribe WebVital →
    // sin límite era un vector de inflado de la tabla. 120/min es holgado para RUM real.
    // La key lleva la IP hasheada (auditoría 2026-08-24, C-8): la IP es dato personal
    // y no debe quedar en claro en rate_limit_buckets.
    const clientIp = getClientIp(request.headers);
    const { allowed } = await rateLimit(ipKey("vitals", clientIp), 120, 60);
    if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

    // LUC-SEC-007 — techo de aplicación: un beacon de vitals son <2 KB (lote ≤15 cabe en 16 KB).
    let body: unknown;
    try {
      body = JSON.parse(await readBodyWithLimit(request, VITALS_MAX_BODY_BYTES));
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return NextResponse.json({ error: "payload too large" }, { status: 413 });
      }
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const parsed = VitalsPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const items: VitalInput[] = "metrics" in parsed.data ? parsed.data.metrics : [parsed.data];

    // Fail-closed ante valores absurdos (artefactos de reporte): no se
    // persisten. En lotes se descarta únicamente la métrica fuera de rango;
    // si todas se descartan respondemos 200 ok:false para que el beacon no reintente.
    const ua = request.headers.get("user-agent")?.slice(0, 500) ?? null;
    const cookieSessionId = cartSessionFromCookies(request.headers.get("cookie"));
    const rowsToPersist = [];
    let dropped = 0;

    for (const item of items) {
      const maxValue = MAX_VALUE_BY_METRIC[item.name];
      if (item.value > maxValue) {
        dropped += 1;
        logger.warn(
          {
            event: "vitals.out_of_range",
            name: item.name,
            value: item.value,
            max: maxValue,
            route: item.route,
          },
          "Web vital descartada por valor fuera de rango",
        );
        continue;
      }
      rowsToPersist.push({
        name: item.name,
        value: item.value,
        rating: item.rating,
        delta: item.delta,
        navType: item.navType ?? null,
        route: item.route,
        sessionId: item.sessionId ?? cookieSessionId,
        target: item.target ?? null,
        userAgent: ua,
      });
    }

    if (rowsToPersist.length === 0) {
      return NextResponse.json({ ok: false });
    }

    // Anti-amplificación por lote (Fase 4 · #15 / H-1): en lotes (>1 fila)
    // descontamos el costo REAL en filas tanto del presupuesto por IP (120 filas/min)
    // como del backstop global C-1 (3000 filas/5 min), evitando multiplicar 15× la cuota.
    if (rowsToPersist.length > 1) {
      const rlIpRows = await rateLimit(
        ipKey("vitals:rows", clientIp),
        120,
        60,
        rowsToPersist.length,
      );
      if (!rlIpRows.allowed) return NextResponse.json({ ok: false }, { status: 429 });
    }

    // Backstop global (auditoría 2026-08-24, C-1): tope de filas nuevas sin importar la IP
    // de origen (un botnet rota IPs y multiplica el límite por-IP). Mismo patrón que
    // NEW_ROW_LIMIT de lib/error-capture.ts. 200 (no 429) para que el beacon no reintente.
    const rlGlobal = await rateLimit("vitals:new-row:global", 3000, 5 * 60, rowsToPersist.length);
    if (!rlGlobal.allowed) return NextResponse.json({ ok: false });

    if (rowsToPersist.length === 1) {
      await prisma.webVital.create({ data: rowsToPersist[0]! });
    } else {
      await prisma.webVital.createMany({ data: rowsToPersist });
    }

    return NextResponse.json({
      ok: true,
      accepted: rowsToPersist.length,
      ...(dropped > 0 ? { dropped } : {}),
    });
  } catch (err) {
    logger.warn(
      { event: "vitals.persist_fail", err: err instanceof Error ? err.message : String(err) },
      "Failed to persist web vital",
    );
    // Respuesta 200 incluso si fallamos — no queremos que el cliente
    // intente retry y termine spammeando el endpoint.
    return NextResponse.json({ ok: false });
  }
}
