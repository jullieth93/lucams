/*
 * RBAC del admin por Capacidades (`AdminCapability`) y Rutas — LÓGICA PURA (client-safe).
 * Evolucionado en S17 (Fase 8):
 *   - De autorización gruesa por 4 prefijos a matriz fina Rol × Capacidad bajo principio
 *     de mínimo privilegio y protección server-side de PII.
 *   - Mantiene compatibilidad estricta N-21 (Ruta == Página == Server Action / Route Handler)
 *     y preserva intactos los roles legacy `MANAGER` y `FULFILLMENT`.
 */

import type { AdminRole } from "@lucams/db";

/**
 * Catálogo tipado de capacidades granulares del backoffice y CRM operativo.
 */
export const ADMIN_CAPABILITIES = [
  "dashboard:read",
  "orders:read_operational",
  "orders:read_pii",
  "orders:transition",
  "orders:reconcile",
  "production:download_assets",
  "production:moderate",
  "production:manage_AssetsCatalog",
  "contacts:read_360",
  "contacts:read_pii",
  "contacts:merge",
  "crm:manage_activities",
  "crm:manage_tasks",
  "support:manage",
  "warranty:manage",
  "warranty:refund",
  "retract:manage",
  "retract:refund",
  "carts:recover",
  "carts:configure",
  "marketing:read",
  "marketing:export_csv",
  "opportunities:manage",
  "finance:read",
  "finance:reconcile_cod",
  "finance:export_csv",
  "metrics:read",
  "catalog:write",
  "shipping:configure",
  "cms:write",
  "cms:manage_global",
  "audit:read",
  "staff:manage",
  "account:self_security",
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

const OPS_MANAGER_CAPS: readonly AdminCapability[] = [
  "dashboard:read",
  "orders:read_operational",
  "orders:read_pii",
  "orders:transition",
  "orders:reconcile",
  "production:download_assets",
  "production:moderate",
  "production:manage_AssetsCatalog",
  "contacts:read_360",
  "contacts:read_pii",
  "contacts:merge",
  "crm:manage_activities",
  "crm:manage_tasks",
  "support:manage",
  "warranty:manage",
  "warranty:refund",
  "retract:manage",
  "carts:recover",
  "marketing:read",
  "marketing:export_csv",
  "opportunities:manage",
  "catalog:write",
  "shipping:configure",
  "account:self_security",
];

/**
 * Matriz autoritativa Rol → Capacidades.
 * `SUPERADMIN` posee el 100 % del catálogo.
 */
export const ROLE_CAPABILITY_MATRIX: Record<AdminRole, ReadonlySet<AdminCapability>> = {
  SUPERADMIN: new Set<AdminCapability>(ADMIN_CAPABILITIES),
  OPERATIONS_MANAGER: new Set<AdminCapability>(OPS_MANAGER_CAPS),
  MANAGER: new Set<AdminCapability>(OPS_MANAGER_CAPS),
  CUSTOMER_SUPPORT: new Set<AdminCapability>([
    "dashboard:read",
    "orders:read_operational",
    "orders:read_pii",
    "contacts:read_360",
    "contacts:read_pii",
    "crm:manage_activities",
    "crm:manage_tasks",
    "support:manage",
    "warranty:manage",
    "retract:manage",
    "carts:recover",
    "opportunities:manage",
    "account:self_security",
  ]),
  PRINT_WORKSHOP: new Set<AdminCapability>([
    "dashboard:read",
    "orders:read_operational",
    "orders:transition",
    "production:download_assets",
    "production:moderate",
    "crm:manage_tasks",
    "account:self_security",
  ]),
  FULFILLMENT: new Set<AdminCapability>([
    "dashboard:read",
    "orders:read_operational",
    "orders:transition",
    "production:download_assets",
    "crm:manage_tasks",
    "account:self_security",
  ]),
  FINANCE_ANALYST: new Set<AdminCapability>([
    "dashboard:read",
    "orders:read_operational",
    "orders:read_pii",
    "finance:read",
    "finance:reconcile_cod",
    "finance:export_csv",
    "metrics:read",
    "crm:manage_tasks",
    "account:self_security",
  ]),
  CMS_EDITOR: new Set<AdminCapability>(["cms:write", "account:self_security"]),
};

/**
 * ¿El rol posee la capacidad indicada?
 */
export function hasCapability(role: AdminRole, capability: AdminCapability): boolean {
  if (role === "SUPERADMIN") return true;
  const set = ROLE_CAPABILITY_MATRIX[role];
  return set ? set.has(capability) : false;
}

const ALL_ROLES_ORDER: readonly AdminRole[] = [
  "SUPERADMIN",
  "OPERATIONS_MANAGER",
  "CUSTOMER_SUPPORT",
  "PRINT_WORKSHOP",
  "FINANCE_ANALYST",
  "MANAGER",
  "FULFILLMENT",
  "CMS_EDITOR",
];

/**
 * Devuelve la lista determinista de roles que poseen una capacidad.
 */
export function rolesWithCapability(capability: AdminCapability): AdminRole[] {
  return ALL_ROLES_ORDER.filter((role) => hasCapability(role, capability));
}

/**
 * Conjuntos de rol nombrados (compatibles con Server Actions y Route Handlers existentes
 * y derivados directamente de la matriz de capacidades).
 */
export const ADMIN_ROLE_SETS = {
  /** Roles que consultan y operan pedidos (incluye soporte/finanzas en lectura, transiciones acotadas por ORDERS_TRANSITION). */
  ALL: rolesWithCapability("orders:read_operational"),
  /** Roles habilitados para transicionar estados logísticos/producción de pedidos. */
  ORDERS_TRANSITION: rolesWithCapability("orders:transition"),
  /** Roles habilitados para descargar ZIP 300 DPI de producción. */
  PRODUCTION_DOWNLOAD: rolesWithCapability("production:download_assets"),
  /** Roles habilitados para imprimir la guía física de entrega (excluye PRINT_WORKSHOP y CMS_EDITOR). */
  SHIPPING_GUIDE_PRINT: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "orders:read_pii") || r === "FULFILLMENT",
  ),
  /** Roles habilitados para moderar diseños de clientes (incluye PRINT_WORKSHOP). */
  PRODUCTION_MODERATE: rolesWithCapability("production:moderate"),
  /** Gerencia operativa + catálogo (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`). */
  MANAGER_UP: rolesWithCapability("catalog:write"),
  /** Atención posventa: tickets, garantías, retractos (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `CUSTOMER_SUPPORT`). */
  SUPPORT_CARE: rolesWithCapability("support:manage"),
  /** Recuperación de carritos abandonados (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `CUSTOMER_SUPPORT`). */
  CARTS_RECOVER: rolesWithCapability("carts:recover"),
  /** Cotizaciones y oportunidades B2B/eventos (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `CUSTOMER_SUPPORT`). */
  OPPORTUNITIES: rolesWithCapability("opportunities:manage"),
  /** Lectura de Contacto 360 (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `CUSTOMER_SUPPORT`). */
  CONTACTS_360: rolesWithCapability("contacts:read_360"),
  /** Fusión humana de duplicados (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`). */
  CONTACTS_MERGE: rolesWithCapability("contacts:merge"),
  /** Finanzas y lectura contable (`SUPERADMIN`, `FINANCE_ANALYST`). */
  FINANCE: rolesWithCapability("finance:read"),
  /** Conciliación contraentrega COD (`SUPERADMIN`, `FINANCE_ANALYST`). */
  FINANCE_COD: rolesWithCapability("finance:reconcile_cod"),
  /** Exportación CSV contable (`SUPERADMIN`, `FINANCE_ANALYST`). */
  FINANCE_EXPORT: rolesWithCapability("finance:export_csv"),
  /** Exportación CSV marketing con opt-in (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`). */
  MARKETING_EXPORT: rolesWithCapability("marketing:export_csv"),
  /** Métricas y analítica comercial (`SUPERADMIN`, `FINANCE_ANALYST`). */
  METRICS: rolesWithCapability("metrics:read"),
  /** Contenido editorial CMS v2 (`SUPERADMIN`, `CMS_EDITOR`). */
  CONTENT: rolesWithCapability("cms:write"),
  /** Exclusivo `SUPERADMIN` (usuarios, auditoría, reembolsos finales, config global). */
  SUPER: ["SUPERADMIN"] as const,
  /** Autoservicio de seguridad de cuenta (MFA obligatorio para el 100 % de roles). */
  ALL_PLUS_CMS: ALL_ROLES_ORDER,
} satisfies Record<string, readonly AdminRole[]>;

const ROUTE_ROLES: Array<{ prefix: string; roles: readonly AdminRole[] }> = [
  { prefix: "/admin/dashboard", roles: rolesWithCapability("dashboard:read") },
  { prefix: "/admin/hoy", roles: rolesWithCapability("dashboard:read") },
  { prefix: "/admin/pedidos", roles: rolesWithCapability("orders:read_operational") },

  // Posventa y soporte al cliente (incluye CUSTOMER_SUPPORT)
  { prefix: "/admin/garantias", roles: rolesWithCapability("warranty:manage") },
  { prefix: "/admin/reclamos", roles: rolesWithCapability("warranty:manage") },
  { prefix: "/admin/retractos", roles: rolesWithCapability("retract:manage") },
  { prefix: "/admin/soporte", roles: rolesWithCapability("support:manage") },
  { prefix: "/admin/mensajes", roles: rolesWithCapability("support:manage") },

  // Oportunidades y cotizaciones B2B / eventos
  { prefix: "/admin/cotizaciones", roles: rolesWithCapability("opportunities:manage") },
  { prefix: "/admin/oportunidades", roles: rolesWithCapability("opportunities:manage") },

  // Producción y moderación (PRINT_WORKSHOP accede a moderación; plantillas/fichas siguen en catálogo/estudio)
  { prefix: "/admin/moderacion", roles: rolesWithCapability("production:moderate") },
  {
    prefix: "/admin/disenos",
    roles: rolesWithCapability("production:manage_AssetsCatalog"),
  },
  {
    prefix: "/admin/fichas",
    roles: rolesWithCapability("production:manage_AssetsCatalog"),
  },
  {
    prefix: "/admin/plantillas",
    roles: rolesWithCapability("production:manage_AssetsCatalog"),
  },

  // Catálogo y transporte
  { prefix: "/admin/productos", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/inventario", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/categorias", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/ocasiones", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/resenas", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/envios", roles: rolesWithCapability("shipping:configure") },

  // Contactos 360 vs Bandeja de fusión de duplicados (longest-prefix match protege /duplicados)
  { prefix: "/admin/clientes/duplicados", roles: rolesWithCapability("contacts:merge") },
  { prefix: "/admin/clientes", roles: rolesWithCapability("contacts:read_360") },

  // Marketing y carritos abandonados
  {
    prefix: "/admin/marketing/suscriptores/export",
    roles: rolesWithCapability("marketing:export_csv"),
  },
  {
    prefix: "/admin/marketing/segmentos/export",
    roles: rolesWithCapability("marketing:export_csv"),
  },
  { prefix: "/admin/marketing", roles: rolesWithCapability("marketing:read") },
  { prefix: "/admin/carritos/configuracion", roles: ["SUPERADMIN"] },
  { prefix: "/admin/carritos", roles: rolesWithCapability("carts:recover") },

  // Finanzas, conciliación COD, costos y métricas (habilita FINANCE_ANALYST sin SUPERADMIN)
  { prefix: "/admin/finanzas/conciliacion", roles: rolesWithCapability("finance:reconcile_cod") },
  { prefix: "/admin/finanzas/bloqueos", roles: rolesWithCapability("finance:reconcile_cod") },
  { prefix: "/admin/finanzas/export", roles: rolesWithCapability("finance:export_csv") },
  { prefix: "/admin/finanzas", roles: rolesWithCapability("finance:read") },
  { prefix: "/admin/costos", roles: rolesWithCapability("finance:read") },
  { prefix: "/admin/metricas", roles: rolesWithCapability("metrics:read") },

  // Configuración sensible y CMS v2
  { prefix: "/admin/fidelizacion", roles: ["SUPERADMIN"] },
  { prefix: "/admin/contenido/paginas/global", roles: ["SUPERADMIN"] },
  { prefix: "/admin/contenido/configuracion", roles: ["SUPERADMIN"] },
  { prefix: "/admin/contenido", roles: rolesWithCapability("cms:write") },
  { prefix: "/admin/email-templates", roles: ["SUPERADMIN"] },
  { prefix: "/admin/auditoria", roles: rolesWithCapability("audit:read") },
  { prefix: "/admin/usuarios", roles: rolesWithCapability("staff:manage") },

  // Aprendizaje y seguridad de la cuenta (disponibles para todos los roles)
  { prefix: "/admin/ayuda", roles: ALL_ROLES_ORDER },
  { prefix: "/admin/seguridad", roles: ALL_ROLES_ORDER },
];

/** ¿El rol puede acceder a esta ruta admin? */
export function canAccessAdminPath(role: AdminRole, pathname: string): boolean {
  if (role === "SUPERADMIN") return true;
  let best: { prefix: string; roles: readonly AdminRole[] } | null = null;
  for (const r of ROUTE_ROLES) {
    if (
      pathname === r.prefix ||
      pathname.startsWith(r.prefix + "/") ||
      pathname.startsWith(r.prefix + "?")
    ) {
      if (!best || r.prefix.length > best.prefix.length) best = r;
    }
  }
  if (!best) return false; // no listada → solo SUPERADMIN (deny-by-default)
  return best.roles.includes(role);
}

/**
 * Ruta "home" del panel para cada rol.
 * Operativos aterrizan en `/admin/dashboard`; `CMS_EDITOR` aterriza en `/admin/contenido`.
 */
export function adminHomePath(role: AdminRole): string {
  for (const path of ["/admin/dashboard", "/admin/contenido"]) {
    if (canAccessAdminPath(role, path)) return path;
  }
  return "/admin/login";
}

/**
 * Filtra grupos/items del menú según lo que el rol puede ver.
 */
export function filterNavByRole<T extends { items?: Array<{ href: string }>; href?: string }>(
  groups: T[],
  role: AdminRole,
): T[] {
  if (role === "SUPERADMIN") return groups;
  const out: T[] = [];
  for (const g of groups) {
    if (g.items) {
      const items = g.items.filter((it) => canAccessAdminPath(role, it.href));
      if (items.length > 0) out.push({ ...g, items } as T);
    } else if (g.href) {
      if (canAccessAdminPath(role, g.href)) out.push(g);
    } else {
      out.push(g);
    }
  }
  return out;
}
