/*
 * Service layer — CMS v2 (CmsPage / CmsSection / CmsField / CmsFieldVersion).
 *
 * Modelo Página → Sección → Campo: el contenido se navega por página del sitio
 * (Inicio, Footer, Contacto…) para una administradora NO técnica. Unifica los
 * antiguos CmsBlock (kind BLOCK) y SiteSetting (kind SETTING) en CmsField.
 *
 * Semántica de publicación:
 *   - kind BLOCK: guardar crea una VERSIÓN BORRADOR; el sitio público no cambia
 *     hasta "Publicar" (publishedVersionId apunta a la versión viva).
 *   - kind SETTING: guardar crea versión Y PUBLICA de inmediato (equivalente al
 *     comportamiento del viejo SiteSetting, que se aplicaba al guardar). Los
 *     settings no se pueden despublicar.
 *
 * Lógica de dominio pura: Prisma + tipos, sin imports de next/* ni
 * @/lib/supabase. Server actions envuelven con auth + revalidación.
 */

import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import type {
  CmsFieldCreateInput,
  CmsFieldSaveInput,
  CmsPageUpdateInput,
  CmsSectionUpdateInput,
} from "./schemas";

export class CmsValidationError extends Error {
  constructor(
    public field: "key" | "general",
    message: string,
  ) {
    super(message);
    this.name = "CmsValidationError";
  }
}

// ─────────────────── Queries: navegación por páginas ───────────────────

/** Índice del admin: páginas con sus secciones y estado de publicación. */
export async function listCmsPages() {
  return prisma.cmsPage.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          fields: {
            where: { deletedAt: null },
            select: {
              id: true,
              kind: true,
              isPublished: true,
              publishedVersionId: true,
              versions: {
                orderBy: { version: "desc" },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
}

/** ¿El campo tiene un borrador más nuevo que lo publicado (o nunca se publicó)? */
export function cmsFieldHasDraft(field: {
  isPublished: boolean;
  publishedVersionId: string | null;
  versions: { id: string }[];
}): boolean {
  const latest = field.versions[0];
  if (!latest) return false;
  return latest.id !== field.publishedVersionId;
}

/** Editor de una página: secciones con campos completos y su versión viva. */
export async function getCmsPageBySlug(slug: string) {
  return prisma.cmsPage.findUnique({
    where: { slug },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          fields: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
            include: {
              publishedVersion: true,
              versions: { orderBy: { version: "desc" }, take: 1 },
            },
          },
        },
      },
    },
  });
}

/** Editor de un campo: con breadcrumb (sección → página), historial e items
 *  de lista (solo presentes si el campo es LISTA — ver CmsListItem). */
export async function getCmsFieldById(id: string) {
  return prisma.cmsField.findFirst({
    where: { id, deletedAt: null },
    include: {
      section: { include: { page: true } },
      publishedVersion: true,
      versions: { orderBy: { version: "desc" }, take: 50 },
      items: { orderBy: { position: "asc" } },
    },
  });
}

/** Buscador global del admin: por key, etiqueta, ayuda o contenido. */
export async function searchCmsFields(query: string) {
  if (!query.trim()) return [];
  return prisma.cmsField.findMany({
    where: {
      deletedAt: null,
      OR: [
        { key: { contains: query, mode: "insensitive" } },
        { label: { contains: query, mode: "insensitive" } },
        { helpText: { contains: query, mode: "insensitive" } },
        { body: { contains: query, mode: "insensitive" } },
      ],
    },
    include: {
      section: { include: { page: { select: { slug: true, title: true } } } },
      publishedVersion: { select: { version: true, publishedAt: true } },
    },
    orderBy: [{ key: "asc" }],
    take: 50,
  });
}

// ─────────────────── Mutaciones de campos ───────────────────

/**
 * Crea un campo nuevo en una sección. kind BLOCK nace como borrador
 * (isPublished:false + versión 1 sin publicar); kind SETTING nace publicado
 * (equivale al viejo createSiteSetting, que quedaba vivo al crearlo).
 */
export async function createCmsField(input: CmsFieldCreateInput, createdBy: string | null) {
  const conflict = await prisma.cmsField.findUnique({
    where: { key: input.key },
    select: { id: true },
  });
  if (conflict) {
    throw new CmsValidationError("key", `El identificador "${input.key}" ya existe`);
  }

  const publishNow = input.kind === "SETTING";
  return prisma.$transaction(async (tx) => {
    const field = await tx.cmsField.create({
      data: {
        sectionId: input.sectionId,
        key: input.key,
        kind: input.kind,
        label: input.label,
        helpText: input.helpText ?? null,
        type: input.type,
        category: input.category,
        body: input.body,
        isPublished: publishNow,
        ...(createdBy ? { createdBy } : {}),
      },
    });
    const v1 = await tx.cmsFieldVersion.create({
      data: {
        fieldId: field.id,
        version: 1,
        title: input.label,
        body: input.body,
        publishedAt: publishNow ? new Date() : null,
        ...(createdBy ? { createdBy } : {}),
      },
    });
    if (publishNow) {
      return tx.cmsField.update({
        where: { id: field.id },
        data: { publishedVersionId: v1.id },
      });
    }
    return field;
  });
}

/**
 * Guarda una nueva versión del campo.
 *   - BLOCK: NO publica — el body actual del CmsField se actualiza (= último
 *     borrador) pero `publishedVersionId` no cambia hasta "Publicar".
 *   - SETTING: publica de inmediato (la versión nueva queda viva en el sitio).
 */
export async function saveCmsFieldDraft(input: CmsFieldSaveInput, updatedBy: string | null) {
  const existing = await prisma.cmsField.findUnique({
    where: { id: input.id },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!existing || existing.deletedAt) {
    throw new CmsValidationError("general", "Campo no encontrado");
  }
  const nextVersion = (existing.versions[0]?.version ?? 0) + 1;
  const publishNow = existing.kind === "SETTING";

  return prisma.$transaction(async (tx) => {
    const version = await tx.cmsFieldVersion.create({
      data: {
        fieldId: existing.id,
        version: nextVersion,
        title: input.label ?? existing.label,
        body: input.body,
        publishedAt: publishNow ? new Date() : null,
        ...(updatedBy ? { createdBy: updatedBy } : {}),
      },
    });
    await tx.cmsField.update({
      where: { id: existing.id },
      data: {
        label: input.label ?? existing.label,
        helpText: input.helpText !== undefined ? input.helpText : existing.helpText,
        body: input.body,
        ...(publishNow ? { isPublished: true, publishedVersionId: version.id } : {}),
        ...(updatedBy ? { updatedBy } : {}),
      },
    });
    return version;
  });
}

/**
 * Publica una versión específica del campo (la marca como activa en el sitio
 * público). El campo queda `isPublished: true` y `publishedVersionId` apunta a
 * esta versión.
 */
export async function publishCmsFieldVersion(
  fieldId: string,
  versionId: string,
  publishedBy: string | null,
) {
  const version = await prisma.cmsFieldVersion.findFirst({
    where: { id: versionId, fieldId },
  });
  if (!version) throw new CmsValidationError("general", "Versión no encontrada");

  return prisma.$transaction(async (tx) => {
    await tx.cmsFieldVersion.update({
      where: { id: version.id },
      data: { publishedAt: new Date() },
    });
    return tx.cmsField.update({
      where: { id: fieldId },
      data: {
        isPublished: true,
        publishedVersionId: version.id,
        ...(publishedBy ? { updatedBy: publishedBy } : {}),
      },
    });
  });
}

/**
 * Despublica el campo: queda en DB pero el sitio público no lo ve (cae al
 * fallback hardcoded del componente). Solo aplica a kind BLOCK — los settings
 * no se pueden despublicar (el viejo SiteSetting tampoco podía).
 */
export async function unpublishCmsField(fieldId: string, updatedBy: string | null) {
  const field = await prisma.cmsField.findUnique({ where: { id: fieldId } });
  if (!field || field.deletedAt) throw new CmsValidationError("general", "Campo no encontrado");
  if (field.kind === "SETTING") {
    throw new CmsValidationError("general", "Los ajustes no se pueden despublicar");
  }
  return prisma.cmsField.update({
    where: { id: fieldId },
    data: {
      isPublished: false,
      publishedVersionId: null,
      ...(updatedBy ? { updatedBy } : {}),
    },
  });
}

export async function softDeleteCmsField(id: string, deletedBy: string | null) {
  return prisma.cmsField.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isPublished: false,
      publishedVersionId: null,
      ...(deletedBy ? { deletedBy } : {}),
    },
  });
}

// ─────────────────── Campos LISTA (roadmap B4) ───────────────────
// Un campo con `metadata.listSchema` se edita como filas con un input por
// subcampo (sin ver JSON). CmsListItem es la representación de EDICIÓN; al
// guardar, el array serializado a JSON es el body del CmsField y pasa por el
// flujo NORMAL de versión (BLOCK → borrador; SETTING → publica al guardar).
// La lectura pública (lib/cms.ts getCmsList) sigue leyendo ese JSON.

/** Tope de filas por lista: protege contra payloads absurdos. */
export const MAX_LIST_ITEMS = 100;

/** Subcampo declarado en `metadata.listSchema` de un campo lista. */
export type CmsListSubfield = {
  name: string;
  type: string; // CmsFieldType — controla el tipo de input del editor
  label: string;
};

/** Fila de un campo lista tal como la consume el editor admin. */
export type CmsListItemData = {
  /** null cuando el item se derivó del body y aún no existe en CmsListItem. */
  id: string | null;
  position: number;
  values: Record<string, unknown>;
};

/**
 * Lee el `listSchema` de la metadata de un campo (null si NO es un campo
 * lista). Defensivo: ignora entradas malformadas y devuelve null si no queda
 * ningún subcampo válido.
 */
export function getCmsListSchema(metadata: Prisma.JsonValue): CmsListSubfield[] | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).listSchema;
  if (!Array.isArray(raw)) return null;
  const schema = raw.filter(
    (v): v is CmsListSubfield =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as CmsListSubfield).name === "string" &&
      typeof (v as CmsListSubfield).type === "string" &&
      typeof (v as CmsListSubfield).label === "string",
  );
  return schema.length > 0 ? schema : null;
}

/**
 * Items de un campo lista, ordenados por position. Si el campo aún no tiene
 * filas en CmsListItem pero su body es un array JSON válido (campo no migrado
 * todavía), deriva los items del body — migración perezosa al abrir el
 * editor; se persisten en CmsListItem al primer guardado.
 */
export async function getCmsFieldItems(fieldId: string): Promise<CmsListItemData[]> {
  const field = await prisma.cmsField.findFirst({
    where: { id: fieldId, deletedAt: null },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!field) throw new CmsValidationError("general", "Campo no encontrado");
  if (field.items.length > 0) {
    return field.items.map((item) => ({
      id: item.id,
      position: item.position,
      values: item.values as Record<string, unknown>,
    }));
  }
  try {
    const parsed: unknown = JSON.parse(field.body);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is Record<string, unknown> =>
          typeof v === "object" && v !== null && !Array.isArray(v),
      )
      .map((values, position) => ({ id: null, position, values }));
  } catch {
    return [];
  }
}

/**
 * Guarda las filas de un campo lista:
 *   1. Valida contra el listSchema de metadata (todos los subcampos son
 *      requeridos: string no vacío; máx. MAX_LIST_ITEMS filas) y normaliza —
 *      solo quedan los subcampos declarados, en el orden del schema, así el
 *      JSON que ve el sitio tiene SIEMPRE la forma esperada.
 *   2. Reemplaza los CmsListItem (delete + insert en la misma transacción).
 *   3. El array serializado es el body del campo → flujo normal de versión:
 *      BLOCK crea versión BORRADOR (hay que Publicar aparte); SETTING crea
 *      versión y PUBLICA de inmediato.
 */
export async function saveCmsFieldItems(
  fieldId: string,
  items: Record<string, unknown>[],
  updatedBy: string | null,
) {
  const existing = await prisma.cmsField.findFirst({
    where: { id: fieldId, deletedAt: null },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!existing) throw new CmsValidationError("general", "Campo no encontrado");

  const listSchema = getCmsListSchema(existing.metadata);
  if (!listSchema) {
    throw new CmsValidationError("general", "Este campo no está configurado como lista");
  }
  if (items.length > MAX_LIST_ITEMS) {
    throw new CmsValidationError("general", `La lista admite máximo ${MAX_LIST_ITEMS} elementos`);
  }

  const cleaned = items.map((item, index) => {
    const values: Record<string, string> = {};
    for (const sub of listSchema) {
      const raw = item[sub.name];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) {
        throw new CmsValidationError(
          "general",
          `Fila ${index + 1}: «${sub.label}» no puede estar vacío`,
        );
      }
      values[sub.name] = value;
    }
    return values;
  });

  const body = JSON.stringify(cleaned, null, 2);
  const nextVersion = (existing.versions[0]?.version ?? 0) + 1;
  const publishNow = existing.kind === "SETTING";

  return prisma.$transaction(async (tx) => {
    await tx.cmsListItem.deleteMany({ where: { fieldId: existing.id } });
    if (cleaned.length > 0) {
      await tx.cmsListItem.createMany({
        data: cleaned.map((values, position) => ({ fieldId: existing.id, position, values })),
      });
    }
    const version = await tx.cmsFieldVersion.create({
      data: {
        fieldId: existing.id,
        version: nextVersion,
        title: existing.label,
        body,
        publishedAt: publishNow ? new Date() : null,
        ...(updatedBy ? { createdBy: updatedBy } : {}),
      },
    });
    await tx.cmsField.update({
      where: { id: existing.id },
      data: {
        body,
        ...(publishNow ? { isPublished: true, publishedVersionId: version.id } : {}),
        ...(updatedBy ? { updatedBy } : {}),
      },
    });
    return version;
  });
}

// ─────────────────── Metadatos de estructura ───────────────────

export async function updateCmsPage(input: CmsPageUpdateInput) {
  return prisma.cmsPage.update({
    where: { id: input.id },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function updateCmsSection(input: CmsSectionUpdateInput) {
  return prisma.cmsSection.update({
    where: { id: input.id },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

// ─────────────────── Lookups por key ───────────────────

/** Busca un campo por su key natural (no id). */
export async function getCmsFieldByKey(key: string) {
  return prisma.cmsField.findFirst({
    where: { key, deletedAt: null },
    include: { publishedVersion: true },
  });
}

// Tipo auxiliar para consumidores que necesiten el campo completo con página.
export type CmsFieldWithPage = Prisma.CmsFieldGetPayload<{
  include: { section: { include: { page: true } } };
}>;
