/*
 * Schemas Zod para CMS v2 (CmsPage / CmsSection / CmsField).
 *
 * Validación de input de admin antes de tocar el service.
 */

import { z } from "zod";

// Mismas enums que Prisma — duplicadas como string union acá para
// evitar import circular y porque Zod no infiere bien de Prisma enums.
const FIELD_TYPES = [
  "TEXT",
  "TEXTAREA",
  "MARKDOWN",
  "HTML",
  "JSON",
  "EMAIL",
  "URL",
  "NUMBER",
  "PHONE",
  "COLOR",
  "BOOLEAN",
] as const;
const FIELD_KINDS = ["BLOCK", "SETTING"] as const;

const keyRegex = /^[a-z][a-z0-9._-]*$/i;

/** Guardar el contenido de un campo existente (borrador o save+publish si es SETTING). */
export const CmsFieldSaveSchema = z.object({
  id: z.string().cuid("ID inválido"),
  body: z.string().min(1, "El contenido no puede estar vacío").max(50_000),
  label: z.string().min(2, "Mínimo 2 caracteres").max(200).optional(),
  helpText: z.string().max(500).nullable().optional(),
});
export type CmsFieldSaveInput = z.infer<typeof CmsFieldSaveSchema>;

/**
 * Guardar las filas de un campo LISTA (el editor las serializa a JSON en un
 * hidden input; acá se re-parsea). La validación contra el listSchema de
 * metadata (subcampos requeridos) la hace el service — acá solo la forma.
 */
export const CmsFieldItemsSaveSchema = z.object({
  id: z.string().cuid("ID inválido"),
  items: z.array(z.record(z.string(), z.unknown())).max(100, "Máximo 100 elementos"),
});
export type CmsFieldItemsSaveInput = z.infer<typeof CmsFieldItemsSaveSchema>;

/** Crear un campo nuevo dentro de una sección existente. */
export const CmsFieldCreateSchema = z.object({
  sectionId: z.string().cuid("Sección inválida"),
  key: z
    .string()
    .min(3, "Identificador muy corto")
    .max(120, "Máximo 120 caracteres")
    .regex(keyRegex, "Solo letras, números, puntos, guiones y guiones bajos"),
  kind: z.enum(FIELD_KINDS),
  label: z.string().min(2, "Mínimo 2 caracteres").max(200),
  helpText: z.string().max(500).nullable().optional(),
  type: z.enum(FIELD_TYPES).default("TEXT"),
  category: z.string().min(2).max(40),
  body: z.string().min(1, "El contenido no puede estar vacío").max(50_000),
});
export type CmsFieldCreateInput = z.infer<typeof CmsFieldCreateSchema>;

export const CmsFieldPublishSchema = z.object({
  fieldId: z.string().cuid(),
  versionId: z.string().cuid(),
});
export type CmsFieldPublishInput = z.infer<typeof CmsFieldPublishSchema>;

export const CmsFieldIdSchema = z.object({
  fieldId: z.string().cuid(),
});
export type CmsFieldIdInput = z.infer<typeof CmsFieldIdSchema>;

/** Editar metadatos de una página (título/descripción/orden). */
export const CmsPageUpdateSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CmsPageUpdateInput = z.infer<typeof CmsPageUpdateSchema>;

/** Editar metadatos de una sección (título/descripción/orden). */
export const CmsSectionUpdateSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CmsSectionUpdateInput = z.infer<typeof CmsSectionUpdateSchema>;
