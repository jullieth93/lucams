/*
 * Service layer — Moderación de contenido de diseños (ADR-062 P0-2).
 *
 * Print-on-demand: cada diseño personalizado se imprime y despacha físicamente. Lucy revisa
 * TODOS los diseños de pedidos activos (PAID/FULFILLING) antes de producir. El gate del envío
 * (transitionOrderAction → SHIPPED) bloquea hasta que todos los diseños del pedido estén APPROVED.
 *
 * A4-01 (cert 2026-09-26): la cola también incluye diseños COMPARTIDOS por link público
 * (/d/<token>) aunque no tengan pedido ni cotización — son contenido público y deben
 * moderarse igual. Rechazar un diseño revoca su link público (ver rejectDesign).
 *
 * La app opera vía Prisma (rol privilegiado). Estas funciones son server-only.
 */

import "server-only";
import { prisma } from "@/lib/db";

// Estados de pedido en los que un diseño AÚN puede/deber moderarse antes de imprimir.
const ACTIVE_ORDER_STATUSES = ["PAID", "FULFILLING"] as const;
// Estados de cotización cuyo diseño todavía puede acabar en la mesa de trabajo. DISCARDED queda
// fuera: esa cotización ya se descartó y su diseño no se va a fabricar.
const ACTIVE_QUOTE_STATUSES = ["PENDING", "CONTACTED", "CLOSED"] as const;

/** De dónde viene el diseño que hay que moderar. En Etapa 1 son todas cotizaciones. */
export type ModerationSource = { tipo: "pedido" | "cotizacion"; numero: string; contacto: string };

function dedupeSources(sources: ModerationSource[]): ModerationSource[] {
  const byNumber = new Map<string, ModerationSource>();
  for (const s of sources) byNumber.set(s.numero, s);
  return [...byNumber.values()];
}

export type PendingModerationDesign = {
  designId: string;
  previewUrl: string | null;
  productionUrls: string[];
  productName: string;
  createdAt: Date;
  /** Paquete C (2026-10-02) — timestamp de la aceptación explícita de calidad
   *  de fotos en la Vista Previa del Estudio (checkbox obligatorio cuando el
   *  diseño usa fotos con avisos). null = sin avisos o diseño anterior. */
  qualityAcknowledgedAt: Date | null;
  /** Pedidos Y cotizaciones que esperan por este diseño. Vacío si el diseño
   *  solo está COMPARTIDO por link público (A4-01). */
  sources: ModerationSource[];
  /** true si el diseño tiene link público /d/<token> vivo (shareTokenHash != null). */
  shared: boolean;
};

/** Cola de moderación: diseños PENDING de pedidos activos, cotizaciones activas
 *  o COMPARTIDOS por link público, más antiguos primero. */
export async function listPendingModeration(): Promise<PendingModerationDesign[]> {
  const designs = await prisma.design.findMany({
    where: {
      moderationStatus: "PENDING",
      // El OR con cotizaciones es lo que hace existir esta cola en la Etapa 1 (Lucy 2026-07-25).
      // Filtrar solo por pedidos la dejaba ESTRUCTURALMENTE vacía —no hay pedidos mientras la tienda
      // opera por cotización—, así que los 699 diseños de la base estaban en PENDING sin forma
      // humana de aprobarlos y toda hoja de taller habría salido marcada "no imprimir".
      //
      // A4-01 (cert 2026-09-26): la tercera rama (shareTokenHash != null) cubre los diseños
      // SOLO-COMPARTIDOS — el cliente los publica en /d/<token> sin pedido ni cotización, y sin
      // esta rama nunca pasaban por moderación pese a ser contenido público.
      OR: [
        {
          orderItems: {
            some: { order: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null } },
          },
        },
        {
          quoteItems: {
            some: { quote: { status: { in: [...ACTIVE_QUOTE_STATUSES] }, deletedAt: null } },
          },
        },
        { shareTokenHash: { not: null } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      previewUrl: true,
      productionUrls: true,
      createdAt: true,
      qualityAcknowledgedAt: true,
      // Solo para derivar `shared` (boolean) — el hash NUNCA sale del service.
      shareTokenHash: true,
      product: { select: { name: true } },
      orderItems: {
        where: { order: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null } },
        select: { order: { select: { number: true, email: true } } },
      },
      quoteItems: {
        where: { quote: { status: { in: [...ACTIVE_QUOTE_STATUSES] }, deletedAt: null } },
        select: { quote: { select: { number: true, customerWhatsapp: true } } },
      },
    },
  });
  return designs.map((d) => ({
    designId: d.id,
    previewUrl: d.previewUrl,
    productionUrls: d.productionUrls,
    productName: d.product.name,
    createdAt: d.createdAt,
    qualityAcknowledgedAt: d.qualityAcknowledgedAt,
    shared: d.shareTokenHash !== null,
    sources: dedupeSources([
      ...d.orderItems.map((o) => ({
        tipo: "pedido" as const,
        numero: o.order.number,
        contacto: o.order.email,
      })),
      ...d.quoteItems.map((q) => ({
        tipo: "cotizacion" as const,
        numero: q.quote.number,
        contacto: q.quote.customerWhatsapp,
      })),
    ]),
  }));
}

/**
 * Paths de las piezas reales de producción de UN diseño (bucket privado production-assets).
 * La cola de moderación ya no firma los PNGs de todos los diseños al renderizar (eran 2-5 MB
 * por pieza × hasta 24 por diseño): la grilla muestra el previewUrl y el admin pide las piezas
 * reales bajo demanda (modal "ver piezas") — la server action firma solo estas rutas.
 */
export async function getDesignProductionPaths(designId: string): Promise<string[]> {
  const design = await prisma.design.findUnique({
    where: { id: designId },
    select: { productionUrls: true },
  });
  return design?.productionUrls ?? [];
}

/** Aprueba un diseño para producción. Idempotente en la práctica (re-aprobar es no-op semántico). */
export async function approveDesign(designId: string, adminId: string): Promise<void> {
  await prisma.design.update({
    where: { id: designId },
    data: {
      moderationStatus: "APPROVED",
      moderationReason: null,
      moderatedAt: new Date(),
      moderatedById: adminId,
    },
  });
}

export type RejectResult = { productName: string; sources: ModerationSource[] };

/**
 * Rechaza un diseño (contenido no apto para imprimir). Devuelve la info para avisar al cliente
 * (pedidos afectados + producto). El gate impedirá que esos pedidos se marquen SHIPPED.
 *
 * A4-01 (cert 2026-09-26): el rechazo también REVOCA el link público /d/<token>
 * (shareTokenHash=null) — un diseño rechazado no puede seguir publicado. Si luego
 * se aprueba, el link NO se restaura: el token plano es irrecuperable por diseño
 * (F-11, solo queda el hash); el cliente puede volver a compartir desde "Mis
 * diseños" y eso genera un token NUEVO (el viejo queda muerto).
 * No se toca previewUrl: las vistas de pedido/cotización la leen en vivo (misma
 * regla que archiveCustomerDesign).
 */
export async function rejectDesign(
  designId: string,
  adminId: string,
  reason: string,
): Promise<RejectResult> {
  const design = await prisma.design.update({
    where: { id: designId },
    data: {
      moderationStatus: "REJECTED",
      moderationReason: reason,
      moderatedAt: new Date(),
      moderatedById: adminId,
      shareTokenHash: null,
    },
    select: {
      product: { select: { name: true } },
      orderItems: {
        where: { order: { deletedAt: null } },
        select: { order: { select: { number: true, email: true } } },
      },
      // También hay que poder avisarle a quien COTIZÓ: en Etapa 1 es el único caso que ocurre.
      quoteItems: {
        where: { quote: { deletedAt: null } },
        select: { quote: { select: { number: true, customerWhatsapp: true } } },
      },
    },
  });
  return {
    productName: design.product.name,
    sources: dedupeSources([
      ...design.orderItems.map((o) => ({
        tipo: "pedido" as const,
        numero: o.order.number,
        contacto: o.order.email,
      })),
      ...design.quoteItems.map((q) => ({
        tipo: "cotizacion" as const,
        numero: q.quote.number,
        contacto: q.quote.customerWhatsapp,
      })),
    ]),
  };
}

/**
 * Gate del envío (ADR-062 P0-2): ¿el pedido tiene algún diseño SIN aprobar (PENDING o REJECTED)?
 * transitionOrderAction lo consulta antes de permitir SHIPPED. Pedidos sin diseños personalizados
 * (productos no personalizables) devuelven false → envían sin fricción.
 */
export async function orderHasUnmoderatedDesigns(orderId: string): Promise<boolean> {
  const count = await prisma.design.count({
    where: {
      moderationStatus: { not: "APPROVED" },
      orderItems: { some: { orderId } },
    },
  });
  return count > 0;
}
