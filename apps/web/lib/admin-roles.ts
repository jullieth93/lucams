import type { AdminRole } from "@lucams/db";

/**
 * Lista canónica de todos los roles del enum Prisma `AdminRole` (S17 · Fase 8).
 *
 * Incluye los 4 perfiles granulares por capacidades (`OPERATIONS_MANAGER`,
 * `CUSTOMER_SUPPORT`, `PRINT_WORKSHOP`, `FINANCE_ANALYST`) junto con los roles
 * existentes (`SUPERADMIN`, `MANAGER`, `FULFILLMENT`, `CMS_EDITOR`) para
 * compatibilidad sin downtime sobre sesiones y cuentas activas.
 */
export const ADMIN_ROLES_ALL: readonly AdminRole[] = [
  "SUPERADMIN",
  "OPERATIONS_MANAGER",
  "CUSTOMER_SUPPORT",
  "PRINT_WORKSHOP",
  "FINANCE_ANALYST",
  "MANAGER",
  "FULFILLMENT",
  "CMS_EDITOR",
] as const;

/**
 * Diccionario ÚNICO de etiquetas de roles admin en español (Colombia).
 */
export const ADMIN_ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "Administradora",
  OPERATIONS_MANAGER: "Jefa de operaciones",
  CUSTOMER_SUPPORT: "Atención al cliente",
  PRINT_WORKSHOP: "Taller e impresión",
  FINANCE_ANALYST: "Analista financiera",
  MANAGER: "Gestora",
  FULFILLMENT: "Despachos",
  CMS_EDITOR: "Editor de contenido",
};

/**
 * Descripción breve y clara de cada rol para selectores y pantallas de acceso.
 */
export const ADMIN_ROLE_DESCRIPTION: Record<AdminRole, string> = {
  SUPERADMIN: "Control total: seguridad, usuarios, reembolsos finales y configuración maestra.",
  OPERATIONS_MANAGER:
    "Operación integral: catálogo, envíos, pedidos, Contacto 360, fusión de duplicados y marketing.",
  CUSTOMER_SUPPORT:
    "Servicio al cliente: tickets, garantías, retractos, carritos y Contacto 360 (sin catálogo ni exports).",
  PRINT_WORKSHOP:
    "Taller e imprenta: preparación de pedidos, ZIP 300 DPI y moderación (PII enmascarada).",
  FINANCE_ANALYST:
    "Contabilidad y recaudo: finanzas, conciliación contraentrega, costos, métricas y export contable.",
  MANAGER: "Gestora general (perfil compatible con Jefa de operaciones).",
  FULFILLMENT: "Despachos y alistamiento de pedidos (PII enmascarada).",
  CMS_EDITOR: "Edición exclusiva de páginas y textos editoriales del sitio.",
};

export function isValidAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES_ALL as readonly string[]).includes(value);
}

export function adminRoleLabel(role: string): string {
  // Object.hasOwn evita que claves heredadas del prototype ("toString",
  // "__proto__", etc.) devuelvan la propiedad heredada en vez del string —
  // garantiza el tipo de retorno `string`.
  return Object.hasOwn(ADMIN_ROLE_LABEL, role) ? ADMIN_ROLE_LABEL[role] : role;
}
