"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { addBlockedIdentity, BlocklistError } from "@/features/anti-abuse/blocklist-service";
import { processPaidOrder } from "@/features/orders/saga";
import { refundOrder, transitionOrder } from "@/features/orders/service";
import { sealManuallyResolvedWebhookEvents } from "@/features/orders/webhook-seal";
import { orderStatusLabel } from "@/features/orders/order-status-display";
import { sendOrderShipped, sendOrderDelivered, sendOrderCancelled } from "@/features/orders/emails";
import { orderHasUnmoderatedDesigns } from "@/features/moderation/service";
import { letterSetUnitCount } from "@/features/personalization/design-units";
import { formatCOP } from "@/lib/format";

/**
 * Reintenta la saga post-PAID (útil cuando el primer intento falló por
 * dims faltantes, Aveonline temporalmente caído, etc.).
 *
 * No transiciona la Order — sólo invoca processPaidOrder con la actual.
 * Si la Order ya tiene tracking, processPaidOrder es idempotente y
 * devuelve already_processed.
 */
export async function retryShipmentAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ORDERS_TRANSITION });

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Falta orderId" };

  try {
    const result = await processPaidOrder({ orderId });
    // N-13 — resolución manual exitosa (guía generada o ya existente con tracking):
    // sella los WebhookEvent SIN procesar relacionados con esta orden (WOMPI por
    // wompiTransactionId, AVEONLINE por trackingNumber) para que la alerta
    // webhooks_stuck se auto-limpie. Si el claim lo tiene otro proceso
    // (already_processed SIN tracking) aún no hay resolución → no se sella nada.
    // Best-effort: un fallo acá NO revierte la guía ya creada ni ensucia el éxito.
    let sealedWebhooks = 0;
    if (
      result.status === "ok" ||
      (result.status === "already_processed" && result.trackingNumber)
    ) {
      try {
        sealedWebhooks = (await sealManuallyResolvedWebhookEvents(orderId)).sealed;
      } catch (sealErr) {
        logger.error({
          event: "admin.order.retry_shipment.seal_webhooks_fail",
          orderId,
          err: sealErr instanceof Error ? sealErr.message : String(sealErr),
        });
      }
    }
    await recordAdminAction({
      actorId: session.admin.id,
      action: "order.retry_shipment",
      entityType: "Order",
      entityId: orderId,
      metadata: {
        sagaStatus: result.status,
        trackingNumber: result.trackingNumber ?? null,
        sealedWebhooks,
      },
    });
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/[number]`, "page");
    if (result.status === "ok") {
      return { success: `Guía generada: ${result.trackingNumber}` };
    }
    if (result.status === "already_processed") {
      // #10 — si el claim lo tiene otro proceso y aún no escribió la guía, trackingNumber es
      // undefined; no interpolarlo (Lucy leería "Ya tenía tracking: undefined" como un error).
      return result.trackingNumber
        ? { success: `Ya tenía tracking: ${result.trackingNumber}` }
        : { success: "La guía se está generando en otro proceso; espera unos minutos y recarga." };
    }
    return { error: result.reason ?? "Falló crear guía" };
  } catch (err) {
    logger.error({
      event: "admin.order.retry_shipment_fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "Error inesperado" };
  }
}

/**
 * Cambio de estado manual (admin force). Valida ORDER_TRANSITIONS.
 * Usado para marcar SHIPPED manualmente cuando admin despacha sin webhook
 * Aveonline (caso edge), o CANCELLED por incidencia.
 */
export async function transitionOrderAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ORDERS_TRANSITION });

  const orderId = String(formData.get("orderId") ?? "");
  const to = String(formData.get("to") ?? "");
  // Motivo opcional de la transición (ej. "cliente canceló", "dirección errada"). Queda en el
  // audit trail para saber POR QUÉ cambió el estado, no solo A QUÉ estado.
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  if (!orderId || !to) return { error: "Faltan parámetros" };
  // REFUNDED debe pasar SIEMPRE por refundOrderAction (audita monto/quién/cuándo +
  // avisa al cliente + exige SUPERADMIN). Bloquearlo acá evita un reembolso "mudo".
  if (to === "REFUNDED") {
    return {
      error: "Para reembolsar usa el botón Reembolsar (registra auditoría y avisa al cliente).",
    };
  }
  // Gate de moderación (ADR-062 P0-2): marcar SHIPPED implica que ya se imprimió y despachó.
  // Print-on-demand → no se despacha nada con diseños sin aprobar. Revisa /admin/moderacion.
  if (to === "SHIPPED" && (await orderHasUnmoderatedDesigns(orderId))) {
    return {
      error:
        "Este pedido tiene diseños sin aprobar en Moderación. Apruébalos antes de marcarlo como enviado.",
    };
  }

  try {
    await transitionOrder(orderId, to, {
      actorAdminId: session.admin.id,
      note: reason || undefined,
    });

    // Auditoría 2026-07-13: el path manual también avisa al cliente (antes solo la saga
    // del webhook lo hacía). Idempotente (idempotencyKey de Resend) y best-effort (un fallo
    // de email nunca rompe la transición). CANCELLED aquí es siempre manual (no pago-rechazado).
    if (to === "SHIPPED") await sendOrderShipped(orderId);
    else if (to === "DELIVERED") await sendOrderDelivered(orderId);
    else if (to === "CANCELLED") await sendOrderCancelled(orderId, reason || null);

    await recordAdminAction({
      actorId: session.admin.id,
      action: "order.transition",
      entityType: "Order",
      entityId: orderId,
      metadata: reason ? { to, reason } : { to },
    });
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/[number]`, "page");
    // #29 — mostrar la etiqueta en español ("Entregado"), no el enum crudo ("DELIVERED").
    return { success: `Estado cambiado a ${orderStatusLabel(to)}` };
  } catch (err) {
    logger.warn({
      event: "admin.order.transition_fail",
      orderId,
      to,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "Error transicionando" };
  }
}

/**
 * F2 — Reembolso desde admin. Marca la orden REFUNDED (revierte stock + audita
 * quién/cuándo/motivo/monto) y dispara el email al cliente.
 *
 * N-17 — El DINERO en Wompi se mueve MANUALMENTE y la confirmación es
 * OBLIGATORIA Y PREVIA: el formulario exige marcar "Confirmo que el dinero ya
 * fue devuelto al cliente en Wompi" (checkbox bloqueante, `moneyReturned`).
 * Sin el checkbox, la action RECHAZA sin tocar la orden. La confirmación se
 * persiste (Order.refundMoneyConfirmedAt/By) y va en la auditoría; el email
 * refund-issued solo sale tras ella (ver refundOrder en service.ts). Solo
 * aplica a órdenes PAID o DELIVERED (la máquina de estados lo valida).
 */
export async function refundOrderAction(
  _prev: { error?: string; success?: string; reauthRequired?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string; reauthRequired?: boolean }> {
  // El reembolso es una operación financiera → SUPERADMIN + MFA aal2 (ADR-062 P0-1).
  // El guard vive acá porque las Server Actions son endpoints POST invocables directo.
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  // F-10 (auditoría 2026-09-04): operación destructiva → aal2 RECIENTE. Si la
  // elevación es vieja, la UI abre el modal TOTP (MfaReauthModal) y reintenta.
  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) return { error: MFA_REAUTH_MESSAGE, reauthRequired: true };
    throw err;
  }

  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orderId) return { error: "Falta orderId" };

  // N-17 — sin la confirmación explícita del dinero, NO se reembolsa. El checkbox
  // del form manda "on" (aceptamos "true" por robustez ante callers programáticos).
  const moneyReturned = String(formData.get("moneyReturned") ?? "");
  if (moneyReturned !== "on" && moneyReturned !== "true") {
    return {
      error:
        "Debes confirmar que el dinero ya fue devuelto al cliente antes de registrar el reembolso (checkbox del formulario).",
    };
  }

  try {
    const res = await refundOrder(orderId, {
      adminId: session.admin.id,
      reason: reason || undefined,
      moneyReturnedConfirmed: true,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "order.refund",
      entityType: "Order",
      entityId: orderId,
      metadata: {
        status: res.status,
        amount: res.amount,
        reason: reason || null,
        // N-17 — quién confirmó la devolución del dinero (evidencia en auditoría).
        moneyReturnedConfirmedBy: session.admin.id,
      },
    });
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/[number]`, "page");
    if (res.status === "already_refunded") {
      return { success: "La orden ya estaba reembolsada." };
    }
    return {
      // Checklist explícito del efecto real (2026-10-01): el admin confirmó el dinero
      // ANTES (checkbox N-17), pero el resultado no le decía todo lo que el sistema
      // hizo — la duda "¿y ahora qué pasó?" era recurrente. El dinero sigue siendo
      // 100% manual (Wompi/transferencia); esto solo comunica lo ya ejecutado.
      success:
        `Reembolso de ${formatCOP(res.amount)} registrado. ` +
        `✔ Orden en REFUNDED ✔ stock repuesto ✔ cupón liberado (si aplicaba) ` +
        `✔ email enviado al cliente. El dinero ya debió devolverse por el canal manual ` +
        `(Wompi o transferencia) — tu confirmación quedó en auditoría.`,
    };
  } catch (err) {
    logger.warn({
      event: "admin.order.refund_fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "Error al reembolsar" };
  }
}

/**
 * Reconciliación manual (2026-10-05): apaga Order.needsReconciliation cuando el
 * admin YA gestionó el caso por fuera del sistema (refund emitido a mano en
 * Wompi, stock producido, etc.). La nota de resolución es OBLIGATORIA — sin ella
 * el cierre no explica nada y la auditoría pierde su valor.
 *
 * Solo apaga el flag si sigue prendido (updateMany gateado → idempotente: dos
 * admins marcando a la vez no pisan la primera resolución). NO toca los flujos
 * automáticos que lo prenden (saga, expire-pending, checkout COD): si la anomalía
 * se repite, el flag vuelve a prender con su motivo nuevo.
 */
export async function markOrderReconciledAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Falta el pedido." };
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 500);
  if (note.length < 5) {
    return {
      error:
        "Escribe una nota de resolución (mínimo 5 caracteres): qué se hizo para gestionar el caso.",
    };
  }

  const resolved = await prisma.order.updateMany({
    where: { id: orderId, needsReconciliation: true },
    data: {
      needsReconciliation: false,
      reconciliationNote: note,
      reconciledAt: new Date(),
      reconciledBy: session.admin.id,
    },
  });
  if (resolved.count === 0) {
    return { error: "Este pedido no está marcado para reconciliar (quizá ya lo gestionaron)." };
  }

  await recordAdminAction({
    actorId: session.admin.id,
    action: "order.reconcile",
    entityType: "Order",
    entityId: orderId,
    metadata: { note },
  });
  logger.info({ event: "admin.order.reconciled", adminId: session.admin.id, orderId });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/[number]`, "page");
  return { success: "Reconciliación marcada como gestionada. La nota quedó en auditoría." };
}

/**
 * Anti-abuso COD (ADR-065): marca un pedido contra entrega como NO RECIBIDO (no-show). Señal explícita
 * —distinta del RETURNED del courier— que assessCodRisk usa para vetar futuros COD de la identidad.
 */
export async function markOrderNoShowAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Falta el pedido." };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, paymentMethod: true, noShowAt: true },
  });
  if (!order) return { error: "Pedido no encontrado." };
  if (order.paymentMethod !== "COD") return { error: "Solo aplica a pedidos contra entrega." };
  if (order.noShowAt) return { success: "Ya estaba marcado como no recibido." };

  await prisma.order.update({
    where: { id: orderId },
    data: { noShowAt: new Date(), noShowBy: session.admin.id },
  });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "order.mark_no_show",
    entityType: "Order",
    entityId: orderId,
  });
  logger.info({ event: "admin.order.no_show", adminId: session.admin.id, orderId });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/[number]`, "page");
  return {
    success: "Marcado como no recibido. El contra entrega de esta identidad quedará bloqueado.",
  };
}

/**
 * Anti-abuso COD (ADR-065): bloquea la DIRECCIÓN de este pedido (clave normalizada) en el block-list —
 * el punto de entrada de UX para la key ADDRESS, que no se teclea. SUPERADMIN (veto de pago, como refund).
 */
export async function blockOrderAddressAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Falta el pedido." };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { number: true, shippingAddressKey: true },
  });
  if (!order?.shippingAddressKey) {
    return { error: "Este pedido no tiene una dirección normalizada para bloquear." };
  }

  try {
    await addBlockedIdentity({
      kind: "ADDRESS",
      value: order.shippingAddressKey,
      reason: `Dirección del pedido ${order.number}`,
      createdBy: session.admin.id,
    });
  } catch (err) {
    if (err instanceof BlocklistError) return { error: err.message };
    throw err;
  }
  await recordAdminAction({
    actorId: session.admin.id,
    action: "cod.blocklist.add_address",
    entityType: "Order",
    entityId: orderId,
  });
  logger.info({ event: "admin.cod_blocklist.add_address", adminId: session.admin.id, orderId });
  revalidatePath("/admin/finanzas/bloqueos");
  return { success: "Dirección bloqueada para contra entrega." };
}

/**
 * Regenerar los archivos de impresión POR FICHA de un diseño de set de letras
 * (owner 2026-11-03, ADR-188): diseños cuya producción quedó en LÁMINA por set
 * (históricos, o porque el encolado del job de mejora falló en silencio en el
 * finalize — el catch best-effort ya reporta a ErrorLog desde hoy). Crea/resetea
 * el RenderJob con el conteo real (letras × sets) y lo patea; el worker (cron
 * cada minuto) termina de reemplazar las láminas por fichas 300 DPI.
 *
 * Guardas: solo diseños letterset/name (metadata.letters) en formato lámina
 * (productionUrls.length === sets). Si ya está en fichas, es no-op amable.
 */
export async function regenerateLettersetProductionAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ORDERS_TRANSITION });

  const designId = String(formData.get("designId") ?? "");
  const orderNumber = String(formData.get("orderNumber") ?? "");
  if (!designId || !orderNumber) return { error: "Faltan datos." };

  const design = await prisma.design.findUnique({
    where: { id: designId },
    select: { id: true, productId: true, metadata: true, productionUrls: true },
  });
  const meta = (design?.metadata ?? null) as Record<string, unknown> | null;
  const letters = Array.isArray(meta?.letters) ? (meta.letters as unknown[]) : [];
  if (!design || letters.length === 0) {
    return { error: "Este diseño no es un set de letras." };
  }
  const sets = letterSetUnitCount(meta);
  if (design.productionUrls.length === letters.length * sets) {
    return { success: "Este diseño ya tiene sus archivos por ficha." };
  }

  const { createOrResetRenderJob, processRenderJobs, RENDER_JOB_KICK_BUDGET_MS } =
    await import("@/features/personalization/render-job-service");
  await createOrResetRenderJob({
    designId: design.id,
    productId: design.productId,
    slotCount: letters.length * sets,
  });
  // Kick acotado (mismo presupuesto del finalize): las primeras fichas salen ya;
  // el resto lo cierra el cron del minuto siguiente.
  await processRenderJobs({ onlyDesignId: design.id, budgetMs: RENDER_JOB_KICK_BUDGET_MS });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "order.design_regen_letterset",
    entityType: "Design",
    entityId: design.id,
    metadata: { orderNumber, fichas: letters.length * sets },
  });
  logger.info({
    event: "admin.order.regen_letterset",
    adminId: session.admin.id,
    designId: design.id,
    orderNumber,
  });
  revalidatePath(`/admin/pedidos/${encodeURIComponent(orderNumber)}`);
  return {
    success: `Render por ficha encolado (${letters.length * sets} fichas). En unos minutos reemplazan la lámina.`,
  };
}

/**
 * Reintento manual en un clic de un `RenderJob` en estado `FAILED` (S11 · [OPS-01]).
 * Disponible para los roles operativos (`SUPERADMIN`, `MANAGER`, `FULFILLMENT`) para que
 * el taller pueda destrabar impresiones 300 DPI caídas por fallas transitorias sin tocar SQL.
 */
export async function retryRenderJobAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ORDERS_TRANSITION });

  const designId = String(formData.get("designId") ?? "").trim();
  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
  if (!designId || !orderNumber) return { error: "Faltan datos del diseño." };

  const job = await prisma.renderJob.findUnique({
    where: { designId },
    select: { id: true, status: true, totalUnits: true, doneUnits: true },
  });
  if (!job) {
    return { error: "Este diseño no tiene un trabajo de render asociado." };
  }
  if (job.status !== "FAILED") {
    return { success: "El render ya está en curso o completado." };
  }

  await prisma.renderJob.update({
    where: { designId },
    data: {
      status: "PENDING",
      attempts: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
    },
  });

  const { processRenderJobs, RENDER_JOB_KICK_BUDGET_MS } =
    await import("@/features/personalization/render-job-service");
  await processRenderJobs({ onlyDesignId: designId, budgetMs: RENDER_JOB_KICK_BUDGET_MS });

  const after = await prisma.renderJob.findUnique({
    where: { designId },
    select: { status: true, doneUnits: true, totalUnits: true, error: true },
  });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "order.render_job_retry",
    entityType: "Design",
    entityId: designId,
    metadata: {
      orderNumber,
      resultStatus: after?.status ?? "PENDING",
      doneUnits: after?.doneUnits ?? job.doneUnits,
      totalUnits: after?.totalUnits ?? job.totalUnits,
    },
  });
  logger.info({
    event: "admin.order.render_job_retry",
    adminId: session.admin.id,
    designId,
    orderNumber,
    resultStatus: after?.status ?? "PENDING",
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${encodeURIComponent(orderNumber)}`);

  if (after?.status === "DONE") {
    return {
      success: `Archivos 300 DPI generados (${after.totalUnits} pieza${after.totalUnits === 1 ? "" : "s"}).`,
    };
  }
  if (after?.status === "FAILED") {
    return {
      error: `El reintento volvió a fallar${after.error ? `: ${after.error}` : "."}`,
    };
  }
  return {
    success: `Render reencolado (${after?.doneUnits ?? 0} de ${after?.totalUnits ?? job.totalUnits} piezas listas). Terminará en unos minutos.`,
  };
}
