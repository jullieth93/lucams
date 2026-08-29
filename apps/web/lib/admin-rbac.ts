/*
 * RBAC del admin por rol — LÓGICA PURA (client-safe). Lucy 2026-06-27 (Bloque C / A5).
 *
 * Matriz ruta→roles derivada de SECURITY.md §113-118:
 *   - SUPERADMIN: todo.
 *   - MANAGER:    catálogo (productos/inventario/categorías/ocasiones), pedidos,
 *                 reclamos, reseñas, clientes.
 *   - FULFILLMENT: solo pedidos + reclamos (cambio de estado, descarga PNG).
 *   - CMS_EDITOR: solo contenido del sitio (CMS v2 en /admin/contenido y
 *                 /admin/email-templates). NO entra a nada más.
 *   - Cualquier ruta NO listada → solo SUPERADMIN (deny-by-default).
 *
 * Hoy solo existe SUPERADMIN (Lucy), así que no la afecta — prepara el terreno
 * para empleados. El guard de servidor (requireRole) vive en lib/admin-rbac-guard.
 */

import type { AdminRole } from "@lucams/db";

const ALL: AdminRole[] = ["SUPERADMIN", "MANAGER", "FULFILLMENT"];
const CATALOG: AdminRole[] = ["SUPERADMIN", "MANAGER"];
const CONTENT: AdminRole[] = ["SUPERADMIN", "CMS_EDITOR"];
// Todos los roles del enum, CMS_EDITOR incluido. Solo para autoservicio de CUENTA
// (seguridad/MFA): el MFA es obligatorio para TODO admin (auditoría 2026-08-24 · B-1),
// así que la pantalla de enrolamiento no puede quedar tras el deny-by-default.
const ALL_PLUS_CMS: AdminRole[] = ["SUPERADMIN", "MANAGER", "FULFILLMENT", "CMS_EDITOR"];

/**
 * Conjuntos de rol nombrados para declarar la autorización de cada Server Action
 * de forma uniforme (ADR-062 P0-1). Los consume `requireAdminAction` en el guard:
 *   - ALL         → pedidos, garantías, retractos (transiciones de estado).
 *                   (Son los roles OPERATIVOS; CMS_EDITOR no está: no es "todos
 *                   los roles del enum", es "todos los de operación".)
 *   - MANAGER_UP  → catálogo (productos/variantes/categorías/ocasiones/reseñas/
 *                   fichas/plantillas/galería), soporte, garantías.
 *   - CONTENT     → contenido del sitio (CMS v2: páginas, ajustes globales y
 *                   plantillas de correo).
 *   - SUPER       → finanzas, cupones, usuarios, redirects, seguridad,
 *                   integraciones, observability, reembolsos.
 *   - ALL_PLUS_CMS → todos los roles del enum (incl. CMS_EDITOR). Reservado al
 *                   autoservicio de cuenta: /admin/seguridad (MFA obligatorio).
 */
export const ADMIN_ROLE_SETS = {
  ALL: ["SUPERADMIN", "MANAGER", "FULFILLMENT"] as const,
  MANAGER_UP: ["SUPERADMIN", "MANAGER"] as const,
  CONTENT: ["SUPERADMIN", "CMS_EDITOR"] as const,
  SUPER: ["SUPERADMIN"] as const,
  ALL_PLUS_CMS: ["SUPERADMIN", "MANAGER", "FULFILLMENT", "CMS_EDITOR"] as const,
} satisfies Record<string, readonly AdminRole[]>;

const ROUTE_ROLES: Array<{ prefix: string; roles: AdminRole[] }> = [
  { prefix: "/admin/dashboard", roles: ALL },
  { prefix: "/admin/pedidos", roles: ALL },
  // "Reclamos" legales = garantias + retractos: FULFILLMENT/MANAGER gestionan
  // estados; el resto es SUPERADMIN. /admin/reclamos (bandeja aparte, sí existe)
  // queda MANAGER_UP más abajo, igual que sus actions.
  { prefix: "/admin/garantias", roles: ALL },
  { prefix: "/admin/retractos", roles: ALL },
  { prefix: "/admin/soporte", roles: CATALOG },
  // Cotizaciones (Etapa 1): las mutaciones del service exigen MANAGER_UP.
  { prefix: "/admin/cotizaciones", roles: CATALOG },
  // MANAGER_UP (= CATALOG): rutas cuyas actions ya exigen ADMIN_ROLE_SETS.MANAGER_UP
  // (reclamos, mensajes, diseños/galería, fichas y plantillas del Estudio).
  { prefix: "/admin/reclamos", roles: CATALOG },
  { prefix: "/admin/mensajes", roles: CATALOG },
  { prefix: "/admin/disenos", roles: CATALOG },
  { prefix: "/admin/fichas", roles: CATALOG },
  { prefix: "/admin/plantillas", roles: CATALOG },
  { prefix: "/admin/moderacion", roles: CATALOG },
  { prefix: "/admin/productos", roles: CATALOG },
  { prefix: "/admin/inventario", roles: CATALOG },
  { prefix: "/admin/categorias", roles: CATALOG },
  { prefix: "/admin/ocasiones", roles: CATALOG },
  { prefix: "/admin/resenas", roles: CATALOG },
  { prefix: "/admin/clientes", roles: CATALOG },
  // Contenido del sitio (CMS v2): "Páginas del sitio" (/admin/contenido, incluye
  // /admin/contenido/paginas/global = "Ajustes del sitio") y "Plantillas de
  // correo" (/admin/email-templates, redirect legacy a /admin/contenido/paginas/emails).
  { prefix: "/admin/contenido", roles: CONTENT },
  { prefix: "/admin/email-templates", roles: CONTENT },
  // Seguridad de la cuenta (MFA + recovery codes): abierta a TODOS los roles porque
  // el MFA es obligatorio para todo admin (B-1). Sin esta excepción, el redirect de
  // enrolamiento forzado del guard caería en el deny-by-default (loop con el home).
  { prefix: "/admin/seguridad", roles: ALL_PLUS_CMS },
  // Resto (finanzas, cupones, usuarios, integraciones, auditoria,
  // mayorista, materiales, costos, canales, bot, metricas,
  // performance, redirects) → SUPERADMIN únicamente.
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
 * Ruta "home" del panel para cada rol (Lucy 2026-07-30, rol CMS_EDITOR).
 *
 * CMS_EDITOR NO tiene acceso a /admin/dashboard (la matriz lo limita a
 * contenido), así que el dashboard no puede ser su destino post-login ni su
 * fallback de "acceso denegado" — sería un loop de redirects. Decisión (la más
 * simple): la home es la PRIMERA ruta preferida a la que el rol tiene acceso
 * según la misma matriz (dashboard → contenido). Para los roles operativos el
 * comportamiento no cambia (dashboard); para CMS_EDITOR es /admin/contenido.
 *
 * La usan: la action de login (redirect post-login), el layout del panel
 * (redirect por rol sin permiso) y requireAdminAction (idem en Server Actions).
 */
export function adminHomePath(role: AdminRole): string {
  for (const path of ["/admin/dashboard", "/admin/contenido"]) {
    if (canAccessAdminPath(role, path)) return path;
  }
  // Defensivo: un rol sin NINGUNA ruta accesible no debería estar en el panel.
  return "/admin/login";
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
