/*
 * Server Actions — Stock de variantes desde /admin/productos/[id].
 *
 * Patrón: action delgada (Zod + auth + delegate al service + audit trail).
 *
 * Diseñada para el widget ProductStockPanel:
 *  - Caso "1 variant Default": edita stock directo desde el tab Resumen
 *  - Caso "N variants": cada fila tiene su mini-form de stock con esta misma action
 *
 * Audit: recordAdminAction siempre — Lucy puede ver historial de cambios
 * de stock por admin desde /admin/auditoria.
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { setVariantStockAdmin, VariantStockError } from "@/features/products/stock-admin";
import { MAX_STOCK_VALUE } from "@/features/products/stock-constants";

export type StockActionState = {
  ok?: string;
  error?: string;
  fieldErrors?: Partial<Record<"variantId" | "newStock", string[]>>;
};

const SetStockSchema = z.object({
  variantId: z.string().min(1, "Variante requerida"),
  newStock: z
    .number({ error: "Stock debe ser un número" })
    .int("Stock debe ser un entero (sin decimales)")
    .min(0, "Stock no puede ser negativo")
    .max(MAX_STOCK_VALUE, `Stock no puede ser mayor a ${MAX_STOCK_VALUE.toLocaleString("es-CO")}`),
  productId: z.string().optional(), // solo para revalidatePath
});

/**
 * Actualiza el stock de UNA variant a un valor absoluto.
 *
 * Acción pública del admin — usada por:
 *  - ProductStockPanel (caso "1 variant Default" o por fila en grid de N variants)
 *  - Futuro: /admin/productos/[id]/variants form completo (cuando se refactorice)
 */
export async function setVariantStockAction(
  _prev: StockActionState | null,
  formData: FormData,
): Promise<StockActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  // Parse + Zod validation
  const variantId = String(formData.get("variantId") ?? "").trim();
  const rawStock = String(formData.get("newStock") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim() || undefined;

  const parsed = SetStockSchema.safeParse({
    variantId,
    newStock: rawStock === "" ? NaN : Number(rawStock),
    productId,
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      fieldErrors: {
        variantId: flat.fieldErrors.variantId,
        newStock: flat.fieldErrors.newStock,
      },
      error: flat.fieldErrors.newStock?.[0] ?? flat.fieldErrors.variantId?.[0] ?? "Datos inválidos",
    };
  }

  try {
    const result = await setVariantStockAdmin({
      variantId: parsed.data.variantId,
      newStock: parsed.data.newStock,
      adminId: session.admin.id,
    });

    // Audit en AdminActionLog (visible en /admin/auditoria).
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.variant.stock.update",
      entityType: "ProductVariant",
      entityId: result.variantId,
      metadata: {
        previousStock: result.previousStock,
        newStock: result.newStock,
        delta: result.delta,
        productId: result.productId,
        logged: result.logged,
      },
    });

    // Revalidar pages que muestran el stock.
    revalidatePath(`/admin/productos/${result.productId}`);
    revalidatePath(`/admin/productos/${result.productId}/variants`);
    revalidatePath("/admin/productos"); // listado con badges de stock

    // Mensaje confirmación tono cálido es-CO tuteo.
    if (!result.logged) {
      return { ok: "El stock ya estaba en ese valor, no hubo cambio." };
    }
    const direction = result.delta > 0 ? "agregaste" : "quitaste";
    return {
      ok: `Listo, ${direction} ${Math.abs(result.delta)} unidad${Math.abs(result.delta) === 1 ? "" : "es"}. Stock ahora: ${result.newStock}.`,
    };
  } catch (err) {
    if (err instanceof VariantStockError) {
      logger.warn({
        event: "stock.admin.action.validation_fail",
        code: err.code,
        variantId: parsed.data.variantId,
      });
      return { error: err.message };
    }
    logger.error({
      event: "stock.admin.action.unexpected_fail",
      err: err instanceof Error ? err.message : String(err),
      variantId: parsed.data.variantId,
    });
    return { error: "Algo salió mal al actualizar el stock. Prueba de nuevo." };
  }
}
