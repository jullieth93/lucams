"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

function backToCostos(params: string): never {
  redirect(`/admin/costos?${params}`);
}

export async function updateProductCostAction(formData: FormData): Promise<void> {
  // D1 (Auditoría 360° Bloque 2): edición de costos centralizada en /admin/costos
  // para roles con `catalog:write` (SUPERADMIN, OPERATIONS_MANAGER y legacy MANAGER).
  // FINANCE_ANALYST tiene acceso de SOLO LECTURA (`finance:read`) a la ruta, pero
  // cualquier intento de mutar Product.cost queda bloqueado acá server-side.
  const session = await requireAdminAction({ capability: "catalog:write" });

  const productId = String(formData.get("productId") ?? "");
  if (!productId) backToCostos(`error=${encodeURIComponent("Falta el producto.")}`);

  // El input llega en PESOS (lo que Lucy maneja en el día a día); DB guarda centavos.
  // Vacío = quitar el costo (vuelve a null y el producto sale del análisis de margen).
  const raw = String(formData.get("costPesos") ?? "").trim();
  let cost: number | null = null;
  if (raw !== "") {
    const pesos = Number(raw.replace(",", "."));
    if (!Number.isFinite(pesos) || pesos < 0) {
      backToCostos(
        `error=${encodeURIComponent("El costo debe ser un número en pesos, mayor o igual a 0.")}`,
      );
    }
    cost = Math.round(pesos * 100);
  }

  let previousCost: number | null = null;
  let sku: string | null = null;
  try {
    const existing = await prisma.product.findUnique({
      where: { id: productId },
      select: { cost: true, sku: true },
    });
    if (!existing) backToCostos(`error=${encodeURIComponent("El producto ya no existe.")}`);
    previousCost = existing.cost;
    sku = existing.sku;
    await prisma.product.update({
      where: { id: productId },
      data: { cost, updatedBy: session.admin.id },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.warn({
      event: "admin.costos.update_fail",
      adminId: session.admin.id,
      productId,
      err: err instanceof Error ? err.message : String(err),
    });
    backToCostos(`error=${encodeURIComponent("No se pudo guardar el costo. Reintenta.")}`);
  }

  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.cost.update",
    entityType: "Product",
    entityId: productId,
    metadata: { sku, previousCostCentavos: previousCost, costCentavos: cost },
  });
  revalidatePath("/admin/costos");
  revalidatePath(`/admin/productos/${productId}`);
  backToCostos("updated=1");
}
