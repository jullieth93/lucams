/*
 * RBAC del admin por rol — LÓGICA PURA (client-safe). Lucy 2026-06-27 (Bloque C / A5).
 *
 * Matriz ruta→roles derivada de SECURITY.md §113-118:
 *   - SUPERADMIN: todo.
 *   - MANAGER:    catálogo (productos/inventario/categorías/ocasiones), pedidos,
 *                 reclamos, reseñas, clientes.
 *   - FULFILLMENT: solo pedidos + reclamos (cambio de estado, descarga PNG).
 *   - Cualquier ruta NO listada → solo SUPERADMIN (deny-by-default).
 *
 * Hoy solo existe SUPERADMIN (Lucy), así que no la afecta — prepara el terreno
 * para empleados. El guard de servidor (requireRole) vive en lib/admin-rbac-guard.
 */

import type { AdminRole } from "@lucams/db";

const ALL: AdminRole[] = ["SUPERADMIN", "MANAGER", "FULFILLMENT"];
const CATALOG: AdminRole[] = ["SUPERADMIN", "MANAGER"];

/**
 * Conjuntos de rol nombrados para declarar la autorización de cada Server Action
 * de forma uniforme (ADR-062 P0-1). Los consume `requireAdminAction` en el guard:
 *   - ALL         → pedidos, garantías, retractos (transiciones de estado).
 *   - MANAGER_UP  → catálogo (productos/variantes/categorías/ocasiones/reseñas/
 *                   fichas/plantillas/galería), soporte, garantías.
 *   - SUPER       → finanzas, cupones, usuarios, contenido, redirects, seguridad,
 *                   integraciones, observability, reembolsos.
 */
export const ADMIN_ROLE_SETS = {
  ALL: ["SUPERADMIN", "MANAGER", "FULFILLMENT"] as const,
  MANAGER_UP: ["SUPERADMIN", "MANAGER"] as const,
  SUPER: ["SUPERADMIN"] as const,
} satisfies Record<string, readonly AdminRole[]>;

const ROUTE_ROLES: Array<{ prefix: string; roles: AdminRole[] }> = [
  { prefix: "/admin/dashboard", roles: ALL },
  { prefix: "/admin/pedidos", roles: ALL },
  // "Reclamos" son las rutas reales garantias + retractos (antes apuntaba a /admin/reclamos
  // inexistente). FULFILLMENT/MANAGER gestionan estados; el resto es SUPERADMIN.
  { prefix: "/admin/garantias", roles: ALL },
  { prefix: "/admin/retractos", roles: ALL },
  { prefix: "/admin/soporte", roles: CATALOG },
  // Cotizaciones (Etapa 1): las mutaciones del service exigen MANAGER_UP.
  { prefix: "/admin/cotizaciones", roles: CATALOG },
  { prefix: "/admin/moderacion", roles: CATALOG },
  { prefix: "/admin/productos", roles: CATALOG },
  { prefix: "/admin/inventario", roles: CATALOG },
  { prefix: "/admin/categorias", roles: CATALOG },
  { prefix: "/admin/ocasiones", roles: CATALOG },
  { prefix: "/admin/resenas", roles: CATALOG },
  { prefix: "/admin/clientes", roles: CATALOG },
  // Resto (finanzas, cupones, usuarios, integraciones, contenido, auditoria,
  // seguridad, mayorista, materiales, costos, canales, bot, metricas,
  // performance, redirects, email-templates) → SUPERADMIN únicamente.
];

/** ¿El rol puede acceder a esta ruta admin? */
export function canAccessAdminPath(role: AdminRole, pathname: string): boolean {
  if (role === "SUPERADMIN") return true;
  let best: { prefix: string; roles: AdminRole[] } | null = null;
  for (const r of ROUTE_ROLES) {
    if (
      pathname === r.prefix ||
      pathname.startsWith(r.prefix + "/") ||
      pathname.startsWith(r.prefix + "?")
    ) {
      if (!best || r.prefix.length > best.prefix.length) best = r;
    }
  }
  if (!best) return false; // no listada → solo SUPERADMIN
  return best.roles.includes(role);
}

/**
 * Filtra grupos/items del menú según lo que el rol puede ver. Un grupo puede ser
 * link directo (href, sin items, ej. dashboard) o un grupo con sub-items.
 */
export function filterNavByRole<T extends { items?: Array<{ href: string }>; href?: string }>(
  groups: T[],
  role: AdminRole,
): T[] {
  if (role === "SUPERADMIN") return groups;
  const out: T[] = [];
  for (const g of groups) {
    if (g.items) {
      // Grupo con lista: se muestra solo si queda ≥1 item visible. Un grupo cuyos
      // items se filtran todos (o declarado `items: []`) NO se muestra.
      const items = g.items.filter((it) => canAccessAdminPath(role, it.href));
      if (items.length > 0) out.push({ ...g, items } as T);
    } else if (g.href) {
      if (canAccessAdminPath(role, g.href)) out.push(g);
    } else {
      out.push(g); // grupo estructural sin items ni href → se conserva
    }
  }
  return out;
}
