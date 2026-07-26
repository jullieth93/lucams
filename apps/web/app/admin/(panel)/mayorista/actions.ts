"use server";

/*
 * Server actions del módulo Mayorista B2B.
 *
 * Dinero: la admin digita PESOS (como piensa cualquier colombiana) y acá
 * convertimos a CENTAVOS antes de persistir (mandato CLAUDE.md: DB siempre
 * en centavos COP). Math.round evita floats tipo 0.1*100.
 *
 * El borrado es SOFT (deletedAt/deletedBy) siguiendo el patrón del resto del
 * schema: preserva auditoría y permite rastrear quién quitó un nivel.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";

export type TierActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"productId" | "minQty" | "unitPrice" | "note", string[]>>;
};

const TierCreateSchema = z.object({
  productId: z.string().min(1).nullable(),
  minQty: z
    .number()
    .int("La cantidad mínima debe ser un número entero.")
    .min(2, "La cantidad mínima debe ser al menos 2 unidades."),
  unitPrice: z.number().positive("El precio por unidad debe ser mayor a $0."),
  note: z.string().max(200, "La nota no puede superar 200 caracteres.").nullable(),
  isActive: z.boolean(),
});

function parsePayload(formData: FormData) {
  const productIdRaw = String(formData.get("productId") ?? "").trim();
  const unitPricePesos = Number(formData.get("unitPricePesos") ?? 0);
  return {
    productId: productIdRaw === "" ? null : productIdRaw,
    minQty: Number(formData.get("minQty") ?? 0),
    // Pesos → centavos. El formulario expone el campo como unitPricePesos
    // para que nadie lo confunda con el valor persistido.
    unitPrice: Math.round(unitPricePesos * 100),
    note: String(formData.get("note") ?? "").trim() || null,
    isActive: formData.get("isActive") === "on",
  };
}

function isNextRedirect(err: unknown): boolean {
  return err instanceof Error && err.message === "NEXT_REDIRECT";
}

export async function createWholesaleTierAction(
  _prev: TierActionState | null,
  formData: FormData,
): Promise<TierActionState> {
  // Precios = operación sensible: mismo rol que cupones (solo SUPERADMIN).
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const parsed = TierCreateSchema.safeParse(parsePayload(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Revisa los datos del formulario.",
      fieldErrors: flat.fieldErrors as TierActionState["fieldErrors"],
    };
  }
  const data = parsed.data;

  try {
    if (data.productId) {
      const product = await prisma.product.findFirst({
        where: { id: data.productId, deletedAt: null },
        select: { id: true },
      });
      if (!product) {
        return { fieldErrors: { productId: ["El producto seleccionado ya no existe."] } };
      }
    }

    // Un nivel duplicado (mismo producto + misma cantidad) haría ambiguo qué
    // precio aplicar en el checkout; lo bloqueamos con mensaje claro.
    const duplicate = await prisma.wholesaleTier.findFirst({
      where: { productId: data.productId, minQty: data.minQty, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) {
      return {
        error: "Ya existe un nivel con esa cantidad mínima para ese alcance.",
        fieldErrors: { minQty: ["Ya existe un nivel con esta cantidad mínima."] },
      };
    }

    const tier = await prisma.wholesaleTier.create({
      data: { ...data, createdBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "wholesale_tier.create",
      entityType: "WholesaleTier",
      entityId: tier.id,
      metadata: { productId: tier.productId, minQty: tier.minQty, unitPrice: tier.unitPrice },
    });
    logger.info({
      event: "admin.wholesale_tier.created",
      adminId: session.admin.id,
      tierId: tier.id,
    });
    revalidatePath("/admin/mayorista");
    redirect("/admin/mayorista?created=1");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    logger.error({
      event: "admin.wholesale_tier.create_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error al crear el nivel. Reintenta." };
  }
}

export async function toggleWholesaleTierAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");

  try {
    const tier = await prisma.wholesaleTier.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!tier) redirect(`/admin/mayorista?error=${encodeURIComponent("Nivel no encontrado.")}`);

    const updated = await prisma.wholesaleTier.update({
      where: { id },
      data: { isActive: !tier.isActive, updatedBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: updated.isActive ? "wholesale_tier.activate" : "wholesale_tier.deactivate",
      entityType: "WholesaleTier",
      entityId: id,
    });
    revalidatePath("/admin/mayorista");
    redirect(`/admin/mayorista?${updated.isActive ? "activated" : "deactivated"}=1`);
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    logger.error({
      event: "admin.wholesale_tier.toggle_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/mayorista?error=${encodeURIComponent("Error al cambiar el estado.")}`);
  }
}

export async function deleteWholesaleTierAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");

  try {
    const tier = await prisma.wholesaleTier.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!tier) redirect(`/admin/mayorista?error=${encodeURIComponent("Nivel no encontrado.")}`);

    await prisma.wholesaleTier.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: session.admin.id, isActive: false },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "wholesale_tier.delete",
      entityType: "WholesaleTier",
      entityId: id,
    });
    revalidatePath("/admin/mayorista");
    redirect("/admin/mayorista?deleted=1");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    logger.error({
      event: "admin.wholesale_tier.delete_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/mayorista?error=${encodeURIComponent("Error al eliminar el nivel.")}`);
  }
}
