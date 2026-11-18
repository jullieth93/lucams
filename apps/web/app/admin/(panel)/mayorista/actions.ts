"use server";

/*
 * Server actions del módulo Mayorista B2B (/admin/mayorista).
 *
 * Dinero: en el formulario se digita en PESOS y acá convertimos a CENTAVOS
 * enteros antes de persistir (mandato CLAUDE.md: DB siempre en centavos COP).
 * Math.round evita errores de punto flotante.
 *
 * Gobierno y seguridad (Bloque 3 — Auditoría 360°):
 *   - Mutaciones restringidas a `ADMIN_ROLE_SETS.MAYORISTA_WRITE`
 *     (`SUPERADMIN`, `OPERATIONS_MANAGER` y alias `MANAGER`).
 *   - `deleteWholesaleTierAction` exige Step-up MFA reciente (`requireRecentMfa`,
 *     ≤ 10 min) y realiza borrado lógico (`deletedAt`/`deletedBy`).
 *   - Se bloquean escalas invertidas (mayor cantidad con igual o mayor precio) y
 *     precios iguales o superiores al precio base de referencia del producto.
 *   - Toda mutación invalida `catalog`, `/admin/mayorista`, `/carrito` y `/checkout/pago`.
 */

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { validateWholesaleTierCandidate } from "@/features/cart/volume-pricing";
import {
  MAX_SELF_SERVICE_PHYSICAL_UNITS,
  maxSelectorUnitsForProduct,
} from "@/features/personalization/design-units";
import { prisma } from "@/lib/db";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { isMfaReauthRequired, requireRecentMfa } from "@/lib/admin-reauth";
import { formatCOP } from "@/lib/format";
import { logger } from "@/lib/logger";

export type TierActionState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"productId" | "variantId" | "minQty" | "unitPrice" | "note", string[]>
  >;
};

const TierCreateSchema = z.object({
  productId: z.string().min(1).nullable(),
  variantId: z.string().min(1).nullable(),
  minQty: z
    .number()
    .int("La cantidad mínima debe ser un número entero.")
    .min(2, "La cantidad mínima debe ser al menos 2 unidades.")
    .max(
      MAX_SELF_SERVICE_PHYSICAL_UNITS,
      `La cantidad mínima en compra directa no puede superar ${MAX_SELF_SERVICE_PHYSICAL_UNITS} unidades (usa Empresas y Eventos para pedidos mayores).`,
    ),
  unitPrice: z
    .number()
    .int("El precio por unidad debe ser un valor entero.")
    .min(100, "El precio por unidad debe ser al menos $1 COP.")
    .max(500_000_000, "El precio por unidad no puede superar $5.000.000 COP."),
  note: z.string().max(200, "La nota no puede superar 200 caracteres.").nullable(),
  isActive: z.boolean(),
});

const TierUpdateSchema = TierCreateSchema.omit({
  productId: true,
  variantId: true,
  isActive: true,
});

function parsePayload(formData: FormData) {
  const productIdRaw = String(formData.get("productId") ?? "").trim();
  const variantIdRaw = String(formData.get("variantId") ?? "").trim();
  const productId = productIdRaw === "" ? null : productIdRaw;
  const variantId = productId && variantIdRaw !== "" ? variantIdRaw : null;
  const unitPricePesos = Number(formData.get("unitPricePesos") ?? 0);
  return {
    productId,
    variantId,
    minQty: Number(formData.get("minQty") ?? 0),
    unitPrice: Math.round(unitPricePesos * 100),
    note: String(formData.get("note") ?? "").trim() || null,
    isActive: formData.get("isActive") === "on",
  };
}

function isNextRedirect(err: unknown): boolean {
  return err instanceof Error && err.message === "NEXT_REDIRECT";
}

function revalidateWholesaleCaches() {
  updateTag("catalog");
  revalidatePath("/admin/mayorista");
  revalidatePath("/carrito");
  revalidatePath("/checkout/pago");
}

async function checkTierScaleCoherence(opts: {
  productId: string | null;
  variantId: string | null;
  minQty: number;
  unitPrice: number;
  willBeActive: boolean;
  excludeId?: string;
}): Promise<TierActionState | null> {
  const { productId, variantId, minQty, unitPrice, willBeActive, excludeId } = opts;

  let referencePrice: number | null = null;
  let maxAllowedQty: number = MAX_SELF_SERVICE_PHYSICAL_UNITS;
  let unitPlural = "unidades";
  let productNameForMsg = "el catálogo";

  if (productId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        basePrice: true,
        personalizationKind: true,
        personalizationSchema: true,
        variants: {
          where: { deletedAt: null },
          select: { id: true, price: true, isActive: true, attributes: true },
        },
      },
    });
    if (!product) {
      return {
        error: "El producto seleccionado ya no existe.",
        fieldErrors: { productId: ["El producto seleccionado ya no existe."] },
      };
    }
    productNameForMsg = `«${product.name}»`;
    const activeVars = product.variants.filter((v) => v.isActive);
    if (variantId) {
      const targetVariant = product.variants.find((v) => v.id === variantId);
      if (!targetVariant) {
        return {
          error: "La opción seleccionada no pertenece a este producto.",
          fieldErrors: { variantId: ["La opción seleccionada no pertenece a este producto."] },
        };
      }
      referencePrice = targetVariant.price ?? product.basePrice;
      const cap = maxSelectorUnitsForProduct({
        slug: product.slug,
        personalizationKind: product.personalizationKind,
        personalizationSchema: product.personalizationSchema,
        variantAttrs: targetVariant.attributes,
        allVariantsAttrs: activeVars.map((v) => v.attributes),
      });
      maxAllowedQty = cap.maxUnits;
      unitPlural = cap.unitPlural;
    } else {
      referencePrice =
        activeVars.length > 0
          ? Math.min(...activeVars.map((v) => v.price ?? product.basePrice))
          : product.basePrice;
      const cap = maxSelectorUnitsForProduct({
        slug: product.slug,
        personalizationKind: product.personalizationKind,
        personalizationSchema: product.personalizationSchema,
        variantAttrs: activeVars[0]?.attributes,
        allVariantsAttrs: activeVars.map((v) => v.attributes),
      });
      maxAllowedQty = cap.maxUnits;
      unitPlural = cap.unitPlural;
    }
  }

  const activeSiblings = await prisma.wholesaleTier.findMany({
    where: {
      productId,
      variantId,
      deletedAt: null,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { minQty: true, unitPrice: true },
  });

  const violation = validateWholesaleTierCandidate({
    minQty,
    unitPrice,
    willBeActive,
    referencePrice,
    activeSiblings,
    maxAllowedQty,
  });

  if (!violation) return null;

  if (violation.kind === "EXCEEDS_MAX_UNITS") {
    const msg = `Para ${productNameForMsg} el selector permite máximo ${violation.maxAllowedQty} ${unitPlural}; la cantidad mínima debe estar entre 2 y ${violation.maxAllowedQty} (para 25+ usa Empresas y Eventos).`;
    return { error: msg, fieldErrors: { minQty: [msg] } };
  }

  if (violation.kind === "ABOVE_OR_EQUAL_BASE") {
    const msg = `El precio mayorista (${formatCOP(unitPrice)}) debe ser menor al precio base de venta del producto (${formatCOP(violation.referencePrice)}).`;
    return { error: msg, fieldErrors: { unitPrice: [msg] } };
  }

  if (violation.kind === "INVERTED_HIGHER_QTY") {
    const msg = `Escala invertida: para ${minQty}+ unidades el precio (${formatCOP(unitPrice)}) debe ser menor que el nivel activo de ${violation.conflictMinQty}+ unidades (${formatCOP(violation.conflictUnitPrice)}).`;
    return { error: msg, fieldErrors: { unitPrice: [msg] } };
  }

  const msg = `Escala invertida: para ${minQty}+ unidades el precio (${formatCOP(unitPrice)}) debe ser mayor que el nivel activo de ${violation.conflictMinQty}+ unidades (${formatCOP(violation.conflictUnitPrice)}).`;
  return { error: msg, fieldErrors: { unitPrice: [msg] } };
}

export async function createWholesaleTierAction(
  _prev: TierActionState | null,
  formData: FormData,
): Promise<TierActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MAYORISTA_WRITE });

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
    const duplicate = await prisma.wholesaleTier.findFirst({
      where: {
        productId: data.productId,
        variantId: data.variantId,
        minQty: data.minQty,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      return {
        error: "Ya existe un nivel con esa cantidad mínima para ese alcance.",
        fieldErrors: { minQty: ["Ya existe un nivel con esta cantidad mínima."] },
      };
    }

    const coherenceError = await checkTierScaleCoherence({
      productId: data.productId,
      variantId: data.variantId,
      minQty: data.minQty,
      unitPrice: data.unitPrice,
      willBeActive: data.isActive,
    });
    if (coherenceError) return coherenceError;

    const tier = await prisma.wholesaleTier.create({
      data: { ...data, createdBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "wholesale_tier.create",
      entityType: "WholesaleTier",
      entityId: tier.id,
      metadata: {
        productId: tier.productId,
        variantId: tier.variantId,
        minQty: tier.minQty,
        unitPrice: tier.unitPrice,
        isActive: tier.isActive,
      },
    });
    logger.info({
      event: "admin.wholesale_tier.created",
      adminId: session.admin.id,
      tierId: tier.id,
    });
    revalidateWholesaleCaches();
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

export async function updateWholesaleTierAction(
  _prev: TierActionState | null,
  formData: FormData,
): Promise<TierActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MAYORISTA_WRITE });
  const id = String(formData.get("id") ?? "");

  const parsed = TierUpdateSchema.safeParse(parsePayload(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Revisa los datos del formulario.",
      fieldErrors: flat.fieldErrors as TierActionState["fieldErrors"],
    };
  }
  const data = parsed.data;

  try {
    const tier = await prisma.wholesaleTier.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        productId: true,
        variantId: true,
        minQty: true,
        unitPrice: true,
        isActive: true,
      },
    });
    if (!tier) return { error: "El nivel ya no existe." };

    const duplicate = await prisma.wholesaleTier.findFirst({
      where: {
        productId: tier.productId,
        variantId: tier.variantId,
        minQty: data.minQty,
        deletedAt: null,
        id: { not: tier.id },
      },
      select: { id: true },
    });
    if (duplicate) {
      return {
        error: "Ya existe un nivel con esa cantidad mínima para ese alcance.",
        fieldErrors: { minQty: ["Ya existe un nivel con esta cantidad mínima."] },
      };
    }

    const coherenceError = await checkTierScaleCoherence({
      productId: tier.productId,
      variantId: tier.variantId,
      minQty: data.minQty,
      unitPrice: data.unitPrice,
      willBeActive: tier.isActive,
      excludeId: tier.id,
    });
    if (coherenceError) return coherenceError;

    await prisma.wholesaleTier.update({
      where: { id: tier.id },
      data: {
        minQty: data.minQty,
        unitPrice: data.unitPrice,
        note: data.note,
        updatedBy: session.admin.id,
      },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "wholesale_tier.update",
      entityType: "WholesaleTier",
      entityId: tier.id,
      metadata: {
        productId: tier.productId,
        previousMinQty: tier.minQty,
        previousUnitPrice: tier.unitPrice,
        minQty: data.minQty,
        unitPrice: data.unitPrice,
      },
    });
    revalidateWholesaleCaches();
    redirect("/admin/mayorista?updated=1");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    logger.error({
      event: "admin.wholesale_tier.update_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error al actualizar el nivel. Reintenta." };
  }
}

export async function toggleWholesaleTierAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MAYORISTA_WRITE });
  const id = String(formData.get("id") ?? "");

  try {
    const tier = await prisma.wholesaleTier.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        productId: true,
        variantId: true,
        minQty: true,
        unitPrice: true,
        isActive: true,
      },
    });
    if (!tier) redirect(`/admin/mayorista?error=${encodeURIComponent("Nivel no encontrado.")}`);

    const nextActive = !tier.isActive;
    if (nextActive) {
      const coherenceError = await checkTierScaleCoherence({
        productId: tier.productId,
        variantId: tier.variantId,
        minQty: tier.minQty,
        unitPrice: tier.unitPrice,
        willBeActive: true,
        excludeId: tier.id,
      });
      if (coherenceError?.error) {
        redirect(`/admin/mayorista?error=${encodeURIComponent(coherenceError.error)}`);
      }
    }

    const updated = await prisma.wholesaleTier.update({
      where: { id },
      data: { isActive: nextActive, updatedBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: updated.isActive ? "wholesale_tier.activate" : "wholesale_tier.deactivate",
      entityType: "WholesaleTier",
      entityId: id,
      metadata: {
        productId: tier.productId,
        minQty: tier.minQty,
        unitPrice: tier.unitPrice,
      },
    });
    revalidateWholesaleCaches();
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

export async function deleteWholesaleTierAction(
  formData: FormData,
): Promise<{ reauthRequired?: boolean } | void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MAYORISTA_WRITE });
  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) {
      return { reauthRequired: true };
    }
    throw err;
  }

  const id = String(formData.get("id") ?? "");

  try {
    const tier = await prisma.wholesaleTier.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, productId: true, minQty: true, unitPrice: true },
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
      metadata: {
        productId: tier.productId,
        minQty: tier.minQty,
        unitPrice: tier.unitPrice,
      },
    });
    revalidateWholesaleCaches();
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
