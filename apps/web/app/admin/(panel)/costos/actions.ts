"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

function backToCostos(params: string): never {
  redirect(`/admin/costos?${params}`);
}

export async function updateProductCostAction(formData: FormData): Promise<void> {
  // Costos = dato financiero sensible: solo MANAGER para arriba (mismo set que garantías).
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

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

  try {
    await prisma.product.update({ where: { id: productId }, data: { cost } });
  } catch (err) {
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
    metadata: { costCentavos: cost },
  });
  revalidatePath("/admin/costos");
  backToCostos("updated=1");
}
