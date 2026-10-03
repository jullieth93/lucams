import "server-only";
import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  createSlugRenameRedirect,
  archiveRedirectOccupyingPath,
} from "@/features/redirects/service";
import type { CategoryCreateInput } from "./schemas";

export class CategoryValidationError extends Error {
  constructor(
    public field: "slug" | "general",
    message: string,
  ) {
    super(message);
    this.name = "CategoryValidationError";
  }
}

/**
 * Siguiente `order` libre dentro de un grupo de hermanas (mismo parentId).
 * D3 (Lucy 2026-06-27): el orden se auto-asigna al crear; Lucy no lo escribe.
 */
async function nextOrderInGroup(parentId: string | null): Promise<number> {
  const last = await prisma.category.findFirst({
    where: { parentId, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

/**
 * Valida que una categoría pueda colgar de `parentId` respetando el límite de
 * 1 nivel (el storefront sólo tiene rutas /productos/[categoria]/[subcategoria]).
 * `selfId` se pasa en edición para impedir auto-referencia / volverse hija
 * teniendo ya hijas propias.
 */
async function assertValidParent(parentId: string, selfId?: string): Promise<void> {
  if (selfId && parentId === selfId) {
    throw new CategoryValidationError("general", "Una categoría no puede ser su propia madre.");
  }
  const parent = await prisma.category.findFirst({
    where: { id: parentId, deletedAt: null },
    select: { parentId: true },
  });
  if (!parent) {
    throw new CategoryValidationError("general", "La categoría madre elegida no existe.");
  }
  if (parent.parentId) {
    throw new CategoryValidationError(
      "general",
      "Solo se permite un nivel de sub-categorías (la madre ya es una sub-categoría).",
    );
  }
  if (selfId) {
    const childCount = await prisma.category.count({
      where: { parentId: selfId, deletedAt: null },
    });
    if (childCount > 0) {
      throw new CategoryValidationError(
        "general",
        "Esta categoría ya tiene sub-categorías, así que no puede volverse sub-categoría de otra.",
      );
    }
  }
}

export type CategoryListOpts = {
  /** Búsqueda en name/slug (case-insensitive). */
  q?: string;
  /** Filtro por estado. Default: "all" (muestra todo incluso archivadas). */
  status?: "active" | "inactive" | "archived" | "all";
  /** Orden. Default: por order asc + name asc. */
  sort?: "order" | "name" | "recent";
};

export async function listCategories(opts: CategoryListOpts = {}) {
  const q = opts.q?.trim();
  const orderBy = (() => {
    switch (opts.sort) {
      case "name":
        return [{ name: "asc" as const }];
      case "recent":
        return [{ createdAt: "desc" as const }];
      case "order":
      default:
        return [{ order: "asc" as const }, { name: "asc" as const }];
    }
  })();

  // Default: admin ve TODO (activas + inactivas + archivadas). Storefront
  // filtra deletedAt+isActive aparte. Lucy 2026-05-22: modularidad.
  return prisma.category.findMany({
    where: {
      ...(opts.status === "active" ? { isActive: true, deletedAt: null } : {}),
      ...(opts.status === "inactive" ? { isActive: false, deletedAt: null } : {}),
      ...(opts.status === "archived" ? { deletedAt: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { slug: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      deletedAt: true,
      order: true,
      parentId: true,
      // Roadmap B3 — para la vista previa (icono + swatch) en el listado admin.
      icon: true,
      gradient: true,
      parent: { select: { name: true } },
      _count: { select: { products: true, children: true } },
    },
  });
}

/** Categorías de primer nivel (parentId null), activas, para usar como opciones
 * "categoría madre" en el form. Excluye `excludeId` (la propia, en edición). */
export async function listParentCategoryOptions(excludeId?: string) {
  return prisma.category.findMany({
    where: {
      parentId: null,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function createCategory(input: CategoryCreateInput, createdBy: string | null) {
  const conflict = await prisma.category.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (conflict) throw new CategoryValidationError("slug", `Slug "${input.slug}" ya existe`);

  const parentId = input.parentId ?? null;
  if (parentId) await assertValidParent(parentId);

  // D3: orden auto = último de su grupo de hermanas + 1 (salvo que venga explícito).
  const order = input.order ?? (await nextOrderInGroup(parentId));

  const created = await prisma.category.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      isActive: input.isActive,
      parentId,
      order,
      // Roadmap B3 — visual de catálogo (null = fallback por slug/default).
      icon: input.icon ?? null,
      gradient: input.gradient ?? null,
      // B-6 — contenido de la sub-categoría (null = la tienda omite la sección;
      // defaultSort null = "recent" en el PLP).
      richDescription: input.richDescription ?? null,
      useCase: input.useCase ?? null,
      defaultSort: input.defaultSort ?? null,
      ...(createdBy ? { createdBy } : {}),
    },
  });
  updateTag("catalog");

  // A11R-03 — alta con slug liberado: si un redirect activo ocupa la URL nueva
  // (/productos/<slug> o /productos/<madre>/<slug>, p.ej. quedó de un rename
  // previo), la página viva gana → archivarlo; si no, la categoría nueva sería
  // inalcanzable (301 al renombrado) sin señal al admin. Best-effort (mismo
  // criterio que A11-02): el alta ya quedó; un fallo acá es warn, no error.
  try {
    const parentSlug = parentId
      ? (await prisma.category.findUnique({ where: { id: parentId }, select: { slug: true } }))
          ?.slug
      : null;
    await archiveRedirectOccupyingPath(
      parentSlug ? `/productos/${parentSlug}/${created.slug}` : `/productos/${created.slug}`,
      createdBy,
    );
  } catch (err) {
    logger.warn({
      event: "catalog.create_archive_redirect_fail",
      entity: "category",
      entityId: created.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return created;
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryCreateInput>,
  updatedBy: string | null,
) {
  if (input.slug) {
    // findUnique (no findFirst con deletedAt:null) para detectar también el slug
    // de una categoría ARCHIVADA — el UNIQUE de la DB lo ocupa igual. Antes esto
    // lanzaba un P2002 sin capturar; ahora da un error amigable. (Fix bug hallado
    // por tests, Lucy 2026-06-30.)
    const conflict = await prisma.category.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (conflict && conflict.id !== id) {
      throw new CategoryValidationError("slug", `Slug "${input.slug}" ya existe`);
    }
  }

  // A11-02 — slug/parent actual (para el redirect automático si el slug cambia).
  const prevCategory = input.slug
    ? await prisma.category.findUnique({ where: { id }, select: { slug: true, parentId: true } })
    : null;

  // D2: si cambia la categoría madre, validamos el límite de 1 nivel y
  // reubicamos el `order` al final del nuevo grupo de hermanas.
  let orderOverride: number | undefined;
  if (input.parentId !== undefined) {
    const current = await prisma.category.findUnique({
      where: { id },
      select: { parentId: true },
    });
    const newParentId = input.parentId ?? null;
    if (newParentId) await assertValidParent(newParentId, id);
    if ((current?.parentId ?? null) !== newParentId) {
      orderOverride = await nextOrderInGroup(newParentId);
    }
  }

  const updated = await prisma.category.update({
    where: { id },
    data: {
      ...input,
      ...(orderOverride !== undefined ? { order: orderOverride } : {}),
      ...(updatedBy ? { updatedBy } : {}),
    },
  });
  updateTag("catalog");

  // A11-02 — rename de slug público: crear UrlRedirect viejo→nuevo para que la
  // URL vieja no quede en 404 (best-effort: el rename ya quedó; un fallo acá es
  // warn, no error de la acción). Si es categoría MADRE, el rename también mueve
  // las URLs de sus hijas (/productos/<madre>/<hija>) → un redirect por hija viva.
  if (prevCategory && updated.slug !== prevCategory.slug) {
    try {
      const slugOf = async (parentId: string | null) =>
        parentId
          ? (await prisma.category.findUnique({ where: { id: parentId }, select: { slug: true } }))
              ?.slug
          : null;
      const oldParentSlug = await slugOf(prevCategory.parentId);
      const newParentSlug =
        updated.parentId === prevCategory.parentId ? oldParentSlug : await slugOf(updated.parentId);
      const catPath = (parentSlug: string | null | undefined, slug: string) =>
        parentSlug ? `/productos/${parentSlug}/${slug}` : `/productos/${slug}`;
      const description = `Auto: slug de categoría renombrado (${prevCategory.slug} → ${updated.slug})`;
      await createSlugRenameRedirect({
        fromPath: catPath(oldParentSlug, prevCategory.slug),
        toPath: catPath(newParentSlug, updated.slug),
        actorAdminId: updatedBy,
        description,
      });
      if (!prevCategory.parentId) {
        const children = await prisma.category.findMany({
          where: { parentId: id, deletedAt: null },
          select: { slug: true },
        });
        for (const child of children) {
          await createSlugRenameRedirect({
            fromPath: `/productos/${prevCategory.slug}/${child.slug}`,
            toPath: `/productos/${updated.slug}/${child.slug}`,
            actorAdminId: updatedBy,
            description,
          });
        }
      }
    } catch (err) {
      logger.warn({
        event: "catalog.slug_rename_redirect_fail",
        entity: "category",
        entityId: id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return updated;
}

/**
 * Reordena una categoría dentro de su grupo de hermanas (mismo parentId),
 * intercambiándola con la vecina en la dirección dada. Re-secuencia TODO el
 * grupo a 0..n para ser robusto ante `order` duplicados (datos legacy en 0).
 * D3 (Lucy 2026-06-27): reemplaza el campo manual "número de orden".
 */
export async function moveCategory(id: string, direction: "up" | "down", actorId: string | null) {
  const cat = await prisma.category.findUnique({
    where: { id },
    select: { parentId: true },
  });
  if (!cat) return;

  const siblings = await prisma.category.findMany({
    where: { parentId: cat.parentId, deletedAt: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const idx = siblings.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return; // ya en el borde

  const reordered = [...siblings];
  [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

  await prisma.$transaction(
    reordered.map((s, i) =>
      prisma.category.update({
        where: { id: s.id },
        data: { order: i, ...(s.id === id && actorId ? { updatedBy: actorId } : {}) },
      }),
    ),
  );
  updateTag("catalog");
}

export async function softDeleteCategory(id: string, deletedBy: string | null) {
  // Bloquear borrado si tiene productos activos asociados — evita
  // huérfanos en Product.categoryId.
  const productCount = await prisma.product.count({
    where: { categoryId: id, deletedAt: null },
  });
  if (productCount > 0) {
    throw new CategoryValidationError(
      "general",
      `No se puede archivar: tiene ${productCount} producto(s) activo(s). Movelos a otra categoría primero.`,
    );
  }
  const deleted = await prisma.category.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      ...(deletedBy ? { deletedBy } : {}),
    },
  });
  updateTag("catalog");
  return deleted;
}

/** Restaura una categoría archivada. isActive queda false; admin la activa
 * explícito desde el listado para evitar que reaparezca en storefront sin querer. */
export async function restoreCategory(id: string, restoredBy: string | null) {
  const restored = await prisma.category.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedBy: null,
      isActive: false,
      ...(restoredBy ? { updatedBy: restoredBy } : {}),
    },
  });
  updateTag("catalog");
  return restored;
}
