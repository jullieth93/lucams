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
  "notifications:manage",
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
  "lifecycle:manage",
  "account:self_security",
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

const OPS_MANAGER_CAPS: readonly AdminCapability[] = [
  "dashboard:read",
  "notifications:manage",
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
  "retract:manage",
  "carts:recover",
  "marketing:read",
  "marketing:export_csv",
  "opportunities:manage",
  "catalog:write",
  "shipping:configure",
  "lifecycle:manage",
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
    "crm:manage_tasks",
    "account:self_security",
  ]),
  FINANCE_ANALYST: new Set<AdminCapability>([
    "dashboard:read",
    "orders:read_operational",
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
  /** Roles habilitados para despachar pedidos (SHIPPED/DELIVERED) y reintentar guías Aveonline (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `FULFILLMENT`). */
  ORDERS_SHIPMENT_DISPATCH: ALL_ROLES_ORDER.filter(
    (r) =>
      hasCapability(r, "orders:transition") &&
      (hasCapability(r, "orders:read_pii") || r === "FULFILLMENT"),
  ),
  /** Roles habilitados para reconciliar incidencias y cancelar pedidos activos (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`). */
  ORDERS_RECONCILE: rolesWithCapability("orders:reconcile"),
  /** Roles habilitados para moderar diseños de clientes (incluye PRINT_WORKSHOP). */
  PRODUCTION_MODERATE: rolesWithCapability("production:moderate"),
  /** Roles habilitados para gestionar activos del Estudio (plantillas, prediseñados y abecedarios). */
  PRODUCTION_ASSETS: rolesWithCapability("production:manage_AssetsCatalog"),
  /** Gerencia operativa + catálogo (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`). */
  MANAGER_UP: rolesWithCapability("catalog:write"),
  /** Lectura de costos y márgenes BOM (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `FINANCE_ANALYST`). */
  COSTOS_READ: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "finance:read") || hasCapability(r, "catalog:write"),
  ),
  /** Lectura de precios al por mayor (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `FINANCE_ANALYST`). */
  MAYORISTA_READ: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "catalog:write") || hasCapability(r, "finance:read"),
  ),
  /** Edición de precios al por mayor (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`). */
  MAYORISTA_WRITE: rolesWithCapability("catalog:write"),
  /** Lectura de cupones comerciales (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `FINANCE_ANALYST`); mutación exclusiva `SUPER`. */
  CUPONES_READ: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "catalog:write") || hasCapability(r, "finance:read"),
  ),
  /** Lectura de fidelización y referidos (`SUPERADMIN`, `FINANCE_ANALYST`); mutación exclusiva `SUPER`. */
  FIDELIZACION_READ: ALL_ROLES_ORDER.filter(
    (r) => r === "SUPERADMIN" || hasCapability(r, "finance:read"),
  ),
  /** Atención posventa: tickets, garantías, retractos (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `CUSTOMER_SUPPORT`). */
  SUPPORT_CARE: rolesWithCapability("support:manage"),
  /** Lectura operativa y contable de garantías (`SUPPORT_CARE` + `FINANCE_ANALYST` con PII enmascarada); mutación exclusiva `warranty:manage`. */
  GARANTIAS_READ: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "warranty:manage") || hasCapability(r, "finance:read"),
  ),
  /** Lectura operativa y contable de retractos (`SUPPORT_CARE` + `FINANCE_ANALYST` con PII enmascarada); mutación exclusiva `retract:manage`. */
  RETRACTOS_READ: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "retract:manage") || hasCapability(r, "finance:read"),
  ),
  /** Lectura de reseñas y reputación posventa (`catalog:write` + `CUSTOMER_SUPPORT`); moderación exclusiva `catalog:write`. */
  RESENAS_READ: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "catalog:write") || hasCapability(r, "support:manage"),
  ),
  /** Lectura analítica 0-PII y operativa de carritos abandonados (`CARTS_RECOVER` + `FINANCE_ANALYST`); recordatorios exclusivos `carts:recover`. */
  CARTS_READ: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "carts:recover") || hasCapability(r, "finance:read"),
  ),
  /** Recuperación de carritos abandonados (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`, `CUSTOMER_SUPPORT`). */
  CARTS_RECOVER: rolesWithCapability("carts:recover"),
  /** Gobierno global de recuperación de carritos (`SUPERADMIN`). */
  CARTS_CONFIGURE: rolesWithCapability("carts:configure"),
  /** Lectura analítica 0-PII y operativa de Lifecycle Journeys (`LIFECYCLE_MANAGE` + `FINANCE_ANALYST`); mutación exclusiva `lifecycle:manage`. */
  LIFECYCLE_READ: ALL_ROLES_ORDER.filter(
    (r) => hasCapability(r, "lifecycle:manage") || hasCapability(r, "finance:read"),
  ),
  /** Gestión y operación de Lifecycle Journeys (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`). */
  LIFECYCLE_MANAGE: rolesWithCapability("lifecycle:manage"),
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
  /** Centro de notificaciones operativas (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`). */
  NOTIFICATIONS: rolesWithCapability("notifications:manage"),
  /** Exclusivo `SUPERADMIN` (usuarios, auditoría, reembolsos finales, config global). */
  SUPER: ["SUPERADMIN"] as const,
  /** Autoservicio de seguridad de cuenta (MFA obligatorio para el 100 % de roles). */
  ALL_PLUS_CMS: ALL_ROLES_ORDER,
} satisfies Record<string, readonly AdminRole[]>;

const ROUTE_ROLES: Array<{ prefix: string; roles: readonly AdminRole[] }> = [
  { prefix: "/admin/dashboard", roles: rolesWithCapability("dashboard:read") },
  { prefix: "/admin/hoy", roles: rolesWithCapability("dashboard:read") },
  { prefix: "/admin/notificaciones", roles: rolesWithCapability("notifications:manage") },
  { prefix: "/admin/pedidos", roles: rolesWithCapability("orders:read_operational") },

  // Posventa y soporte al cliente (CUSTOMER_SUPPORT gestiona; FINANCE_ANALYST lee retractos/garantías con PII enmascarada)
  {
    prefix: "/admin/garantias",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "warranty:manage") || hasCapability(r, "finance:read"),
    ),
  },
  {
    prefix: "/admin/reclamos",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "warranty:manage") || hasCapability(r, "finance:read"),
    ),
  },
  {
    prefix: "/admin/retractos",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "retract:manage") || hasCapability(r, "finance:read"),
    ),
  },
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

  // Catálogo, canales de venta, insumos y transporte
  { prefix: "/admin/productos", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/inventario", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/materiales", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/categorias", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/ocasiones", roles: rolesWithCapability("catalog:write") },
  {
    prefix: "/admin/resenas",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "catalog:write") || hasCapability(r, "support:manage"),
    ),
  },
  { prefix: "/admin/canales/mercadolibre", roles: ["SUPERADMIN"] },
  { prefix: "/admin/canales", roles: rolesWithCapability("catalog:write") },
  { prefix: "/admin/envios", roles: rolesWithCapability("shipping:configure") },

  // Contactos 360 vs Bandeja de fusión de duplicados (longest-prefix match protege /duplicados)
  { prefix: "/admin/clientes/duplicados", roles: rolesWithCapability("contacts:merge") },
  { prefix: "/admin/clientes", roles: rolesWithCapability("contacts:read_360") },

  // Marketing y carritos abandonados (FINANCE_ANALYST accede en lectura 0-PII a Lifecycle y Carritos)
  {
    prefix: "/admin/marketing/suscriptores/export",
    roles: rolesWithCapability("marketing:export_csv"),
  },
  {
    prefix: "/admin/marketing/segmentos/export",
    roles: rolesWithCapability("marketing:export_csv"),
  },
  { prefix: "/admin/marketing", roles: rolesWithCapability("marketing:read") },
  { prefix: "/admin/lifecycle/nuevo", roles: rolesWithCapability("lifecycle:manage") },
  {
    prefix: "/admin/lifecycle",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "lifecycle:manage") || hasCapability(r, "finance:read"),
    ),
  },
  { prefix: "/admin/carritos/configuracion", roles: rolesWithCapability("carts:configure") },
  { prefix: "/admin/carritos/enviar", roles: rolesWithCapability("carts:recover") },
  {
    prefix: "/admin/carritos",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "carts:recover") || hasCapability(r, "finance:read"),
    ),
  },

  // Finanzas, conciliación COD, costos y métricas (habilita FINANCE_ANALYST sin SUPERADMIN;
  // /admin/costos permite lectura a FINANCE_ANALYST + lectura/edición a catalog:write)
  { prefix: "/admin/finanzas/conciliacion", roles: rolesWithCapability("finance:reconcile_cod") },
  { prefix: "/admin/finanzas/bloqueos", roles: rolesWithCapability("finance:reconcile_cod") },
  { prefix: "/admin/finanzas/export", roles: rolesWithCapability("finance:export_csv") },
  { prefix: "/admin/finanzas", roles: rolesWithCapability("finance:read") },
  {
    prefix: "/admin/costos",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "finance:read") || hasCapability(r, "catalog:write"),
    ),
  },
  { prefix: "/admin/metricas", roles: rolesWithCapability("metrics:read") },

  // Reglas comerciales, promociones y fidelización (Bloque 3 — N-21 estricto)
  {
    prefix: "/admin/mayorista",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "catalog:write") || hasCapability(r, "finance:read"),
    ),
  },
  {
    prefix: "/admin/cupones",
    roles: ALL_ROLES_ORDER.filter(
      (r) => hasCapability(r, "catalog:write") || hasCapability(r, "finance:read"),
    ),
  },
  {
    prefix: "/admin/fidelizacion",
    roles: ALL_ROLES_ORDER.filter((r) => r === "SUPERADMIN" || hasCapability(r, "finance:read")),
  },

  // Configuración sensible, salud técnica y CMS v2
  { prefix: "/admin/integraciones", roles: ["SUPERADMIN"] },
  { prefix: "/admin/observability", roles: ["SUPERADMIN"] },
  { prefix: "/admin/performance", roles: ["SUPERADMIN"] },
  { prefix: "/admin/contenido/paginas/global", roles: ["SUPERADMIN"] },
  { prefix: "/admin/contenido/configuracion", roles: ["SUPERADMIN"] },
  { prefix: "/admin/contenido", roles: rolesWithCapability("cms:write") },
  { prefix: "/admin/redirects", roles: rolesWithCapability("cms:write") },
  { prefix: "/admin/email-templates", roles: ["SUPERADMIN"] },
  { prefix: "/admin/auditoria", roles: rolesWithCapability("audit:read") },
  { prefix: "/admin/usuarios", roles: rolesWithCapability("staff:manage") },

  // Aprendizaje y seguridad de la cuenta (disponibles para todos los roles)
  { prefix: "/admin/ayuda", roles: ALL_ROLES_ORDER },
  { prefix: "/admin/seguridad", roles: ALL_ROLES_ORDER },
];

/**
 * Reglas de ruta con segmento dinámico intermedio evaluadas ANTES del match por prefijo literal.
 * Garantiza paridad N-21 entre `AdminPanelLayout`, helpers de enlaces (`canAccessAdminPath`)
 * y `requireCapability` en la página/acción cuando una subruta dinámica cambia la capacidad exigida.
 */
const ROUTE_PATTERN_ROLES: ReadonlyArray<{
  pattern: RegExp;
  roles: readonly AdminRole[];
}> = [
  {
    // Hoja imprimible de producción/taller para cotizaciones con activos 300 DPI:
    // habilita PRINT_WORKSHOP y restringe CUSTOMER_SUPPORT (exige production:download_assets).
    pattern: /^\/admin\/cotizaciones\/[^/?]+\/taller(?:$|[/?])/,
    roles: rolesWithCapability("production:download_assets"),
  },
  {
    // Descarga de ZIP de producción 300 DPI del pedido (Bloque 5 — paridad N-21 con route.ts):
    // exige production:download_assets (excluye FULFILLMENT, CUSTOMER_SUPPORT y FINANCE_ANALYST).
    pattern: /^\/admin\/pedidos\/[^/?]+\/produccion(?:$|[/?])/,
    roles: rolesWithCapability("production:download_assets"),
  },
  {
    // Guía física imprimible de entrega / mensajero propio (Bloque 5 — paridad N-21 con guia/page.tsx):
    // habilita SHIPPING_GUIDE_PRINT y excluye PRINT_WORKSHOP y FINANCE_ANALYST.
    pattern: /^\/admin\/pedidos\/[^/?]+\/guia(?:$|[/?])/,
    roles: ADMIN_ROLE_SETS.SHIPPING_GUIDE_PRINT,
  },
  {
    // Vista previa HTML del correo de recuperación de carrito (Bloque 7 — paridad N-21 con preview/route.ts):
    // contiene PII real del carrito, diseños personalizados y cupón del comprador → exclusivo `carts:recover`.
    pattern: /^\/admin\/carritos\/[^/?]+\/preview(?:$|[/?])/,
    roles: rolesWithCapability("carts:recover"),
  },
];

export type OrderAdminTransitionTarget = "FULFILLING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

/**
 * Segregación por etapa operativa en transiciones de `Order` (Bloque 5):
 * - `CANCELLED`: exclusivo de gerencia operativa (`orders:reconcile`: `SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`).
 * - `FULFILLING`: cualquier rol con `orders:transition` (`PRINT_WORKSHOP` en personalizados y `FULFILLMENT` en estándar).
 * - `SHIPPED` / `DELIVERED`: roles logísticos de despacho (`ORDERS_SHIPMENT_DISPATCH`, excluye `PRINT_WORKSHOP`).
 */
export function canTransitionOrderTo(
  role: AdminRole,
  toStatus: OrderAdminTransitionTarget,
): boolean {
  if (!hasCapability(role, "orders:transition")) return false;
  if (toStatus === "CANCELLED") {
    return hasCapability(role, "orders:reconcile");
  }
  if (toStatus === "FULFILLING") {
    return true;
  }
  return (ADMIN_ROLE_SETS.ORDERS_SHIPMENT_DISPATCH as readonly string[]).includes(role);
}

/** ¿Puede reintentar la generación de guía en Aveonline? (Despachos y gerencia operativa; no Taller ni Soporte). */
export function canRetryOrderShipment(role: AdminRole): boolean {
  return (ADMIN_ROLE_SETS.ORDERS_SHIPMENT_DISPATCH as readonly string[]).includes(role);
}

/** ¿Puede reintentar `RenderJob` 300 DPI o regenerar piezas de taller? (Exclusivo `production:download_assets`). */
export function canManageOrderRenderJobs(role: AdminRole): boolean {
  return hasCapability(role, "production:download_assets");
}

/**
 * ¿Puede ver el desglose comercial completo en COP (subtotal, descuentos, cupones, precios unitarios e intentos Wompi)?
 * Habilitado para Administradora, Operaciones, Analista financiera y Soporte; oculto en Taller y Despachos.
 */
export function canSeeOrderCommercialBreakdown(role: AdminRole): boolean {
  return (
    hasCapability(role, "finance:read") ||
    hasCapability(role, "orders:read_pii") ||
    hasCapability(role, "catalog:write")
  );
}

/**
 * ¿Puede ver el monto a recaudar cuando un pedido es contraentrega (`COD`)?
 * `FULFILLMENT` necesita verificar si debe cobrar efectivo en la entrega, sin acceder al resto del desglose comercial;
 * `PRINT_WORKSHOP` no recibe importes COP de ningún tipo.
 */
export function canSeeOrderCodCollectionAmount(role: AdminRole): boolean {
  return canSeeOrderCommercialBreakdown(role) || role === "FULFILLMENT";
}

/** ¿El rol puede acceder a esta ruta admin? */
export function canAccessAdminPath(role: AdminRole, pathname: string): boolean {
  if (role === "SUPERADMIN") return true;
  for (const rule of ROUTE_PATTERN_ROLES) {
    if (rule.pattern.test(pathname)) {
      return rule.roles.includes(role);
    }
  }
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

export type NotificationRouteScope =
  | { unrestricted: true }
  | { unrestricted: false; allowedPrefixes: string[]; deniedPrefixes: string[] };

/**
 * Devuelve los prefijos de `ROUTE_ROLES` permitidos y denegados para un rol dado,
 * de modo que las consultas SQL de `Notification` (`listNotifications`, `getUnreadCount`,
 * `markRead`, `markAllRead`) filtren en base de datos exactamente las mismas rutas que
 * `canAccessAdminPath(role, actionUrl)` sin filtrar ingresos COP, alertas DIAN, MFA ni
 * infraestructura a roles operativos (`OPERATIONS_MANAGER`, `MANAGER`).
 */
export function getNotificationRouteScope(role: AdminRole): NotificationRouteScope {
  if (role === "SUPERADMIN") return { unrestricted: true };
  const allowedPrefixes = ROUTE_ROLES.filter((r) => r.roles.includes(role)).map((r) => r.prefix);
  const deniedPrefixes = ROUTE_ROLES.filter(
    (r) =>
      !r.roles.includes(role) &&
      allowedPrefixes.some(
        (allowed) =>
          r.prefix.length > allowed.length &&
          (r.prefix.startsWith(`${allowed}/`) || r.prefix.startsWith(`${allowed}?`)),
      ),
  ).map((r) => r.prefix);
  return { unrestricted: false, allowedPrefixes, deniedPrefixes };
}
