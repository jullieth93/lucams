/*
 * Server Actions — Admin Variants de un producto (M.3.b.CAT.9 · 2026-05-18).
 *
 * Patrón: actions delgadas, validación Zod en frontera, delegación al
 * service. Verificación admin defensiva + audit con recordAdminAction.
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";
import {
  createVariant,
  softDeleteVariant,
  updateVariant,
  VariantValidationError,
} from "@/features/products/service";
import {
  VariantCreateSchema,
  VariantUpdateSchema,
  mergePreservingUnmanagedAttributes,
  parseAttributesFromForm,
} from "@/features/products/variant-schemas";
import { prisma } from "@/lib/db";

export type VariantActionState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"name" | "sku" | "price" | "compareAtPrice" | "stock" | "description", string[]>
  >;
};

/**
 * Parsea attributes opcionales que vienen del form (todos como strings)
 * y convierte a tipo fuerte según valueType. Vacíos quedan undefined
 * para que Zod los omita.
 *
 * Vive en variant-schemas.ts (features/products) y no acá: un archivo
 * "use server" solo puede exportar funciones async, y la lógica es pura
 * (testeable en variant-schemas.test.ts).
 */

// ─────────────────── CREATE ───────────────────

export async function createVariantAction(
  _prev: VariantActionState | null,
  formData: FormData,
): Promise<VariantActionState | null> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const productId = String(formData.get("productId") ?? "");
  const priceStr = String(formData.get("price") ?? "").trim();
  const compareStr = String(formData.get("compareAtPrice") ?? "").trim();
  const parsed = VariantCreateSchema.safeParse({
    productId,
    name: formData.get("name"),
    sku: String(formData.get("sku") ?? "").toUpperCase(),
    description: formData.get("description"),
    // El form pide PESOS (consistente con el producto). Guardamos en CENTAVOS.
    price: priceStr === "" ? null : Math.round(Number(priceStr) * 100),
    compareAtPrice: compareStr === "" ? null : Math.round(Number(compareStr) * 100),
    stock: Number(formData.get("stock") ?? 0),
    isActive: formData.get("isActive") === "on",
    attributes: parseAttributesFromForm(formData),
  });
  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as VariantActionState["fieldErrors"],
    };
  }

  try {
    const v = await createVariant(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.variant.create",
      entityType: "ProductVariant",
      entityId: v.id,
      metadata: { productId, sku: v.sku, attributes: v.attributes },
    });
    logger.info({ event: "admin.variant.create.success", id: v.id, sku: v.sku });
    revalidatePath(`/admin/productos/${productId}/variants`);
    revalidatePath(`/admin/productos/${productId}`);
    // Invalidar TODOS los PDPs y listado público — variants afectan
    // precio "desde X", chip "X opciones", y selector del PDP.
    revalidatePath("/producto/[slug]", "page");
    revalidatePath("/productos");
  } catch (err) {
    if (err instanceof VariantValidationError) {
      return { fieldErrors: { [err.field]: [err.message] } as VariantActionState["fieldErrors"] };
    }
    logger.error({
      event: "admin.variant.create.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error inesperado creando la variante" };
  }
  return null;
}

// ─────────────────── UPDATE ───────────────────

export async function updateVariantAction(
  _prev: VariantActionState | null,
  formData: FormData,
): Promise<VariantActionState | null> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const productId = String(formData.get("productId") ?? "");
  const priceStr = String(formData.get("price") ?? "").trim();
  const compareStr = String(formData.get("compareAtPrice") ?? "").trim();
  // El form solo edita un subconjunto fijo de attributes; las dimensiones sin
  // campo en el form (frameStyle, variantStyle, theme, language, size,
  // variantShape…) se preservan del valor actual — antes se BORRABAN al guardar
  // (catálogo WhatsApp 2026-07-22). `magnet` SÍ tiene campo (select ¿Con imán?,
  // 2026-09-08b) → viaja en parseAttributesFromForm.
  const variantId = String(formData.get("id") ?? "");
  const current = variantId
    ? await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { attributes: true },
      })
    : null;
  const mergedAttributes = mergePreservingUnmanagedAttributes(
    current?.attributes,
    parseAttributesFromForm(formData),
  );
  const parsed = VariantUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    sku: String(formData.get("sku") ?? "").toUpperCase(),
    description: formData.get("description"),
    // El form pide PESOS (consistente con el producto). Guardamos en CENTAVOS.
    price: priceStr === "" ? null : Math.round(Number(priceStr) * 100),
    compareAtPrice: compareStr === "" ? null : Math.round(Number(compareStr) * 100),
    // 3d (Lucy 2026-06-27): el stock NO se edita en este form (se hace con el
    // editor rápido del listado/Inventario). Lo omitimos para no pisarlo —
    // VariantUpdateSchema.stock es opcional y updateVariant no lo toca si falta.
    isActive: formData.get("isActive") === "on",
    attributes: mergedAttributes,
  });
  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as VariantActionState["fieldErrors"],
    };
  }

  try {
    const v = await updateVariant(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.variant.update",
      entityType: "ProductVariant",
      entityId: v.id,
      metadata: { productId, sku: v.sku, attributes: v.attributes },
    });
    logger.info({ event: "admin.variant.update.success", id: v.id });
    revalidatePath(`/admin/productos/${productId}/variants`);
    revalidatePath(`/admin/productos/${productId}`);
    // Invalidar TODOS los PDPs y listado público — variants afectan
    // precio "desde X", chip "X opciones", y selector del PDP.
    revalidatePath("/producto/[slug]", "page");
    revalidatePath("/productos");
  } catch (err) {
    if (err instanceof VariantValidationError) {
      return { fieldErrors: { [err.field]: [err.message] } as VariantActionState["fieldErrors"] };
    }
    logger.error({
      event: "admin.variant.update.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error inesperado actualizando la variante" };
  }
  return null;
}

// ─────────────────── ARCHIVE ───────────────────

export async function archiveVariantAction(formData: FormData) {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("productId") ?? "");
  try {
    await softDeleteVariant(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.variant.archive",
      entityType: "ProductVariant",
      entityId: id,
      metadata: { productId },
    });
    revalidatePath(`/admin/productos/${productId}/variants`);
    revalidatePath(`/admin/productos/${productId}`);
    // Invalidar TODOS los PDPs y listado público — variants afectan
    // precio "desde X", chip "X opciones", y selector del PDP.
    revalidatePath("/producto/[slug]", "page");
    revalidatePath("/productos");
  } catch (err) {
    // Re-throw para que el caller decida (typical: redirect con error en searchParams)
    if (err instanceof VariantValidationError) {
      throw new Error(err.message);
    }
    throw err;
  }
}
