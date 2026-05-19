/*
 * Server Actions — Admin Productos.
 *
 * Patrón: actions delgadas, validación Zod aquí + delegación al service.
 * Verificación admin defensiva al inicio de cada acción (proxy.ts gate
 * + esta verificación = defense in depth).
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCurrentAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  createProduct,
  ProductValidationError,
  softDeleteProduct,
  updateProduct,
} from "@/features/products/service";
import { ProductCreateSchema, ProductUpdateSchema } from "@/features/products/schemas";

export type ProductActionState = {
  error?: string;
  fieldErrors?: Partial<
    Record<
      | "name"
      | "slug"
      | "description"
      | "basePrice"
      | "compareAtPrice"
      | "cost"
      | "sku"
      | "categoryId"
      | "seoTitle"
      | "seoDescription",
      string[]
    >
  >;
};

/**
 * Convierte FormData a un payload para Zod, parseando los enteros
 * (precios) y booleans (checkboxes).
 */
function parsePayload(formData: FormData) {
  const get = (k: string) => formData.get(k);
  const getOptNum = (k: string) => {
    const v = get(k);
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    name: String(get("name") ?? "").trim(),
    slug: String(get("slug") ?? "").trim(),
    description: String(get("description") ?? "").trim(),
    basePrice: getOptNum("basePrice") ?? 0,
    compareAtPrice: getOptNum("compareAtPrice"),
    cost: getOptNum("cost"),
    sku: String(get("sku") ?? "")
      .trim()
      .toUpperCase(),
    categoryId: String(get("categoryId") ?? ""),
    isPersonalizable: get("isPersonalizable") === "on",
    isActive: get("isActive") === "on",
    isFeatured: get("isFeatured") === "on",
    seoTitle: (get("seoTitle") || null) as string | null,
    seoDescription: (get("seoDescription") || null) as string | null,
    // PLAN_CATALOG_V2 — campos enriquecidos AI-ready
    richDescription: (get("richDescription") || null) as string | null,
    whyChooseThis: (get("whyChooseThis") || null) as string | null,
    idealFor: String(get("idealFor") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    warrantyMonths: getOptNum("warrantyMonths") ?? undefined,
    productionDays: getOptNum("productionDays") ?? undefined,
    shippingDaysMin: getOptNum("shippingDaysMin") ?? undefined,
    shippingDaysMax: getOptNum("shippingDaysMax") ?? undefined,
    minimumQuantity: getOptNum("minimumQuantity") ?? undefined,
    maximumQuantity: getOptNum("maximumQuantity"),
    premadeSurcharge: getOptNum("premadeSurcharge") ?? undefined,
  };
}

export async function createProductAction(
  _prev: ProductActionState | null,
  formData: FormData,
): Promise<ProductActionState> {
  const session = await getCurrentAdmin();
  if (!session) {
    return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  }

  const parsed = ProductCreateSchema.safeParse(parsePayload(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as ProductActionState["fieldErrors"],
    };
  }

  try {
    const product = await createProduct(parsed.data, session.admin.id);
    logger.info({
      event: "admin.product.created",
      adminId: session.admin.id,
      productId: product.id,
      slug: product.slug,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.create",
      entityType: "Product",
      entityId: product.id,
      metadata: { slug: product.slug, sku: product.sku, name: product.name },
    });
    // Revalidar admin + storefront para que el cliente vea el cambio
    // inmediatamente sin esperar al revalidate por TTL.
    revalidatePath("/admin/productos");
    revalidatePath("/productos");
    revalidatePath("/", "layout"); // home featured + categorías
    redirect(`/admin/productos/${product.id}?created=1`);
  } catch (err) {
    if (err instanceof ProductValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as ProductActionState["fieldErrors"],
      };
    }
    // redirect() lanza una excepción interna de Next — la dejamos pasar
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error(
      {
        event: "admin.product.create_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to create product",
    );
    return { error: "Algo salió mal creando el producto. Intenta de nuevo." };
  }
}

export async function updateProductAction(
  _prev: ProductActionState | null,
  formData: FormData,
): Promise<ProductActionState> {
  const session = await getCurrentAdmin();
  if (!session) {
    return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  }

  const id = String(formData.get("id") ?? "");
  const payload = { id, ...parsePayload(formData) };
  const parsed = ProductUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as ProductActionState["fieldErrors"],
    };
  }

  try {
    const product = await updateProduct(parsed.data, session.admin.id);
    logger.info({
      event: "admin.product.updated",
      adminId: session.admin.id,
      productId: product.id,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.update",
      entityType: "Product",
      entityId: product.id,
      metadata: { fields: Object.keys(parsed.data).filter((k) => k !== "id") },
    });
    revalidatePath("/admin/productos");
    revalidatePath(`/admin/productos/${product.id}`);
    // Revalidar todas las URLs storefront que muestran este producto.
    revalidatePath("/productos");
    revalidatePath(`/producto/${product.slug}`);
    revalidatePath("/", "layout"); // home featured + categorías
    return {};
  } catch (err) {
    if (err instanceof ProductValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as ProductActionState["fieldErrors"],
      };
    }
    logger.error(
      {
        event: "admin.product.update_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to update product",
    );
    return { error: "Algo salió mal actualizando el producto." };
  }
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await softDeleteProduct(id, session.admin.id);
  logger.info({
    event: "admin.product.deleted",
    adminId: session.admin.id,
    productId: id,
  });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.archive",
    entityType: "Product",
    entityId: id,
  });
  revalidatePath("/admin/productos");
  revalidatePath("/productos");
  revalidatePath("/", "layout");
  redirect("/admin/productos?deleted=1");
}
