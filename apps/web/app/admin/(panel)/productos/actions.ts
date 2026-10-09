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
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";
import {
  createProduct,
  getProductPurgeBlockers,
  hardDeleteProduct,
  ProductValidationError,
  restoreProduct,
  softDeleteProduct,
  toggleProductActive,
  updateProduct,
} from "@/features/products/service";
import { deleteProductImage } from "@/lib/storage";
import { prisma } from "@/lib/db";
import { ProductCreateSchema, ProductUpdateSchema } from "@/features/products/schemas";

export type ProductActionState = {
  error?: string;
  /** true cuando el guardado aplicó — el form de edición muestra el aviso de
   * éxito (antes retornaba {} y "aparentemente no hacía nada", owner 2026-09-18). */
  success?: boolean;
  /** Claves = campos del schema Zod (cualquiera, no solo los del form). El form
   * las traduce a etiquetas humanas en el alert global. */
  fieldErrors?: Partial<Record<string, string[]>>;
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
  // Texto opcional: vacío → null (en update, null = borrar la key del schema).
  const getOptStr = (k: string) => {
    const v = get(k);
    if (v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  // Lista una-por-línea (textarea): vacío → null (mismo criterio de borrado).
  const getLines = (k: string) => {
    const lines = String(get(k) ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return lines.length > 0 ? lines : null;
  };
  // Checkbox del panel activo: marcado → true; ausente (apagado o el panel no
  // aplica al kind elegido) → null = no declarar / borrar la key.
  const getFlag = (k: string) => (get(k) === "on" ? true : null);
  // El select del form expone el valor sintético "LETTERSET" (set de letras:
  // abecedario completo / vocales). En DB es kind NONE + schema.letterSet —
  // la convención de los seeds (restructure-abecedario.mjs) y surface.ts le
  // da prioridad al marcador sobre el kind.
  const rawKind = String(get("personalizationKind") ?? "NONE");
  return {
    name: String(get("name") ?? "").trim(),
    slug: String(get("slug") ?? "").trim(),
    description: String(get("description") ?? "").trim(),
    // null cuando vacío (antes ?? 0): con noValidate en el form el navegador ya
    // no bloquea el precio vacío al CREAR y un 0 silencioso crearía una opción
    // gratis; Zod rechaza null con "Precio inválido" (visible en el form). En
    // edición el hidden siempre trae valor → número.
    basePrice: getOptNum("basePrice"),
    compareAtPrice: getOptNum("compareAtPrice"),
    cost: getOptNum("cost"),
    sku: String(get("sku") ?? "")
      .trim()
      .toUpperCase(),
    categoryId: String(get("categoryId") ?? ""),
    // isPersonalizable ya NO viaja: el checkbox salió del form (2026-10-02) y
    // el service lo deriva del kind (kind ≠ NONE).
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
    // PR C — peso + dims del paquete final (para Aveonline cotización).
    weightGrams: getOptNum("weightGrams"),
    widthCm: getOptNum("widthCm"),
    heightCm: getOptNum("heightCm"),
    depthCm: getOptNum("depthCm"),
    // Personalización (2026-10-02, tab "Personalización"). Campos de paneles
    // que no aplican al kind elegido llegan ausentes → null → el service BORRA
    // esa key del personalizationSchema (limpieza al cambiar de tipo).
    personalizationKind: rawKind === "LETTERSET" ? "NONE" : rawKind,
    photoSlots: getOptNum("photoSlots"),
    facesPerUnit: getOptNum("facesPerUnit"),
    aspectRatio: getOptStr("aspectRatio"),
    galleryTag: getOptStr("galleryTag"),
    textOnlyVariant: getOptStr("textOnlyVariant"),
    letterCountMin: getOptNum("letterCountMin"),
    letterCountMax: getOptNum("letterCountMax"),
    language: getOptStr("language"),
    maxChars: getOptNum("maxChars"),
    fontOptions: getLines("fontOptions"),
    eventFields: getLines("eventFields"),
    allowPhoto: getFlag("allowPhoto"),
    logoFields: getLines("logoFields"),
    requiresVectorFile: getFlag("requiresVectorFile"),
    letterSet: getOptStr("letterSet"),
    // Estudio por producto (2026-09-24 v2): tamaño base del lienzo + columnas
    // forzadas de la grilla. Vacío → null → en edición el service ELIMINA la
    // key del personalizationSchema (vuelve al default del Estudio).
    canvasBaseScale: getOptNum("canvasBaseScale"),
    gridColsOverride: getOptNum("gridColsOverride"),
  };
}

export async function createProductAction(
  _prev: ProductActionState | null,
  formData: FormData,
): Promise<ProductActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

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
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

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
    return { success: true };
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
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

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

/** Restaura un producto archivado (deletedAt → null). Queda isActive=false
 * por seguridad — admin lo activa explícito desde la fila después. */
export async function restoreProductAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await restoreProduct(id, session.admin.id);
  logger.info({ event: "admin.product.restored", adminId: session.admin.id, productId: id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.restore",
    entityType: "Product",
    entityId: id,
  });
  revalidatePath("/admin/productos");
  revalidatePath("/productos");
  revalidatePath("/", "layout");
  redirect("/admin/productos?restored=1");
}

/**
 * ELIMINAR PERMANENTEMENTE un producto archivado (2026-10-09, a pedido del
 * owner — espejo de purgeGalleryImageAction de prediseñados). Purga las
 * imágenes del bucket (product.images + variant.images) y borra la fila con
 * sus cascadas seguras. Irreversible — la UI pide escribir ELIMINAR.
 * Bloquea con mensaje claro si hay diseños, pedidos, carritos o reseñas
 * referenciando el producto. Si la purga de storage falla se ABORTA y la fila
 * se conserva (reintentable; nunca quedan bytes sin fila).
 */
export async function purgeProductAction(formData: FormData): Promise<ProductActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Datos inválidos." };

  const blockers = await getProductPurgeBlockers(id);
  const reasons: string[] = [];
  if (blockers.orderItems > 0) reasons.push(`${blockers.orderItems} pedido(s) lo contienen`);
  if (blockers.designs > 0) reasons.push(`${blockers.designs} diseño(s) del Estudio lo usan`);
  if (blockers.cartItems > 0) reasons.push(`${blockers.cartItems} carrito(s) vivo(s) lo tienen`);
  if (blockers.reviews > 0)
    reasons.push(`${blockers.reviews} reseña(s) de clientes (bórralas primero si procede)`);
  if (reasons.length > 0) {
    return { error: `No se puede eliminar: ${reasons.join("; ")}.` };
  }

  // Bytes primero: si la purga de storage falla, no se borra la fila.
  const media = await prisma.product.findUnique({
    where: { id },
    select: { images: true, variants: { select: { images: true } } },
  });
  if (!media) return { error: "Producto no encontrado." };
  try {
    for (const url of [...media.images, ...media.variants.flatMap((v) => v.images)]) {
      await deleteProductImage(url);
    }
  } catch (err) {
    logger.warn(
      {
        event: "admin.product.purge_fail",
        adminId: session.admin.id,
        id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to purge product images",
    );
    return {
      error:
        "No se pudieron borrar las imágenes del servidor. El producto sigue archivado; inténtalo de nuevo.",
    };
  }

  const purged = await hardDeleteProduct(id);
  if (!purged) return { error: "El producto no está archivado (archívalo primero)." };

  logger.info({ event: "admin.product.purged", adminId: session.admin.id, productId: id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.purge",
    entityType: "Product",
    entityId: id,
  });
  revalidatePath("/admin/productos");
  revalidatePath("/productos");
  revalidatePath("/", "layout");
  return { success: true };
}

/** Toggle isActive (activa o desactiva sin archivar). Reflejo inmediato en storefront. */
export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("isActive") === "true";
  if (!id) return;
  try {
    await toggleProductActive(id, isActive, session.admin.id);
  } catch (err) {
    // Publicar sin peso/dimensiones se bloquea: mostramos el mensaje claro en el
    // banner de la lista en vez de un 500 (revisión adversarial #1).
    if (err instanceof ProductValidationError) {
      redirect(`/admin/productos?bulkError=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  logger.info({
    event: "admin.product.toggle_active",
    adminId: session.admin.id,
    productId: id,
    isActive,
  });
  await recordAdminAction({
    actorId: session.admin.id,
    action: isActive ? "product.activate" : "product.deactivate",
    entityType: "Product",
    entityId: id,
  });
  revalidatePath("/admin/productos");
  revalidatePath("/productos");
  revalidatePath("/", "layout");
}
