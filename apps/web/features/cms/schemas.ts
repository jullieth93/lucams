/*
 * Schemas Zod para CMS (CmsBlock + SiteSetting).
 *
 * Validación de input de admin antes de tocar el service.
 */

import { z } from "zod";

// Mismas enums que Prisma — duplicadas como string union acá para
// evitar import circular y porque Zod no infiere bien de Prisma enums.
const BLOCK_FORMATS = ["MARKDOWN", "HTML", "TEXT", "JSON"] as const;
const BLOCK_CATEGORIES = [
  "LEGAL",
  "HOME",
  "FOOTER",
  "EMPTY_STATE",
  "COOKIES",
  "FAQ",
  "SUPPORT",
  "MAINTENANCE",
  "EMAIL",
  "MARKETING",
] as const;
const SETTING_TYPES = ["TEXT", "EMAIL", "URL", "NUMBER", "PHONE", "COLOR", "BOOLEAN"] as const;
const SETTING_CATEGORIES = [
  "CONTACT",
  "BUSINESS",
  "LEGAL",
  "COMMERCE",
  "SOCIAL",
  "EXTERNAL",
  "WHATSAPP",
  "COPYRIGHT",
  "SEO",
] as const;

const keyRegex = /^[a-z][a-z0-9._-]*$/i;

export const CmsBlockCreateSchema = z.object({
  key: z
    .string()
    .min(3, "Identificador muy corto")
    .max(120, "Máximo 120 caracteres")
    .regex(keyRegex, "Solo letras, números, puntos, guiones y guiones bajos"),
  title: z.string().min(2, "Mínimo 2 caracteres").max(200).nullable().optional(),
  body: z.string().min(1, "El contenido no puede estar vacío").max(50_000),
  format: z.enum(BLOCK_FORMATS).default("MARKDOWN"),
  category: z.enum(BLOCK_CATEGORIES),
  description: z.string().max(500).nullable().optional(),
});
export type CmsBlockCreateInput = z.infer<typeof CmsBlockCreateSchema>;

// Update: todos los campos opcionales excepto id.
export const CmsBlockUpdateSchema = z.object({
  id: z.string().cuid("ID inválido"),
  title: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(50_000),
  format: z.enum(BLOCK_FORMATS).optional(),
  category: z.enum(BLOCK_CATEGORIES).optional(),
  description: z.string().max(500).nullable().optional(),
});
export type CmsBlockUpdateInput = z.infer<typeof CmsBlockUpdateSchema>;

export const SiteSettingCreateSchema = z.object({
  key: z
    .string()
    .min(2, "Identificador muy corto")
    .max(120)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Solo MAYÚSCULAS, números y guion bajo (ej. CONTACT_EMAIL)"),
  value: z.string().max(2000, "Valor muy largo"),
  valueType: z.enum(SETTING_TYPES).default("TEXT"),
  label: z.string().min(2).max(200),
  description: z.string().max(500).nullable().optional(),
  category: z.enum(SETTING_CATEGORIES),
});
export type SiteSettingCreateInput = z.infer<typeof SiteSettingCreateSchema>;

// Update: solo se cambia value/label/description (no key ni type).
export const SiteSettingUpdateSchema = z.object({
  id: z.string().cuid("ID inválido"),
  value: z.string().max(2000),
  label: z.string().min(2).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
});
export type SiteSettingUpdateInput = z.infer<typeof SiteSettingUpdateSchema>;
