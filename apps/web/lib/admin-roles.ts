/**
 * Diccionario ÚNICO de etiquetas de roles admin en español (Lucy 2026-06-27).
 *
 * Antes el sidebar y /admin/usuarios tenían diccionarios distintos y hasta con
 * valores de enum inexistentes (ADMIN/EDITOR/OPERATOR), así que el mismo rol se
 * veía con nombres diferentes según la pantalla. El enum real es
 * SUPERADMIN | MANAGER | FULFILLMENT | CMS_EDITOR (ver prisma `enum AdminRole`).
 */
export const ADMIN_ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "Administradora",
  MANAGER: "Gestora",
  FULFILLMENT: "Despachos",
  CMS_EDITOR: "Editor de contenido",
};

export function adminRoleLabel(role: string): string {
  // Object.hasOwn evita que claves heredadas del prototype ("toString",
  // "__proto__", etc.) devuelvan la propiedad heredada en vez del string —
  // garantiza el tipo de retorno `string`. (Bug hallado por tests, Lucy 2026-06-30.)
  return Object.hasOwn(ADMIN_ROLE_LABEL, role) ? ADMIN_ROLE_LABEL[role] : role;
}
